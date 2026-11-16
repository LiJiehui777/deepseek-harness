# 数据拉取详细契约

按唯一键从 MES 数据库拉取一个业务键（合同号 / 订单号）在各业务模块里的数据，**在拉取时直接构造成要推给国网程析平台的报文**，写入共享工作库的待审池。人工在审核台看到的就是这份报文，改的也是它，批准后原样发出。只读，不推送。

本文件对应 `src/index.ts`、`src/service.ts`、`src/queries.ts` 与 `src/push-schema.ts`。包名 `@deepseek-ai/dsh-tool-mes-pull`，由 `tsc` 与 `tsdown` 构建。

## 一、定位

```
tool-postgres-connector ──ctx.postgres（只读连接）──▶ 本包
                                                        │ 写 review_item
                                                        │   source_payload = MES 原始行
                                                        │   mapped_payload = 推送报文
                                                        ▼
                                            work.db（共享工作库）
                                                        │ 读
                                                        ▼
                                              tool-review-gate（审核台）
```

**上游是"能力"不是"服务调用"**：本包只取 `ctx.postgres.query()`，不关心连接器后面连的是哪个库。**下游不做任何事**：本包只把数据放进约定的表，筛不筛、推不推是审核闸与投递环节的事。

`ctx.get('postgres')` 每次调用惰性解析，因此连接器可以在本包之后挂载，挂载顺序不影响结果。

### 为什么在拉取时构报文

旧做法把 MES 原始行**复制一份**写进报文列，真实字段映射留给投递环节的模板配置。那样审核就失去意义：审核员改的是一份"看起来像报文"的原始行，真正发出去的是另一套模板渲染的结果，两者能对不上。

现在报文列就是**最终报文**：审核台展示它、编辑它、批准它，投递环节原样发送。字段映射集中在 `src/push-schema.ts`，依据是逐行核对 MES 源码得出的接口行为，不是照接口文档猜的。

### 刻意不做

- 定时任务 / 自动轮询
- 业务规则判断（那是审核闸的 `rules.json`）
- 推送（那是投递环节）
- 跨插件直调

## 二、推送报文映射（`src/push-schema.ts`）

### 为什么映射要在这里做

1. **审核员必须看到最终报文**。若审核台展示原始行、投递环节再渲染，现场改的字段和真正发出去的字段是两套东西。
2. 程析的字段名大小写混杂（`ipoNo` 与 `ProductionOrderNo` 并存），还有写死常量与派生字段（`schedule` 进度、`planPeriod` 天数、`ProcedureNo` 的 `,jyxxqq` 拼接）。把这类逻辑放进配置模板，等于把业务代码翻译成模板语言，无法审查。
3. 映射集中一处，改字段只改这里，三个环节自动一致。

### 已支持的模块

| `-- @module:` | 模块名 | 程析接口（配置键） | 行级唯一键 | 备注 |
|---|---|---|---|---|
| `salesOrder` | 销售订单 | `cxist.orderUrl` | `contractNo` | `Status` 写死 2 |
| `salesOrderLine` | 销售订单明细 | `cxist.orderDetailUrl` | `otcLineNo` | 品类由零件名推断 |
| `productionPlan` | 排产计划 | `cxist.productionPlanUrl` | `mpsNo` | 期望收货日期缺失时告警 |
| `productionOrder` | 生产订单 | `cxist.productionOrderUrl` | `mpsNo` | 独立字段集，**不是**排产计划那套 |
| `workOrder` | 工单 | `cxist.workOrderUrl` | `optaskNo` | 状态经 MES 的状态表转换 |
| `workReport` | 报工信息 | `cxist.productionTimeScheduledUrl` | `productNo` | `BuyerProvince` 写死"江苏省" |
| `finishedProduct` | 成品信息 | `cxist.finishedProductUrl` | `cable` | **只新增不更新** |
| `rawMaterialStock` | 原材料库存 | `cxist.rawMaterialStockUrl` | `partNo` | `storeCity` 写死"江苏南通" |
| `productionStore` | 产成品库存 | `cxist.productionStoreUrl` | `customerOrderNo` | `PoItemId` 取订单行已推送后回填的 id |
| `productionOrderRawMaterial` | 选用原材料 | `cxist.productionOrderRawMaterialUrl` | `rawMaterialNo` | **只新增不更新** |
| `dryingRoom` | 烘房除气 | `cxist.productionTimeScheduledUrl` + `cxist.procedureDataUrl` | `batchNo` | 一条推两个接口 |

### 告警（`warnings`）不是装饰

映射过程中凡有"可能不对"的地方，都会写进 `review_item.warnings` 并在审核台显示。例如：

- 品类/种类代码未识别 → 报文里会是 `null`（MES 同样如此，但不该静默）
- 客户订单期望收货日期缺失 → MES 会直接阻断推送，这条不该批准
- 工单已取消（`05canceled`）→ MES 跳过它，这条不该批准
- 成品信息 → 提示"重复批准会在下游产生重复记录"
- 产成品库存 → 提示"订单行未推送时票据 id 为空，更新会被下游拒绝"

**不允许静默补值**：审核员看到的告警就是他知道"这条数据哪里可能不对"的唯一途径。

## 三、数据落地

位置：`$DSH_HOME/mes-pipeline/work.db`（`dbPath` 配置可覆盖）

### 写入的行

| 列 | 取值 |
|---|---|
| `module` | 报文构造器里的中文模块名（如 `工单`） |
| `biz_key` | **行级**唯一键，由该模块的 `keyField` 决定 |
| `source_payload` | MES 原始行（只读留档） |
| `mapped_payload` | **推送报文**（可编辑，投递环节原样发送） |
| `warnings` | 映射告警数组 |
| `status` | 恒为 `pending`（规则判定由审核闸的 `evaluate()` 做） |
| `batch_id` | 本次拉取批次号 |

