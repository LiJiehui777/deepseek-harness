# Business workflows

English | [中文](business-workflow.zh.md)

The [business-workflow package group](../../packages/business-workflow/README.md) defines browser-authored business processes and their Flowable execution. This subsystem is separate from [model-authored workflow scripts](workflow.md). Flowable owns durable instance state; the DH analysis Session owns its model transcript. The [package reference](../../packages/business-workflow/workbench/README.md) defines deployment, supported nodes, and operator permissions.

## Draft data

[`WorkflowDraft` and `DraftNode`](../../packages/business-workflow/workbench/src/shared/types.ts) describe an acyclic graph. Node ids identify editor data; generated BPMN activity ids identify engine execution. A node names its kind, successor, optional failed-condition successor, input source, output field path, instruction, and review-role description. A condition additionally selects equality, inequality, or existence and a scalar JSON comparison value. `WorkflowInputField` declares a startup field name, description, scalar type (`string`, `number`, or `boolean`), and required flag. A draft has at most 16 fields. The interchange document has `version: 1` and a `draft` object; absent `inputs` means no fields.

## Runtime projections

The browser-safe [runtime types](../../packages/business-workflow/workbench/src/shared/runtime.ts) are projected from Flowable through the authenticated `businessWorkflows` Remote namespace.

| Type | Fields and semantics |
|---|---|
| `ProcessId`, `WorkItemId` | Opaque branded engine identities; a work item alone grants no permission. |
| `StartProcessRequest` | `requestId` identifies start delivery; `draftJson` pins the revision and `inputJson` supplies a JSON object. |
| `WorkflowTemplate` | Server-owned `id`, `tenantId`, `revision`, `lastVersion`, editable `draftJson`, `updatedAt`, and nullable active `published` snapshot. |
| `WorkflowPublication` | Monotonic `version`, exact engine `definitionId`, pinned `draftJson`, and `publishedAt`. |
| `SaveTemplateRequest` | `id`, `expectedRevision` (zero creates), and editable `draftJson`; conflicts reject. |
| `StartPublishedRequest` | Template `id`, current `version`, delivery `requestId`, and `inputJson`; only declared scalar inputs are accepted. |
| `WorkflowChoice` | Published `id`, pinned `version`, and display `name`; selector display grants no extra connector permission. |
| `ConversationWorkflowState` | Session id, binding `revision`, nullable `selection`, current published `choices`, `selectedAvailable`, and Agent `busy` state. |
| `SelectConversationWorkflowRequest` | Expected binding revision and nullable id/version choice; null returns to ordinary chat. |
| `ConversationReviewTask` | Exact process and task ids plus task name, restricted to the initiating conversation. |
| `ConversationReviews` | Oldest 30 current human tasks, full pending count, attached `following` processes, refresh interval, and engine error; independent of the current binding. |
| `ConversationFollow` | Owned process id and name, current step, and running/human/wait/settling/blocked phase; projected from the engine without model polling. |
| `ConversationReviewDetail` | Pinned process evidence and exact human-node `inputJson`; null input means the selected task has ended. |
| `EngineHealth` | `connected`, `version`, `error`, and the Host-selected browser refresh interval. |
| `ProcessSummary` | Instance id, name, `running`/`completed`/`canceled` status, start and end times. The list returns the newest 30 owned runs. |
| `ProcessDetail` | Summary plus submitted draft and input JSON, current work items, completed node ids, persisted per-node output JSON, `ownerSessionId`, `workflowId`, and `workflowVersion`. |
| `EngineWorkItem` | Engine id, editor node id, name, kind, waiting/executing/unavailable/failed status, and a non-secret error code. |

Review and wait methods require the current item of the corresponding kind in an owned instance. There is no operation for completing an arbitrary node. Persisted instances remain independent of editor changes and browser previews. The [execution decision](../../.agents/notes/implemented/feature/2026-11-02-flowable-business-execution.md) explains engine ownership and analysis restrictions.

<!-- BEGIN GENERATED cordis-surface (gen-cordis-catalog.ts) — do not edit between markers -->

<a id="cordis-surface"></a>

## Cordis API

Generated from source by `scripts/gen-cordis-catalog.ts` (verified fresh by `pnpm run verify-cordis-catalog` in doc-sync; regenerate with `pnpm run gen-cordis-catalog`) — the language sides differ only in locale-specific paired document paths. Signature blocks use a `ts cordis-catalog` fence and keep the original source JSDoc; dispatch modes are defined in the [primer](../cordis-primer.md#dispatch-modes), and the framework-inherited `ctx` API lives in [cordis-api/inherited.md](../cordis-api/inherited.md).

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

Types: [SessionId](core.md)

Source: [`packages/business-workflow/workbench/src/index.ts`](../../packages/business-workflow/workbench/src/index.ts)
<!-- END GENERATED cordis-surface -->
