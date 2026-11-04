/** Draft graph and preview behavior, including malformed imports and manual review/wait transitions. */
import { describe, expect, it } from 'vitest'
import { advancePreview, createNode, createTemplate, insertNode, parseDraft, removeNode, serializeDraft, startPreview, validateDraft } from '../src/shared/draft.ts'
import { createWorkbenchStore } from '../src/client/store.ts'
import { validateInputs } from '../src/host/catalog.ts'
import { en, zh } from '../src/client/locales.ts'

const t = ((key: keyof typeof zh, values?: Record<string, unknown>) => {
  let value: string = zh[key]
  for (const [name, replacement] of Object.entries(values ?? {})) value = value.replace(`{${name}}`, String(replacement))
  return value
})
const example = () => createTemplate('example', 'Order review', '', [
  { kind: 'start', name: 'Start' }, { kind: 'agent', name: 'Analyze', instruction: 'Compare records' },
  { kind: 'human', name: 'Review', role: 'Reviewer' }, { kind: 'wait', name: 'Wait' },
  { kind: 'action', name: 'Verify', action: 'eip.verify' }, { kind: 'end', name: 'End' },
])

describe('workflow drafts', () => {
  it('round-trips explicit configuration without preview state', () => {
    const draft = example()
    expect(validateDraft(draft)).toEqual([])
    expect(parseDraft(serializeDraft(draft))).toEqual(draft)
    expect(serializeDraft(draft)).not.toContain('completed')
  })
  it('inserts and removes nodes while exposing broken data dependencies', () => {
    let draft = example()
    draft = insertNode(draft, createNode('read', 'action', 'Read'), draft.nodes[0]!.id)
    expect(draft.nodes[0]!.next).toBe('read')
    expect(draft.nodes[1]!.next).toBe('example-1')
    draft.nodes[2]!.source = 'read'
    draft = removeNode(draft, 'read')
    expect(draft.nodes[0]!.next).toBe('example-1')
    expect(validateDraft(draft)).toContainEqual({ code: 'source', nodeId: 'example-1' })
    expect(removeNode(draft, draft.nodes[0]!.id)).toBe(draft)
    expect(insertNode(draft, createNode('unused', 'wait', 'Wait'), draft.nodes.at(-1)!.id)).toBe(draft)
  })
  it('rejects invalid structure and non-upstream input references', () => {
    const draft = example()
    draft.nodes[1]!.source = 'example-4'
    draft.nodes[2]!.next = draft.nodes[1]!.id
    draft.nodes[3]!.next = 'missing'
    const codes = validateDraft(draft).map(issue => issue.code)
    expect(codes).toEqual(expect.arrayContaining(['source', 'cycle', 'unreachable', 'target']))
    expect(startPreview(draft, 'run', true)).toBeUndefined()
    draft.nodes = []
    expect(validateDraft(draft).map(issue => issue.code)).toEqual(['start', 'end'])
  })
  it('requires both condition routes and does not evaluate arbitrary expressions', () => {
    let draft = example()
    const gate = createNode('condition', 'condition', 'Ready?')
    gate.instruction = 'input.ready === true'
    draft = insertNode(draft, gate, draft.nodes[0]!.id)
    expect(validateDraft(draft)).toContainEqual({ code: 'target', nodeId: gate.id })
    draft.nodes[1]!.otherwise = 'example-5'
    let run = startPreview(draft, 'run', false)!
    run = advancePreview(run, 'next')
    run = advancePreview(run, 'next')
    expect(run.current).toBe('example-5')
  })
  it.each([
    'null', '{}', '{"version":2,"draft":{}}',
    JSON.stringify({ version: 1, draft: { ...example(), nodes: [example().nodes[0], example().nodes[0]] } }),
    JSON.stringify({ version: 1, draft: { ...example(), nodes: [{ ...example().nodes[0], action: 'arbitrary.execute' }, example().nodes[1]] } }),
    JSON.stringify({ version: 1, draft: { ...example(), nodes: [{ ...example().nodes[0], role: 42 }, example().nodes[1]] } }),
  ])('refuses an unsupported or malformed imported draft', (input) => { expect(() => parseDraft(input)).toThrow() })
  it('refuses oversized imports', () => { expect(() => parseDraft(' '.repeat(131073))).toThrow('draft-size') })
})

