import { Context } from '@deepseek-ai/cordis'
import Loader from '@deepseek-ai/cordis-plugin-loader'
import Include from '@deepseek-ai/cordis-plugin-include'
import AgentRegistry from '@deepseek-ai/dsh-agent'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import Tools from '@deepseek-ai/dsh-tools'
import { ToolCallId } from '@deepseek-ai/dsh-llm'
import { afterEach, expect, it } from 'vitest'
import * as Quality from '../src/index.ts'

let ctx: Context | undefined
const draft = { title: 'Scratch investigation', facts: ['12 of 200 sampled units scratched'], evidence: [{ id: 'E1', document_name: 'Inspection procedure', chunk_id: 'chunk-1', summary: 'Inspect packaging and handling' }], hypotheses: [{ statement: 'Packaging may contribute', evidence_ids: ['E1'], verification: 'Compare controlled packaging trials' }], actions: [{ action: 'Contain affected stock', owner: 'Quality team', acceptance_criteria: 'All affected stock identified' }], questions: ['Batch size unknown'] }
afterEach(async () => { await ctx?.fiber.dispose(); ctx = undefined })
async function boot() {
  ctx = new Context()
  await ctx.plugin(Loader)
  ctx.loader.builtins.include = Include
  const modules = new Map<string, unknown>([['@deepseek-ai/dsh-agent', AgentRegistry], ['@deepseek-ai/dsh-system-prompt', SystemPrompt], ['@deepseek-ai/dsh-tools', Tools], ['@deepseek-ai/dsh-tool-quality-report', Quality]])
  ctx.loader.internal = { version: 'v2', async import(name: string) { if (!modules.has(name)) throw new Error(name); return modules.get(name) } } as unknown as NonNullable<typeof ctx.loader.internal>
  await ctx.loader.create({ name: 'cordis:include', config: { path: new URL('./fixtures/cordis.yml', import.meta.url).href } })
  await ctx.loader.await()
  return ctx
}
async function execute(report: typeof draft) {
  const root = await boot()
  return root.tools.execute({ callId: ToolCallId('review'), name: 'quality_report_review', arguments: { report }, signal: new AbortController().signal })
}
it('boots through the Loader and preserves draft status and replayable evidence', async () => {
  const result = await execute(draft)
  expect(result.isError).toBe(false)
  expect(result.meta).toEqual({ schema_version: 1, review_status: 'draft', structure_valid: true, report_json: JSON.stringify(draft), issues: [] })
  expect(result.content).toEqual([{ type: 'text', text: JSON.stringify(result.meta) }])
})
it('returns missing sections and unresolved citations instead of approving a draft', async () => {
  const result = await execute({ ...draft, facts: [], evidence: [], actions: [], hypotheses: [{ statement: 'Packaging caused it', evidence_ids: ['invented'], verification: '' }] })
  expect(result.meta).toMatchObject({ structure_valid: false, review_status: 'draft', issues: ['missing_facts', 'missing_evidence', 'incomplete_hypothesis', 'unresolved_evidence_reference', 'incomplete_actions'] })
})
it('rejects multibyte oversized reports before returning metadata', async () => {
  const result = await execute({ ...draft, title: '\u8d28'.repeat(2000) })
  expect(result.isError).toBe(true)
  expect(result.meta).toBeUndefined()
})
it('unregisters its tool when the plugin fiber is disposed', async () => {
  const root = new Context(); ctx = root
  await root.plugin(AgentRegistry); await root.plugin(SystemPrompt); await root.plugin(Tools)
  const fiber = root.plugin(Quality, { maxReportBytes: 4096, maxItems: 30 })
  await fiber.await()
  expect(root.tools.schemas().map(tool => tool.name)).toContain('quality_report_review')
  await fiber.dispose()
  expect(root.tools.schemas().map(tool => tool.name)).not.toContain('quality_report_review')
})

it('deduplicates structural issues and accepts missing sections only as an invalid draft', async () => {
  const result = await execute({ ...draft, title: ' ', facts: [' '], evidence: [{ id: ' ', document_name: '', chunk_id: '', summary: '' }, { id: ' ', document_name: '', chunk_id: '', summary: '' }], hypotheses: [], actions: [{ action: '', owner: '', acceptance_criteria: '' }] })
  expect(result.meta).toMatchObject({ structure_valid: false, issues: ['missing_title', 'missing_facts', 'invalid_evidence_id', 'incomplete_evidence', 'missing_hypotheses', 'incomplete_actions'] })
})
it('bounds nested references and complete escaped results independently', async () => {
  const excessive = await execute({ ...draft, hypotheses: [{ ...draft.hypotheses[0]!, evidence_ids: Array.from({ length: 31 }, () => 'E1') }] })
  expect(excessive.isError).toBe(true)
  const escaped = await execute({ ...draft, title: '"'.repeat(1300) })
  expect(escaped.isError).toBe(true)
  expect(escaped.content).toEqual(expect.arrayContaining([expect.objectContaining({ text: expect.stringContaining('Complete review result') })]))
})
