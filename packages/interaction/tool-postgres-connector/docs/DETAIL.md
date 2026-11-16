# PostgreSQL 连接器详细契约

只读的 PostgreSQL 连接器。**它只负责连接**：建连、凭据解析、语句安全、结果限流。读什么、什么时候读，由调用它的插件决定。

本文件是运行契约的权威说明，内容对应 `src/index.ts`、`src/statement.ts`、`src/gateway.ts` 与 `src/types.ts`。本包是普通工作区包：`tsc` 产出类型声明，`tsdown` 打包 `lib/index.js`，包名 `@deepseek-ai/dsh-tool-postgres-connector`。

## 定位

```
消费方插件（MES 拉取环节、运维任务）
        │  调用 ctx.postgres.xxx()
        ▼
tool-postgres-connector              ← 本包
        │  await import('pg') → 连接池
        ▼
PostgreSQL
```

本包**不含**任何业务规则：不筛客户、不判状态、不推送、不改数据。

## 一、配置与校验

可以在 DH 插件设置或 `cordis.yml` 中配置连接。保存后无需重启；执行读取时检查连接参数与凭据。

| 字段 | 默认值 | 约束 |
|---|---|---|
| `enabled` | `true` | 关闭时任何读取都被拒绝 |
| `host` | 空 | 读取前校验非空 |
| `port` | 空 | 1–65535 |
| `database` | 空 | 读取前校验非空 |
| `user` | 空 | 读取前校验非空 |
| `passwordEnv` | `MES_PG_PASSWORD` | 必须是环境变量名形态 |
| `ssl` | `false` | `true` 时 `rejectUnauthorized: true` |
| `maxConnections` | `4` | 1–16 |
| `maxRows` | `500` | 1–10000 |
| `timeoutMs` | `30000` | 服务端 `statement_timeout` |
| `exposeTools` | `true` | 是否注册四个读取工具 |

插件加载后就可以显示设置页。每次读取在连接数据库之前校验 `host`、`port`、`database`、`user` 和 `passwordEnv`。解析凭据期间若保存了另一份配置，拒绝该次读取；用新配置重试即可。

## 二、`ctx.postgres` 服务契约

表面精确为以下六项。多一项少一项都是破坏性变更。

### `settings`（getter，同步）

当前生效配置的只读快照。**不含任何口令字段**：`passwordEnv` 是引用名而不是值。

### `testConnection(): Promise<{ ok: boolean, message: string }>`

检查能否连上。**永不抛错**，失败折叠成 `{ ok: false, message }`，消息已脱敏。实现上跑一次 `listSchemas()`：只读、开销小、能同时验证认证与权限。

### `listSchemas(): Promise<PostgresSchema[]>`

当前角色可见的 schema，排除 `pg_catalog`、`information_schema`、`pg_toast` 与 `pg_temp_*`。按名字排序。

### `listTables(schema, page = 1, pageSize = 50)`

一页关系元数据，返回 `{ tables, page, hasMore }`。`tables[]` 每项是 `{ schema, name, kind, comment, estimatedRows }`；`kind` 取 `table` / `view` / `materialized view` / `partitioned table` / `foreign table` / `unknown`，`estimatedRows` 取 `reltuples`，不可用时为 `null`。

- `schema` 必须是裸标识符，否则在碰驱动之前就报错。
- `pageSize` 夹到 1–200；`page` 夹到 ≥ 1。
- `hasMore` 用"多取一行"判定。

### `describeTable(schema, table)`

返回 `{ schema, name, kind, comment, columns, primaryKey }`，其中 `columns` 每项是 `{ name, type, nullable, defaultValue, comment }`。

`columns` 按 `attnum` 声明顺序；`type` 是 `format_type()` 的结果（例如 `character varying(64)`、`numeric(12,3)`）。关系不存在或不可读时抛错。`schema` 与 `table` 都必须是裸标识符。

### `query(sql, limit?)`

执行**单条**只读语句，返回 `{ rows, columns, rowCount, truncated, limit, elapsedMs }`。

- 省略 `limit` 时用配置的 `maxRows`；超过也被夹到 `maxRows`；非正整数报错。
- 实现上执行 `SELECT * FROM (<sql>) AS connector_bounded_result LIMIT limit+1`，多取一行来判定 `truncated`。**包裹而非拼接**，调用方无法靠尾部子句跳出上限。

### 拒绝语义

| 情况 | 错误信息要点 |
|---|---|
| `enabled=false` | 指明去设置 > 插件中打开它 |
| 口令解析不到 | 指名 `passwordEnv` 这个引用名 |
| 语句非法 | 具体原因（见下节） |
| 插件已卸载 | 指明连接器正在关闭 |

## 三、语句守卫（`src/statement.ts`）

只接受**单条** `SELECT`（可带前导 `WITH`）。判定顺序必须如此，顺序错了会把数据里的关键字当成 SQL，或者报错理由和真实原因对不上：