describe('manual preview', () => {
  it('requires explicit simulated approval and arrival, and keeps a pinned graph', () => {
    const draft = example()
    let run = startPreview(draft, 'run', true)!
    draft.nodes[2]!.name = 'Edited after start'
    run = advancePreview(advancePreview(run, 'next'), 'next')
    expect(run.status).toBe('human')
    expect(run.draft.nodes[2]!.name).toBe('Review')
    expect(advancePreview(run, 'next').current).toBe(run.current)
    run = advancePreview(run, 'approve')
    expect(run.status).toBe('event')
    expect(advancePreview(run, 'next').current).toBe(run.current)
    run = advancePreview(run, 'arrived')
    run = advancePreview(advancePreview(run, 'next'), 'next')
    expect(run.status).toBe('completed')
    expect(run.completed).toHaveLength(6)
    expect(advancePreview(run, 'next')).toBe(run)
  })
  it('treats rejection as terminal', () => {
    let run = startPreview(example(), 'run', true)!
    run = advancePreview(advancePreview(run, 'next'), 'next')
    run = advancePreview(run, 'reject')
    expect(run.status).toBe('rejected')
    expect(advancePreview(run, 'approve')).toBe(run)
  })
  it('keeps all templates editable and uses the same preview path', () => {
    const store = createWorkbenchStore(t).create()
    const originalCount = store.getSnapshot().drafts.length
    for (const draft of store.getSnapshot().drafts) {
      expect(validateDraft(draft)).toEqual([])
      store.actions.open(draft.id)
      store.actions.preview(true)
      let run = store.getSnapshot().runs[0]!
      for (let step = 0; step < 20 && run.status !== 'completed'; step++) {
        store.actions.advance(run.id, run.status === 'human' ? 'approve' : run.status === 'event' ? 'arrived' : 'next')
        run = store.getSnapshot().runs.find(item => item.id === run.id)!
      }
      expect(run.status).toBe('completed')
    }
    store.actions.newDraft()
    store.actions.add('condition')
    store.actions.validate()
    expect(store.getSnapshot().issues).not.toEqual([])
    store.actions.duplicate()
    expect(store.getSnapshot().drafts).toHaveLength(originalCount + 2)
  })
})


describe('declared startup inputs', () => {
  const fields = [{ name: 'orderId', type: 'string' as const, description: 'Order identifier', required: true }]
  it('checks required fields, types, and undeclared parameters before execution', () => {
    expect(validateInputs(fields, { orderId: 'A001' })).toEqual({ orderId: 'A001' })
    for (const value of [{}, { orderId: 1 }, { orderId: 'A001', sessionId: 'forged' }, { orderId: 'x'.repeat(4097) }]) expect(() => validateInputs(fields, value)).toThrow()
    expect(validateInputs([{ ...fields[0]!, required: false }], {})).toEqual({})
  })
  it('rejects duplicate and prototype input names in imported definitions', () => {
    for (const inputs of [[...fields, ...fields], [{ ...fields[0], name: 'constructor' }], [{ ...fields[0], type: 'script' }]]) {
      expect(() => parseDraft(JSON.stringify({ version: 1, draft: { ...example(), inputs } }))).toThrow('draft-inputs')
    }
  })
})

it('pins the simulation and recommendation limits visible in both model tasks', async () => {
  await expect(JSON.stringify({ zh: [zh.demoClassifyTask, zh.demoBriefTask], en: [en.demoClassifyTask, en.demoBriefTask] }, null, 2) + '\n')
    .toMatchFileSnapshot('./expected/demo-prompts.expected.json')
})
