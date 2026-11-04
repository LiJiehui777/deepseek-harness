/** Account pages share one revision and cannot mutate a sibling account. */
import { expect, it, vi } from 'vitest'
import { stubConfigForm } from '@deepseek-ai/dsh-client-test-runtime'
import { accountForm, type EnterpriseAccountForms } from '../src/client/account-form.ts'

it('projects stable account snapshots and keeps parent revision fences on nested writes', async () => {
  const host = stubConfigForm<EnterpriseAccountForms>()
  host.publish({ status: 'ready', writable: true, value: { wecom: { enabled: true } } as EnterpriseAccountForms,
    base: { wecom: { enabled: false } }, user: { feishu: { enabled: true } }, revision: 9 })
  const child = accountForm(host.scope, 'wecom')
  const first = child.getSnapshot()
  expect(child.getSnapshot()).toBe(first)
  expect(first).toMatchObject({ value: { enabled: true }, base: { enabled: false }, revision: 9 })
  expect(first.user).toBeUndefined()
  await child.mutate([{ op: 'set', path: ['allowedChats'], value: ['chat-a'] }], 9)
  expect(host.mutate).toHaveBeenLastCalledWith([{ op: 'set', path: ['wecom', 'allowedChats'], value: ['chat-a'] }], 9)
  await child.set('enabled', false)
  expect(host.mutate).toHaveBeenLastCalledWith([{ op: 'set', path: ['wecom', 'enabled'], value: false }])
  await child.unset('enabled')
  expect(host.mutate).toHaveBeenLastCalledWith([{ op: 'unset', path: ['wecom', 'enabled'] }])
  const listener = vi.fn()
  const dispose = child.subscribe(listener)
  host.publish({ revision: 10, writable: false })
  expect(listener).toHaveBeenCalledOnce()
  expect(child.getSnapshot()).toMatchObject({ revision: 10, writable: false })
  expect(child.getSnapshot()).not.toBe(first)
  dispose()
  host.publish({ revision: 11 })
  expect(listener).toHaveBeenCalledOnce()
})
