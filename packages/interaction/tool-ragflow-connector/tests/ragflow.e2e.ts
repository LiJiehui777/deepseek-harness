import { Context } from '@deepseek-ai/cordis'
import AgentRegistry from '@deepseek-ai/dsh-agent'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import Tools from '@deepseek-ai/dsh-tools'
import { ToolCallId } from '@deepseek-ai/dsh-llm'
import { MemoryCredentials } from '../../../credentials/credentials/tests/memory.ts'
import { expect, it } from 'vitest'
import * as Connector from '../src/index.ts'

it.skipIf(!process.env.RAGFLOW_API_KEY)('lists and retrieves knowledge from an independently running RAGFlow service', async () => {
  const ctx = new Context()
  try {
    await ctx.plugin(AgentRegistry)
    await ctx.plugin(SystemPrompt)
    await ctx.plugin(Tools)
    await ctx.plugin(MemoryCredentials, { RAGFLOW_API_KEY: process.env.RAGFLOW_API_KEY! })
    const config: Connector.Config = { enabled: true, baseURL: process.env.RAGFLOW_BASE_URL ?? 'http://localhost:9380', apiKeyEnv: 'RAGFLOW_API_KEY', datasetIds: [], maxChunks: 10, maxPageSize: 50, maxResultBytes: 262144, timeoutMs: 30000 }
    const discovery = ctx.plugin(Connector, config)
    await discovery
    const list = await ctx.tools.execute({ callId: ToolCallId('list-live'), name: 'ragflow_list_datasets', arguments: { page_size: 10 }, signal: new AbortController().signal })
    expect(list.isError).toBe(false)
    const text = list.content.find(item => item.type === 'text')
    if (!text || text.type !== 'text') throw new Error('Missing RAGFlow dataset result')
    const data = JSON.parse(text.text) as { datasets: Array<{ id: string }> }
    const id = process.env.RAGFLOW_DATASET_ID ?? data.datasets[0]?.id
    if (!id) throw new Error('This real-service check requires an accessible indexed RAGFlow dataset')
    await discovery.dispose()
    config.datasetIds = [id]
    await ctx.plugin(Connector, config)
    const retrieved = await ctx.tools.execute({ callId: ToolCallId('retrieve-live'), name: 'ragflow_retrieval', arguments: { question: '质量检验要求', max_chunks: 2 }, signal: new AbortController().signal })
    expect(retrieved.isError).toBe(false)
    expect(JSON.stringify(retrieved)).not.toContain(process.env.RAGFLOW_API_KEY!)
  } finally {
    await ctx.fiber.dispose()
  }
}, 60000)
