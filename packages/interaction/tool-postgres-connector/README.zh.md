---
description: "其他插件与内置 postgres_* 工具共用的只读 PostgreSQL 数据源：口令走凭据引用、只接受单条语句、结果有界。"
kind: "package-bundle"
---

# @deepseek-ai/dsh-tool-postgres-connector

[English](README.md) | 中文

## 概述

`@deepseek-ai/dsh-tool-postgres-connector` 为其他插件提供只读的 PostgreSQL 访问能力：它拥有连接池、从凭据引用解析口令、拒绝一切不是单条只读 `SELECT` 的语句，并同时按行数与服务端期限限制每次结果。需要生产数据的部署挂载它之后，既可以直接调用 `ctx.postgres`，也可以让四个内置 `postgres_*` 工具列 schema、描述关系、跑一条有界查询。它不写入、不返回口令，也不做任何业务判断。

## 目录

- [使用本包](#use-this-package)
- [理解实现](#understand-the-implementation)
- [进一步探索](#further-exploration)
- [模型体验](#model-experience)
- [已知限制与延期工作](#known-limitations-and-deferred-work)
- [开发备注](#dev-note)

-----

<a id="use-this-package"></a>
## 使用本包

当某个插件或一项运维任务必须读取部署自有的 PostgreSQL 库时，挂载本插件。挂载后提供 `ctx.postgres` 服务，并在 `exposeTools` 保持默认时注册四个给模型用的只读工具。

### 何时选用它

需要数据库读取且只需要读取时选用它：它不提供写入、DDL 或管理类操作，因此改数据要另建一个带自身确认流程的动作。[MES 拉取环节](../tool-mes-pull/README.zh.md)是随附的消费方；其他自己拥有 SQL 的插件可以直接调用 `ctx.postgres`。

### 最小配置

```yaml
- id: tool-postgres-connector
  name: '@deepseek-ai/dsh-tool-postgres-connector'
  config:
    enabled: true
    host: mes-db.example.invalid
    port: 5432
    database: mes
    user: mes_reader
    passwordEnv: MES_PG_PASSWORD
```

连接未配置时也可以打开设置页。设置 `enabled: false` 可禁止读取。`passwordEnv` 只填写凭据引用名，不存储口令。

| 字段 | 默认值 | 含义 |
|---|---|---|
| `enabled` | `true` | 该连接是否可以执行语句 |
| `host` | 空 | PostgreSQL 主机名或地址 |
| `port` | 空 | PostgreSQL TCP 端口 |
| `database` | 空 | 要连接的库名 |
| `user` | 空 | 连接使用的角色 |
| `passwordEnv` | `MES_PG_PASSWORD` | 每次调用都重新解析的凭据引用 |
| `ssl` | `false` | 是否要求带证书校验的 TLS |
| `maxConnections` | `4` | 连接池上限，1 到 16 |
| `maxRows` | `500` | 单条语句可返回的行数，1 到 10000 |
| `timeoutMs` | `30000` | 服务端强制的语句期限，单位毫秒 |
| `exposeTools` | `true` | 是否注册四个内置只读工具 |

每次读取前，插件一起校验主机、端口、数据库、账号及凭据引用。保存后的连接配置无需重启即可生效。如果解析凭据期间设置发生变化，本次读取被拒绝，请重试。

### 其他插件调用的服务

`ctx.postgres` 提供 `settings`、`testConnection()`、`listSchemas()`、`listTables(schema, page, pageSize)`、`describeTable(schema, table)` 与 `query(sql, limit)`。`query` 返回 `rows`、`columns`、`rowCount`、`truncated`、`limit` 与 `elapsedMs`；`truncated` 是连接器丢过行的唯一信号。账号被关闭、凭据缺失或服务不可达时，调用被拒绝并指明需要修哪一项。

-----

<a id="understand-the-implementation"></a>
## 理解实现

<details>
<summary>实现细节 —— 点击展开</summary>

这个连接器是数据源，不是 SQL 控制台。三层各自独立地决定一次读取能做什么：语句守卫拒绝一切不是单条只读 `SELECT` 的文本；网关把每条语句包在只读事务里，且连接设置了 `default_transaction_read_only=on`；PostgreSQL 强制执行连接池构建时带上的语句期限。

守卫在扫描禁用关键字之前，先把字符串字面量、引号标识符与注释整段裸化，因此 `WHERE note = 'DROP TABLE users'` 能通过，而可写 CTE 会因为其中真实存在的 `INSERT` 被拒。行数上限靠把已接受的语句包进外层 `SELECT ... LIMIT n+1` 实现，尾部注释或子句无法逃逸，多取的那一行让截断可观测。

连接器为同一份连接配置解析凭据。口令变化后，网关为新口令打开新池，并关闭旧池。`pg` 驱动在首次读取时加载，而不是在挂载时，这样没有该驱动的部署仍可挂载，缺依赖也变成一条可操作的错误而不是插件挂载失败。

### 源码导览

| 文件 | 职责 |
|---|---|
| [`src/index.ts`](src/index.ts) | 插件入口、`Config`、`ctx.postgres` 服务与四个只读工具 |
| [`src/statement.ts`](src/statement.ts) | 语句接受、生效行数上限与包裹用 `LIMIT` |
| [`src/gateway.ts`](src/gateway.ts) | 连接池、只读事务、元数据查询与驱动惰性加载 |
| [`src/types.ts`](src/types.ts) | 消费方收到的元数据与结果值 |
| [`src/pg-shim.ts`](src/pg-shim.ts) | 本包依赖其类型的最小驱动接口 |

</details>

-----

<a id="further-exploration"></a>
## 进一步探索

- [连接器详细契约](docs/DETAIL.md) —— 语句守卫的判定顺序、连接池参数与逐个方法说明。
- [MES 拉取环节](../tool-mes-pull/README.zh.md) —— `ctx.postgres` 的随附消费方。
- [凭据子系统](../../../docs/subsystems/credentials.zh.md) —— `passwordEnv` 在哪里解析、引用如何保存。
- [interaction 分组导览](../README.zh.md) —— 相邻的人机交互与流水线包。

-----

<a id="model-experience"></a>
## 模型体验

### 工具定义

#### 模型看到的内容

`exposeTools` 保持默认时注册四个工具：`postgres_list_schemas`、`postgres_list_tables`、`postgres_describe_table` 与 `postgres_query`。它们的参数是 schema 与关系名、关系分页用的页码与每页条数，`postgres_query` 另有一条 `SELECT` 文本与可选行数上限。每次结果都是一个文本块，内容是服务返回的 JSON。

#### Token 影响

只要连接器以 `exposeTools` 挂载并存在工具注册表，这四个固定定义就会在每次请求上占用同样的 token。之后每次调用再叠加其参数与结果，而 `maxRows` 决定该结果最多携带多少行。

#### KV Cache 影响

只要随附的定义与 `exposeTools` 设置不变，前缀即可稳定复用；结果追加在可复用前缀之后。把 `exposeTools` 设为 `false` 或卸载该连接器条目会移除这些定义，从那一刻起此前缓存的条目不再可复用。

### 工具调用历史与结果

#### 模型看到的内容

assistant 调用保留参数，其中包括完整的语句文本。结果是 `query` 返回的 JSON —— `rows`、`columns`、`rowCount`、`truncated`、`limit` 与 `elapsedMs` —— 或者三个列举工具的元数据对象。拒绝或服务端失败以单条错误信息送达，任何信息都不带口令。

#### Token 影响

参数保留到会话结束，结果大小随返回行数增长，直到 `maxRows` 截住。没有任何流式输出，因此一次调用把整个结果一次加进去。

#### KV Cache 影响

仅追加：新出现的可见内容位于可复用请求前缀之后，不会使既有条目失效。

## 已知限制与延期工作

<a id="known-limitations-and-deferred-work"></a>

这些限制决定该连接器何时不是合适的工具。它们是当前包约束，不是待办清单。

- **一个安装一套连接** —— 进程内所有组合共用同一个主机、库、角色与连接池；没有按会话或按租户切换账号的能力。
- **`pg` 在首次读取时加载** —— 驱动不是声明的依赖，因此没有它的部署仍能挂载并显示配置，首次读取才以安装提示失败，而不是以连接失败出现。
- **一次调用一条语句** —— 一次调用不能返回多个结果集，含两条语句的文本会被拒绝而不是被拆分。
- **语句失败返回驱动原文** —— 文本可能引用语句片段，因为守卫在驱动之前生效，且之后没有任何环节重写回复；口令不会出现，因为它只到达连接池。
- **只限行数，不限字节** —— `maxRows` 与 `truncated` 限制的是行数，一条极宽的行仍然可能很大。
- **沿用驱动默认类型转换** —— `bytea` 与高精度 `numeric` 按驱动自身的表示到达消费方，本包不额外归一。
- **仅支持 PostgreSQL** —— 语句守卫、系统目录查询与连接池参数都是 PostgreSQL 专有的。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者的工作上下文 —— 点击展开</summary>

驱动通过计算出来的说明符导入，本包因此能在没有 `pg` 的环境里通过类型检查并加载；改成静态导入会把一个可选驱动缺失变成插件挂载失败。语句守卫里行锁子句在禁用动词扫描之前检查：放在之后会把 `FOR UPDATE` 里的 `update` 报出来，掩盖真正的拒绝原因。

</details>
