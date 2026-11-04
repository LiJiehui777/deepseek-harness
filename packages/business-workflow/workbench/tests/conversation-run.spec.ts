/** Suspended turns spend no model calls and resume only from current, owned engine facts. */
import { Context } from '@deepseek-ai/cordis'
import { agentEvents, type Agent } from '@deepseek-ai/dsh-agent'
import { brandString } from '@deepseek-ai/dsh-brand'
import type { SessionId } from '@deepseek-ai/dsh-session'
import type { UserMessage } from '@deepseek-ai/dsh-llm'
import Storage, { storageBackendServiceKey } from '@deepseek-ai/dsh-storage'
import * as StorageDomain from '@deepseek-ai/dsh-storage-domain'
import { MemoryMediaPool, MemoryStorageBackend } from '../../../storage/storage-domain/tests/helpers/memory-backend.ts'
import { expect, it, vi } from 'vitest'
import { join } from 'node:path'
import { ConversationRuns, conversationRunSpec } from '../src/host/conversation-run.ts'
import { FlowableError } from '../src/host/flowable.ts'
import type { ProcessDetail, ProcessId, WorkItemId } from '../src/shared/runtime.ts'

async function fixture(pool = new MemoryMediaPool()) {
  const ctx = new Context(), lifetime = new AbortController()
  await ctx.plugin(Storage).await()
  const backend = new MemoryStorageBackend(pool)
  ctx.storage.backend.register('memory', backend)
  ctx.provide(storageBackendServiceKey('memory'), backend)
  await ctx.plugin(StorageDomain, { backend: 'memory' }).await()
  const domain = await ctx.storageDomain.open(conversationRunSpec)
  const flush = vi.fn(() => Promise.resolve())
  ctx.provide('sessions', { flush } as never)
  ctx.provide('agents', { list: () => [] } as never)
  const owner = brandString<SessionId>('follow-owner')
  const state: { run: ProcessDetail; unavailable: boolean } = { unavailable: false, run: {
    id: brandString<ProcessId>('run'), ownerSessionId: owner, name: 'Workflow', status: 'running', startedAt: '', endedAt: '',
    draftJson: '', inputJson: '{}', workflowId: 'test', workflowVersion: 1, completed: [], results: [],
    items: [{ id: brandString<WorkItemId>('human'), nodeId: 'human', kind: 'human', name: 'Review', status: 'waiting', error: '' }],
  } }
  const read = vi.fn(async () => {
    if (state.unavailable) throw new FlowableError('FLOWABLE_UNAVAILABLE')
    return state.run
  })
  const follows = new ConversationRuns(ctx, domain, 'test', 10, lifetime.signal, read)
  const steer = vi.fn<(message: UserMessage) => void>()
  const agent = { id: owner, status: 'running', ctx, session: { id: owner }, inbox: { nextStep: [], nextTurn: [] }, steer } as unknown as Agent
  return { ctx, lifetime, domain, owner, state, read, follows, agent, steer, flush, pool,
    stop: () => { lifetime.abort() }, close: async () => { lifetime.abort(); await follows.dispose(); await ctx.fiber.dispose() } }
}

it('holds the same turn through review and execution, then steers saved completion facts once', async () => {
  const f = await fixture()
  try {
    await f.follows.attach(f.owner, f.state.run, new AbortController().signal)
    let ended = false
    const waiting = agentEvents(f.ctx, f.agent).serial('agent/turn-stopping', { turn: 1, signal: new AbortController().signal })
      .then(() => { ended = true })
    await vi.waitFor(() => { expect(f.read.mock.calls.length).toBeGreaterThan(1) })
    expect(ended).toBe(false)
    expect(f.steer).not.toHaveBeenCalled()
    f.state.run = { ...f.state.run, items: [{ ...f.state.run.items[0]!, kind: 'agent', status: 'executing' }] }
    expect((await f.follows.state(f.owner))[0]?.phase).toBe('running')
    expect(f.steer).not.toHaveBeenCalled()
    f.state.run = { ...f.state.run, status: 'completed', items: [], results: [{ nodeId: 'analysis', json: '{"result":"Evidence"}' }] }
    await waiting
    expect(f.steer).toHaveBeenCalledTimes(1)
    expect(f.steer.mock.calls[0]![0].source).toMatchObject({ kind: 'business-workflow', form: 'notice' })
    await expect(JSON.stringify(f.steer.mock.calls[0]![0].content, null, 2))
      .toMatchFileSnapshot(join(import.meta.dirname, 'expected/conversation-completion.expected.json'))
    expect(JSON.stringify(f.steer.mock.calls[0]![0])).toContain('Evidence')
    expect(f.flush).toHaveBeenCalledTimes(1)
    expect(f.domain.table('runs').get(f.state.run.id)).toBeUndefined()
  } finally { await f.close() }
})

