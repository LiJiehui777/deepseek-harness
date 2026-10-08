import { Context } from '@deepseek-ai/cordis'
import Loader from '@deepseek-ai/cordis-plugin-loader'
import Include from '@deepseek-ai/cordis-plugin-include'
import AgentRegistry from '@deepseek-ai/dsh-agent'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import Tools from '@deepseek-ai/dsh-tools'
import { ToolCallId } from '@deepseek-ai/dsh-llm'
import { afterEach, expect, it, vi } from 'vitest'
import * as Records from '../src/index.ts'

let ctx: Context | undefined
const config = { channel: 'feishu' as 'feishu' | 'wecom', endpoint: 'http://bridge.invalid/read', token: 'host-only-authority', maxResultBytes: 4096, maxPageSize: 50, timeoutMs: 1000 }
const page = { channel: 'feishu', account_name: 'Project bot', scope: 'bot_visible_history', kind: 'messages', items: [{ chat_id: 'room', message_id: 'm1', sender_id: 'u1', text: '项目按计划推进' }], has_more: false, next_cursor: '' }

afterEach(async () => {
  await ctx?.fiber.dispose()
  ctx = undefined
  vi.unstubAllGlobals()
})
async function boot(): Promise<Context> {
  ctx = new Context()
  await ctx.plugin(Loader)
  ctx.loader.builtins.include = Include
  const modules = new Map<string, unknown>([['@deepseek-ai/dsh-agent', AgentRegistry], ['@deepseek-ai/dsh-system-prompt', SystemPrompt], ['@deepseek-ai/dsh-tools', Tools], ['@deepseek-ai/dsh-tool-chat-records', Records]])
  ctx.loader.internal = { version: 'v2', import(name: string) { return Promise.resolve(modules.get(name)) } } as unknown as NonNullable<typeof ctx.loader.internal>
  await ctx.loader.create({ name: 'cordis:include', config: { path: new URL('./fixtures/cordis.yml', import.meta.url).href } })
  await ctx.loader.await()
  return ctx
}
async function configured(overrides: Partial<Records.Config> = {}): Promise<Context> {
  ctx = new Context()
  await ctx.plugin(AgentRegistry)
  await ctx.plugin(SystemPrompt)
  await ctx.plugin(Tools)
  await ctx.plugin(Records, { ...config, ...overrides })
  return ctx
}
function execute(root: Context, name = 'feishu_read_messages', arguments_: Record<string, unknown> = { chat_id: 'room' }) {
  return root.tools.execute({ callId: ToolCallId('read-records'), name, arguments: arguments_, signal: new AbortController().signal })
}
function requestBody(request: RequestInit): Record<string, unknown> {
  if (typeof request.body !== 'string') throw new Error('Expected a JSON string request body')
  return JSON.parse(request.body) as Record<string, unknown>
}
it('boots both instances through the Loader and pins model-visible schemas and record output', async () => {
  const fetchMock = vi.fn((_url: unknown, request: RequestInit) => {
    const channel = requestBody(request).channel
    return Promise.resolve(new Response(JSON.stringify({ ...page, channel })))
  })
  vi.stubGlobal('fetch', fetchMock)
  const root = await boot()
  expect(root.tools.schemas().filter(tool => tool.name.includes('feishu') || tool.name.includes('wecom'))).toMatchSnapshot('channel-read schemas')
  const result = await execute(root, 'feishu_read_messages', { chat_id: 'room', account_id: 'cannot-widen', cursor: 'next', start_time: 1, end_time: 5 })
  expect(result.isError).toBe(false)
  expect(result.content).toMatchSnapshot('record output without host authority')
  const sent = fetchMock.mock.calls[0]![1]
  expect(requestBody(sent)).toEqual({ channel: 'feishu', operation: 'messages', chat_id: 'room', page_size: 20, cursor: 'next', start_time: 1, end_time: 5 })
  expect(sent.headers).toMatchObject({ Authorization: 'Bearer host-only-authority' })
  expect(JSON.stringify(result)).not.toContain('host-only-authority')
  expect((await execute(root, 'wecom_list_chats', { page_size: 2, cursor: 'chat-after' })).isError).toBe(false)
  expect((await execute(root, 'feishu_list_chats', {})).isError).toBe(false)
  expect((await execute(root, 'wecom_read_messages')).isError).toBe(false)
})
it('enforces execution bounds even for direct tool callers', async () => {
  const fetchMock = vi.fn(() => Promise.resolve(new Response(JSON.stringify(page))))
  vi.stubGlobal('fetch', fetchMock)
  const root = await boot()
  for (const name of ['feishu_list_chats', 'feishu_read_messages']) {
    for (const page_size of [0, 51, 1.5]) expect((await execute(root, name, { chat_id: 'room', page_size })).isError).toBe(true)
  }
  expect(fetchMock).not.toHaveBeenCalled()
})
it('uses the explicit deployment page limit when the caller omits page_size', async () => {
  const fetchMock = vi.fn(() => Promise.resolve(new Response(JSON.stringify(page))))
  vi.stubGlobal('fetch', fetchMock)
  const root = await configured({ maxPageSize: 2 })
  expect((await execute(root)).isError).toBe(false)
  expect(requestBody((fetchMock.mock.calls[0] as unknown as [unknown, RequestInit])[1]).page_size).toBe(2)
  expect((await execute(root, 'feishu_list_chats', {})).isError).toBe(false)
})
it('bounds exact and oversized multibyte response pages without returning partial history', async () => {
  const raw = JSON.stringify(page)
  vi.stubGlobal('fetch', () => Promise.resolve(new Response(raw)))
  const root = await configured({ maxResultBytes: Buffer.byteLength(raw) })
  expect((await execute(root)).isError).toBe(false)
  vi.stubGlobal('fetch', () => Promise.resolve(new Response(raw + ' ')))
  const result = await execute(root)
  expect(result.isError).toBe(true)
  expect(JSON.stringify(result.content)).toContain('page is too large')
})
it('bounds the complete decoded result even when invalid UTF-8 expands during decoding', async () => {
  const raw = Buffer.from(JSON.stringify({ channel: 'feishu', items: [], extra: 'x' }))
  raw[raw.indexOf(Buffer.from('"x"')) + 1] = 255
  vi.stubGlobal('fetch', () => Promise.resolve(new Response(raw)))
  const root = await configured({ maxResultBytes: raw.byteLength })
  const result = await execute(root)
  expect(result.isError).toBe(true)
  expect(JSON.stringify(result.content)).toContain('Complete chat record result')
})
it('contains connection errors, denied access, empty and malformed responses', async () => {
  const root = await boot()
  vi.stubGlobal('fetch', () => Promise.reject(new Error('host-only-authority')))
  const unavailable = await execute(root)
  expect(unavailable.isError).toBe(true)
  expect(JSON.stringify(unavailable)).not.toContain('host-only-authority')
  for (const response of [new Response('private upstream body', { status: 403 }), new Response(null, { status: 403 }), new Response(null), new Response('not-json'), new Response('null'), new Response('[]'), new Response('1'), new Response('{}'), new Response('{"channel":"wecom","items":[]}'), new Response('{"channel":"feishu"}'), new Response('{"channel":"feishu","items":{}}')]) {
    vi.stubGlobal('fetch', () => Promise.resolve(response))
    expect((await execute(root)).isError).toBe(true)
  }
})
it('rejects invalid host authority before any tool is registered', async () => {
  const root = await boot()
  for (const overrides of [{ endpoint: 'file:///tmp/records' }, { endpoint: 'https://user@bridge.test' }, { endpoint: 'https://:pass@bridge.test' }, { token: ' ' }]) {
    expect(() => { Records.apply(root, { ...config, ...overrides }) }).toThrow('HTTP endpoint')
  }
})
it('removes both contributions when their Loader row is unloaded', async () => {
  const root = await boot()
  expect(root.tools.schemas().map(tool => tool.name)).toContain('feishu_list_chats')
  const entry = root.loader.entries().find(entry => entry.options.id === 'feishu-records')
  expect(entry).toBeDefined()
  await entry!.fiber!.dispose()
  expect(root.tools.schemas().map(tool => tool.name)).not.toContain('feishu_list_chats')
  expect(root.tools.schemas().map(tool => tool.name)).not.toContain('feishu_read_messages')
  expect(root.tools.schemas().map(tool => tool.name)).toContain('wecom_read_messages')
})
