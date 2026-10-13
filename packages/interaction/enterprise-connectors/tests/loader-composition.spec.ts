/** Real Loader + official SDKs against private HTTP/WebSocket provider fixtures. */
import { once } from 'node:events'
import { createServer, type Server } from 'node:http'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { Context } from '@deepseek-ai/cordis'
import Loader from '@deepseek-ai/cordis-plugin-loader'
import Include from '@deepseek-ai/cordis-plugin-include'
import AgentRegistry from '@deepseek-ai/dsh-agent'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import Tools from '@deepseek-ai/dsh-tools'
import { ToolCallId } from '@deepseek-ai/dsh-llm'
import { credentialRef } from '@deepseek-ai/dsh-credentials'
import { WebSocketServer } from 'ws'
import { afterEach, expect, it } from 'vitest'
import { MemoryCredentials } from '../../../credentials/credentials/tests/memory.ts'
import Enterprise, { Config } from '../src/index.ts'

let root: Context | undefined
let server: Server | undefined
let sockets: WebSocketServer | undefined
let directory: string | undefined
let baseURL = ''
let broken = false
let huge = false
const requests: Array<{ path: string; auth: string | undefined; body: Record<string, unknown> }> = []
const frames: Array<Record<string, unknown>> = []
afterEach(async () => {
  try { await root?.fiber.dispose() }
  finally {
    root = undefined
    for (const socket of sockets?.clients ?? []) socket.terminate()
    await new Promise<void>((resolve) => { if (sockets) sockets.close(() => { resolve() }); else resolve() })
    sockets = undefined
    if (server) {
      server.closeAllConnections()
      await new Promise<void>((resolve, reject) => { server!.close((error) => { if (error) reject(error); else resolve() }) })
    }
    server = undefined
    if (directory) await rm(directory, { recursive: true, force: true })
    directory = undefined
    requests.length = 0
    frames.length = 0
    broken = false
    huge = false
  }
})
async function fixture(): Promise<void> {
  server = createServer((req, res) => {
    void (async () => {
      const chunks: Buffer[] = []
      for await (const chunk of req as AsyncIterable<Uint8Array>) chunks.push(Buffer.from(chunk))
      const raw = Buffer.concat(chunks).toString()
      const body = raw ? JSON.parse(raw) as Record<string, unknown> : {}
      requests.push({ path: req.url!, auth: req.headers.authorization, body })
      const path = new URL(req.url!, 'http://fixture.invalid').pathname
      let value: unknown = { code: 0, bot: { app_name: 'Fixture bot' } }
      if (path.includes('tenant_access_token')) value = { code: 0, tenant_access_token: 'fixture-access-token', expire: 7200 }
      else if (broken) value = { code: 999, msg: 'fixture-feishu-secret' }
      else if (path.endsWith('/chats')) value = { code: 0, data: { items: [{ chat_id: 'chat_a', name: huge ? 'x'.repeat(10000) : 'Quality team' }], has_more: false } }
      else if (path.endsWith('/messages')) value = { code: 0, data: { items: [{ message_id: 'message_a', msg_type: 'text', sender: { id: 'user_a' }, body: { content: '{"text":"Quality check"}' } }], has_more: false } }
      else if (path.endsWith('/raw_content')) value = { code: 0, data: { content: 'Authorized quality document' } }
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify(value))
    })().catch(() => { res.destroy() })
  })
  sockets = new WebSocketServer({ server })
  sockets.on('connection', (socket) => {
    socket.on('message', (raw) => {
      const bytes = Array.isArray(raw) ? Buffer.concat(raw) : raw instanceof ArrayBuffer ? Buffer.from(raw) : raw
      const frame = JSON.parse(bytes.toString()) as Record<string, unknown>
      frames.push(frame)
      socket.send(JSON.stringify({ headers: frame.headers, errcode: 0, errmsg: 'ok' }))
    })
  })
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const address = server.address()
  if (!address || typeof address !== 'object') throw new Error('Missing fixture port')
  baseURL = `http://127.0.0.1:${address.port}`
}
async function boot(): Promise<Context> {
  await fixture()
  root = new Context()
  await root.plugin(Loader)
  root.loader.builtins.include = Include
  const modules = new Map<string, unknown>([
    ['agents', AgentRegistry], ['system-prompt', SystemPrompt], ['tools', Tools], ['enterprise', Enterprise],
    ['credentials', { apply(ctx: Context) { ctx.plugin(MemoryCredentials, { FEISHU_APP_SECRET: 'fixture-feishu-secret', WECOM_BOT_SECRET: 'fixture-wecom-secret' }) } }],
  ])
  root.loader.internal = { version: 'v2', import(name: string) { return Promise.resolve(modules.get(name)) } } as unknown as NonNullable<typeof root.loader.internal>
  directory = await mkdtemp(join(tmpdir(), 'enterprise-loader-'))
  const config = { feishu: { enabled: true, appId: 'cli_fixture', baseURL, allowedChats: ['chat_a'] },
    wecom: { enabled: true, botId: 'bot_fixture', websocketURL: baseURL.replace('http:', 'ws:'),
      receiveEnabled: true, allowedSenders: ['user_a'], allowedChats: ['chat_a'] }, maxResultBytes: 4096, timeoutMs: 1000 }
  const file = join(directory, 'cordis.yml')
  await writeFile(file, '- name: agents\n- name: system-prompt\n- name: tools\n- name: credentials\n- name: enterprise\n  config: '+JSON.stringify(config)+'\n')
  await root.loader.create({ name: 'cordis:include', config: { path: pathToFileURL(file).href } })
  await root.loader.await()
  await root.enterpriseConnectors.reconnect('feishu')
  await root.enterpriseConnectors.reconnect('wecom')
  return root
}
function execute(ctx: Context, name: string, args: unknown = {}) {
  return ctx.tools.execute({ name, callId: ToolCallId(`test-${name}`), arguments: args, signal: new AbortController().signal })
}
it('defaults to disconnected accounts without credentials in settings', () => {
  const config = Config({} as never)
  expect(config.feishu.enabled).toBe(false)
  expect(config.wecom.enabled).toBe(false)
  expect(JSON.stringify(config)).not.toContain('fixture-')
})
it('uses official API authentication, projects authorized reads, and removes native tools on unload', async () => {
  const ctx = await boot()
  expect(ctx.enterpriseConnectors.status().map(row => row.state)).toEqual(['connected', 'connected'])
  for (const [name, args, expected] of [
    ['feishu_list_chats', {}, 'Quality team'],
    ['feishu_read_messages', { chat_id: 'chat_a' }, 'Quality check'],
    ['feishu_read_document', { resource: 'DocA' }, 'Authorized quality document'],
  ] as const) {
    const response = await execute(ctx, name, args)
    expect(response.isError).toBe(false)
    expect(JSON.stringify(response)).toContain(expected)
    expect(JSON.stringify(response)).not.toContain('fixture-feishu-secret')
    expect(JSON.stringify(response)).not.toContain('fixture-access-token')
  }
  expect(requests.filter(row => !row.path.includes('tenant_access_token')).every(row => row.auth === 'Bearer fixture-access-token')).toBe(true)
  expect(ctx.tools.schemas().filter(tool => /^(feishu|wecom)_/.test(tool.name))).toMatchSnapshot('standalone enterprise tool schemas')
  const tools = ctx.tools
  await ctx.fiber.dispose()
  expect(tools.schemas()).toEqual([])
  expect(ctx.get('enterpriseConnectors')).toBeUndefined()
})
it('denies cross-scope reads and sends before any provider write, and sanitizes oversized or failed reads', async () => {
  const ctx = await boot()
  expect((await execute(ctx, 'feishu_read_messages', { chat_id: 'chat_other' })).isError).toBe(true)
  expect((await execute(ctx, 'feishu_send_message', { chat_id: 'chat_a', text: 'Must not send' })).isError).toBe(true)
  expect(requests.some(row => row.path.includes('/messages') && Object.hasOwn(row.body, 'content'))).toBe(false)
  broken = true
  const failed = await execute(ctx, 'feishu_list_chats')
  expect(failed.isError).toBe(true)
  expect(JSON.stringify(failed)).not.toContain('fixture-feishu-secret')
  broken = false
  huge = true
  expect((await execute(ctx, 'feishu_list_chats')).isError).toBe(true)
  expect((await execute(ctx, 'feishu_list_chats', { page_size: 0 })).isError).toBe(true)
  expect((await execute(ctx, 'feishu_read_document', { resource: 'https://untrusted.invalid/docx/DocA' })).isError).toBe(true)
})
it('captures only approved senders and exposes its received-message scope explicitly', async () => {
  const ctx = await boot()
  await expect.poll(() => sockets!.clients.size).toBe(1)
  const socket = [...sockets!.clients][0]!
  const send = (id: string, user: string) => { socket.send(JSON.stringify({ cmd: 'aibot_msg_callback', headers: { req_id: id },
    body: { msgid: id, aibotid: 'bot_fixture', chattype: 'group', chatid: 'chat_a', from: { userid: user }, msgtype: 'text', text: { content: 'Quality request' } } })) }
  send('unauthorized', 'user_other')
  await expect.poll(() => ctx.enterpriseConnectors.status()[1]?.lastSenderId).toBe('user_other')
  expect(JSON.stringify(await execute(ctx, 'wecom_read_messages', { chat_id: 'chat_a' }))).not.toContain('Quality request')
  send('authorized', 'user_a')
  await expect.poll(() => ctx.enterpriseConnectors.status()[1]?.receivedMessages).toBe(1)
  const received = await execute(ctx, 'wecom_read_messages', { chat_id: 'chat_a' })
  expect(received.isError).toBe(false)
  expect(JSON.stringify(received)).toContain('captured_since_connection')
  expect(JSON.stringify(received)).toContain('authorized')
  expect(JSON.stringify(received)).not.toContain('unauthorized')
  send('authorized', 'user_a')
  expect(ctx.enterpriseConnectors.status()[1]?.receivedMessages).toBe(1)
  await ctx.credentials.set(credentialRef('WECOM_BOT_SECRET'), 'rotated-secret')
  await ctx.enterpriseConnectors.reconnect('wecom')
  expect(JSON.stringify(await execute(ctx, 'wecom_read_messages', { chat_id: 'chat_a' }))).not.toContain('Quality request')
})
