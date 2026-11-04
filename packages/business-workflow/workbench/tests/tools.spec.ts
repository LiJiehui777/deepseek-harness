import * as NativeExecutor from '@deepseek-ai/dsh-tool-executor-native'
import { executeOne } from './execute.ts'
/** Fixed tool schemas, executor validation, and registration ownership. */
import { Context } from '@deepseek-ai/cordis'
import { brandString } from '@deepseek-ai/dsh-brand'
import type { ToolCallId } from '@deepseek-ai/dsh-llm'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import Tools from '@deepseek-ai/dsh-tools'
import { expect, it, vi } from 'vitest'
import { join } from 'node:path'
import { registerWorkflowTools } from '../src/host/tools.ts'
import type { Agent } from '@deepseek-ai/dsh-agent'
import type { SessionId } from '@deepseek-ai/dsh-session'
import type { ProcessDetail, ProcessId, WorkflowChoice } from '../src/shared/runtime.ts'

it('pins model-visible schemas, rejects missing identity and unknown fields, and unregisters on unload', async () => {
  const ctx = new Context()
  const invoked = vi.fn(() => Promise.reject(new Error('operation must not be reached')))
  try {
    await ctx.plugin(SystemPrompt)
    await ctx.plugin(Tools)
    await ctx.plugin(NativeExecutor)
    const fiber = ctx.plugin({ name: 'workflow-tools-test', inject: ['tools'], apply(scope: Context) {
      registerWorkflowTools(scope, { templates: invoked, selection: () => null, start: invoked, detail: invoked, cancel: invoked })
    } })
    await fiber.await()
    await expect(JSON.stringify(ctx.tools.schemas(), null, 2)).toMatchFileSnapshot(join(import.meta.dirname, 'expected/workflow-tools.expected.json'))
    for (const [name, args] of [
      ['business_workflow_list', {}],
      ['business_workflow_start', { workflowId: 'x', version: 1, inputs: {} }],
      ['business_workflow_start', { workflowId: 'x', version: 1, inputs: {}, sessionId: 'forged' }],
      ['business_workflow_status', { runId: 'foreign' }],
      ['business_workflow_cancel', { runId: 'foreign' }],
    ] as const) {
      const result = await executeOne(ctx, { name, arguments: args,
        callId: brandString<ToolCallId>(name), signal: new AbortController().signal })
      expect(result.isError).toBe(true)
    }
    expect(invoked).not.toHaveBeenCalled()
    await fiber.dispose()
    expect(ctx.tools.schemas()).toEqual([])
  } finally { await ctx.fiber.dispose() }
})

it('requires the manually selected version at the executor even without the prompt policy', async () => {
  const ctx = new Context()
  const owner = brandString<SessionId>('ordinary')
  const agent = { id: owner, ctx, session: { header: { id: owner } } } as Agent
  let selection: WorkflowChoice | null = null
  const run: ProcessDetail = { id: brandString<ProcessId>('accepted'), name: 'Review', status: 'running', ownerSessionId: owner,
    startedAt: '', endedAt: '', draftJson: '', inputJson: '{}', workflowId: 'published', workflowVersion: 1,
    completed: [], results: [], items: [] }
  const start = vi.fn(() => Promise.resolve(run))
  try {
    await ctx.plugin(SystemPrompt)
    await ctx.plugin(Tools)
    await ctx.plugin(NativeExecutor)
    registerWorkflowTools(ctx, { templates: () => Promise.resolve([]), selection: () => selection, start,
      detail: () => Promise.resolve(run), cancel: () => Promise.resolve(run) })
    const request = { agent, name: 'business_workflow_start', arguments: { workflowId: 'published', version: 1, inputs: {} },
      callId: brandString<ToolCallId>('start'), signal: new AbortController().signal }
    const unbound = await executeOne(ctx, request)
    expect(unbound.isError).toBe(true)
    expect(JSON.stringify(unbound)).toContain('WORKFLOW_SELECTION_REQUIRED')
    selection = { id: 'published', version: 2, name: 'Review' }
    const stale = await executeOne(ctx, request)
    expect(stale.isError).toBe(true)
    expect(JSON.stringify(stale)).toContain('WORKFLOW_SELECTION_MISMATCH')
    expect(start).not.toHaveBeenCalled()
    selection = { ...selection, version: 1 }
    const accepted = await executeOne(ctx, request)
    expect(accepted.isError).toBe(false)
    expect(accepted.concludesTurn).toBe(true)
    expect(start).toHaveBeenCalledTimes(1)
  } finally { await ctx.fiber.dispose() }
})
