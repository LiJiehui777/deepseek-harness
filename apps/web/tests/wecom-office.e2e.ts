/** Native QR settings, managed CLI transport and a logged local Agent tool round. */
import { WebSocketServer } from 'ws'
import { once } from 'node:events'
import { existsSync } from 'node:fs'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium, type Browser } from 'playwright'
import { afterEach, expect, it } from 'vitest'
import { LlmAdapter, ToolCallId, type GenerateOptions, type LlmModelInfo, type LlmProviderInfo, type StreamChunk } from '@deepseek-ai/dsh-llm'
import type { SessionEvent } from '@deepseek-ai/dsh-session'
import type {} from '@deepseek-ai/dsh-enterprise-connectors'
import { assertFixtureInventory, captureStableAria, compareOrRefreshGolden, fixtureUserPrompts, launchWebScaffold, recordFixture, watchConsole, webSnapshotMode, type WebScaffold } from './scaffold.ts'

const MODE = webSnapshotMode()
const FIXTURE = fileURLToPath(new URL('../../../snapshots/web/wecom-office/session.v3.jsonl', import.meta.url))
let socketServer: WebSocketServer | undefined
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
      for (const socket of socketServer?.clients ?? []) socket.terminate()
      if (socketServer) await new Promise<void>((resolve) => { socketServer!.close(() => { resolve() }) })
      socketServer = undefined
      if (directory) await rm(directory, { recursive: true, force: true }); directory = undefined }
  }
})
class OfficeModel extends LlmAdapter {
  override providerInfo(provider: string): LlmProviderInfo { return { id: provider, name: 'Office fixture' } }
  override listModels(provider: string): Promise<readonly LlmModelInfo[]> {
    return Promise.resolve([{ provider, id: 'fixture', name: 'Fixture', contextWindow: 128000 }])
  }
  override async * stream(options: GenerateOptions): AsyncIterable<StreamChunk> {
    const last = options.messages.findLast(message => message.source.kind === 'tool' || message.source.kind === 'user')
    if (last?.source.kind === 'user') {
      const id = ToolCallId('office-document-read')
      const name = 'wecom_office_read_document'
      const args = JSON.stringify({ resource: 'doc_quality', document_type: 'doc' })
      yield { type: 'block-start', index: 0, blockType: 'tool-call' }
      yield { type: 'tool-call-delta', index: 0, id, name, argumentsDelta: args }
      yield { type: 'block-end', index: 0, block: { type: 'tool-call', id, name, arguments: args } }
      yield { type: 'finish', reason: { kind: 'tool-calls' } }
      return
    }
    const text = JSON.stringify(last).includes('Inspect every incoming batch') ? 'Quality reference: inspect every incoming batch and retain the test report.' : 'Office read failed.'
    yield { type: 'block-start', index: 0, blockType: 'text' }
    yield { type: 'block-end', index: 0, block: { type: 'text', text } }
    yield { type: 'finish', reason: { kind: 'stop' } }
  }
}
it.skipIf(MODE === 'record')('connects by QR without manual setup, reads a document in local chat and disconnects', async () => {
  directory = await mkdtemp(join(tmpdir(), 'wecom-office-web-'))
  socketServer = new WebSocketServer({ host: '127.0.0.1', port: 0 })
  socketServer.on('connection', (socket) => { socket.on('message', (raw) => {
    const bytes = Array.isArray(raw) ? Buffer.concat(raw) : raw instanceof ArrayBuffer ? Buffer.from(raw) : raw
    const frame = JSON.parse(bytes.toString()) as { headers: unknown }
    socket.send(JSON.stringify({ headers: frame.headers, errcode: 0, errmsg: 'ok' }))
  }) })
  await once(socketServer, 'listening')
  const address = socketServer.address()
  if (!address || typeof address !== 'object') throw new Error('Missing SDK fixture port')
  const fixture = fileURLToPath(new URL('../../../packages/interaction/enterprise-connectors/tests/fixtures/wecom-office-cli.mjs', import.meta.url))
  const overlay = join(directory, 'office.patch.yml')
  await writeFile(overlay, '- id: agent-default-model\n  config:\n    provider: office-fixture\n    model: fixture\n- insert:\n    - id: office-authorization\n      name: "@deepseek-ai/dsh-authorization"\n    - id: office-connector\n      name: "@deepseek-ai/dsh-enterprise-connectors"\n      config:\n        wecom:\n          websocketURL: ws://127.0.0.1:'+String(address.port)+'\n        wecomOfficeRuntime:\n          directory: '+JSON.stringify(join(directory, 'account'))+'\n          command: '+JSON.stringify([process.execPath, fixture, directory])+'\n        timeoutMs: 10000\n')
  const bootstrap = MODE === 'refresh' && !existsSync(FIXTURE)
  scaffold = await launchWebScaffold({ extraOverlayPath: overlay, ...(bootstrap ? {} : { replayFixture: FIXTURE, compareReplaySession: true,
    replayProviders: [{ id: 'office-fixture', name: 'Office fixture', models: [{ id: 'fixture', name: 'Fixture', contextWindow: 128000 }] }] }) })
  const owner = scaffold
  if (bootstrap) owner.ctx.effect(() => owner.ctx.llm.registerAdapter(['office-fixture'], new OfficeModel()))
  const events: SessionEvent[] = []
  owner.ctx.on('session/event', (_session, event) => { events.push(event) })
  browser = await chromium.launch()
  const page = await browser.newPage({ locale: 'en-US', viewport: { width: 1440, height: 1000 } })
  const tripwire = watchConsole(page)
  await page.goto(owner.authenticatedUrl)
  await page.getByRole('button', { name: 'Settings', exact: true }).click()
  const settings = page.getByRole('dialog', { name: 'Settings', exact: true })
  await settings.getByRole('button', { name: 'Plugins', exact: true }).click()
  await settings.getByRole('button', { name: 'Show settings: WeCom connector', exact: true }).click()
  const office = settings.getByRole('region', { name: 'Office account', exact: true })
  expect(await office.getByRole('checkbox').count()).toBe(0)
  await page.screenshot({ path: '/tmp/dh-wecom-office-simple.png' })
  await office.getByRole('button', { name: 'Connect by QR code', exact: true }).click()
  await office.getByRole('img').waitFor()
  expect((await office.getByRole('img').getAttribute('src'))?.startsWith('data:image/png;base64,')).toBe(true)
  await office.getByRole('button', { name: 'Cancel', exact: true }).click()
  await office.getByRole('button', { name: 'Connect by QR code', exact: true }).waitFor()
  await office.getByRole('button', { name: 'Connect by QR code', exact: true }).click()
  await office.getByRole('img').waitFor()
  await writeFile(join(directory, 'approve'), '')
  await office.getByText('Quality user', { exact: false }).waitFor()
  expect(await office.getByRole('button').count()).toBe(1)
  expect(await office.getByRole('checkbox').count()).toBe(0)
  const document = await readFile(join(owner.harnessHome, 'settings.yaml'), 'utf8')
  expect(document).toContain('wecom-office-connector:')
  expect(document).not.toContain('fixture-secret')
  expect(await settings.getByRole('textbox', { name: 'Bot ID', exact: true }).count()).toBe(0)
  await settings.getByText('Task access permissions', { exact: true }).click()
  const socket = [...socketServer.clients][0]!
  socket.send(JSON.stringify({ cmd: 'aibot_msg_callback', headers: { req_id: 'setup-only' }, body: {
    msgid: 'setup-only', aibotid: 'bot_fixture', chattype: 'group', chatid: 'qr_fixture_group', from: { userid: 'quality_member' },
    msgtype: 'text', text: { content: 'Set up member access' },
  } }))
  await expect.poll(() => owner.ctx.enterpriseConnectors.status()[1]?.lastSenderId).toBe('quality_member')
  expect(owner.ctx.enterpriseConnectors.status()[1]?.receivedMessages).toBe(0)
  await settings.getByRole('button', { name: 'Refresh status', exact: true }).click()
  await settings.getByRole('button', { name: 'Add latest sender', exact: true }).click()
  await settings.getByRole('button', { name: 'Save', exact: true }).click()
  await expect.poll(async () => (await readFile(join(owner.harnessHome, 'settings.yaml'), 'utf8')).includes('quality_member')).toBe(true)
  expect(await settings.getByRole('textbox', { name: 'Bot ID', exact: true }).count()).toBe(0)
  await settings.getByRole('button', { name: 'Show settings: WeCom connector', exact: true }).click()
  await office.getByText('Quality user', { exact: false }).waitFor()
  expect(await settings.getByRole('textbox', { name: 'Bot ID', exact: true }).count()).toBe(0)
  const expected = fileURLToPath(new URL('./expected/wecom-office/settings.expected.md', import.meta.url))
  await compareOrRefreshGolden(expected, await captureStableAria(page, '[role="dialog"]', owner.workspaceCwd), webSnapshotMode())
  await settings.getByRole('button', { name: 'Close', exact: true }).click()
  const workspace = join(owner.workspaceCwd, 'workspace')
  await mkdir(workspace, { recursive: true })
  await page.getByRole('textbox', { name: 'Choose workspace' }).click()
  const picker = page.getByRole('dialog', { name: 'Select Workspace Directory' })
  await picker.getByRole('button', { name: 'Edit path' }).click()
  const path = picker.getByRole('textbox', { name: 'Edit path' })
  await path.fill(workspace)
  await path.press('Enter')
  await picker.getByRole('button', { name: 'Open', exact: true }).click()
  await page.locator('[data-composer-input][contenteditable="true"]').waitFor()
  const input = page.locator('[data-composer-input]').first()
  const settled = owner.whenTurnSettled()
  const prompt = bootstrap ? 'Read the quality inspection reference document.' : fixtureUserPrompts(await readFile(FIXTURE, 'utf8'))[0]
  if (!prompt) throw new Error('Office fixture must own one user prompt')
  await input.fill(prompt)
  await input.press('Enter')
  const sessionId = await settled
  if (bootstrap) await recordFixture(owner, sessionId, FIXTURE)
  await page.getByText('Quality reference: inspect every incoming batch and retain the test report.', { exact: true }).waitFor()
  expect(owner.ctx.tools.get('wecom_list_chats')).toBeDefined()
  expect(owner.ctx.tools.get('wecom_send_message')).toBeDefined()
  expect(owner.ctx.tools.get('wecom_read_messages')).toBeDefined()
  const reads = events.filter(event => event.type === 'tool/result')
  expect(JSON.stringify(reads)).toContain('Inspect every incoming batch')
  expect(JSON.stringify(reads)).not.toContain('fixture-secret')
  const state = await owner.ctx.enterpriseConnectors.wecomOfficeStatus()
  expect(state.capabilities.find(row => row.id === 'documents')?.state).toBe('verified')
  await owner.ctx.enterpriseConnectors.disconnectWecomOffice()
  expect((await owner.ctx.enterpriseConnectors.wecomOfficeStatus()).state).toBe('unauthorized')
  if (!bootstrap) await assertFixtureInventory(dirname(FIXTURE), ['session.v3.jsonl', 'system-prompt.expected.md', 'tool-schemas.expected.json'])
  expect(tripwire.pageErrors).toEqual([])
}, 60000)
