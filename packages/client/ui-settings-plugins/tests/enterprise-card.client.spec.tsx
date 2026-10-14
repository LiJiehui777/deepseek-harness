// @vitest-environment jsdom
/** Identity selection stages native settings and exposes only the selected authorization instructions. */
import { useSyncExternalStore } from 'react'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { stubSettingsScope } from '@deepseek-ai/dsh-client-test-runtime'
import { EnterpriseCard, type EnterpriseCardProps } from '../src/client/EnterpriseCard.tsx'
import { EnterpriseCardController, type EnterpriseSettings } from '../src/client/enterprise-card-controller.ts'
import { en, zh, type PluginsSettingsLocaleKey } from '../src/client/locales.ts'

const controllers: EnterpriseCardController[] = []
afterEach(() => { cleanup(); for (const controller of controllers.splice(0)) controller.dispose() })

function bench(identity: 'app' | 'user' = 'app', writable = true) {
  const host = stubSettingsScope<EnterpriseSettings>()
  const value: EnterpriseSettings = {
    enabled: true, appId: 'cli_fixture', secretRef: 'FEISHU_APP_SECRET',
    baseURL: 'https://open.feishu.cn', readIdentity: identity, readEnabled: true,
    receiveEnabled: false, sendEnabled: false, allowedSenders: ['user_a'], allowedChats: ['chat_a'],
    redirectURI: '', userScopes: ['im:chat:read'], workspacePath: '', agentPreset: 'standard',
  }
  host.publish({ status: 'ready', writable, value, base: { ...value, readIdentity: 'app' }, user: { readIdentity: identity }, revision: 1 })
  host.set.mockImplementation((field: string, next: unknown) => {
    const current = host.scope.getSnapshot()
    host.publish({ value: { ...current.value, [field]: next }, user: { ...current.user as object, [field]: next } })
  })
  const revokeFeishu = vi.fn(async () => ({ ok: true, value: undefined }))
  const authorizeFeishu = vi.fn(async () => ({ ok: true, value: 'http://127.0.0.1/auth/feishu/start?state=fixture' }))
  const controller = new EnterpriseCardController(host.scope, {
    remote: {
      credentials: { describe: vi.fn(async () => ({ ok: true, value: { FEISHU_APP_SECRET: { configured: true, writable: true } } })) },
      enterpriseConnections: {
        status: vi.fn(async () => ({ ok: true, value: [{ channel: 'feishu', state: 'disabled', error: '', receivedMessages: 0, lastSenderId: '', lastChatId: '' }] })),
        feishuAuthorization: vi.fn(async () => ({ ok: true, value: {
          identity: host.scope.getSnapshot().value?.readIdentity, state: 'authorized', error: '',
          redirectURI: 'http://127.0.0.1:3001/auth/feishu/callback', requestedScopes: ['im:chat:read'],
          grantedScopes: ['im:chat:read'], userName: 'Fixture user',
        } })),
        authorizeFeishu, revokeFeishu,
      },
    },
  } as never, 'feishu')
  controllers.push(controller)
  const face = controller.inject()
  function View({ dictionary = en }: { dictionary?: typeof en }) {
    const state = useSyncExternalStore(
      listener => face.hooks.enterpriseCard.subscribe(listener), () => face.hooks.enterpriseCard.getSnapshot())
    return <EnterpriseCard {...{
      ...face, view: 'page',
      useEnterpriseCard: (selector: (snapshot: typeof state) => unknown) => selector(state),
      t: (key: PluginsSettingsLocaleKey) => dictionary[key],
    } as unknown as EnterpriseCardProps} />
  }
  return { host, face, View, authorizeFeishu, revokeFeishu }
}

