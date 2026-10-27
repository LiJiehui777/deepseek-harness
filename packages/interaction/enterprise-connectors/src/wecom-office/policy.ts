/** Local-conversation admission, including persisted fork and subagent ancestry. */
import type { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import type {} from '@deepseek-ai/dsh-session-query'
import { OfficeError } from './runtime.ts'

/**
 * Reject enterprise remote sessions and their descendants before account access.
 * @param ctx - live sessions and optional persisted ancestry reader.
 * @param agent - trusted tool execution owner, never a model argument.
 * @param signal - cancellation while observing persisted ancestry.
 * @throws OfficeError when ownership is absent, remote, cyclic, or unresolvable.
 */
export async function requireLocalOfficeConversation(ctx: Context, agent: Agent | undefined, signal: AbortSignal): Promise<void> {
  if (!agent) throw new OfficeError('permission-denied')
  let header = agent.session.header
  const seen = new Set<string>()
  while (true) {
    signal.throwIfAborted()
    // runRemoteTask owns this durable reserved prefix; descendants retain parentSession.
    if (header.id.startsWith('enterprise-') || seen.has(header.id)) throw new OfficeError('permission-denied')
    seen.add(header.id)
    const parent = header.parentSession
    if (!parent) {
      if (header.origin === 'subagent') throw new OfficeError('permission-denied')
      return
    }
    const live = ctx.get('sessions')?.get(parent)
    if (live) { header = live.header; continue }
    const query = ctx.get('sessionQuery')
    if (!query) throw new OfficeError('permission-denied')
    try {
      using observation = await query.observeSession(parent, { signal })
      header = observation.header
    } catch { throw new OfficeError('permission-denied') }
  }
}
