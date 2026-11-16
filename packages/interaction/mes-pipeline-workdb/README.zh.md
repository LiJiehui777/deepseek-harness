---
description: "MES 流水线各环节共同读写的 SQLite 交接表：拉取、审核、推送三步认同一份文件、同一套状态与同一条迁移规则。"
kind: "package-library"
---

# @deepseek-ai/dsh-mes-pipeline-workdb

[English](README.md) | 中文

## 概述

`@deepseek-ai/dsh-mes-pipeline-workdb` 拥有 MES 审核流水线的交接约定：共享 SQLite 文件放在哪、里面有哪些表与索引、每个状态串是什么含义、事务与增量迁移怎么跑。各环节靠这份文件交接而不是互相调用，所以拉取环节、审核闸、投递环节可以分别安装、分别启停、分别测试。本包只承载这份约定：不含任何环节的业务逻辑，也没有自己的模型侧贡献。

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

把它当普通工作区依赖，从流水线各环节 import。它导出的是纯模块 API：不注册 Cordis 服务、不暴露工具，也不出现在 `cordis.yml` 里。

### 何时使用它

在每一个接触共享库的包里使用它 —— 拉取环节、审核闸、投递环节 —— 这样一套表定义、一套状态词表、一个路径解析器服务全部三处。只负责拼装报文的环节既没有理由打开库，也没有理由 import 本包。

### 打开共享库

`resolveDatabasePath(override)` 把各插件可选的路径设置收敛成每一步都必须认同的那一个路径：显式 `*.db` 路径原样使用，其它值当作所在目录，省略时落到 `$DSH_HOME/mes-pipeline/work.db`。`openWorkDatabase({ dbPath, busyTimeoutMs, log })` 以仅属主权限建目录，用 WAL 模式打开文件，设置 busy timeout 与外键，执行建表语句，再跑增量迁移。每个插件只打开一次，把返回的 `close()` 留给插件卸载。

### 读写

`inTransaction(db, work)` 先以 `BEGIN IMMEDIATE` 拿写锁再执行 `work`，因此"先读后写"的环节不会与另一环节升级读锁时死锁；失败时回滚并原样抛出。`now()` 产出各 `*_at` 列存储的本地时区 ISO-8601 时间戳，`parseJson(text, fallback)` 读取 JSON 载荷列，遇到手工改坏的行也不会抛错。

`STATUS` 是待审池的四个状态，`PUSH_STATUS` 是 `push_record` 上的三个投递状态，`ACTION` 是审核留痕的动作名。`PENDING` 与 `BLOCKED` 都表示"尚未人工决定"：任何环节都不能把 `BLOCKED` 当成终局驳回，因为人仍可强制放行。

-----

<a id="understand-the-implementation"></a>
## 理解实现

<details>
<summary>实现细节 —— 点击展开</summary>

打开是同步的，因为各环节都在插件挂载期开库，而挂载期只允许同步注册；改成异步会把工具注册推到期后，并让第一个调用方拿到 undefined 的服务。

`review_item` 上有 `UNIQUE(module, biz_key)`，重复拉取同一张订单不会覆盖人工已改的内容；`push_record` 上有 `UNIQUE(module, biz_key, target)`，这是防重投递的物理保证。`biz_key` 必须是行级唯一号：只用合同号会把同一合同的多行折叠成一条待审项。

### 源码导览

| 文件 | 职责 |
|---|---|
| [`src/schema.ts`](src/schema.ts) | 数据目录、表与索引定义、状态与动作词表 |
| [`src/index.ts`](src/index.ts) | 路径解析、打开与迁移、事务、时间戳、JSON 读取 |

</details>

-----

<a id="further-exploration"></a>
## 进一步探索

- [流水线契约](../tool-review-gate/CONTRACT.md) —— 这些表实现的跨包约定。
- [interaction 分组导览](../README.zh.md) —— 消费这份约定的各环节包。
- [存储子系统](../../../docs/subsystems/storage.zh.md) —— Harness 自带的存储后端；本流水线刻意不使用它们。

-----

<a id="model-experience"></a>
## 模型体验

### 本包没有自己的模型侧贡献

#### 模型看到的内容

本包什么都不贡献。它不注册工具定义、不注册系统提示段落、也不注册会话事件，因此挂载它既不会让任何请求变长，也不会让任何请求变形。模型最终从这些表里看到什么，由各环节包自己拥有：`tool-mes-pull` 渲染拉取摘要，`tool-review-gate` 渲染四个审核工具，`tool-downstream-push` 渲染四个投递工具。本包定义的字符串 —— `STATUS`、`PUSH_STATUS` 与 `ACTION` —— 只有在某个环节选择打印它们时才到达模型。

#### Token 影响

直接开销为零。本包不新增 schema、不新增提示文本、也不新增自己的结果内容；归属于本流水线的每个 token 都来自部署实际挂载的那些环节工具。

#### KV Cache 影响

彼此独立。本包不可能让可复用前缀失效，因为它对请求没有任何贡献。流水线的工具定义能否保持稳定前缀，由拥有它们的三个环节包决定。

## 已知限制与延期工作

<a id="known-limitations-and-deferred-work"></a>

这些约束界定了交接文件能与不能承诺什么。它们是当前包限制，不是待办清单。

- **一个安装一份库** —— 路径是部署配置，没有按账号或按租户隔离，因此两个共用同一个 `$DSH_HOME` 的部署共用一条队列。
- **依赖 `node:sqlite`** —— 这份约定面向 Node 内置驱动，不提供第三方驱动的兜底。
- **迁移只能加列** —— `migrate` 只补缺失列、从不改写语义，因此改变某列含义的版本必须新增列。
- **同一时刻只有一个写入者** —— WAL 模式让读可以并行，但每个写入都要在 busy timeout 后面排队，因此一批慢插入会拖住其它环节。
- **不清理旧行** —— 待审池与投递队列会无限增长，本包不做任何清理，保留策略由部署自己负责。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者的工作上下文 —— 点击展开</summary>

各环节此前各自携带一份本模块副本，把一份约定变成了必须同步修改的四个文件。它们现在依赖本包，因此改表、改状态或改迁移规则都只改一处。

</details>
