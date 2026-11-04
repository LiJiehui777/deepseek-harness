// @vitest-environment jsdom
import { Context } from '@deepseek-ai/cordis'
import { LocaleRuntime } from '@deepseek-ai/dsh-client-locale/client'
import { SlotRegistry } from '@deepseek-ai/dsh-client-ui-renderer/client'
import type { PropsRenderSlots } from '@deepseek-ai/dsh-client-ui-slots'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { useSyncExternalStore } from 'react'
import { afterEach, expect, it } from 'vitest'
import * as Browser from '../src/client/index.ts'
import { WorkbenchPage } from '../src/client/WorkbenchPage.tsx'
import { createWorkbenchStore } from '../src/client/store.ts'
import { zh, en, NS } from '../src/client/locales.ts'

afterEach(cleanup)

it('installs and removes both panel registrations with declaration and plugin lifetimes', async () => {
  const ctx = new Context()
  try {
    await ctx.plugin(SlotRegistry).await()
    const locale = new LocaleRuntime(ctx)
    ctx.provide('locale', locale)
    ctx.slots.installLocale(locale)
    ctx.provide('remote', { businessWorkflows: { templates: () => Promise.resolve({ ok: true, value: [] }), health: () => Promise.resolve({ ok: true, value: { connected: false, version: '', error: '', refreshIntervalMs: 60000 } }) } } as never)
    ctx.provide('remote.businessWorkflows', {} as never)
    ctx.provide('sessions', {} as never)
    const fiber = ctx.plugin(Browser)
    await fiber.await()
    const declare = () => ctx.slots.register({ name: 'root', children: {
      main: { kind: 'keyed', scope: 'root' }, 'sidebar.panellist': { kind: 'list', scope: 'root' },
      'conversation.input.left': { kind: 'list', scope: 'session' },
      'conversation.input.dock': { kind: 'list', scope: 'session' },
    } }, ({ renderSlot }: PropsRenderSlots<'main' | 'sidebar.panellist'>) => <>
      {renderSlot('main', {}, { entryKey: 'business-workflow' })}
      {renderSlot('sidebar.panellist', { size: 18, active: false })}
    </>)
    const dispose = declare()
    await Promise.resolve()
    expect(ctx.slots.entries('main')[0]!.options.key).toBe('business-workflow')
    expect(ctx.slots.entries('sidebar.panellist')[0]!.options.id).toBe('business-workflow')
    expect(ctx.slots.entries('conversation.input.dock')[0]!.options.id).toBe('business-workflow-reviews')
    locale.setLocale('zh')
    expect(locale.bind(NS)('panel')).toBe(zh.panel)
    locale.setLocale('en')
    expect(locale.bind(NS)('panel')).toBe(en.panel)
    dispose()
    expect(ctx.slots.entries('main')).toEqual([])
    expect(ctx.slots.entries('conversation.input.dock')).toEqual([])
    declare()
    await Promise.resolve()
    expect(ctx.slots.entries('main')).toHaveLength(1)
    expect(ctx.slots.entries('conversation.input.dock')).toHaveLength(1)
    await fiber.dispose()
    expect(ctx.slots.entries('main')).toEqual([])
    expect(ctx.slots.entries('sidebar.panellist')).toEqual([])
    expect(ctx.slots.entries('conversation.input.dock')).toEqual([])
  } finally { await ctx.fiber.dispose() }
})

it('edits a draft, exposes preview limitations, and opens a simulated human task', async () => {
  const t = ((key: keyof typeof zh, values?: Record<string, unknown>) => {
    let value: string = zh[key]
    for (const [name, replacement] of Object.entries(values ?? {})) value = value.replace(`{${name}}`, String(replacement))
    return value
  })
  const store = createWorkbenchStore(t).create()
  function Harness() {
    const value = useSyncExternalStore(listener => store.subscribe(listener), () => store.getSnapshot(), () => store.getSnapshot())
    const props = { t, actions: store.actions,
      useStore: (selector: (state: typeof value) => unknown) => selector(value), download: () => {},
      useEngine: (selector: (state: import('../src/client/engine-controller.ts').EngineState) => unknown) => selector({ health: null, templates: [], runs: [], detail: null, busy: false, error: '' }),
      saveTemplate: async () => undefined, publishTemplate: async () => undefined, unpublishTemplate: async () => undefined,
      startPublishedProcess: () => {}, refreshEngine: () => {}, startProcess: () => {}, openProcess: () => {}, reviewProcess: () => {},
      arriveProcess: () => {}, cancelProcess: () => {},
    } as Parameters<typeof WorkbenchPage>[0]
    return <WorkbenchPage {...props} />
  }
  render(<Harness />)
  expect(screen.getByText(zh.scope)).toBeTruthy()
  fireEvent.click(screen.getAllByRole('button', { name: zh.edit })[0]!)
  fireEvent.change(screen.getByLabelText(zh.flowName), { target: { value: 'Order A review' } })
  fireEvent.click(screen.getByRole('button', { name: zh.validate }))
  expect(await screen.findByText(zh.valid)).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: zh.preview }))
  for (let index = 0; index < 4; index++) {
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: zh.advance })) })
  }
  expect(await screen.findByRole('button', { name: zh.approve })).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: /模拟待办/ }))
  expect(await screen.findByRole('button', { name: zh.inspect })).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: zh.inspect }))
  fireEvent.click(screen.getByRole('button', { name: zh.reject }))
  expect((await screen.findAllByText(zh['status.rejected'])).length).toBeGreaterThan(0)
  expect(screen.queryByRole('button', { name: zh.advance })).toBeNull()
})
