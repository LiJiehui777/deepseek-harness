/** Draft editing and bounded, manual simulation with no model or business-system calls. */
import type { ActionId, DraftIssue, DraftNode, NodeKind, PreviewDecision, PreviewRun, WorkflowDraft, WorkflowInputField } from './types.ts'

export const NODE_KINDS: readonly NodeKind[] = ['start', 'action', 'agent', 'condition', 'human', 'wait', 'end']
export const ACTION_IDS: readonly ActionId[] = ['core.echo', 'demo.wecom.todos', 'wecom.todos.list', 'mes.read', 'sdcc.read', 'sdcc.sync', 'eip.verify', 'ledger.write', 'report.read', 'report.archive']

/** Create a node with explicit empty bindings and a default read action. */
export function createNode(id: string, kind: NodeKind, name: string): DraftNode {
  return { id, kind, name, action: 'mes.read', instruction: '', source: '', field: '', role: '', next: '', otherwise: '', operator: 'eq', expected: 'true' }
}

/** Create a connected template; all localized sample names come from the caller. */
export function createTemplate(id: string, name: string, description: string, steps: Array<{
  kind: NodeKind
  name: string
  action?: ActionId
  instruction?: string
  role?: string
}>): WorkflowDraft {
  const nodes = steps.map((step, index) => ({
    ...createNode(`${id}-${index}`, step.kind, step.name),
    action: step.action ?? 'mes.read', instruction: step.instruction ?? '', role: step.role ?? '',
    source: index > 0 ? `${id}-${index - 1}` : '',
    field: index > 0 ? 'result' : '',
    next: index < steps.length - 1 ? `${id}-${index + 1}` : '',
  }))
  return { id, name, description, inputs: [], nodes }
}

/** Return an independent snapshot for import, duplication, and pinned previews. */
export function copyDraft(draft: WorkflowDraft): WorkflowDraft {
  return { ...draft, inputs: draft.inputs.map(field => ({ ...field })), nodes: draft.nodes.map(node => ({ ...node })) }
}

/** Check graph structure and upstream bindings without claiming business authorization. */
export function validateDraft(draft: WorkflowDraft): DraftIssue[] {
  const issues: DraftIssue[] = []
  const nodes = new Map(draft.nodes.map(node => [node.id, node]))
  const starts = draft.nodes.filter(node => node.kind === 'start')
  const add = (code: DraftIssue['code'], nodeId = ''): void => { issues.push({ code, nodeId }) }
  if (starts.length !== 1) add('start')
  if (!draft.nodes.some(node => node.kind === 'end')) add('end')
  if (!draft.name.trim()) add('required')
  const ancestors = (id: string, seen = new Set<string>()): Set<string> => {
    for (const candidate of draft.nodes) {
      if ((candidate.next === id || (candidate.kind === 'condition' && candidate.otherwise === id)) && !seen.has(candidate.id)) {
        seen.add(candidate.id)
        ancestors(candidate.id, seen)
      }
    }
    return seen
  }
  for (const node of draft.nodes) {
    if (!node.name.trim() || (node.kind === 'agent' && !node.instruction.trim())
      || (node.kind === 'human' && !node.role.trim())
      || (node.kind === 'condition' && !node.instruction.trim())) add('required', node.id)
    const targets = node.kind === 'end' ? [] : [node.next, ...(node.kind === 'condition' ? [node.otherwise] : [])]
    if (targets.some(target => !nodes.has(target))) add('target', node.id)
    if (node.kind === 'end' && (node.next || node.otherwise)) add('target', node.id)
    if (node.source && (!nodes.has(node.source) || !ancestors(node.id).has(node.source)
      || node.source === node.id || !node.field.trim())) add('source', node.id)
  }
  const visited = new Set<string>(), active = new Set<string>()
  const visit = (id: string): void => {
    if (active.has(id)) { add('cycle', id); return }
    if (visited.has(id)) return
    visited.add(id)
    const node = nodes.get(id)
    if (!node) return
    active.add(id)
    if (node.kind !== 'end') {
      visit(node.next)
      if (node.kind === 'condition') visit(node.otherwise)
    }
    active.delete(id)
  }
  const [start] = starts
  if (starts.length === 1 && start) {
    visit(start.id)
    for (const node of draft.nodes) if (!visited.has(node.id)) add('unreachable', node.id)
  }
  return issues
}

/** Insert after a selected node, preserving its successor and existing incoming edges. */
export function insertNode(draft: WorkflowDraft, node: DraftNode, selectedId: string): WorkflowDraft {
  const result = copyDraft(draft)
  const index = result.nodes.findIndex(item => item.id === selectedId)
  const selected = result.nodes[index]
  if (!selected || selected.kind === 'end') return draft
  node = { ...node, next: selected.next, source: selected.id, field: 'result' }
  selected.next = node.id
  result.nodes.splice(index + 1, 0, node)
  return result
}

/** Remove an intermediate node and preserve explicit dangling data bindings for validation. */
export function removeNode(draft: WorkflowDraft, id: string): WorkflowDraft {
  const removed = draft.nodes.find(node => node.id === id)
  if (!removed || removed.kind === 'start' || removed.kind === 'end') return draft
  return { ...draft, nodes: draft.nodes.filter(node => node.id !== id).map(node => ({
    ...node, next: node.next === id ? removed.next : node.next,
    otherwise: node.otherwise === id ? removed.next : node.otherwise,
  })) }
}

