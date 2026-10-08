// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ChannelPluginsPanel, type ChannelPluginsPanelProps } from '../src/client/ChannelPluginsPanel.tsx'
import { en } from '../src/client/locales.ts'

const origin = 'https://ragflow.test'
const props = {
  managementUrl: `${origin}/user-setting/chat-channel`, hostOrigin: origin,
  t: (key: keyof typeof en, values: Record<string, string> = {}) => {
    let value = en[key]
    for (const [name, text] of Object.entries(values)) value = value.replace(`{${name}}`, text)
    return value
  },
} as ChannelPluginsPanelProps

afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals() })

function embedded() {
  const postMessage = vi.fn()
  const parent = { postMessage } as unknown as Window
  vi.spyOn(window, 'parent', 'get').mockReturnValue(parent)
  const view = render(<ChannelPluginsPanel {...props} />)
  const receive = (channels: unknown, override: Partial<MessageEventInit> = {}) => { act(() => {
    window.dispatchEvent(new MessageEvent('message', {
      source: parent, origin, data: { type: 'ragflow.workbench.channel-status', channels }, ...override,
    }))
  }) }
  return { ...view, postMessage, receive }
}
const valid = [
  { channel: 'feishu', configuredAccounts: 2, enabled: true, boundAccountName: 'Research bot' },
  { channel: 'wecom', configuredAccounts: 0, enabled: false },
]

describe('native channel plugin settings', () => {
  it('requests safe metadata, rejects untrusted responses and delegates both account managers', () => {
    const { postMessage, receive, unmount } = embedded()
    expect(postMessage).toHaveBeenCalledWith({ type: 'ragflow.workbench.channel-status-request' }, origin)
    expect(screen.getAllByText(en.channelLoading)).toHaveLength(2)
    receive(valid, { source: window })
    receive(valid, { origin: 'https://untrusted.test' })
    receive(valid, { data: null })
    receive(valid, { data: 'text' })
    receive(valid, { data: [] })
    receive(valid, { data: { type: 'unknown' } })
    expect(screen.queryByText('Research bot')).toBeNull()
    receive(valid)
    expect(screen.getByText('Bound account: Research bot')).toBeTruthy()
    expect(screen.getByText('2 configured accounts')).toBeTruthy()
    expect(screen.getByText(en.channelEmpty)).toBeTruthy()
    expect(screen.getByText(en.channelEnabled)).toBeTruthy()
    expect(screen.getByText(en.channelDisabled)).toBeTruthy()
    const buttons = screen.getAllByRole('button', { name: en.channelManage })
    fireEvent.click(buttons[0]!)
    fireEvent.click(buttons[1]!)
    expect(postMessage).toHaveBeenCalledWith({ type: 'ragflow.workbench.manage-channel', channel: 'feishu' }, origin)
    expect(postMessage).toHaveBeenCalledWith({ type: 'ragflow.workbench.manage-channel', channel: 'wecom' }, origin)
    const remove = vi.spyOn(window, 'removeEventListener')
    unmount()
    expect(remove).toHaveBeenCalledWith('message', expect.any(Function))
  })

  it('rejects malformed or unbounded metadata without replacing the last valid state', () => {
    const { receive } = embedded()
    const item = valid[0]!
    const invalid = [undefined, {}, [], [item], [item, item],
      ...[null, [], 'text', { ...item, channel: 'other' }, { ...item, enabled: 1 },
        { ...item, configuredAccounts: '2' }, { ...item, configuredAccounts: 1.5 }, { ...item, configuredAccounts: -1 },
        { ...item, configuredAccounts: 100001 }, { ...item, boundAccountName: 1 },
        { ...item, boundAccountName: '' }, { ...item, boundAccountName: 'x'.repeat(256) }]
        .map(row => [row, valid[1]]),
    ]
    for (const channels of invalid) receive(channels)
    expect(screen.getAllByText(en.channelLoading)).toHaveLength(2)
    receive(valid)
    for (const channels of invalid) receive(channels)
    expect(screen.getByText('Bound account: Research bot')).toBeTruthy()
    receive([{ ...item, boundAccountName: undefined }, { ...valid[1], configuredAccounts: 100000 }])
    expect(screen.queryByText('Bound account: Research bot')).toBeNull()
    expect(screen.getByText('100000 configured accounts')).toBeTruthy()
  })

  it('uses the validated host destination when opened outside an iframe', () => {
    render(<ChannelPluginsPanel {...props} />)
    expect(screen.getAllByText(en.channelStandalone)).toHaveLength(2)
    const assign = vi.fn()
    vi.stubGlobal('window', new Proxy(window, { get: (target, key) => key === 'location' ? { assign } : Reflect.get(target, key) as unknown }))
    for (const button of screen.getAllByRole('button', { name: en.channelManage })) fireEvent.click(button)
    expect(assign).toHaveBeenCalledWith(`${props.managementUrl}?channel=feishu`)
    expect(assign).toHaveBeenCalledWith(`${props.managementUrl}?channel=wecom`)
  })
})
