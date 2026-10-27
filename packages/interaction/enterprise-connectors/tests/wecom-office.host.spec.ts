/** Real Loader and native subprocess composition with a deterministic external CLI fixture. */
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { once } from 'node:events'
import { WebSocketServer } from 'ws'
import { MemorySettings } from '../../../settings/settings/tests/memory.ts'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { Context } from '@deepseek-ai/cordis'
import Loader from '@deepseek-ai/cordis-plugin-loader'
import Include from '@deepseek-ai/cordis-plugin-include'
import Agents from '@deepseek-ai/dsh-agent'
import type { Agent } from '@deepseek-ai/dsh-agent'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import Tools from '@deepseek-ai/dsh-tools'
import { Session, SessionId } from '@deepseek-ai/dsh-session'
import { ToolCallId } from '@deepseek-ai/dsh-llm'
import Authorization from '@deepseek-ai/dsh-authorization'
import SubprocessLocal from '@deepseek-ai/dsh-subprocess-local'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MemoryCredentials } from '../../../credentials/credentials/tests/memory.ts'
import Enterprise from '../src/index.ts'
import { officeRequest } from '../src/wecom-office/operations.ts'

let socketServer: WebSocketServer | undefined
let root: Context | undefined
let directory: string | undefined
const fixture = fileURLToPath(new URL('./fixtures/wecom-office-cli.mjs', import.meta.url))
afterEach(async () => {
  try { await root?.fiber.dispose() }
  finally {
    root = undefined
    for (const socket of socketServer?.clients ?? []) socket.terminate()
    if (socketServer) await new Promise<void>((resolve) => { socketServer!.close(() => { resolve() }) })
    socketServer = undefined
    if (directory) await rm(directory, { recursive: true, force: true }); directory = undefined }
})
async function boot(options: Record<string, unknown> = {}): Promise<Context> {
  directory = await mkdtemp(join(tmpdir(), 'wecom-office-loader-'))
  socketServer = new WebSocketServer({ host: '127.0.0.1', port: 0 })
  socketServer.on('connection', (socket) => { socket.on('message', (raw) => {
    const bytes = Array.isArray(raw) ? Buffer.concat(raw) : raw instanceof ArrayBuffer ? Buffer.from(raw) : raw
    const frame = JSON.parse(bytes.toString()) as { headers: unknown }
    socket.send(JSON.stringify({ headers: frame.headers, errcode: 0, errmsg: 'ok' }))
  }) })
  await once(socketServer, 'listening')
  const address = socketServer.address()
  if (!address || typeof address !== 'object') throw new Error('Missing SDK fixture port')
  root = new Context()
  await root.plugin(Loader)
  root.loader.builtins.include = Include
  const modules = new Map<string, unknown>([
    ['settings', MemorySettings], ['agents', Agents], ['system-prompt', SystemPrompt], ['tools', Tools], ['authorization', Authorization],
    ['subprocess', SubprocessLocal], ['enterprise', Enterprise],
    ['credentials', { apply(ctx: Context) { ctx.plugin(MemoryCredentials, {}) } }],
  ])
  root.loader.internal = { version: 'v2', import(name: string) { return Promise.resolve(modules.get(name)) } } as unknown as NonNullable<typeof root.loader.internal>
  const config = { wecom: { websocketURL: `ws://127.0.0.1:${address.port}` }, wecomOffice: { enabled: true, documents: true, files: true, calendar: true, todos: true },
    wecomOfficeRuntime: { directory: join(directory, 'account'), command: [process.execPath, fixture, directory] }, timeoutMs: 10000, ...options }
  const file = join(directory, 'cordis.yml')
  await writeFile(file, '- name: settings\n- name: agents\n- name: system-prompt\n- name: tools\n- name: credentials\n- name: authorization\n- name: subprocess\n- name: enterprise\n  config: '+JSON.stringify(config)+'\n')
  await root.loader.create({ name: 'cordis:include', config: { path: pathToFileURL(file).href } })
  await root.loader.await()
  return root
}
async function authorize(ctx: Context): Promise<void> {
  await ctx.enterpriseConnectors.authorizeWecomOffice()
  await vi.waitFor(async () => {
    expect((await ctx.enterpriseConnectors.wecomOfficeStatus()).qrImage).toMatch(/^data:image\/png;base64,/)
  }, { timeout: 15000 })
  await writeFile(join(directory!, 'approve'), '')
  await vi.waitFor(async () => { expect((await ctx.enterpriseConnectors.wecomOfficeStatus()).state).toBe('authorized') }, { timeout: 15000 })
}
function execute(ctx: Context, operation: string, args: unknown = {}, id = 'local-quality') {
  const session = Session.create(SessionId(id))
  // The policy consumes only the trusted Session header; no Agent behavior is stubbed by this fixture.
  const agent = { session } as Agent
  return ctx.tools.execute({ name: `wecom_office_${operation}`, callId: ToolCallId(`office-${operation}`), arguments: args,
    agent, signal: new AbortController().signal })
}

