// @vitest-environment jsdom
/** Native office form staging and asynchronous consent state, isolated from robot credentials. */
import { useSyncExternalStore } from 'react'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { stubSettingsScope } from '@deepseek-ai/dsh-client-test-runtime'
import type { WecomOfficeStatus } from '@deepseek-ai/dsh-api-remotes/client'
import { WecomOfficeCardController, type OfficeSettings } from '../src/client/wecom-office-controller.ts'
import { WecomOfficeSection } from '../src/client/WecomOfficeSection.tsx'
import { en, zh } from '../src/client/locales.ts'

const controllers: WecomOfficeCardController[] = []
afterEach(() => { cleanup(); for (const controller of controllers.splice(0)) controller.dispose() })
function bench() {
  const host = stubSettingsScope<OfficeSettings>()
  const value = { enabled: false, documents: false, files: false, calendar: false, todos: false }
  host.publish({ status: 'ready', writable: true, value, base: value, user: {}, revision: 1 })
  host.set.mockImplementation((field: string, next: unknown) => {
    const current = host.scope.getSnapshot()
    host.publish({ value: { ...current.value, [field]: next }, user: { ...current.user as object, [field]: next } })
  })
  host.mutate.mockImplementation((ops: ReadonlyArray<{ op: string; path: string[]; value?: unknown }>) => {
    const current = host.scope.getSnapshot()
    const changes: Record<string, unknown> = {}
    for (const op of ops) { const field = op.path[0]; if (field) changes[field] = op.value }
    host.publish({ value: { ...current.value, ...changes }, user: { ...current.user as object, ...changes } })
  })
  let status: WecomOfficeStatus = { state: 'disabled', error: '', authorizerName: '', corporationName: '', qrImage: '', expiresAt: 0,
    pollIntervalMs: 10000, capabilities: [{ id: 'documents', state: 'unknown' }] }
  const remote = {
    wecomOfficeStatus: vi.fn(async () => ({ ok: true as const, value: status })),
    authorizeWecomOffice: vi.fn(async () => ({ ok: true as const, value: { ...status, state: 'pending' as const, qrImage: 'data:image/png;base64,fixture' } })),
    checkWecomOffice: vi.fn(async () => ({ ok: true as const, value: { ...status, state: 'authorized' as const, authorizerName: 'Quality user', capabilities: [{ id: 'documents' as const, state: 'discoverable' as const }] } })),
    cancelWecomOffice: vi.fn(async () => ({ ok: true as const, value: { ...status, state: 'unauthorized' as const, qrImage: '' } })),
    disconnectWecomOffice: vi.fn(async () => ({ ok: true as const, value: { ...status, state: 'unauthorized' as const } })),
  }
  const controller = new WecomOfficeCardController(host.scope, { remote: { enterpriseConnections: remote } } as never)
  controllers.push(controller)
  const actions = controller.actions()
  function View({ dictionary = en }: { dictionary?: typeof en }) {
    const state = useSyncExternalStore(listener => controller.source.subscribe(listener), () => controller.source.getSnapshot())
    return <WecomOfficeSection state={state} actions={actions} t={key => dictionary[key]} />
  }
  return { host, controller, actions, remote, View, status: (next: Partial<WecomOfficeStatus>) => { status = { ...status, ...next } } }
}

it.each([en, zh])('connects with one QR action and enables all supported capabilities in either language', async (dictionary) => {
  const { View, host, remote } = bench()
  render(<View dictionary={dictionary} />)
  await vi.waitFor(() => { expect(remote.wecomOfficeStatus).toHaveBeenCalledOnce() })
  expect(remote.authorizeWecomOffice).not.toHaveBeenCalled()
  expect(screen.queryByText(dictionary.wecomOfficeAdvanced)).toBeNull()
  expect(screen.getAllByRole('button')).toHaveLength(1)
  expect(screen.queryByRole('checkbox')).toBeNull()
  expect(screen.queryByRole('button', { name: dictionary.wecomOfficeSave })).toBeNull()
  const scan = screen.getByRole<HTMLButtonElement>('button', { name: dictionary.wecomOfficeScan })
  expect(scan.disabled).toBe(false)
  fireEvent.click(scan)
  await screen.findByAltText(dictionary.wecomOfficeQrAlt)
  expect(host.scope.getSnapshot().value).toMatchObject({ enabled: true, documents: true, calendar: true, files: true, todos: true })
  expect(host.set).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: dictionary.wecomOfficeCancel }))
  await screen.findByText(dictionary.wecomOfficeDisabled)
  expect(screen.queryByAltText(dictionary.wecomOfficeQrAlt)).toBeNull()
})

it('shows one disconnect action for a connected account without manual permission controls', async () => {
  const { View, status, controller } = bench()
  await controller.refresh()
  status({ state: 'authorized', authorizerName: 'Quality user' })
  await controller.refresh()
  render(<View />)
  await screen.findByText('Quality user')
  expect(screen.getAllByRole('button')).toHaveLength(1)
  expect(screen.getByRole('button', { name: en.wecomOfficeDisconnect })).toBeDefined()
  expect(screen.queryByRole('checkbox')).toBeNull()
})

it('keeps a mutation busy across settings refreshes and discards responses after disposal', async () => {
  const { controller, actions, remote, host } = bench()
  await controller.refresh()
  let resolve!: (value: Awaited<ReturnType<typeof remote.authorizeWecomOffice>>) => void
  remote.authorizeWecomOffice.mockImplementationOnce(() => new Promise((done) => { resolve = done }))
  actions.scan()
  expect(controller.source.getSnapshot().busy).toBe(true)
  host.publish({ revision: 2 })
  await controller.refresh()
  resolve({ ok: true, value: { state: 'pending', error: '', authorizerName: '', corporationName: '', qrImage: '', expiresAt: 0, pollIntervalMs: 10000, capabilities: [] } })
  await vi.waitFor(() => { expect(controller.source.getSnapshot().busy).toBe(false) })
  expect(controller.source.getSnapshot().status?.state).toBe('pending')
  const before = controller.source.getSnapshot()
  let complete!: (value: Awaited<ReturnType<typeof remote.wecomOfficeStatus>>) => void
  remote.wecomOfficeStatus.mockImplementationOnce(() => new Promise((done) => { complete = done }))
  const pending = controller.refresh()
  controller.dispose()
  complete({ ok: true, value: { ...before.status!, state: 'authorized' } })
  await pending
  expect(controller.source.getSnapshot()).toBe(before)
})

it('checks account identity after the pending QR completes without claiming verified resource access', async () => {
  const { controller, actions, remote, status } = bench()
  await controller.refresh()
  actions.scan()
  await vi.waitFor(() => { expect(controller.source.getSnapshot().status?.state).toBe('pending') })
  status({ state: 'authorized' })
  await controller.refresh()
  expect(remote.checkWecomOffice).toHaveBeenCalledOnce()
  expect(controller.source.getSnapshot().status).toMatchObject({ authorizerName: 'Quality user', capabilities: [{ state: 'discoverable' }] })
})

it('does not begin consent after disposal while the initial settings commit is pending', async () => {
  const { controller, actions, remote, host } = bench()
  await controller.refresh()
  let finish!: () => void
  const pending = new Promise<void>((resolve) => { finish = resolve })
  host.mutate.mockReturnValueOnce(pending)
  actions.scan()
  controller.dispose()
  expect(host.listenerCount()).toBe(0)
  host.publish({ value: { enabled: true, documents: true } })
  finish()
  await pending
  await Promise.resolve()
  expect(remote.authorizeWecomOffice).not.toHaveBeenCalled()
})
