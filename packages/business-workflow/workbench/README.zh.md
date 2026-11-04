---
description: "增强版 DH 内的 Flowable 业务流程编排、持久执行、本机审核与受限 DH 分析。"
kind: "package-reference"
---

# @deepseek-ai/dsh-business-workflow-workbench

[English](README.md) | 中文

## 概述

在 DH 内设计业务流程，并通过 Flowable 执行固定版本。可以配置节点与输入引用、查看持久实例、办理人工任务及确认等待回执。DH 分析节点不开放工具。MES、SDCC、EIP 动作在连接器实现前保持等待。草稿可保存到服务端并发布，DH 能在对话中发现和启动已发布流程。发布版本及引擎实例跨刷新保留。

## 目录

- [使用本包](#use-this-package)
- [执行语义](#execution-semantics)
- [模型体验](#model-experience)
- [已知限制与后续工作](#known-limitations-and-deferred-work)
- [开发备注](#dev-note)

<a id="use-this-package"></a>
## 使用本包

[中天覆盖配置](../../../apps/cli/config/examples/ztt/cordis.yml)启用侧栏面板并提供全部 Host 配置。通用 Web bundle 默认禁用本包。浏览器通过已认证的 DH Typert Remote 命名空间 `businessWorkflows` 操作；引擎凭证只在 Host 持有，每次请求通过 `passwordEnv` 解析。

本地引擎 [Compose 文件](engine/compose.yml)固定 Flowable 8.0.0，将 8082 端口绑定到本机，H2 数据库存入命名卷。将 `DH_FLOWABLE_PASSWORD` 放在私有环境文件中，并向 DH 提供相同的凭证引用；在仓库根目录运行 `docker compose --project-name dh-flowable --env-file .local/flowable/engine.env -f packages/business-workflow/workbench/engine/compose.yml up -d`。重启引擎时不要删除数据卷。

Host 必须配置 `baseUrl`、`username`、`passwordEnv`、`tenantId`、`requestTimeoutMs`、`pollIntervalMs`、`analysisTimeoutMs` 、`lockDurationMs` 和 `maxTemplates`。租约必须长于分析超时加三次 REST 请求超时。远程引擎必须使用 HTTPS。每个部署使用独立租户及包含租户名的外部任务主题。[生成的配置目录](../../../docs/config-catalog.zh.md#deepseek-aidsh-business-workflow-workbench)定义字段检查。

使用「Flowable 接入验证」模板验证内置数据传递、人工审核、接收等待与条件分支。`core.echo` 只传递选中输入，不执行外部操作。启动参数必须为 JSON 对象。条件支持将输入字段与 JSON 标量比较（`eq` 或 `neq`），或检查字段是否存在。验证模板默认读取启动参数中的 `approved`。用户文字不会转换为脚本或 EL 表达式。

「企业微信待办整理」模板读取未完成待办，交给 DH 生成建议，再停在人工确认处。先启用现有办公连接器、扫码授权并开启待办权限。固定动作 `wecom.todos.list` 请求首 10 项未完成待办，启动参数不改变查询；它在私有本地作用域中通过受检查的工具执行器复用 `wecom_office_list_todos`，不调用模型，仍执行原有账号与祖先来源检查。结果保留分页及截断标记；示例不创建待办或消息，也不完成待办。连接或权限缺失时节点停止并提示检查设置。

独立的「企业微信待办风控演示（模拟）」模板包含 8 个节点，必须提供 `scenario`：`risk` 返回 4 条模拟待办，包含逾期及缺资料事实；`routine` 返回 2 条普通模拟待办。固定基准日为 2026-11-03。`demo.wecom.todos` 只生成带标记的样本，不需要凭证，不访问连接器或模型。由日期及资料标记计算的布尔值控制风险复核分支，模型文字不决定走向。风险复核通过后才生成 DH 简报，两条路线都需要最终人工确认。演示不修改企业微信数据。

选择节点后，可在分组侧栏编辑基础信息、执行配置、输入、判断规则与后续步骤。面板独立滚动，删除入口固定在底部；开始和结束节点不能删除。若删除了被引用的节点，应修正下游输入并检查草稿，再保存或发布；已接受的引擎实例保留原图。

打开示例，保存到服务端，再点击「发布给 DH 使用」。可以声明最多 16 个标量启动字段，配置名称、说明、类型及必填标记。发布会检查图并部署确切的引擎定义；之后保存的编辑不会改变发布版本。下线阻止后续启动，已有实例继续执行。遇到版本冲突时，先重新打开服务端草稿再保存。先在会话中手动选择企业微信待办整理流程，再发送执行需求。DH 会填写声明的参数、异步启动并返回实例编号。可在发起会话或工作流页面查看进度及办理审核。

在输入框权限控件旁点击「工作流」，将当前本地会话绑定到一个已发布版本。菜单底部可刷新流程列表；将鼠标放到按钮上可查看绑定说明。选择本身不启动实例，发送执行需求后才启动。绑定跨刷新和 Host 重启保留；选择器在打开或重连时刷新，过期的修改版本会被拒绝。普通聊天仅讨论和推荐流程，不能启动新实例；必须手动选择已发布版本后才能启动。切回「普通聊天」解除绑定，不会取消已有实例。选择流程要求会话可直接调用工作流工具；仅使用 PTC 的会话保持原模式并拒绝绑定。

待人工审核的任务显示在发起会话的输入框上方，包括之前绑定的流程实例。每个实例将流程身份及状态显示在上层，当前步骤缩进显示在下层；审核按钮属于步骤，步骤名称仅显示一次。点击卡片即可在 DH 内查看该节点保存的准确输入，以及可展开的上游依据。通过会完成同一条 Flowable 任务并继续执行；退回会终止该实例。工作流页面保留原有入口，两处均刷新引擎状态；已结束任务的详情不会自动切换为下一项审核。卡片显示最早的 30 项待审核及总数，处理后补充后续任务。刷新页面或重连后从引擎恢复待审核任务。

通过 agent 工具启动时，流程会关联到发起会话。启动成功的结果携带原生结束标记，停止后续模型步骤；现有 `agent/turn-stopping` 扩展会让同一轮次保持待处理，期间由 Flowable 执行或等待人工输入，不产生模型请求。人工通过后，引擎运行后续节点；完成、终止或步骤受阻时，将有限大小的已保存依据写入原 Session，并恢复其 agent 自动反馈。卡片展示等待及后续执行状态。旧实例可点击「让 DH 继续跟进」显式关联。停止会话只取消跟进，不会终止引擎实例。

<a id="execution-semantics"></a>
## 执行语义

Host 将无环草稿编译为受限 BPMN 子集，部署后按确切定义编号启动实例。提交的草稿与启动数据保存在引擎变量中；编辑器修改不改变已有实例。同一 Host 上相同请求编号的并发启动共享创建过程，之后的相同请求编号会查询引擎历史；这不提供分布式严格一次执行保证。变更型 REST 请求不会自动重试。

Flowable 为分析、已支持动作与条件计算生成外部任务，由单个串行 DH worker 处理支持的主题。分析使用当前默认 DH 模型创建私有单回合 Session；作用域内工具集合为空，使用 native 展示方式，并由单调执行检查拒绝所有工具调用。只有正常完成且输出非空的回合才能完成引擎任务。分析或访问企微前将 Session 编号存入引擎；Host 重启后遇到结果不确定的已有尝试会失败，不自动重复运行。步骤错误会保存并设置零次重试，需要人工处理或重新启动修正后的流程。

人工审核是分配给 `dh-local-operator` 的 Flowable 用户任务。已认证的本机 DH 操作人可通过，或退回并终止实例。等待节点是接收任务：确认时记录本机操作人回执，并继续传递原输入。审核和等待接口先检查租户、DH 业务编号及当前任务类型，不提供通用的完成任意节点接口。草稿中的企业角色名称仅为说明，不构成身份授权。

节点输入可引用上游输出字段，来源为空时使用启动参数。开始、内置传递、审核、等待与分析输出使用 `result` 字段。必要输入缺失会停止执行；条件提供专门的存在性判断。界面将持久引擎实例及人工任务与浏览器手动模拟分开。

正在跟进的归属独立保存在 `business_workflow_follows` 版本 1 中。重新打开所属本机会话时，恢复跟进已有实例，不重新启动。插件消息通过已记录的 notice 上下文进入会话；引擎结果仅为参考数据，不授权审核或工具访问。如果在保存结果通知后、删除跟进记录前崩溃，重启后可能重复一次通知。

服务端草稿、发布指针及会话绑定使用 DH 存储域 `business_workflows`；未保存的编辑及手动模拟仍由浏览器持有。版本 1 JSON 支持 2–64 个唯一编号节点；缺少条件设置时默认比较是否等于 `true`。图检查报告无效出口、循环、不可达节点、缺少配置和非上游引用。JSON 导出不包含引擎凭证或实例历史。

<a id="model-experience"></a>
## 模型体验

### 工作流工具

#### 模型看到的内容

四个固定工具分别发现当前发布版本、启动选定版本、查询当前对话持有的实例及终止实例。发现结果按有界页面返回用途及声明字段；启动拒绝未声明或类型不符的参数。工具结果通过正常 Agent 循环记入日志。人工审核、事件确认、编辑及发布没有对应工作流工具。调用检查拒绝企业远程会话及其后代，包括已持久化的祖先；执行器从可信调用元数据派生发起方及投递编号。绑定会话会收到已记录的动态上下文，其中包含所选流程编号及版本。提示词组装仅开放四个工作流工具；单调的注册表检查还会拒绝其他调用，包括后注册的作用域工具。启动接受时再次检查绑定编号及版本，查询和终止还检查流程归属。选择变更通过 Agent 空闲维护执行，队列中的消息必须等绑定写入完成后才能启动。普通会话隐藏工作流启动工具，并在注册表及启动执行器中拒绝未绑定调用；其他工具保持可用。只读发现可用于推荐流程，已有实例可查询或显式终止。工作流选择及工作台启动入口拒绝带 agent 发起身份的调用，避免绕过手动选择。

##### 会话工作流指令

```markdown
This conversation is bound to the selected published business workflow. Use business_workflow_list to inspect its declared inputs, then business_workflow_start when the user requests execution. Ask for missing required inputs. Selecting a workflow alone does not request execution. For progress questions, query the runId already returned; do not start again. Starting suspends further model steps. The conversation remains pending without model polling while the workflow runs or waits for human review. Approval resumes engine execution automatically; saved completion or failure evidence resumes this conversation for a final response. Human review is available from this conversation's review card or the workflow page and requires the user's explicit UI action. Event confirmation stays in the workflow page. If the selected version is unavailable, ask the user to reselect it. Only the user can change this binding or return to ordinary chat through the workflow selector.
```

##### 普通聊天指令

```markdown
This conversation is in ordinary chat mode. You may discuss or recommend published business workflows, but cannot start one. Ask the user to manually select a workflow in the conversation workflow selector before requesting execution. Do not change the selection or use another tool or service to bypass it. Existing runs remain active; use their returned runId for progress questions.
```

#### Token 影响

普通聊天包含固定的选择要求上下文。发现及状态结果进入发起对话。每次结果限制为 64 KiB；超限的状态输出会省略并标记。启动工具立即返回，但发起轮次保持待处理。等待期间不调用模型；重新打开会话恢复跟进，以及反馈已结束流程时，各增加一条模型可见的通知。结果通知先省略过大的输出，必要时再省略步骤详情，使完整消息小于 64 KiB。

#### KV 缓存影响

固定工具说明及参数结构不随发布变化。当前流程目录及实例数据只出现在工具结果中。

### 工作流分析

#### 模型看到的内容

记录在日志中的用户消息包含节点任务及选中的 JSON 输入；`agent` 节点不获得可执行工具。本包拥有的前缀固定。

##### 分析任务前缀

```markdown
Analyze the supplied business data and return findings, evidence, and uncertainty. You cannot execute system operations.
```

#### Token 影响

每个分析节点创建一个私有 DH 回合，用量取决于说明、输入和所选模型输出。内置传递、模拟待办生成、固定企微读取、审核、等待及路由不创建模型请求。

#### KV 缓存影响

分析消息共享固定前缀。各私有 Session 使用自身输入；跨节点缓存复用取决于提供方。

<a id="known-limitations-and-deferred-work"></a>
## 已知限制与后续工作

- 本包尚未实现 MES、SDCC、EIP、台账与报告连接器动作，这些任务保持等待；分析 worker 无法代替它们执行操作。
- 人工角色与等待回执使用 DH 本机认证；企业身份、角色成员关系及已认证的上游回调需单独接入。
- 失败或结果不确定的任务不自动重试。工作流工具仅允许本地对话调用，且只能查询或终止由该对话启动的实例。分布式启动去重、有界循环、任意 BPMN 导入及结构化模型输出映射需另行实现。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者工作背景——点击展开</summary>

[Flowable 决策](../../../.agents/notes/implemented/feature/2026-11-02-flowable-business-execution.zh.md)负责执行及工具限制；[工作台决策](../../../.agents/notes/implemented/feature/2026-11-02-business-workflow-workbench.zh.md)负责模块位置与手动预览。工具每次调用都读取权威目录，不注册每个发布版本的缓存。引擎使用已保存的确切定义编号；没有需要不变量伴随插件核对的独立运行时缓存投影。

包内测试覆盖草稿与生命周期释放。可选真实引擎测试使用隔离租户；构建后的浏览器场景复用模型录制，验证分析工具为空、办理引擎任务并刷新历史。设置 `DSH_FLOWABLE_TEST_URL` 与 `DSH_FLOWABLE_TEST_PASSWORD` 后运行这些用例；没有真实引擎时跳过。确定性预览场景使用故意未配置的凭证引用。

</details>
