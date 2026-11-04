# 业务工作流

[English](business-workflow.md) | 中文

[business-workflow 包组](../../packages/business-workflow/README.zh.md)定义浏览器编排的业务流程及其 Flowable 执行，与[模型编写的工作流脚本](workflow.zh.md)独立。Flowable 持有持久实例状态，DH 分析 Session 持有模型对话记录。[包参考](../../packages/business-workflow/workbench/README.zh.md)定义部署、支持的节点及操作人权限。

## 草稿数据

[`WorkflowDraft` 与 `DraftNode`](../../packages/business-workflow/workbench/src/shared/types.ts)描述无环图。节点编号标识编辑数据，生成的 BPMN 活动编号标识引擎执行。节点包含类型、后续节点、可选的条件失败出口、输入来源、输出字段路径、说明与审核角色描述。条件额外指定相等、不等或存在性检查，以及用于比较的 JSON 标量。`WorkflowInputField` 声明启动字段名、说明、标量类型（`string`、`number` 或 `boolean`）及必填标记；每个草稿最多 16 个字段。交换文档包含 `version: 1` 和 `draft` 对象；缺少 `inputs` 表示没有字段。

## 运行时投影

浏览器安全的[运行时类型](../../packages/business-workflow/workbench/src/shared/runtime.ts)通过已认证的 `businessWorkflows` Remote 命名空间投影 Flowable 状态。

| 类型 | 字段与语义 |
|---|---|
| `ProcessId`、`WorkItemId` | 不透明的品牌化引擎编号；任务编号本身不授予权限。 |
| `StartProcessRequest` | `requestId` 标识启动请求，`draftJson` 固定版本，`inputJson` 提供 JSON 对象。 |
| `WorkflowTemplate` | 服务端持有的 `id`、`tenantId`、`revision`、`lastVersion`、可编辑 `draftJson`、`updatedAt`，以及可为空的当前 `published` 快照。 |
| `WorkflowPublication` | 单调递增的 `version`、确切引擎 `definitionId`、固定 `draftJson` 及 `publishedAt`。 |
| `SaveTemplateRequest` | `id`、`expectedRevision`（零表示新建）及可编辑 `draftJson`；冲突会拒绝。 |
| `StartPublishedRequest` | 模板 `id`、当前 `version`、投递 `requestId` 及 `inputJson`；只接受声明的标量输入。 |
| `WorkflowChoice` | 已发布的 `id`、固定 `version` 及显示名称 `name`；选择器不增加连接器权限。 |
| `ConversationWorkflowState` | 会话编号、绑定 `revision`、可为空的 `selection`、当前发布的 `choices`、`selectedAvailable` 及 Agent 的 `busy` 状态。 |
| `SelectConversationWorkflowRequest` | 预期的绑定版本及可为空的编号／版本选择；null 表示返回普通聊天。 |
| `ConversationReviewTask` | 准确的实例及任务编号与任务名称，限于发起会话。 |
| `ConversationReviews` | 最早的 30 项当前人工任务、完整待审数量、已关联的 `following` 实例、刷新间隔及引擎错误；不依赖当前绑定。 |
| `ConversationFollow` | 所属实例编号与名称、当前步骤及 running/human/wait/settling/blocked 阶段；从引擎投影，不通过模型轮询。 |
| `ConversationReviewDetail` | 实例保存的依据及人工节点准确的 `inputJson`；输入为 null 表示选定任务已结束。 |
| `EngineHealth` | `connected`、`version`、`error` 及 Host 选定的浏览器刷新间隔。 |
| `ProcessSummary` | 实例编号、名称、`running`／`completed`／`canceled` 状态、开始及结束时间。列表返回本部署最新的 30 条实例。 |
| `ProcessDetail` | 摘要加提交的草稿与输入 JSON、当前任务、已完成节点编号、各节点已保存的输出 JSON，以及 `ownerSessionId`、`workflowId` 和 `workflowVersion`。 |
| `EngineWorkItem` | 引擎编号、编辑节点编号、名称、类型、等待／执行／不可用／失败状态及不含凭证的错误码。 |

审核和等待方法必须引用本部署实例中对应类型的当前任务，不存在完成任意节点的操作。持久实例与编辑器变更及浏览器预览相互独立。[执行决策](../../.agents/notes/implemented/feature/2026-11-02-flowable-business-execution.zh.md)解释引擎状态归属与分析限制。

<!-- BEGIN GENERATED cordis-surface (gen-cordis-catalog.ts) — do not edit between markers -->

<a id="cordis-surface"></a>

## Cordis API

