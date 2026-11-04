/** Shared editor drafts and explicitly simulated interaction state, retained across panel remounts. */
import { randomUUID } from '@deepseek-ai/dsh-util-crypto'
import { defineStore, type EngineStoreHandle } from '@deepseek-ai/dsh-client-store'
import type { Translate } from '@deepseek-ai/dsh-client-ui-slots'
import { advancePreview, copyDraft, draftNode, createNode, createTemplate, insertNode, removeNode, startPreview, validateDraft } from '../shared/draft.ts'
import { parseDraft } from '../shared/draft.ts'
import type { WorkflowTemplate } from '../shared/runtime.ts'
import type { WorkbenchKey } from './locales.ts'
import type { DraftIssue, DraftNode, NodeKind, PreviewDecision, PreviewRun, View, WorkflowDraft, WorkflowInputField } from '../shared/types.ts'

interface State {
  view: View
  drafts: WorkflowDraft[]
  revision: number
  selectedId: string
  selectedNode: string
  runs: PreviewRun[]
  selectedRun: string
  issues: DraftIssue[] | null
  notice: 'imported' | 'exported' | 'invalidImport' | null
}
type Actions = {
  openSaved(draft: State, record: WorkflowTemplate): void
  editInputs(draft: State, fields: WorkflowInputField[]): void
  view(draft: State, view: View): void
  open(draft: State, id: string): void
  selectNode(draft: State, id: string): void
  newDraft(draft: State): void
  duplicate(draft: State): void
  editDraft(draft: State, patch: Pick<WorkflowDraft, 'name' | 'description'>): void
  editNode(draft: State, patch: Partial<Omit<DraftNode, 'id' | 'kind'>>): void
  add(draft: State, kind: NodeKind): void
  remove(draft: State): void
  validate(draft: State): void
  importDraft(draft: State, value: WorkflowDraft): void
  notice(draft: State, value: State['notice']): void
  preview(draft: State, conditionPasses: boolean): void
  selectRun(draft: State, id: string): void
  advance(draft: State, id: string, decision: PreviewDecision): void
  stop(draft: State, id: string): void
}