1. **类型**：非字符串直接拒绝。
2. **长度**：超过 `MAX_STATEMENT_CHARS`（20 000）拒绝。
3. **终止符**：去掉一个结尾分号与首尾空白；空语句拒绝；字符串/注释之外仍有分号则判为多语句。
4. **裸化**：把字符串字面量、引号标识符、行注释、块注释整段替换成空格（保持长度）。这样 `WHERE note = 'DROP TABLE users'` 不会被误判。
5. **开头关键字**：裸化后必须匹配 `select` 或 `with`。
6. **行锁**：`FOR UPDATE` / `FOR SHARE` / `FOR NO KEY UPDATE` / `FOR KEY SHARE`。放在动词扫描**之前**，否则报的是子句里的 `update`，理由不对。
7. **禁用动词**：`insert`、`update`、`delete`、`merge`、`truncate`、`drop`、`create`、`alter`、`grant`、`revoke`、`copy`、`vacuum`、`analyze`、`cluster`、`reindex`、`comment`、`security`、`refresh`、`listen`、`notify`、`set`、`reset`、`begin`、`commit`、`rollback`、`savepoint`、`lock`、`do`、`call`、`execute`、`prepare`、`deallocate`、`declare`、`discard`、`load`、`import`。
8. **禁用函数**：`pg_sleep`、`pg_terminate_backend`、`pg_cancel_backend`、`pg_read_file`、`pg_read_binary_file`、`pg_ls_dir`、`pg_stat_file`、`lo_import`、`lo_export`、`lo_unlink`、`dblink`、`dblink_exec`、`pg_reload_conf`、`pg_rotate_logfile`、`pg_switch_wal`、`pg_create_restore_point`、`pg_drop_replication_slot`、`pg_create_physical_replication_slot`、`set_config`、`query_to_xml`、`xpath_table`。

行为要点：

- `WITH ... SELECT` **通过**。
- 写入型 CTE（`WITH x AS (DELETE FROM t RETURNING *) SELECT * FROM x`）**被拒**，因为裸化文本里出现 `delete`。
- `SELECT created_at::date` **不误判** —— 类型转换名不在禁用表里。
- 字符串里的分号（`'a;b'`）不被当成多语句。

## 四、网关（`src/gateway.ts`）

### 驱动延迟加载

```ts
const specifier = 'pg'
try { return await import(specifier) as PostgresDriver }
catch { throw new Error('PostgreSQL driver "pg" is not installed. …') }
```

绝不能静态 `import 'pg'`：静态导入会把"没装驱动"变成"插件加载失败"，而不是"第一次读取时一条可操作的错误"。计算出来的说明符同时让本仓库在没有该驱动的环境里照样通过类型检查。

### 连接池复用

首次读取时建池，同一份配置与口令下复用；任一变化时关闭旧池。构造参数：

| 参数 | 来源 |
|---|---|
| `host` / `port` / `database` / `user` | 配置 |
| `password` | 按本次连接配置解析；口令变化时换池并关闭旧池 |
| `max` | `maxConnections` |
| `idleTimeoutMillis` | 固定 `30_000` |
| `connectionTimeoutMillis` | `min(timeoutMs, 15_000)` |
| `ssl` | `{ rejectUnauthorized: true }`（`ssl=true` 时） |
| `application_name` | `dsh-connector-postgres` |
| `options` | `-c statement_timeout=<timeoutMs> -c default_transaction_read_only=on` |

### 只读事务

每次读取：借连接 → `BEGIN READ ONLY` → 执行 → `COMMIT`；失败则 `ROLLBACK`，最后**一定** `release()`。即使守卫被绕过，服务端事务也只读。

### 错误脱敏

返回给调用方之前：口令不进入消息，因为口令只到连接池；超长消息截断。不保留原始堆栈 —— 堆栈里常带连接参数。

## 五、凭据与脱敏

解析顺序（每次读取都重解析，口令轮换即时生效）：

1. `ctx.credentials.resolve(credentialRef(passwordEnv))` → 取 `resolved.value.trim()`。
2. 两条都空 → 报"口令缺失"，指名该配哪个引用名。

`ctx.credentials` 写在 `inject` 里：本包需要凭据服务才能工作，缺少它就不该激活。

### 口令不外泄的两道保险

1. `ctx.postgres.settings` 返回配置快照，**不含口令字段**。
2. 网关收到已解析的口令，但从不把它写进错误消息或日志。

## 六、工具

`exposeTools=true`（默认）时注册四个，均在 `ctx.inject(['tools'], …)` 作用域内注册，随插件卸载一起撤回：

| 工具 | 参数 | 返回 |
|---|---|---|
| `postgres_list_schemas` | 无 | `{ schemas }` |
| `postgres_list_tables` | `schema`（必填）、`page`、`page_size` | `{ tables, page, hasMore }` |
| `postgres_describe_table` | `schema`、`table`（均必填） | 关系描述 JSON |
| `postgres_query` | `sql`（必填）、`limit` | 查询结果 JSON |

工具只开放"看结构"和"跑一条只读 SELECT"，**没有**写入/DDL/批处理。所有工具把结果序列化成 JSON 字符串放进一个文本块，避免模型自行猜测字段语义。

## 七、生命周期

```
apply(ctx, config)                    ← 同步
  ├─ assertConfig(config)             校验必需字段与 passwordEnv 形态
  ├─ registerTools()                  exposeTools 时注册四个工具
  └─ ctx.plugin(PostgresConnector)    提供 ctx.postgres 与网关
        ├─ ctx.effect(close pool)     卸载时排空池
        └─ reconfigure(next)          换配置时重建池并关闭旧池
```

`ctx.plugin(PostgresConnector, config)` 的挂载是异步的，但 `apply()` 不等它：等的后果是第一个调用方拿到 undefined 的 `ctx.postgres`。

## 八、测试

```bash
pnpm vitest run packages/interaction/tool-postgres-connector
```

覆盖语句守卫（合法/非法/多语句/危险函数/类型转换误判）、网关（注入假驱动、池复用、截断标记）、插件生命周期与配置校验。测试运行在 vitest 下，与工作区其余包一致。