### biz_key 必须是行级唯一

`review_item` 上有 `UNIQUE(module, biz_key)`。一个合同在「工单」里可能对应多个工单，用合同号当 key 会让多行互相覆盖、只剩最后一条。

取值由各模块的 `keyField` 明确指定（见上表），退化顺序为 `keyField → id → contractNo → customerOrderNo`，全都没有时用 `模块名#序号`。

### 幂等与防重

`INSERT ... ON CONFLICT(module, biz_key) DO NOTHING`：

- 同一单重复拉取不产生重复待审项
- **已存在的行不被覆盖**，人工改过的报文得以保留

### 事务边界

一次拉取的全部写入在**一个** `BEGIN IMMEDIATE` 事务里：先转换完所有模块，再一次性落库。因此部分失败的拉取不会提交一半的行。

### 批次记录

每次拉取写一行 `pull_batch`，供 `mes_list_batches` 回看。预览模式（`persist: false`）不写任何东西，批次号为 `preview`。

## 四、查询定义（`queries/*.sql`）

每个业务模块一个 `.sql` 文件，由熟悉库结构的人维护，插件本身不认识任何表名。**存盘即生效**：每次调用都重新读盘，不需要重启或重新构建。

### 头部指令

```sql
-- @name: 工单
-- @module: workOrder          ← 对应报文构造器的 MODULES 键
-- @desc: 工序任务（production_operation_task）。国网推送接口：工单。
-- @key: contract_no

SELECT ...
```

| 指令 | 说明 | 默认 |
|---|---|---|
| `@name` | 模块显示名（无 `@module` 时的退化模块名） | 文件名 |
| `@module` | 关联报文构造器；**省略则不构报文**，报文退化为原始行副本 | 空 |
| `@desc` | 说明，展示在工具输出里 | 空 |
| `@key` | 键类型，影响占位符别名 | `contract_no` |

指令只在文件开头的注释块里识别；遇到第一行非注释内容即停止扫描。

### 占位符

`:name` 形式。通用键 `:key`，别名 `keyValue` / `contractNo` / `contract_no` / `orderNo` / `order_no` / `keyType` / `key_type`。

两个易踩的坑，已处理：

- **`::type` 类型转换**：`now()::date` 里的 `:date` 不会被当成占位符（前置否定环视）
- **单引号转义**：取值里的 `'` 转成 `''`

> 这里的转义只防"无意拼错"。**真正的只读保证来自连接器侧**：只读事务 + 单条 SELECT 校验 + 行数上限。

## 五、配置

| 项 | 默认 | 说明 |
|---|---|---|
| `enabled` | `false` | **必须显式打开**。保存配置不触发任何业务动作。 |
| `queriesPath` | 包内 `queries/` | SQL 定义目录。 |
| `dbPath` | `$DSH_HOME/mes-pipeline/work.db` | 共享工作库。**必须与审核闸、投递环节一致**。 |
| `rowLimit` | `500` | 单模块返回行数上限，1–5000。 |
| `exposeTools` | `true` | 是否注册工具。 |

## 六、服务与工具

### 服务 `ctx.mesPull`

| 方法 | 说明 |
|---|---|
| `pull({ keyValue, keyType?, queries?, persist, rowLimit? })` | 按唯一键拉取、构报文并写库 |
| `readBatch(batchId, module?, limit?)` | 读取批次明细（拿到的报文列就是报文） |
| `listBatches(limit?)` | 列出最近批次 |
| `listQueries()` / `queriesDirectory` | 查询定义 |
| `health()` | `{ ok, ready, error, dbPath, connector, enabled, items }` |

### 工具

| 工具 | 说明 |
|---|---|
| `mes_list_queries` | 列出查询模块，含对应的下游接口与占位符 |
| `mes_pull_by_key` | 按唯一键拉取、构报文、写入待审池。**只读数据库，不推送** |
| `mes_read_batch` | 读取某批次明细 |
| `mes_list_batches` | 列出最近批次 |

## 七、失败语义

| 情况 | 行为 |
|---|---|
| `enabled=false` | 抛错并提示去设置里打开 |
| 连接器未安装 / 未启用 | 抛错并提示先装连接器并填连接参数（不是静默返回空） |
| 某个模块 SQL 报错 | **该模块记入 `error`，其他模块照常写入**，整体 `ok=false` |
| 模块名没有对应构造器 | 该模块退化为原始行副本，并附告警说明 |
| 占位符缺取值 | 该模块失败，报出缺哪个占位符 |
| 键值为空 / 工作库不可写 | 抛错并给出原因 |

## 八、实现说明

- `apply()` 不是 async：Cordis 只允许在挂载期间注册，异步初始化会把工具注册推到期后。
- 工作库惰性打开：磁盘异常不该让插件起不来，失败经 `health()` 报告。
- 连接器惰性解析：`runner: () => ctx.get('postgres')`，因此挂载顺序无关。
- 全部写入在一个 `BEGIN IMMEDIATE` 事务里。

## 九、测试

```bash
pnpm vitest run packages/interaction/tool-mes-pull
```

## 十、已知限制

- 一次拉取一个键，不做批量。
- 不做增量：每次都按 `queries/*.sql` 全量取该键的数据；增量字段要靠 SQL 自己写。
- **原材料库存**查询与订单无直接关联，过滤条件只有物料属性，按合同号拉取时该模块会返回全量数据（MES 的定时任务同样没有"未推送"过滤）。实际使用建议单独按物料维度拉取。
- 报文里出现的 `null` 与 MES 行为一致，但会在 `warnings` 里提示。
- 工作库是单机 SQLite，不做多机共享。