/** Create the registration-owned draft and preview store; it does not persist or execute business tasks. */
export function createWorkbenchStore(t: Translate<WorkbenchKey>): EngineStoreHandle<State, Actions> {
  const eip = createTemplate('eip', t('eipName'), t('eipDescription'), [
    { kind: 'start', name: t('start') },
    { kind: 'action', name: t('readMes'), action: 'mes.read' },
    { kind: 'action', name: t('action.sdcc.read'), action: 'sdcc.read' },
    { kind: 'agent', name: t('compare'), instruction: t('compareTask') },
    { kind: 'human', name: t('review'), role: t('reviewer') },
    { kind: 'action', name: t('sync'), action: 'sdcc.sync' },
    { kind: 'wait', name: t('waitEip') },
    { kind: 'action', name: t('verify'), action: 'eip.verify' },
    { kind: 'action', name: t('ledger'), action: 'ledger.write' },
    { kind: 'end', name: t('end') },
  ])
  const report = createTemplate('report', t('reportName'), t('reportDescription'), [
    { kind: 'start', name: t('start') },
    { kind: 'action', name: t('readReport'), action: 'report.read' },
    { kind: 'agent', name: t('summarize'), instruction: t('summarizeTask') },
    { kind: 'human', name: t('review'), role: t('qualityRole') },
    { kind: 'action', name: t('archive'), action: 'report.archive' },
    { kind: 'end', name: t('end') },
  ])
  const engineSample = createTemplate('engine-check', t('engineSample'), t('engineSampleDescription'), [
    { kind: 'start', name: t('start') },
    { kind: 'action', name: t('echo'), action: 'core.echo' },
    { kind: 'human', name: t('review'), role: t('reviewer') },
    { kind: 'wait', name: t('waitReceipt') },
    { kind: 'condition', name: t('gate'), instruction: t('defaultCondition') },
    { kind: 'end', name: t('endPassed') },
    { kind: 'end', name: t('endFailed') },
  ])
  engineSample.inputs = [{ name: 'approved', description: t('gate'), type: 'boolean', required: true }]
  const condition = engineSample.nodes[4], firstEnd = engineSample.nodes[5]
  if (condition && firstEnd) {
    condition.source = ''; condition.field = 'approved'; condition.otherwise = 'engine-check-6'
    firstEnd.next = ''
    const lastEnd = engineSample.nodes[6]
    if (lastEnd) lastEnd.source = condition.id
  }
  const wecom = createTemplate('wecom-todos', t('wecomName'), t('wecomDescription'), [
    { kind: 'start', name: t('start') },
    { kind: 'action', name: t('wecomRead'), action: 'wecom.todos.list' },
    { kind: 'agent', name: t('wecomAnalyze'), instruction: t('wecomTask') },
    { kind: 'human', name: t('wecomReview'), role: t('reviewer') },
    { kind: 'end', name: t('end') },
  ])
  const demo = createTemplate('wecom-todos-demo', t('demoName'), t('demoDescription'), [
    { kind: 'start', name: t('start') },
    { kind: 'action', name: t('demoRead'), action: 'demo.wecom.todos' },
    { kind: 'agent', name: t('demoClassify'), instruction: t('demoClassifyTask') },
    { kind: 'condition', name: t('demoRoute'), instruction: t('demoRule') },
    { kind: 'human', name: t('demoRiskReview'), role: t('demoReviewer') },
    { kind: 'agent', name: t('demoBrief'), instruction: t('demoBriefTask') },
    { kind: 'human', name: t('demoFinalReview'), role: t('demoReviewer') },
    { kind: 'end', name: t('end') },
  ])
  demo.inputs = [{ name: 'scenario', description: t('demoScenario'), type: 'string', required: true }]
  Object.assign(draftNode(demo, 'wecom-todos-demo-1'), { source: '', field: 'scenario' })
  Object.assign(draftNode(demo, 'wecom-todos-demo-3'), { source: 'wecom-todos-demo-1',
    field: 'result.requires_review', otherwise: 'wecom-todos-demo-5' })
  draftNode(demo, 'wecom-todos-demo-4').source = 'wecom-todos-demo-2'
  draftNode(demo, 'wecom-todos-demo-5').source = 'wecom-todos-demo-2'
  const selected = (state: State): WorkflowDraft => {
    const value = state.drafts.find(item => item.id === state.selectedId)
    if (!value) throw new Error('workflow-draft-missing')
    return value
  }
  const replace = (state: State, value: WorkflowDraft): void => {
    state.drafts = state.drafts.map(item => item.id === state.selectedId ? value : item)
    state.issues = null
    state.notice = null
  }
  const open = (state: State, value: WorkflowDraft): void => {
    state.revision = 0
    state.selectedId = value.id
    state.selectedNode = draftNode(value).id
    state.view = 'editor'
    state.issues = null
    state.notice = null
  }
  return defineStore({
    init: (): State => ({ view: 'flows', revision: 0, drafts: [eip, report, engineSample, wecom, demo], selectedId: eip.id,
      selectedNode: draftNode(eip).id, runs: [], selectedRun: '', issues: null, notice: null }),
    actions: {
      openSaved: (d, record) => {
        const value = parseDraft(record.draftJson)
        const index = d.drafts.findIndex(item => item.id === value.id)
        if (index < 0) d.drafts.push(value)
        else d.drafts[index] = value
        open(d, value)
        d.revision = record.revision
      },
      editInputs: (d, fields) => { replace(d, { ...selected(d), inputs: fields }) },
      view: (d, view: View) => { d.view = view },
      open: (d, id: string) => { const value = d.drafts.find(item => item.id === id); if (value) open(d, value) },
      selectNode: (d, id: string) => { d.selectedNode = id },
      newDraft: (d) => {
        const value = createTemplate(randomUUID(), t('unnamed'), '', [
          { kind: 'start', name: t('start') }, { kind: 'end', name: t('end') },
        ])
        d.drafts.push(value)
        open(d, value)
      },
      duplicate: (d) => {
        const value = copyDraft(selected(d))
        value.id = randomUUID()
        value.name = t('copy', { name: value.name })
        d.drafts.push(value)
        open(d, value)
      },
      editDraft: (d, patch: Pick<WorkflowDraft, 'name' | 'description'>) => { replace(d, { ...selected(d), ...patch }) },
      editNode: (d, patch: Partial<Omit<DraftNode, 'id' | 'kind'>>) => {
        replace(d, { ...selected(d), nodes: selected(d).nodes.map(node => node.id === d.selectedNode ? { ...node, ...patch } : node) })
      },
      add: (d, kind: NodeKind) => {
        const value = selected(d)
        if (value.nodes.length >= 64 || kind === 'start' || kind === 'end') return
        const node = createNode(randomUUID(), kind, t('newNode', { kind: t(kind === 'action' ? 'kind.action' : kind) }))
        if (kind === 'agent') node.instruction = t('defaultAgent')
        if (kind === 'condition') node.instruction = t('defaultCondition')
        if (kind === 'human') node.role = t('reviewer')
        const changed = insertNode(value, node, d.selectedNode)
        if (changed !== value) { replace(d, changed); d.selectedNode = node.id }
      },
      remove: (d) => {
        const value = removeNode(selected(d), d.selectedNode)
        replace(d, value)
        d.selectedNode = draftNode(value).id
      },
      validate: (d) => { d.issues = validateDraft(selected(d)); d.notice = null },
      importDraft: (d, input: WorkflowDraft) => {
        const value = copyDraft(input)
        value.id = randomUUID()
        d.drafts.push(value)
        open(d, value)
        d.notice = 'imported'
      },
      notice: (d, notice: State['notice']) => { d.notice = notice },
      preview: (d, conditionPasses: boolean) => {
        const value = startPreview(selected(d), randomUUID(), conditionPasses)
        d.issues = validateDraft(selected(d))
        if (!value) return
        d.runs = [value, ...d.runs].slice(0,20)
        d.selectedRun = value.id
        d.view = 'runs'
      },
      selectRun: (d, id: string) => { d.selectedRun = id; d.view = 'runs' },
      advance: (d, id: string, decision: PreviewDecision) => {
        d.runs = d.runs.map(run => run.id === id ? advancePreview(run, decision) : run)
      },
      stop: (d, id: string) => {
        d.runs = d.runs.map(run => run.id === id && !['completed', 'rejected', 'stopped'].includes(run.status)
          ? { ...run, status: 'stopped' } : run)
      },
    },
  })
}