it.each([en, zh])('shows the matching setup path in either locale without changing stored identity', async (dictionary) => {
  const { host, View, authorizeFeishu, revokeFeishu } = bench()
  render(<View dictionary={dictionary} />)
  await screen.findByText(dictionary.enterpriseSecretSet)
  expect(screen.getByRole<HTMLInputElement>('radio', { name: dictionary.feishuIdentityApp }).checked).toBe(true)
  expect(screen.getByText(dictionary.feishuAppReadHint)).toBeTruthy()
  expect(screen.queryByLabelText(dictionary.feishuCallback)).toBeNull()
  expect(screen.queryByRole('button', { name: dictionary.feishuAuthorize })).toBeNull()
  fireEvent.click(screen.getByRole('radio', { name: dictionary.feishuIdentityUser }))
  expect(screen.getByRole<HTMLInputElement>('radio', { name: dictionary.feishuIdentityUser }).checked).toBe(true)
  expect(screen.getByLabelText(dictionary.feishuCallback)).toBeTruthy()
  expect(screen.getByText(dictionary.feishuAuthorized + ': Fixture user')).toBeTruthy()
  expect(screen.getByRole<HTMLButtonElement>('button', { name: dictionary.feishuAuthorize }).disabled).toBe(true)
  expect(screen.getByText(dictionary.feishuBotMessagingHint)).toBeTruthy()
  expect(screen.getByLabelText(dictionary.feishuAppId)).toBeTruthy()
  expect(screen.getByLabelText(dictionary.feishuSecret)).toBeTruthy()
  expect(host.set).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: dictionary.discard }))
  expect(screen.getByRole<HTMLInputElement>('radio', { name: dictionary.feishuIdentityApp }).checked).toBe(true)
  expect(screen.queryByLabelText(dictionary.feishuCallback)).toBeNull()
  expect(authorizeFeishu).not.toHaveBeenCalled()
  expect(revokeFeishu).not.toHaveBeenCalled()
})

it('saves each identity as its enum without changing bot switches or revoking the retained account grant', async () => {
  const { host, View, revokeFeishu } = bench()
  render(<View />)
  await screen.findByText(en.enterpriseSecretSet)
  fireEvent.click(screen.getByRole('radio', { name: en.feishuIdentityUser }))
  fireEvent.click(screen.getByRole('button', { name: en.save }))
  await vi.waitFor(() => { expect(host.set).toHaveBeenCalledWith('readIdentity', 'user') })
  await screen.findByRole('button', { name: en.save })
  expect(host.scope.getSnapshot().value).toMatchObject({ readIdentity: 'user', receiveEnabled: false, sendEnabled: false })
  fireEvent.click(screen.getByRole('radio', { name: en.feishuIdentityApp }))
  fireEvent.click(screen.getByRole('button', { name: en.save }))
  await vi.waitFor(() => { expect(host.set).toHaveBeenCalledWith('readIdentity', 'app') })
  expect(screen.queryByLabelText(en.feishuCallback)).toBeNull()
  expect(host.set.mock.calls.every(([field]) => field === 'readIdentity')).toBe(true)
  expect(revokeFeishu).not.toHaveBeenCalled()
})

it('keeps identity selection independent between rendered forms and disables read-only controls', async () => {
  const first = bench('app')
  const second = bench('user', false)
  const a = render(<first.View />)
  const b = render(<second.View />)
  await vi.waitFor(() => { expect(first.face.hooks.enterpriseCard.getSnapshot().secretConfigured).toBe(true) })
  const firstUser = within(a.container).getByRole<HTMLInputElement>('radio', { name: en.feishuIdentityUser })
  const secondUser = within(b.container).getByRole<HTMLInputElement>('radio', { name: en.feishuIdentityUser })
  expect(firstUser.name).not.toBe(secondUser.name)
  expect(secondUser.closest('fieldset')?.disabled).toBe(true)
  fireEvent.click(firstUser)
  expect(firstUser.checked).toBe(true)
  expect(secondUser.checked).toBe(true)
  expect(second.host.set).not.toHaveBeenCalled()
})
