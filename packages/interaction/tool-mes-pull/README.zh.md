---
description: "MES 流水线的拉取环节：按唯一键通过 queries/*.sql 定义读取单张订单的数据，在拉取时就构好下游报文，写入共享待审池。只读，不推送。"
kind: "package-reference"
---

# @deepseek-ai/dsh-tool-mes-pull

[English](README.md) | 中文

## 概述

`@deepseek-ai/dsh-tool-mes-pull` 按一个业务键 —— 通常是合同号或订单号 —— 跨配置好的模块拉取 MES 数据，并把结果写入共享待审池。它在拉取时就把下游系统真正会收到的报文构好，因此审核员看到并修改的就是实际发出的那份报文，而不是一份会被后续模板重新渲染的源行。映射风险会变成记录的告警，而不是静默补值。它通过 `ctx.postgres` 读取、写入待审池，不推送任何数据。

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

把本插件与它读取的 [PostgreSQL 连接器](../tool-postgres-connector/README.zh.md)、以及读取它写入内容的[审核闸](../tool-review-gate/README.zh.md)一并挂载。常见路径是一次带键的调用：`mes_pull_by_key` 跑完所有已配置模块、构好每份报文，把行写进池子。

### 何时选用它

当一项操作任务从某个 MES 业务键开始，且结果必须先经人工才能离开时选用它。拉取需要已挂载的连接器；没有连接器时插件仍能加载，拉取会以指明需安装什么的信息失败。它从不判断数据：规则预筛属于审核闸。

### 最小配置

```yaml
- id: tool-mes-pull
  name: '@deepseek-ai/dsh-tool-mes-pull'
  config:
    enabled: true
    dbPath: /var/lib/dsh/mes-pipeline/work.db
```

`enabled` 默认是 `false`。`dbPath` 必须指向流水线每个环节都打开的那同一个文件。

| 字段 | 默认值 | 含义 |
|---|---|---|
| `enabled` | `false` | 是否允许拉取 |
| `queriesPath` | 包内 `queries/` | `.sql` 定义所在目录，每次调用重新读盘 |
| `dbPath` | `$DSH_HOME/mes-pipeline/work.db` | 共享池路径；每个环节必须一致 |
| `rowLimit` | `500` | 单模块行数，1 到 5000 |
| `exposeTools` | `true` | 是否注册四个拉取工具 |

### 查询定义

每个模块一个 `.sql` 文件，由熟悉库结构的人维护，因此改拉取内容不需要重新构建。头部声明模块名、说明、它映射到的推送模块与键类型；`:key` 及其别名会被替换成转义后的字面量。没有 `-- @module` 指令的文件照样能拉取，其载荷变成源行的副本，并附一条说明此事的告警。

### 进入池子的内容

每一行变成一个待审项，携带 MES 源行、将要发出的报文以及映射告警。`biz_key` 是行级唯一号，因此同一合同的多行仍然是多个待审项。重复拉取同一个键不会重复插入，也绝不覆盖人工已经改过的报文。

-----

<a id="understand-the-implementation"></a>
## 理解实现

<details>
<summary>实现细节 —— 点击展开</summary>

本环节先把所有模块转换完，再一次性写入，因此部分失败的拉取不会提交一半的行。某个模块失败不会拖住其它模块：它的错误记在该模块的条目里，整体结果给出 `ok: false`，而可读的模块照样进入池子。

把构报文放在这里而不是投递环节，是审核有意义的前提。程析的字段名大小写混杂，还带写死常量与派生值 —— 以天计的排产周期、进度百分比、由工序与车间拼出的工序号 —— 这些都不是配置模板能写清楚的。凡是映射无法复现 MES 行为的地方都会加一条告警而不是猜：未识别的品类、缺失的必填日期、已取消的工单，或报文里将出现 `null`。

### 源码导览

| 文件 | 职责 |
|---|---|
| [`src/index.ts`](src/index.ts) | 插件入口、`Config` 与四个拉取工具 |
| [`src/service.ts`](src/service.ts) | 打开池子、`pullByKey`、批次读取与单模块失败隔离 |
| [`src/queries.ts`](src/queries.ts) | 读取 `.sql` 定义、头部指令与占位符绑定 |
| [`src/push-schema.ts`](src/push-schema.ts) | 每模块一个报文构造器、行级业务键与映射告警 |

