/** Real settings, SDK transports, Agent execution and durable Session receipts; no external account or model calls. */
import { once } from 'node:events'
import { createServer, type Server } from 'node:http'
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { WebSocketServer, type WebSocket } from 'ws'
import protobuf from 'protobufjs'
import { chromium, type Browser } from 'playwright'
import { afterEach, expect, it } from 'vitest'
import { LlmAdapter, ToolCallId, type GenerateOptions, type StreamChunk } from '@deepseek-ai/dsh-llm'
import type { Session } from '@deepseek-ai/dsh-session'
import type {} from '@deepseek-ai/dsh-enterprise-connectors'
import { captureStableAria, compareOrRefreshGolden, launchWebScaffold, watchConsole, webSnapshotMode, type WebScaffold } from './scaffold.ts'

let server: Server | undefined
let ws: WebSocketServer | undefined
let browser: Browser | undefined
let scaffold: WebScaffold | undefined
let directory: string | undefined
afterEach(async () => {
  try { await browser?.close() }
  finally {
    browser = undefined
    try { await scaffold?.close() }
    finally {
      scaffold = undefined
      for (const socket of ws?.clients ?? []) socket.terminate()
      await new Promise<void>((resolve) => { if (ws) ws.close(() => { resolve() }); else resolve() })
      ws = undefined
      if (server) {
        server.closeAllConnections()
        await new Promise<void>((resolve, reject) => { server!.close((error) => { if (error) reject(error); else resolve() }) })
      }
      server = undefined
      if (directory) await rm(directory, { recursive: true, force: true })
      directory = undefined
    }
  }
})
class FixtureModel extends LlmAdapter {
  private calls = 0
  override async * stream(options: GenerateOptions): AsyncIterable<StreamChunk> {
    const last = options.messages.findLast(message => message.source.kind === 'tool' || message.source.kind === 'user')
    const lastText = JSON.stringify(last)
    if (last?.source.kind === 'user' && lastText.includes('quality_remote_task') && options.tools?.some(tool => tool.name === 'feishu_read_document')) {
      const id = ToolCallId(`enterprise-read-${++this.calls}`)
      const name = lastText.includes('notify_feishu') ? 'feishu_send_message' : lastText.includes('notify_wecom') ? 'wecom_send_message' : 'feishu_read_document'
      const args = JSON.stringify(name === 'feishu_read_document' ? { resource: 'DocA' } : { chat_id: 'chat_a', text: `Quality notice via ${name}` })
      yield { type: 'block-start', index: 0, blockType: 'tool-call' }
      yield { type: 'tool-call-delta', index: 0, id, name, argumentsDelta: args }
      yield { type: 'block-end', index: 0, block: { type: 'tool-call', id, name, arguments: args } }
      yield { type: 'finish', reason: { kind: 'tool-calls' } }
      return
    }
    yield { type: 'block-start', index: 0, blockType: 'text' }
    yield { type: 'block-end', index: 0, block: { type: 'text', text: lastText.includes('Authorized quality document')
      ? 'Quality task done: Authorized quality document' : lastText.includes('accepted') ? 'Quality notice delivered' : 'Fixture response' } }
    yield { type: 'finish', reason: { kind: 'stop' } }
  }
}
it('saves both native accounts without secrets in settings, then runs a WeCom task using the Feishu document tool', async () => {
  const frames: Array<Record<string, unknown>> = []
  const requests: string[] = []
  const posts: string[] = []
  let feishuSocket: WebSocket | undefined
  let wecomSocket: WebSocket | undefined
  const approvals: string[] = []
  // Fixture sequence numbers are small positive varints, also valid for the SDK uint64 fields.
  const frameType = protobuf.parse('syntax = "proto2"; message Header { required string key = 1; required string value = 2; } message Frame { required uint32 SeqID = 1; required uint32 LogID = 2; required int32 service = 3; required int32 method = 4; repeated Header headers = 5; optional bytes payload = 8; }', { keepCase: true }).root.lookupType('Frame')
  server = createServer((req, res) => {
    requests.push(req.url!)
    req.on('data', (chunk) => { if (req.method === 'POST' && req.url?.includes('/messages')) posts.push(String(chunk)) })
    const path = new URL(req.url!, 'http://fixture.invalid').pathname
    const port = (server!.address() as { port: number }).port
    const data = path === '/callback/ws/endpoint'
      ? { code: 0, data: { URL: `ws://127.0.0.1:${port}/feishu?device_id=test&service_id=1`, ClientConfig: { ReconnectCount: 0, ReconnectInterval: 1, ReconnectNonce: 0, PingInterval: 120 } } }
      : path.includes('tenant_access_token')
        ? { code: 0, tenant_access_token: 'fixture-access-token', expire: 7200 }
        : path.endsWith('/raw_content') ? { code: 0, data: { content: 'Authorized quality document' } }
          : { code: 0, bot: { app_name: 'Fixture bot', open_id: 'bot_open_id' } }
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify(data))
  })
  ws = new WebSocketServer({ server })
  ws.on('connection', (socket, req) => {
    if (req.url?.startsWith('/feishu')) { feishuSocket = socket; return }
    wecomSocket = socket
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
  if (!address || typeof address !== 'object') throw new Error('Missing provider port')
  directory = await mkdtemp(join(tmpdir(), 'enterprise-web-'))
  const overlay = join(directory, 'cordis.patch.yml')
  await writeFile(overlay, `- id: agent-default-model\n  config:\n    provider: enterprise-fixture\n    model: fixture\n- insert:\n    - id: enterprise-connectors\n      name: '@deepseek-ai/dsh-enterprise-connectors'\n      config:\n        feishu:\n          secretRef: DSH_TEST_FEISHU_SECRET\n          baseURL: http://127.0.0.1:${address.port}\n        wecom:\n          secretRef: DSH_TEST_WECOM_SECRET\n          websocketURL: ws://127.0.0.1:${address.port}\n        timeoutMs: 2000\n    - id: ragflow-connector\n      name: '@deepseek-ai/dsh-tool-ragflow-connector'\n`)
  scaffold = await launchWebScaffold({ extraOverlayPath: overlay })
  const model = new FixtureModel()
  scaffold.ctx.effect(() => scaffold!.ctx.llm.registerAdapter(['enterprise-fixture'], model))
  scaffold.ctx.on('approval/request', (request) => {
    approvals.push(request.toolName)
    return Promise.resolve('allowed-once')
  }, { prepend: true })
  browser = await chromium.launch()
  const page = await browser.newPage({ viewport: { width: 1440, height: 1100 }, locale: 'en-US' })
  const tripwire = watchConsole(page)
  await page.goto(scaffold.authenticatedUrl)
  await page.getByRole('button', { name: 'Settings', exact: true }).click()
  const settings = page.getByRole('dialog', { name: 'Settings', exact: true })
  await settings.getByRole('button', { name: 'Plugins', exact: true }).click()
  const feishu = settings.getByRole('listitem').filter({ has: page.getByRole('button', { name: /settings: Feishu connector$/ }) })
  await feishu.getByRole('button', { name: 'Show settings: Feishu connector', exact: true }).click()
  await feishu.getByLabel('App ID', { exact: true }).fill('cli_0123456789abcdef')
  await feishu.getByLabel('App Secret', { exact: true }).fill('fixture-feishu-secret')
  await feishu.getByLabel('Allowed sender IDs', { exact: true }).fill('user_a')
  await feishu.getByLabel('Allowed chat IDs', { exact: true }).fill('chat_a')
  await feishu.getByRole('checkbox', { name: 'Enable this connection', exact: true }).check()
  await feishu.getByRole('checkbox', { name: 'Receive remote tasks from this platform', exact: true }).check()
  await feishu.getByRole('checkbox', { name: 'Allow DH to send messages', exact: true }).check()
  await feishu.getByRole('button', { name: 'Save', exact: true }).click()
  await feishu.getByRole('button', { name: 'Show settings: Feishu connector', exact: true }).click()
  await feishu.getByRole('button', { name: 'Connect / check saved account' }).click()
  try { await feishu.getByText('Connected', { exact: true }).waitFor({ timeout: 5000 }) }
  catch (error) {
    const details = { status: scaffold.ctx.enterpriseConnectors.status(), requests, socket: !!feishuSocket }
    throw new Error(JSON.stringify(details), { cause: error })
  }
  expect(await feishu.getByLabel('App Secret', { exact: true }).inputValue()).toBe('')
  const wecom = settings.getByRole('listitem').filter({ has: page.getByRole('button', { name: /settings: WeCom connector$/ }) })
  await wecom.getByRole('button', { name: 'Show settings: WeCom connector', exact: true }).click()
  await wecom.getByLabel('Bot ID', { exact: true }).fill('bot_fixture')
  await wecom.getByLabel('Bot Secret', { exact: true }).fill('fixture-wecom-secret')
  await wecom.getByLabel('Allowed sender IDs', { exact: true }).fill('user_a')
  await wecom.getByLabel('Allowed chat IDs', { exact: true }).fill('chat_a')
  await wecom.getByRole('checkbox', { name: 'Enable this connection', exact: true }).check()
  await wecom.getByRole('checkbox', { name: 'Receive remote tasks from this platform', exact: true }).check()
  await wecom.getByRole('checkbox', { name: 'Allow DH to send messages', exact: true }).check()
  await wecom.getByRole('button', { name: 'Save', exact: true }).click()
  await wecom.getByRole('button', { name: 'Show settings: WeCom connector', exact: true }).click()
  await wecom.getByRole('button', { name: 'Connect / check saved account' }).click()
  await wecom.getByText('Connected', { exact: true }).waitFor()
  expect(await wecom.getByLabel('Bot Secret', { exact: true }).inputValue()).toBe('')
  const document = await readFile(join(scaffold.harnessHome, 'settings.yaml'), 'utf8')
  expect(document).toContain('feishu-connector:')
  expect(document).toContain('wecom-connector:')
  expect(document).not.toContain('fixture-feishu-secret')
  expect(document).not.toContain('fixture-wecom-secret')
  expect(await settings.innerText()).not.toContain('fixture-feishu-secret')
  const expected = fileURLToPath(new URL('./expected/enterprise-connectors/settings.expected.md', import.meta.url))
  await compareOrRefreshGolden(expected, await captureStableAria(page, '[role="dialog"]', scaffold.workspaceCwd), webSnapshotMode())
  const messages: Array<{ session: Session; text: string }> = []
  scaffold.ctx.on('session/event', (session, event) => {
    if (event.type === 'user/message' && event.data.source.kind === 'user') messages.push({ session, text: JSON.stringify(event.data) })
  })
  await expect.poll(() => !!wecomSocket && !!feishuSocket).toBe(true)
  const send = (id: string, sender: string, content = 'quality_remote_task: read DocA and summarize') => { wecomSocket!.send(JSON.stringify({ cmd: 'aibot_msg_callback', headers: { req_id: id },
    body: { msgid: id, aibotid: 'bot_fixture', chattype: 'group', chatid: 'chat_a', from: { userid: sender },
      msgtype: 'text', text: { content } } })) }
  send('forbidden', 'user_other')
  await expect.poll(() => scaffold!.ctx.enterpriseConnectors.status()[1]?.lastSenderId).toBe('user_other')
  expect(messages).toEqual([])
  send('allowed-1', 'user_a')
  await expect.poll(() => JSON.stringify(frames), { timeout: 20000 }).toContain('Quality task done: Authorized quality document')
  expect(requests.some(path => path.endsWith('/raw_content'))).toBe(true)
  expect(messages).toHaveLength(1)
  expect(messages[0]!.text).toContain('wecom')
  const session = messages[0]!.session
  await scaffold.ctx.sessions.flush(session)
  const files = await readdir(scaffold.persistenceRoot, { recursive: true })
  expect(files.length).toBeGreaterThan(0)
  send('allowed-2', 'user_a')
  await expect.poll(() => messages.length).toBe(2)
  expect(messages[1]!.session.id).toBe(session.id)
  send('allowed-2', 'user_a')
  expect(messages).toHaveLength(2)
  send('send-feishu', 'user_a', 'quality_remote_task notify_feishu')
  await expect.poll(() => JSON.stringify(posts), { timeout: 20000 }).toContain('Quality notice via feishu_send_message')
  send('send-wecom', 'user_a', 'quality_remote_task notify_wecom')
  await expect.poll(() => JSON.stringify(frames), { timeout: 20000 }).toContain('Quality notice via wecom_send_message')
  expect(approvals).toHaveLength(2)
  const event = { schema: '2.0', header: { event_type: 'im.message.receive_v1', event_id: 'feishu-incoming' }, event: {
    sender: { sender_type: 'user', sender_id: { open_id: 'user_a' } },
    message: { message_id: 'feishu-incoming', chat_id: 'chat_a', chat_type: 'group', message_type: 'text',
      mentions: [{ id: { open_id: 'bot_open_id' } }], content: JSON.stringify({ text: '@_user_1 quality_remote_task read DocA' }) } } }
  const binary = frameType.encode(frameType.create({ SeqID: 1, LogID: 1, service: 1, method: 1,
    headers: Object.entries({ type: 'event', message_id: 'feishu-incoming', sum: '1', seq: '0' }).map(([key, value]) => ({ key, value })),
    payload: Buffer.from(JSON.stringify(event)) })).finish()
  feishuSocket!.send(binary)
  await expect.poll(() => messages.length, { timeout: 20000 }).toBe(5)
  await expect.poll(() => posts.some(body => body.includes('Quality task done: Authorized quality document')), { timeout: 20000 }).toBe(true)
  expect(messages[4]!.text).toContain('feishu')
  expect(tripwire.pageErrors).toEqual([])
})