/** Start a manual preview only after draft validation, using an independent graph snapshot. */
export function startPreview(draft: WorkflowDraft, id: string, conditionPasses: boolean): PreviewRun | undefined {
  if (validateDraft(draft).length) return undefined
  const start = draft.nodes.find(node => node.kind === 'start')
  if (!start) return undefined
  return { id, draft: copyDraft(draft), current: start.id,
    status: 'ready', completed: [], conditionPasses }
}

/** Advance only the expected preview action; approval and arrival are explicitly simulated. */
export function advancePreview(run: PreviewRun, decision: PreviewDecision): PreviewRun {
  const node = run.draft.nodes.find(item => item.id === run.current)
  if (!node || ['completed', 'rejected', 'stopped'].includes(run.status)) return run
  if (node.kind === 'human') {
    if (decision === 'reject') return { ...run, status: 'rejected' }
    if (decision !== 'approve') return { ...run, status: 'human' }
  } else if (node.kind === 'wait') {
    if (decision !== 'arrived') return { ...run, status: 'event' }
  } else if (decision !== 'next') return run
  const completed = [...run.completed, node.id]
  if (node.kind === 'end') return { ...run, completed, status: 'completed' }
  const next = node.kind === 'condition' && !run.conditionPasses ? node.otherwise : node.next
  const target = draftNode(run.draft, next)
  return { ...run, current: next, completed,
    status: target.kind === 'human' ? 'human' : target.kind === 'wait' ? 'event' : 'ready' }
}

/** Parse the versioned draft interchange format; imported graphs remain editable even with semantic issues. */
export function parseDraft(text: string): WorkflowDraft {
  if (text.length > 131072) throw new Error('draft-size')
  const input: unknown = JSON.parse(text)
  const object = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)
  if (!object(input) || input.version !== 1 || !object(input.draft)) throw new Error('draft-format')
  const draft = input.draft
  if (typeof draft.id !== 'string' || !draft.id || typeof draft.name !== 'string'
    || typeof draft.description !== 'string' || !Array.isArray(draft.nodes)
    || draft.nodes.length < 2 || draft.nodes.length > 64) throw new Error('draft-format')
  const ids = new Set<string>()
  const nodes = draft.nodes.map((value: unknown): DraftNode => {
    if (!object(value) || typeof value.id !== 'string' || !value.id || value.id.length > 128 || ids.has(value.id)
      || !NODE_KINDS.includes(value.kind as NodeKind) || !ACTION_IDS.includes(value.action as ActionId)) throw new Error('draft-node')
    const fields = ['name', 'instruction', 'source', 'field', 'role', 'next', 'otherwise'] as const
    for (const key of fields) if (typeof value[key] !== 'string' || value[key].length > 4096) throw new Error('draft-node')
    if ((value.name as string).length > 256) throw new Error('draft-node')
    ids.add(value.id)
    if (value.operator !== undefined && (typeof value.operator !== 'string' || !['eq', 'neq', 'exists'].includes(value.operator))) throw new Error('draft-node')
    if (value.expected !== undefined && (typeof value.expected !== 'string' || value.expected.length > 4096)) throw new Error('draft-node')
    return { id: value.id, kind: value.kind as NodeKind, action: value.action as ActionId,
      operator: (value.operator ?? 'eq') as DraftNode['operator'], expected: (value.expected ?? 'true'),
      name: value.name as string, instruction: value.instruction as string, source: value.source as string,
      field: value.field as string, role: value.role as string, next: value.next as string, otherwise: value.otherwise as string }
  })
  const fields = draft.inputs ?? []
  if (!Array.isArray(fields) || fields.length > 16) throw new Error('draft-inputs')
  const names = new Set<string>()
  const inputs = fields.map((field: unknown): WorkflowInputField => {
    if (!object(field) || typeof field.name !== 'string' || !/^[A-Za-z][A-Za-z0-9_]{0,47}$/.test(field.name)
      || ['constructor', 'prototype', '__proto__'].includes(field.name) || names.has(field.name)
      || typeof field.description !== 'string' || field.description.length > 512
      || !['string', 'number', 'boolean'].includes(String(field.type)) || typeof field.required !== 'boolean') throw new Error('draft-inputs')
    names.add(field.name)
    return { name: field.name, description: field.description, type: field.type as WorkflowInputField['type'], required: field.required }
  })
  if (draft.id.length > 128 || draft.name.length > 256 || draft.description.length > 4096) throw new Error('draft-format')
  return { id: draft.id, name: draft.name, description: draft.description, inputs, nodes }
}

/** Serialize only draft configuration, excluding preview records, accounts, and credentials. */
export function serializeDraft(draft: WorkflowDraft): string {
  return JSON.stringify({ version: 1, draft }, null, 2)
}

/** Resolve a node in an editor draft or pinned preview; inconsistent local selections fail loud.
 * @param draft - selected draft or preview snapshot.
 * @param id - node identifier; omission selects the first node.
 * @returns the selected node.
 */
export function draftNode(draft: WorkflowDraft, id = draft.nodes[0]?.id): DraftNode {
  const node = draft.nodes.find(item => item.id === id)
  if (!node) throw new Error('workflow-node-missing')
  return node
}
