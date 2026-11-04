/** Reuse the existing WeCom executor for one engine-owned read; no model runs here. */
import { NativeToolExecutor } from '@deepseek-ai/dsh-tool-executor-native'
import type { Context } from '@deepseek-ai/cordis'
import { brandString } from '@deepseek-ai/dsh-brand'
import type { ToolCallId } from '@deepseek-ai/dsh-llm'
import type { SessionId } from '@deepseek-ai/dsh-session'
import type {} from '@deepseek-ai/dsh-agent'
import type {} from '@deepseek-ai/dsh-tools'

const tool = 'wecom_office_list_todos'
const query = { page_size: 10, status_filter: ['proceed'] }

/**
 * Read the first page of pending todos through saved office permissions.
 * @param ctx - local workflow owner.
 * @param sessionId - engine-persisted attempt identity.
 * @param signal - current job lifetime.
 * @returns bounded connector reference data, including pagination facts.
 */
export async function readWecomTodos(ctx: Context, sessionId: string, signal: AbortSignal) {
  if (!ctx.tools.get(tool)) throw new Error('WECOM_TODOS_UNAVAILABLE')
  const handle = await ctx.agents.create({ sessionId: brandString<SessionId>(sessionId), signal,
    meta: { cwd: process.cwd() },
    setup: (scope) => {
      scope.tools.setExecutor(new NativeToolExecutor(scope))
      scope.tools.restrict({ allow: [tool] })
      scope.tools.guard(exec => exec.name === tool && JSON.stringify(exec.arguments) === JSON.stringify(query)
        ? undefined : 'This workflow action permits only its configured read of pending WeCom todos.')
    },
  })
  try {
    const batch = await handle.agent.ctx.tools.execute({ agent: handle.agent, calls: [{ type: 'tool-call', name: tool, arguments: JSON.stringify(query),
      id: brandString<ToolCallId>(`workflow-${sessionId}`) }], signal })
    const result = batch.results[0]?.result
    signal.throwIfAborted()
    if (!result || result.isError || typeof result.value !== 'string') throw new Error('WECOM_TODOS_READ_FAILED')
    const data: unknown = JSON.parse(result.value)
    await ctx.sessions.flush(handle.agent.session)
    return { result: data, query }
  } finally { await handle.dispose() }
}
