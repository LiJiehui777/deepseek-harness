/** Office account admission uses trusted live or persisted Session ancestry. */
import type { Agent } from '@deepseek-ai/dsh-agent'
import { Session, SessionId } from '@deepseek-ai/dsh-session'
import { expect, it, vi } from 'vitest'
import { requireLocalOfficeConversation } from '../src/wecom-office/policy.ts'

it('rejects remote descendants, unknown parents and cyclic ancestry while allowing resolved local forks', async () => {
  const local = Session.create(SessionId('local-parent'))
  const remote = Session.create(SessionId('enterprise-remote-parent'))
  const child = (parent: Session) => {
    const id = SessionId('child')
    return Session.create(id, [], { ...local.header, id, parentSession: parent.id })
  }
  const sessions = new Map([local, remote].map(session => [session.id, session]))
  const ctx = { get: (key: string) => key === 'sessions' ? { get: (id: SessionId) => sessions.get(id) } : undefined } as never
  const run = (session: Session) => requireLocalOfficeConversation(ctx, { session } as Agent, new AbortController().signal)
  await expect(run(child(local))).resolves.toBeUndefined()
  await expect(run(child(remote))).rejects.toThrow('permission-denied')
  sessions.clear()
  await expect(run(child(local))).rejects.toThrow('permission-denied')
  const cyclic = child(local)
  sessions.set(local.id, cyclic)
  await expect(run(cyclic)).rejects.toThrow('permission-denied')
})

it('releases persisted observations and fails closed when persisted ancestry is missing', async () => {
  const parent = Session.create(SessionId('enterprise-persisted-parent'))
  const id = SessionId('fork-child')
  const child = Session.create(id, [], { ...parent.header, id, parentSession: parent.id })
  const disposed = vi.fn()
  const observeSession = vi.fn(async () => ({ header: parent.header, [Symbol.dispose]: disposed }))
  const ctx = { get: (key: string) => key === 'sessionQuery' ? { observeSession } : undefined } as never
  await expect(requireLocalOfficeConversation(ctx, { session: child } as Agent, new AbortController().signal)).rejects.toThrow('permission-denied')
  expect(disposed).toHaveBeenCalledOnce()
  observeSession.mockRejectedValueOnce(new Error('Missing persisted parent'))
  await expect(requireLocalOfficeConversation(ctx, { session: child } as Agent, new AbortController().signal)).rejects.toThrow('permission-denied')
})
