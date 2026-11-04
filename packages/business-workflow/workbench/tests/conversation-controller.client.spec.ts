/** A selector scope owns one mutation and drains it on teardown. */
import { brandString } from '@deepseek-ai/dsh-brand'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import { expect, it, vi } from 'vitest'
import { ConversationChoiceController } from '../src/client/conversation-controller.ts'
import type { ConversationWorkflowState } from '../src/shared/runtime.ts'

it('serializes picks and waits for an accepted write before releasing the Session scope', async () => {
  const sessionId = brandString<SessionId>('selector-owner')
  const choice = { id: 'review', version: 1, name: 'Review' }
  const initial: ConversationWorkflowState = { sessionId, revision: 0, selection: null,
    choices: [choice], selectedAvailable: true, busy: false }
  let resolve!: (value: { ok: true; value: ConversationWorkflowState }) => void
  const write = new Promise<{ ok: true; value: ConversationWorkflowState }>((done) => { resolve = done })
  const select = vi.fn(() => write)
  const controller = new ConversationChoiceController({
    conversationWorkflow: () => Promise.resolve({ ok: true, value: initial }), selectConversationWorkflow: select,
  } as never, sessionId)
  await controller.load()
  const face = controller.face()
  const first = face.choose(choice)
  expect(await face.choose(null)).toBe(false)
  expect(select).toHaveBeenCalledTimes(1)
  expect(select).toHaveBeenCalledWith(sessionId, { expectedRevision: 0, selection: { id: choice.id, version: 1 } })
  let closed = false
  const disposal = controller.dispose().then(() => { closed = true })
  await Promise.resolve()
  expect(closed).toBe(false)
  resolve({ ok: true, value: { ...initial, revision: 1, selection: choice } })
  expect(await first).toBe(true)
  await disposal
  expect(closed).toBe(true)
  expect(await face.choose(choice)).toBe(false)
})
