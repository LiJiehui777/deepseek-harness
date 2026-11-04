/** Bound-conversation policy, stable model instruction, and lifecycle removal. */
import { Context } from '@deepseek-ai/cordis'
import { brandString } from '@deepseek-ai/dsh-brand'
import type { Agent } from '@deepseek-ai/dsh-agent'
import type { ToolCallId } from '@deepseek-ai/dsh-llm'
import type { SessionId } from '@deepseek-ai/dsh-session'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import Tools from '@deepseek-ai/dsh-tools'
import { join } from 'node:path'
import { expect, it } from 'vitest'
import { installSelectionPolicy, selectionInstruction, ordinaryInstruction } from '../src/host/selection.ts'
import { registerWorkflowTools } from '../src/host/tools.ts'

it('narrows model tools, denies a hidden body at dispatch, and removes the policy on unload', async () => {
  const ctx = new Context()
  // Only the registry identity is needed for this policy unit; the Loader case uses real Agent sessions.
  const agent = { id: brandString<SessionId>('bound-session'), ctx } as Agent
  ctx.provide('agents', { list: () => [agent] } as never)
  let calls = 0
  let bound = true
  try {
    await ctx.plugin(SystemPrompt)
    await ctx.plugin(Tools)
    const unavailable = () => Promise.reject(new Error('No workflow operation expected'))
    registerWorkflowTools(ctx, { templates: unavailable, selection: () => null,
      start: unavailable, detail: unavailable, cancel: unavailable })
    ctx.tools.register({ name: 'outside_probe', description: 'Test-only unrelated capability', parameters: { type: 'object', properties: {} },
      output: { schema: { type: 'string' }, render: (_args, value) => [{ type: 'text', text: value as string }] },
      execute: () => { calls++; return Promise.resolve('executed') },
    })
    const fiber = ctx.plugin({ name: 'workflow-binding-policy-test', inject: ['tools', 'systemPrompt', 'agents'], apply(scope: Context) {
      installSelectionPolicy(scope, owner => bound && owner === agent.id ? { id: 'published', version: 1, name: 'Review' } : null)
    } })
    await fiber.await()
    const assembly = await ctx.systemPrompt.assemble({ scope: agent })
    expect(assembly.tools.map(tool => tool.name).sort()).toEqual([
      'business_workflow_cancel', 'business_workflow_list', 'business_workflow_start', 'business_workflow_status',
    ])
    expect(assembly.contexts.some(row => row.text.includes(selectionInstruction))).toBe(true)
    await expect(selectionInstruction).toMatchFileSnapshot(join(import.meta.dirname, 'expected/workflow-selection-prompt.expected.md'))
    const request = { agent, name: 'outside_probe', arguments: {}, callId: brandString<ToolCallId>('blocked'), signal: new AbortController().signal }
    expect((await ctx.tools.execute(request)).isError).toBe(true)
    expect(calls).toBe(0)
    bound = false
    const ordinary = await ctx.systemPrompt.assemble({ scope: agent })
    expect(ordinary.tools.some(tool => tool.name === 'business_workflow_start')).toBe(false)
    expect(ordinary.tools.some(tool => tool.name === 'outside_probe')).toBe(true)
    expect(ordinary.contexts.some(row => row.text === ordinaryInstruction)).toBe(true)
    await expect(ordinaryInstruction).toMatchFileSnapshot(join(import.meta.dirname, 'expected/workflow-ordinary-prompt.expected.md'))
    const denied = await ctx.tools.execute({ ...request, name: 'business_workflow_start',
      arguments: { workflowId: 'published', version: 1, inputs: {} } })
    expect(denied.isError).toBe(true)
    expect(JSON.stringify(denied)).toContain('WORKFLOW_SELECTION_REQUIRED')
    await fiber.dispose()
    expect((await ctx.systemPrompt.assemble({ scope: agent })).tools.some(tool => tool.name === 'outside_probe')).toBe(true)
    expect((await ctx.tools.execute({ ...request, callId: brandString<ToolCallId>('restored') })).isError).toBe(false)
    expect(calls).toBe(1)
  } finally { await ctx.fiber.dispose() }
})