describe('managed office CLI composition', { timeout: 30000 }, () => {
  it('exposes a private QR, preserves account isolation, reads reference data and unregisters on unload', async () => {
    const ctx = await boot()
    expect((await ctx.enterpriseConnectors.wecomOfficeStatus()).state).toBe('unauthorized')
    expect(ctx.tools.get('wecom_read_messages')).toBeDefined()
    expect(ctx.tools.get('wecom_list_chats')).toBeDefined()
    await authorize(ctx)
    const status = await ctx.enterpriseConnectors.checkWecomOffice()
    expect(status.authorizerName).toBe('Quality user')
    expect(status.capabilities.every(row => row.state === 'discoverable')).toBe(true)
    expect(JSON.stringify(status)).not.toContain('fixture-secret')
    expect(ctx.enterpriseConnectors.status()[1]?.state).toBe('connected')
    const cases: Array<[string, unknown, string]> = [
      ['search_documents', { keywords: ['inspection'] }, 'Quality inspection requirements'],
      ['read_document', { resource: 'doc_quality', document_type: 'doc' }, 'Inspect every incoming batch'],
      ['read_document', { resource: 'https://doc.weixin.qq.com/smartpage/a1_quality', document_type: 'smartpage', page_id: 'quality_page' }, 'Retain inspection evidence.'],
      ['search_files', { keywords: ['report'] }, 'Quality report.pdf'],
      ['get_file_info', { resource: 'quality_file' }, 'Quality report.pdf'],
      ['list_calendar', { begin_time: '2026-10-27 00:00:00', end_time: '2026-10-28 00:00:00' }, 'Quality review'],
      ['get_calendar_item', { schedule_id: 'quality_review' }, 'Quality review'],
      ['list_todos', { status_filter: ['proceed'] }, 'Review inspection report'],
      ['get_todo', { todo_id: 'td_quality' }, 'Review inspection report'],
    ]
    for (const [operation, args, content] of cases) {
      const outcome = await execute(ctx, operation, args)
      expect(outcome.isError, JSON.stringify(outcome)).toBe(false)
      expect(JSON.stringify(outcome)).toContain(content)
      expect(JSON.stringify(outcome)).not.toContain('fixture-secret')
      expect(JSON.stringify(outcome)).not.toContain('hidden-user')
    }
    expect(ctx.tools.schemas().filter(row => row.name.startsWith('wecom_office_'))).toMatchSnapshot('office read tools')
    const calls = (await readFile(join(directory!, 'calls.ndjson'), 'utf8')).split('\n').filter(Boolean).map(line => JSON.parse(line) as { credentials?: string })
    expect(calls.filter(row => row.credentials).every(row => row.credentials!.startsWith(join(directory!, 'account')))).toBe(true)
    const tools = ctx.tools
    await ctx.fiber.dispose()
    expect(tools.schemas().some(row => row.name.startsWith('wecom_office_'))).toBe(false)
  })

  it('uses one QR grant for bot sessions and approved sends without manual robot credentials', async () => {
    const ctx = await boot()
    await authorize(ctx)
    const session = Session.create(SessionId('qr-bot-local'))
    const exec = { agent: { session } as Agent, signal: new AbortController().signal }
    const list = ctx.tools.get('wecom_list_chats')!
    const chats = await list.execute({}, exec as never)
    expect(JSON.stringify(chats)).toContain('qr_bound_bot_recent_sessions')
    expect(JSON.stringify(chats)).toContain('Quality bot group')
    expect(JSON.stringify(chats)).not.toContain('fixture-secret')
    await writeFile(join(directory!, 'empty-chats'), '')
    expect(await list.execute({}, exec as never)).toContain('"items":[]')
    await rm(join(directory!, 'empty-chats'))
    const send = ctx.tools.get('wecom_send_message')!
    const denied = await ctx.tools.execute({ name: 'wecom_send_message', callId: ToolCallId('qr-no-approval'),
      arguments: { chat_id: 'qr_chat', text: 'Quality update' }, ...exec })
    expect(denied.isError).toBe(true)
    const before = await readFile(join(directory!, 'calls.ndjson'), 'utf8')
    expect(before).not.toContain('"send"')
    await expect(Promise.resolve().then(() => send.execute({ chat_id: 'not_visible', text: 'Do not send' }, exec as never))).rejects.toThrow()
    expect(await readFile(join(directory!, 'calls.ndjson'), 'utf8')).not.toContain('"send"')
    // The native pipeline denies a missing approval above; exercise the approved executor separately.
    const sent = await send.execute({ chat_id: 'qr_chat', text: 'Quality update' }, exec as never)
    expect(sent).toContain('"accepted":true')
    expect((await readFile(join(directory!, 'calls.ndjson'), 'utf8')).split('\n').filter(line => line.includes('"send"'))).toHaveLength(1)
    const remote = { ...exec, agent: { session: Session.create(SessionId('enterprise-untrusted')) } as Agent }
    await expect(Promise.resolve().then(() => list.execute({}, remote as never))).rejects.toThrow('permission-denied')
  })

  it('automatically receives the QR bot but admits messages only from explicitly approved members', async () => {
    const ctx = await boot()
    await authorize(ctx)
    const socket = [...socketServer!.clients][0]!
    const send = (id: string) => { socket.send(JSON.stringify({ cmd: 'aibot_msg_callback', headers: { req_id: id }, body: {
      msgid: id, aibotid: 'bot_fixture', chattype: 'group', chatid: 'qr_sdk_group', from: { userid: 'approved_member' },
      msgtype: 'text', text: { content: 'Inspection reference' },
    } })) }
    send('not-approved')
    await expect.poll(() => ctx.enterpriseConnectors.status()[1]?.lastSenderId).toBe('approved_member')
    expect(ctx.enterpriseConnectors.status()[1]?.receivedMessages).toBe(0)
    await ctx.settings.update('wecom-connector', { allowedSenders: ['approved_member'] })
    await ctx.enterpriseConnectors.reconnect('wecom')
    const current = [...socketServer!.clients].find(client => client.readyState === 1)!
    current.send(JSON.stringify({ cmd: 'aibot_msg_callback', headers: { req_id: 'approved' }, body: {
      msgid: 'approved', aibotid: 'bot_fixture', chattype: 'group', chatid: 'qr_sdk_group', from: { userid: 'approved_member' },
      msgtype: 'text', text: { content: 'Inspection reference' },
    } }))
    await expect.poll(() => ctx.enterpriseConnectors.status()[1]?.receivedMessages).toBe(1)
    await ctx.enterpriseConnectors.disconnectWecomOffice()
    expect(ctx.enterpriseConnectors.status()[1]?.state).toBe('missing-credentials')
  })

  it('denies direct calls without a trusted local owner and enterprise remote conversations', async () => {
    const ctx = await boot()
    await authorize(ctx)
    const before = await readFile(join(directory!, 'calls.ndjson'), 'utf8')
    const remote = await execute(ctx, 'search_documents', { keywords: ['inspection'] }, 'enterprise-fixture')
    expect(remote.isError).toBe(true)
    const anonymous = await ctx.tools.execute({ name: 'wecom_office_search_documents', callId: ToolCallId('anonymous'),
      arguments: { keywords: ['inspection'] }, signal: new AbortController().signal })
    expect(anonymous.isError).toBe(true)
    expect(await readFile(join(directory!, 'calls.ndjson'), 'utf8')).toBe(before)
  })

  it('cancels pending consent, awaits process exit and removes uncommitted credentials', async () => {
    const ctx = await boot()
    await ctx.enterpriseConnectors.authorizeWecomOffice()
    await vi.waitFor(async () => { expect((await ctx.enterpriseConnectors.wecomOfficeStatus()).qrImage).not.toBe('') }, { timeout: 15000 })
    const cancelled = await ctx.enterpriseConnectors.cancelWecomOffice()
    expect(cancelled.state).toBe('unauthorized')
    expect(cancelled.qrImage).toBe('')
    expect(await readdir(join(directory!, 'account'))).toEqual([])
    const calls = (await readFile(join(directory!, 'calls.ndjson'), 'utf8')).split('\n').filter(Boolean).map(line => JSON.parse(line) as { event: string; pid: number })
    for (const started of calls.filter(row => row.event === 'start')) expect(calls.some(row => row.event === 'exit' && row.pid === started.pid)).toBe(true)
  })

  it('disconnects a saved account and never exposes provider errors or file paths outside an operation', async () => {
    const ctx = await boot()
    await authorize(ctx)
    await writeFile(join(directory!, 'outside.txt'), 'Outside private data')
    expect((await execute(ctx, 'read_document', { resource: 'outside', document_type: 'doc' })).isError).toBe(true)
    await writeFile(join(directory!, 'fail'), '')
    const failed = await execute(ctx, 'search_documents', { keywords: ['inspection'] })
    expect(failed.isError).toBe(true)
    expect(JSON.stringify(failed)).not.toContain('fixture-secret')
    expect((await ctx.enterpriseConnectors.wecomOfficeStatus()).capabilities.find(row => row.id === 'documents')?.state).toBe('unavailable')
    const disconnected = await ctx.enterpriseConnectors.disconnectWecomOffice()
    expect(disconnected.state).toBe('unauthorized')
    expect((await execute(ctx, 'search_documents', { keywords: ['inspection'] })).isError).toBe(true)
    expect(await readdir(join(directory!, 'account'))).toEqual([])
  })

  it('marks bounded long document reads as partial and preserves Unicode boundaries', async () => {
    const ctx = await boot()
    await authorize(ctx)
    const outcome = await execute(ctx, 'read_document', { resource: 'large', document_type: 'doc' })
    expect(outcome.isError).toBe(false)
    const text = outcome.content[0]
    expect(text?.type).toBe('text')
    if (text?.type !== 'text') throw new Error('Expected a text tool result')
    const data = JSON.parse(text.text) as { truncated: boolean }
    expect(data.truncated).toBe(true)
    expect(Buffer.byteLength(text.text)).toBeLessThan(100000)
    expect(JSON.stringify(outcome)).not.toContain('\ufffd')
    expect(JSON.stringify(outcome)).not.toContain('document.md')
  })

  it('validates only fixed read operations and keeps command-looking input as literal JSON', () => {
    const value = '$(touch /tmp/should-never-be-created); `id`'
    expect(officeRequest('search_documents', { keywords: [value] }, 20)).toEqual({ command: ['doc', 'search'], payload: { keywords: [value], limit: 10 } })
    expect(() => officeRequest('read_document', { resource: 'https://evil.invalid/doc/a', document_type: 'doc' }, 20)).toThrow()
    expect(() => officeRequest('read_document', { resource: 'doc_quality', document_type: 'sheet' }, 20)).toThrow()
    expect(() => officeRequest('search_documents', { keywords: ['quality'], command: 'delete' }, 20)).toThrow()
    expect(() => officeRequest('list_calendar', { begin_time: '2026-10-28 00:00:00', end_time: '2026-10-27 00:00:00' }, 20)).toThrow()
  })

  it('expires pending consent and never commits a late approval', async () => {
    const ctx = await boot({ oauthTimeoutMs: 1000 })
    await ctx.enterpriseConnectors.authorizeWecomOffice()
    await vi.waitFor(async () => { expect((await ctx.enterpriseConnectors.wecomOfficeStatus()).error).toBe('timeout') }, { timeout: 10000 })
    await writeFile(join(directory!, 'approve'), '')
    await vi.waitFor(async () => { expect((await ctx.enterpriseConnectors.wecomOfficeStatus()).state).toBe('unauthorized') }, { timeout: 10000 })
    expect(await readdir(join(directory!, 'account'))).toEqual([])
  })

  it('checks saved per-capability switches inside execution before starting a CLI process', async () => {
    const ctx = await boot({ wecomOffice: { enabled: true, documents: false } })
    await authorize(ctx)
    const before = await readFile(join(directory!, 'calls.ndjson'), 'utf8')
    expect((await execute(ctx, 'search_documents', { keywords: ['inspection'] })).isError).toBe(true)
    expect(await readFile(join(directory!, 'calls.ndjson'), 'utf8')).toBe(before)
  })

})