Generated from source by `scripts/gen-cordis-catalog.ts` (verified fresh by `pnpm run verify-cordis-catalog` in doc-sync; regenerate with `pnpm run gen-cordis-catalog`) — the language sides differ only in locale-specific paired document paths. Signature blocks use a `ts cordis-catalog` fence and keep the original source JSDoc; dispatch modes are defined in the [primer](../cordis-primer.zh.md#dispatch-modes), and the framework-inherited `ctx` API lives in [cordis-api/inherited.md](../cordis-api/inherited.md).

<a id="ctxbusinessworkflows--businessworkflows"></a>

### `ctx.businessWorkflows` — `BusinessWorkflows`

Flowable owns state; the Host only handles work the engine has made current.

```ts cordis-catalog
/** Read a local conversation's workflow binding and current published choices.
 * @param sessionId - trusted authenticated UI's target Session.
 * @returns committed binding, available versions, and current Agent activity.
 */
@Remote async conversationWorkflow(sessionId: SessionId): Promise<ConversationWorkflowState>

/** Bind one exact published workflow, or return to ordinary chat without canceling accepted runs.
 * @param sessionId - local conversation to configure.
 * @param request - expected binding revision and explicit user selection.
 * @returns state after durable commit; active turns reject changes.
 * @throws when called from an Agent initiator rather than the authenticated UI.
 */
@Remote async selectConversationWorkflow(sessionId: SessionId, request: SelectConversationWorkflowRequest): Promise<ConversationWorkflowState>

/** Read current local-operator reviews started by this conversation, including earlier bindings.
 * @param sessionId - authenticated UI's local initiating Session.
 * @returns oldest 30 tasks, total count, and deployment polling interval; engine outages retain retry facts.
 */
@Remote async conversationReviews(sessionId: SessionId): Promise<ConversationReviews>

/** Keep following an existing conversation-owned run without starting another workflow.
 * @param sessionId - authenticated local initiating Session.
 * @param id - owned process to follow, including a run started before automatic waiting was available.
 * @returns after follow ownership is durable and an idle Agent has been awakened.
 */
@Remote async followFromConversation(sessionId: SessionId, id: ProcessId): Promise<void>

/** Open a conversation-owned review using its pinned draft and exact node input.
 * @param sessionId - local initiating Session.
 * @param id - process opened from that Session's review card.
 * @param taskId - exact task selected; completed tasks never select their successor implicitly.
 * @returns process evidence and current input, or null input after the selected task ends.
 */
@Remote async conversationReviewDetail(sessionId: SessionId, id: ProcessId, taskId: WorkItemId): Promise<ConversationReviewDetail>

/** Submit an explicit human decision from the initiating conversation; Agent tools cannot call it.
 * @param sessionId - authenticated UI's local initiating Session.
 * @param id - owned process.
 * @param taskId - exact current task; stale submissions reject.
 * @param approved - true continues, false terminates the process.
 * @returns refreshed process state after the existing operator review operation.
 */
@Remote async reviewFromConversation(sessionId: SessionId, id: ProcessId, taskId: WorkItemId, approved: boolean): Promise<ProcessDetail>

/** List this deployment's saved drafts and active publications.
 * @returns durable templates.
 */
@Remote templates(): Promise<WorkflowTemplate[]>

/** Save an editable draft without changing its active publication.
 * @param request - draft and expected server revision; zero creates.
 * @returns committed template.
 */
@Remote async saveTemplate(request: SaveTemplateRequest): Promise<WorkflowTemplate>

/** Publish a saved revision after graph validation and engine deployment.
 * @param id - saved template identity.
 * @param expectedRevision - revision the operator reviewed.
 * @returns committed publication and pinned engine definition.
 */
@Remote async publishTemplate(id: string, expectedRevision: number): Promise<WorkflowTemplate>

/** Withdraw future starts; accepted runs retain their pinned publication.
 * @param id - saved template identity.
 * @param expectedRevision - revision the operator reviewed.
 * @returns committed unpublished template.
 */
@Remote async unpublishTemplate(id: string, expectedRevision: number): Promise<WorkflowTemplate>

/** Start the current published version from the authenticated workbench.
 * @param request - exact version, validated inputs, and delivery key.
 * @returns accepted engine run.
 * @throws when an Agent calls this operator entry instead of the selected-workflow tool.
 */
@Remote async startPublished(request: StartPublishedRequest): Promise<ProcessDetail>

/**
 * Read engine version; credentials stay on the Host.
 * @returns connection facts.
 */
@Remote async health(): Promise<EngineHealth>

/**
 * List this deployment's newest durable runs.
 * @returns process summaries.
 */
@Remote async list(): Promise<ProcessSummary[]>

/**
 * Start a pinned revision in Flowable; concurrent same-key requests on this Host share creation.
 * @param request - draft JSON, JSON inputs, and delivery identity.
 * @returns engine-owned run.
 * @throws when an Agent calls this operator entry instead of the selected-workflow tool.
 */
@Remote async start(request: StartProcessRequest): Promise<ProcessDetail>

/**
 * Read current work and history from the engine.
 * @param id - process belonging to this deployment.
 * @returns pinned draft, current work, and persisted outputs.
 */
@Remote async detail(id: ProcessId): Promise<ProcessDetail>

/**
 * Handle only a current engine human task; overlapping or stale reviews reject, and rejection cancels the process.
 * @param id - owning process.
 * @param taskId - open task identity.
 * @param approved - explicit local-operator decision.
 * @returns refreshed state.
 */
@Remote async review(id: ProcessId, taskId: WorkItemId, approved: boolean): Promise<ProcessDetail>

/**
 * Deliver an operator-confirmed event to a current receive task.
 * @param id - owning process.
 * @param executionId - current receive execution.
 * @returns refreshed state.
 */
@Remote async arrive(id: ProcessId, executionId: WorkItemId): Promise<ProcessDetail>

/**
 * Cancel an owned run and drain its current analysis.
 * @param id - process identity.
 * @returns final engine history.
 */
@Remote async cancel(id: ProcessId): Promise<ProcessDetail>
```

Types: [SessionId](core.zh.md)

Source: [`packages/business-workflow/workbench/src/index.ts`](../../packages/business-workflow/workbench/src/index.ts)
<!-- END GENERATED cordis-surface -->
