/** Browser-only draft and preview data; these are not engine execution receipts. */
export type NodeKind = 'start' | 'action' | 'agent' | 'condition' | 'human' | 'wait' | 'end'
export type ActionId = 'core.echo' | 'demo.wecom.todos' | 'wecom.todos.list' | 'mes.read' | 'sdcc.read' | 'sdcc.sync' | 'eip.verify' | 'ledger.write' | 'report.read' | 'report.archive'
export type View = 'flows' | 'editor' | 'instances' | 'inbox' | 'runs' | 'tasks'
export interface DraftNode {
  id: string
  kind: NodeKind
  name: string
  action: ActionId
  instruction: string
  source: string
  field: string
  role: string
  next: string
  otherwise: string
  operator: 'eq' | 'neq' | 'exists'
  expected: string
}
/** Startup fields advertised to the Agent and validated before acceptance. */
export interface WorkflowInputField {
  name: string
  description: string
  type: 'string' | 'number' | 'boolean'
  required: boolean
}
export interface WorkflowDraft {
  id: string
  name: string
  description: string
  inputs: WorkflowInputField[]
  nodes: DraftNode[]
}
export type IssueCode = 'start' | 'end' | 'target' | 'cycle' | 'unreachable' | 'source' | 'required'
export interface DraftIssue { code: IssueCode; nodeId: string }
export type PreviewStatus = 'ready' | 'human' | 'event' | 'completed' | 'rejected' | 'stopped'
export interface PreviewRun {
  id: string
  draft: WorkflowDraft
  current: string
  status: PreviewStatus
  completed: string[]
  conditionPasses: boolean
}
export type PreviewDecision = 'next' | 'approve' | 'reject' | 'arrived'
