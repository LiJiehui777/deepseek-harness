/** Trusted local-conversation admission shared by workflow tools and the authenticated selector. */
import type { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import type {} from '@deepseek-ai/dsh-session-query'

/** Reject missing, remote, cyclic, or unresolvable ownership, including persisted ancestry.
 * @param ctx - local sessions and optional persisted ancestry reader.
 * @param agent - trusted live owner; model arguments never supply this value.
 * @param signal - operation lifetime.
 * @returns exact initiating Session identity.
 */
export async function requireLocalConversation(ctx: Context, agent: Agent | undefined, signal: AbortSignal): Promise<string> {
  if (!agent) throw new Error('WORKFLOW_LOCAL_CONVERSATION_REQUIRED')
  let header = agent.session.header
  const owner = header.id, seen = new Set<string>()
  while (true) {
    signal.throwIfAborted()
    if (header.id.startsWith('enterprise-') || seen.has(header.id)) throw new Error('WORKFLOW_LOCAL_CONVERSATION_REQUIRED')
    seen.add(header.id)
    const parent = header.parentSession
    if (!parent) {
      if (header.origin === 'subagent') throw new Error('WORKFLOW_LOCAL_CONVERSATION_REQUIRED')
      return owner
    }
    const live = ctx.sessions.get(parent)
    if (live) { header = live.header; continue }
    const query = ctx.get('sessionQuery')
    if (!query) throw new Error('WORKFLOW_LOCAL_CONVERSATION_REQUIRED')
    try {
      using observation = await query.observeSession(parent, { signal })
      header = observation.header
    } catch { throw new Error('WORKFLOW_LOCAL_CONVERSATION_REQUIRED') }
  }
}