it('retains follows across host disposal and wakes an owner reopened from persisted storage', async () => {
  const first = await fixture()
  await first.follows.attach(first.owner, first.state.run, new AbortController().signal)
  const waiting = agentEvents(first.ctx, first.agent).serial('agent/turn-stopping', { turn: 1, signal: new AbortController().signal })
  await vi.waitFor(() => { expect(first.read).toHaveBeenCalled() })
  await first.close(); await waiting
  expect(first.steer).not.toHaveBeenCalled()
  const second = await fixture(first.pool)
  try {
    const idle = { ...second.agent, status: 'idle' as const }
    await agentEvents(second.ctx, idle).serial('agent/created', { source: 'resume' })
    expect(second.steer).toHaveBeenCalledTimes(1)
    expect(JSON.stringify(second.steer.mock.calls[0]![0])).toContain('already-started')
    await expect(JSON.stringify(second.steer.mock.calls[0]![0].content, null, 2))
      .toMatchFileSnapshot(join(import.meta.dirname, 'expected/conversation-resume.expected.json'))
    expect(second.domain.table('runs').get(second.state.run.id)?.sessionId).toBe(second.owner)
  } finally { await second.close() }
})

it('ends waiting after user cancellation and removes follow ownership before any later resume', async () => {
  const f = await fixture(), signal = new AbortController()
  try {
    await f.follows.attach(f.owner, f.state.run, signal.signal)
    const waiting = agentEvents(f.ctx, f.agent).serial('agent/turn-stopping', { turn: 1, signal: signal.signal })
    await vi.waitFor(() => { expect(f.read).toHaveBeenCalled() })
    signal.abort({ kind: 'user' })
    await waiting
    f.ctx.emit('session/event', f.agent.session, { type: 'turn/end', data: { turn: 1,
      reason: { kind: 'aborted', reason: { kind: 'user' } } } } as never)
    await vi.waitFor(() => { expect(f.domain.table('runs').get(f.state.run.id)).toBeUndefined() })
    f.follows.resume({ ...f.agent, status: 'idle' })
    expect(f.steer).not.toHaveBeenCalled()
    expect(f.state.run.status).toBe('running')
  } finally { await f.close() }
})

it('keeps waiting through an outage, but lets queued user input reach the loop', async () => {
  const f = await fixture()
  try {
    await f.follows.attach(f.owner, f.state.run, new AbortController().signal)
    f.state.unavailable = true
    const waiting = agentEvents(f.ctx, f.agent).serial('agent/turn-stopping', { turn: 1, signal: new AbortController().signal })
    await vi.waitFor(() => { expect(f.read.mock.calls.length).toBeGreaterThan(2) })
    expect(f.steer).not.toHaveBeenCalled()
    f.state.unavailable = false
    const nextTurn = f.agent.inbox.nextTurn as UserMessage[]
    nextTurn.push({} as UserMessage)
    await waiting
    expect(f.steer).not.toHaveBeenCalled()
    expect(f.domain.table('runs').get(f.state.run.id)).toBeDefined()
  } finally { await f.close() }
})

it('reports rejection or a blocked node and refuses to attach a foreign owner', async () => {
  const f = await fixture()
  try {
    await expect(f.follows.attach('foreign', f.state.run, new AbortController().signal)).rejects.toThrow('NOT_OWNED_BY_CONVERSATION')
    await f.follows.attach(f.owner, f.state.run, new AbortController().signal)
    f.state.run = { ...f.state.run, status: 'canceled', items: [] }
    await agentEvents(f.ctx, f.agent).serial('agent/turn-stopping', { turn: 1, signal: new AbortController().signal })
    expect(JSON.stringify(f.steer.mock.calls[0]![0])).toContain('canceled')
    await f.follows.attach(f.owner, f.state.run, new AbortController().signal)
    f.state.run = { ...f.state.run, status: 'running', items: [{ id: brandString<WorkItemId>('failed'), nodeId: 'failed',
      kind: 'action', name: 'Missing connector', status: 'unavailable', error: 'CONNECTOR_NOT_CONFIGURED' }] }
    await agentEvents(f.ctx, f.agent).serial('agent/turn-stopping', { turn: 2, signal: new AbortController().signal })
    expect(JSON.stringify(f.steer.mock.calls[1]![0])).toContain('CONNECTOR_NOT_CONFIGURED')
  } finally { await f.close() }
})

it('bounds the entire completion notice when multibyte evidence and optional details are oversized', async () => {
  const f = await fixture()
  try {
    f.state.run = { ...f.state.run, status: 'completed',
      results: [{ nodeId: 'analysis', json: JSON.stringify({ result: '证据'.repeat(100000) }) }],
      items: Array.from({ length: 64 }, () => ({ id: brandString<WorkItemId>('failed'), nodeId: 'failed', kind: 'action',
        name: '步骤'.repeat(128), status: 'failed', error: '错误'.repeat(128) })),
    }
    await f.follows.attach(f.owner, f.state.run, new AbortController().signal)
    await agentEvents(f.ctx, f.agent).serial('agent/turn-stopping', { turn: 1, signal: new AbortController().signal })
    const text = f.steer.mock.calls[0]![0].content.flatMap(block => block.type === 'text' ? [block.text] : []).join('')
    expect(Buffer.byteLength(text, 'utf8')).toBeLessThan(65536)
    expect(text).toContain('"outputsOmitted":true')
    expect(text).toContain('"detailsOmitted":true')
  } finally { await f.close() }
})
