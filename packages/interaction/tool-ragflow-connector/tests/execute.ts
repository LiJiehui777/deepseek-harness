/** Run one native call through the executor-owned batch pipeline in owner tests. */
import type { Context } from '@deepseek-ai/cordis'
import type { ToolExecutionInput } from '@deepseek-ai/dsh-tools'

export async function executeOne(ctx: Context, input: ToolExecutionInput) {
  const batch = await ctx.tools.execute({ calls: [{ type: 'tool-call', id: input.callId,
    name: input.name, arguments: JSON.stringify(input.arguments) }], signal: input.signal,
  ...input.agent === undefined ? {} : { agent: input.agent } })
  const result = batch.results[0]?.result
  if (!result) throw new Error('Expected one native result')
  return result
}
