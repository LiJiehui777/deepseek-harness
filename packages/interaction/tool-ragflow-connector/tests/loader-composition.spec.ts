import { createServer, type Server } from 'node:http'
import { once } from 'node:events'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { Context } from '@deepseek-ai/cordis'
import Loader from '@deepseek-ai/cordis-plugin-loader'
import Include from '@deepseek-ai/cordis-plugin-include'
import AgentRegistry from '@deepseek-ai/dsh-agent'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import Tools from '@deepseek-ai/dsh-tools'
import { credentialRef } from '@deepseek-ai/dsh-credentials'
import { MemoryCredentials } from '../../../credentials/credentials/tests/memory.ts'
import { ToolCallId } from '@deepseek-ai/dsh-llm'
import { afterEach, expect, it } from 'vitest'
import * as Connector from '../src/index.ts'

let ctx: Context | undefined
let server: Server | undefined
let directory: string | undefined
let requests: Array<{ path: string; auth: string | undefined; body: Record<string, unknown> }> = []
let reply: { status: number; body: unknown; headers?: Record<string, string> }
const sample = { code: 0, data: { chunks: [{ id: 'chunk1', dataset_id: 'kb_a', document_id: 'doc1', document_keyword: '质量报告.pdf', content: '检查结论：合格', similarity: 0.95 }] } }
afterEach(async () => {
  await ctx?.fiber.dispose()
  ctx = undefined
  if (server) {
    server.closeAllConnections()
    await new Promise<void>((resolve, reject) => { server!.close((error) => { if (error) reject(error); else resolve() }) })
  }
  server = undefined
  if (directory) await rm(directory, { recursive: true, force: true })
  directory = undefined
})
async function start(): Promise<string> {
  requests = []
  reply = { status: 200, body: sample }
  server = createServer((req, res) => {
    void (async () => {
      const chunks: Buffer[] = []
      for await (const chunk of req as AsyncIterable<Uint8Array>) chunks.push(Buffer.from(chunk))
      const text = Buffer.concat(chunks).toString('utf8')
      requests.push({ path: req.url!, auth: req.headers.authorization, body: text ? JSON.parse(text) as Record<string, unknown> : {} })
      res.writeHead(reply.status, { 'Content-Type': 'application/json', ...reply.headers })
      res.end(typeof reply.body === 'string' ? reply.body : JSON.stringify(reply.body))
    })().catch(() => { res.destroy() })
  })
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const address = server.address()
  if (typeof address !== 'object' || !address) throw new Error('Missing allocated fixture port')
  return `http://127.0.0.1:${address.port}`
}
async function boot(loader = false, overrides: Partial<Connector.Config> = {}): Promise<Context> {
  const baseURL = await start()
  ctx = new Context()
  if (loader) {
    await ctx.plugin(Loader)
    ctx.loader.builtins.include = Include
    const credentials = { apply(context: Context) { context.plugin(MemoryCredentials, { RAGFLOW_API_KEY: 'test-private-key' }) } }
    const modules = new Map<string, unknown>([['@deepseek-ai/dsh-agent', AgentRegistry], ['@deepseek-ai/dsh-system-prompt', SystemPrompt], ['@deepseek-ai/dsh-tools', Tools], ['test:credentials', credentials], ['@deepseek-ai/dsh-tool-ragflow-connector', Connector]])
    ctx.loader.internal = { version: 'v2', import(name: string) { return Promise.resolve(modules.get(name)) } } as unknown as NonNullable<typeof ctx.loader.internal>
    directory = await mkdtemp(join(tmpdir(), 'ragflow-loader-'))
    const file = join(directory, 'cordis.yml')
    await writeFile(file, (await readFile(new URL('./fixtures/cordis.yml', import.meta.url), 'utf8')).replace('http://fixture.invalid', baseURL))
    await ctx.loader.create({ name: 'cordis:include', config: { path: pathToFileURL(file).href } })
    await ctx.loader.await()
  } else {
    await ctx.plugin(AgentRegistry)
    await ctx.plugin(SystemPrompt)
    await ctx.plugin(Tools)
    await ctx.plugin(MemoryCredentials, { RAGFLOW_API_KEY: 'test-private-key' })
    await ctx.plugin(Connector, { enabled: true, baseURL, apiKeyEnv: 'RAGFLOW_API_KEY', datasetIds: ['kb_a'], maxChunks: 5, maxPageSize: 20, maxResultBytes: 4096, timeoutMs: 1000, ...overrides })
  }
  return ctx
}
function execute(root: Context, tool = 'ragflow_retrieval', args: Record<string, unknown> = { question: '检查结果如何？' }, signal = new AbortController().signal) {
  return root.tools.execute({ callId: ToolCallId('ragflow-read'), name: tool, arguments: args, signal })
}
it('boots the native connector through Loader and retrieves cited knowledge over real HTTP', async () => {
  const root = await boot(true)
  expect(root.tools.schemas()).toMatchSnapshot('native knowledge tools')
  const result = await execute(root)
  expect(result.isError).toBe(false)
  expect(result.content).toMatchSnapshot('cited RAGFlow evidence')
  expect(requests[0]).toMatchObject({ path: '/api/v1/retrieval', auth: 'Bearer test-private-key', body: { dataset_ids: ['kb_a'], question: '检查结果如何？', highlight: false } })
  expect(JSON.stringify(result)).not.toContain('test-private-key')
  const tools = root.tools
  await root.fiber.dispose()
  expect(tools.schemas()).toEqual([])
})
it('lists allowed dataset metadata without copying documents or unknown response fields', async () => {
  const root = await boot()
  reply.body = { code: 0, data: [{ id: 'kb_a', name: '质量知识库', secret: 'not-for-the-model' }, { id: 'kb_b', name: 'Other' }] }
  const result = await execute(root, 'ragflow_list_datasets', {})
  expect(result.isError).toBe(false)
  expect(JSON.stringify(result.content)).toContain('质量知识库')
  expect(JSON.stringify(result.content)).not.toContain('Other')
  expect(JSON.stringify(result.content)).not.toContain('not-for-the-model')
  expect(requests[0]?.path).toBe('/api/v1/datasets?page=1&page_size=20')
})
it('refuses requests that widen the dataset allowlist or exceed query and page bounds before HTTP', async () => {
  const root = await boot()
  for (const args of [{ question: 'q', dataset_ids: ['kb_b'] }, { question: 'q', dataset_ids: [] }, { question: 'q', dataset_ids: ['kb_a', 'kb_a'] }, { question: '' }, { question: 'x'.repeat(4001) }, { question: 'q', max_chunks: 6 }]) expect((await execute(root, 'ragflow_retrieval', args)).isError).toBe(true)
  expect((await execute(root, 'ragflow_list_datasets', { page_size: 21 })).isError).toBe(true)
  expect(requests).toEqual([])
})
it('allows discovery with no selected datasets but refuses retrieval', async () => {
  const root = await boot(false, { datasetIds: [] })
  expect((await execute(root)).isError).toBe(true)
  reply.body = { code: 0, data: [{ id: 'kb_a', name: '质量知识库' }] }
  expect((await execute(root, 'ragflow_list_datasets', {})).isError).toBe(false)
  expect(requests).toHaveLength(1)
})
it('keeps disabled connectors disconnected', async () => {
  const root = await boot(false, { enabled: false })
  expect((await execute(root)).isError).toBe(true)
  expect((await execute(root, 'ragflow_list_datasets', {})).isError).toBe(true)
  expect(requests).toEqual([])
})
it('resolves changed credentials on each request and refuses a missing key', async () => {
  const root = await boot()
  await root.credentials.set(credentialRef('RAGFLOW_API_KEY'), 'rotated-key')
  expect((await execute(root)).isError).toBe(false)
  expect(requests[0]?.auth).toBe('Bearer rotated-key')
  await root.credentials.unset(credentialRef('RAGFLOW_API_KEY'))
  expect((await execute(root)).isError).toBe(true)
  expect(requests).toHaveLength(1)
})
it('sanitizes provider errors and refuses malformed and out-of-scope chunks', async () => {
  const root = await boot()
  for (const body of [{ code: 101, message: 'test-private-key' }, 'not-json', { code: 0, data: {} }, { code: 0, data: { chunks: [{ ...sample.data.chunks[0], dataset_id: 'kb_b' }] } }]) {
    reply.body = body
    const result = await execute(root)
    expect(result.isError).toBe(true)
    expect(JSON.stringify(result)).not.toContain('test-private-key')
  }
  reply = { status: 401, body: 'test-private-key' }
  const denied = await execute(root)
  expect(denied.isError).toBe(true)
  expect(JSON.stringify(denied)).not.toContain('test-private-key')
})
it('rejects redirects without forwarding credentials to their target', async () => {
  const root = await boot()
  reply = { status: 302, body: '', headers: { Location: '/untrusted' } }
  expect((await execute(root)).isError).toBe(true)
  expect(requests).toHaveLength(1)
})
it('bounds complete UTF-8 responses and forwards cancellation', async () => {
  const root = await boot()
  reply.body = { code: 0, data: { chunks: [{ ...sample.data.chunks[0], content: '文'.repeat(2000) }] } }
  expect((await execute(root)).isError).toBe(true)
  const abort = new AbortController()
  abort.abort()
  expect((await execute(root, 'ragflow_retrieval', { question: 'q' }, abort.signal)).isError).toBe(true)
})