</details>

-----

<a id="further-exploration"></a>
## 进一步探索

- [拉取详细契约](docs/DETAIL.md) —— 模块对照表、查询指令与失败语义。
- [PostgreSQL 连接器](../tool-postgres-connector/README.zh.md) —— `ctx.postgres` 解析到的只读来源。
- [审核闸](../tool-review-gate/README.zh.md) —— 对拉取结果做预筛并决定的环节。
- [流水线契约](../tool-review-gate/CONTRACT.md) —— 三个环节共用的表与状态。
- [interaction 分组导览](../README.zh.md) —— 相邻的流水线与交互包。

-----

<a id="model-experience"></a>
## 模型体验

### 拉取工具

#### 模型看到的内容

注册四个工具：`mes_list_queries` 列出模块 id、显示名、下游接口、键类型与占位符；`mes_pull_by_key` 接收键值、可选键类型、模块子集、`persist` 标志与行数上限；`mes_read_batch` 接收批次 id；`mes_list_batches` 接收条数上限。每次结果都是一个携带 JSON 的文本块。

#### Token 影响

只要插件以 `exposeTools` 挂载并存在工具注册表，这四个固定定义就会在每次请求上占用同样的 token。之后一次拉取再叠加每模块一条条目与收集到的告警 —— 而不是池子里的行本身，那些行留在数据库里直到某个工具把它们读回来。

#### KV Cache 影响

只要随附的定义与 `exposeTools` 设置不变，前缀即可稳定复用；结果追加在可复用前缀之后。以不同的 `exposeTools` 值注册工具会改变前缀，使此前缓存的条目不再可复用。

### 工具调用历史与结果

#### 模型看到的内容

`mes_pull_by_key` 返回批次 id、键、带各模块截断标志与错误的每模块行数、插入与跳过计数、映射告警以及 `ok`。设置 `persist: false` 时它只预览计数、不写任何内容，批次 id 为 `preview`。`mes_read_batch` 返回已存的键、状态、源行与构好的报文。

#### Token 影响

参数保留到会话结束。`mes_read_batch` 随返回行数增长，默认 200 行；无论写入了多少行，拉取摘要都很小。

#### KV Cache 影响

仅追加：新出现的可见内容位于可复用请求前缀之后，不会使既有条目失效。

## 已知限制与延期工作

<a id="known-limitations-and-deferred-work"></a>

这些限制决定一次拉取何时不是合适的操作。它们是当前包约束，不是待办清单。

- **一次拉取一个键** —— 没有跨多张订单的批量模式，也没有调度：只有调用方或操作员要求时才拉。
- **不做增量** —— 每次拉取都按各 `.sql` 文件取该键的全量结果集；只想要变更行的模块必须自己在 SQL 里表达。
- **有一个模块不受键约束** —— 原材料库存查询只按物料属性过滤，因此按合同号拉取会返回该模块的整集。请改按物料维度单独拉取。
- **告警不阻断任何流程** —— 缺失的必填日期或未识别的品类以告警形式进入待审池，该记录与其它记录一样入库；审核员必须读它。
- **`null` 值会进入报文** —— 凡是 MES 自身也发 `null` 的地方，构出的报文就带 `null` 与一条告警，而不是替换值。
- **`biz_key` 的唯一性取决于行** —— 行里没有可识别标识的模块退化为按序号生成的键，因此行序一变就会产生不同的键，从而多出一条重复待审项。
- **单机共享池** —— 交接文件是单机 SQLite，与[工作库](../mes-pipeline-workdb/README.zh.md)所述一致。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者的工作上下文 —— 点击展开</summary>

占位符转义只防"无意拼错导致语句断裂"，它不是只读保证，只读保证来自连接器的语句守卫。新增一个模块意味着同时加 `.sql` 定义与 `src/push-schema.ts` 里的构造器；`-- @module` 里写了没有构造器声明的模块名会被报出来，而不是被当成原始行静默处理。

</details>
