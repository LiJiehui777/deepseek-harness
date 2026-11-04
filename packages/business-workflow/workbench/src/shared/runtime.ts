/** Browser-safe projections of Flowable-owned process state. */
import type { Branded } from '@deepseek-ai/dsh-brand'

/** Flowable process instance identity. */
export type ProcessId = Branded<'BusinessWorkflowProcessId'>
/** Engine-owned task, execution, or job identity. */
export type WorkItemId = Branded<'BusinessWorkflowWorkItemId'>
/** Engine connection facts; credentials never reach the browser. */
export interface EngineHealth {
  connected: boolean
  version: string
  error: string
  refreshIntervalMs: number
}
/** Durable process-list projection. */
export interface ProcessSummary {
  id: ProcessId
  name: string
  status: 'running' | 'completed' | 'canceled'
  startedAt: string
  endedAt: string
}
/** Current engine wait, review, or external job. */
export interface EngineWorkItem {
  id: WorkItemId
  nodeId: string
  name: string
  kind: 'human' | 'wait' | 'agent' | 'action' | 'condition'
  status: 'waiting' | 'executing' | 'unavailable' | 'failed'
  error: string
}
/** A run pins its submitted draft and inputs in Flowable variables. */
export interface ProcessDetail extends ProcessSummary {
  draftJson: string
  inputJson: string
  ownerSessionId: string
  workflowId: string
  workflowVersion: number
  items: EngineWorkItem[]
  completed: string[]
  results: Array<{ nodeId: string; json: string }>
}
/** Explicit start request; repeated delivery retains one business key in one DH host. */
export interface StartProcessRequest {
  requestId: string
  draftJson: string
  inputJson: string
}

/** Server-owned editable draft and its immutable active publication. */
export interface WorkflowTemplate {
  id: string
  tenantId: string
  revision: number
  lastVersion: number
  draftJson: string
  updatedAt: string
  published: WorkflowPublication | null
}
/** Exact engine definition selected by a publication. */
export interface WorkflowPublication {
  version: number
  definitionId: string
  draftJson: string
  publishedAt: string
}
/** Optimistic save; zero means create. */
export interface SaveTemplateRequest {
  id: string
  expectedRevision: number
  draftJson: string
}
/** Start only the current publication, with a caller-provided delivery key. */
export interface StartPublishedRequest {
  id: string
  version: number
  requestId: string
  inputJson: string
}

/** Published workflow identity displayed by the conversation selector. */
export interface WorkflowChoice {
  id: string
  version: number
  name: string
}
/** Server-owned conversation binding and current choices; selection never starts a run. */
export interface ConversationWorkflowState {
  sessionId: string
  revision: number
  selection: WorkflowChoice | null
  choices: WorkflowChoice[]
  selectedAvailable: boolean
  busy: boolean
}
/** Optimistic selection change; null explicitly returns to ordinary chat. */
export interface SelectConversationWorkflowRequest {
  expectedRevision: number
  selection: { id: string; version: number } | null
}

/** One current human task belonging to the conversation that started its run. */
export interface ConversationReviewTask {
  processId: ProcessId
  taskId: WorkItemId
  name: string
}
/** The oldest 30 pending reviews and full count, independent of the current workflow selection. */
export interface ConversationReviews {
  items: ConversationReviewTask[]
  following: ConversationFollow[]
  total: number
  refreshIntervalMs: number
  error: string
}
/** Workflow checkpoints followed by the original conversation without model polling. */
export interface ConversationFollow {
  processId: ProcessId
  name: string
  phase: 'running' | 'human' | 'wait' | 'settling' | 'blocked'
  step: string
}
/** Pinned process evidence and the exact current human node input; null means the task has ended. */
export interface ConversationReviewDetail {
  process: ProcessDetail
  inputJson: string | null
}
