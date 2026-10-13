/** Remote task admission through the existing DH Session controller. */
import { createHash } from 'node:crypto'
import { mkdir } from 'node:fs/promises'
import { homedir } from 'node:os'
import { isAbsolute, join } from 'node:path'
import type { Config } from './index.ts'
import type { Context } from '@deepseek-ai/cordis'
import { brandString } from '@deepseek-ai/dsh-brand'
import type { SessionId } from '@deepseek-ai/dsh-session'
import type { SessionRequestId } from '@deepseek-ai/dsh-api-session-controller/types'
import type {} from '@deepseek-ai/dsh-api-session-controller'
import type {} from '@deepseek-ai/dsh-agent'
import type {} from '@deepseek-ai/dsh-workspace'
import type { AccountPolicy } from './config.ts'
import type { IncomingMessage } from './providers.ts'
import { cancellable, shorten } from './limits.ts'

/**
 * Run one serialized chat/sender interval without bypassing model or permission settings.
 * Replies contain the latest assistant text observed after this receipt until whole-Agent idle;
 * local follow-ups admitted during that interval may contribute to the reply.
 * @param ctx - Host services and durable Session event feed.
 * @param accountId - configured provider account identity, isolating bindings.
 * @param account - current sender policy and workspace settings.
 * @param incoming - authenticated, authorized provider message.
 * @param bounds - task deadline and reply size.
 * @param lifetime - connection generation; cancellation detaches the reply, not a local user's Agent.
 */
export async function runRemoteTask(
  ctx: Context, accountId: string, account: AccountPolicy, incoming: IncomingMessage, bounds: Config, lifetime: AbortSignal,
): Promise<void> {
  const controller = ctx.get('sessionController')
  const agents = ctx.get('agents')
  const workspaces = ctx.get('workspaceRegistry')
  if (!controller || !agents || !workspaces) throw new Error('Remote tasks require the DH Web Session services.')
  const signal = AbortSignal.any([lifetime, AbortSignal.timeout(bounds.taskTimeoutMs)])
  signal.throwIfAborted()
  const message = incoming.message
  const digest = createHash('sha256').update(JSON.stringify([message.channel, accountId, message.chat_id, message.sender_id])).digest('hex')
  const sessionId = brandString<SessionId>(`enterprise-${digest}`)
  const requestId = brandString<SessionRequestId>(`enterprise-${createHash('sha256').update(message.message_id).digest('hex')}`)
  const cwd = account.workspacePath || join(process.env.DSH_HOME ?? join(homedir(), '.dsh'), 'remote-workspaces', message.channel, digest)
  if (!isAbsolute(cwd)) throw new Error('Remote task workspace must be an absolute path.')
  await mkdir(cwd, { recursive: true, mode: 0o700 })
  signal.throwIfAborted()
  const workspace = await workspaces.create(cwd)
  await controller.create({ sessionId, workspaceId: workspace.id, agentPreset: account.agentPreset })
  signal.throwIfAborted()
  const agent = agents.get(sessionId)
  if (!agent) throw new Error('Remote task Session was not activated.')
  const receipt = { accepted: false, reply: '', endedWithError: false }
  const observed = () => ({ ...receipt })
  const off = ctx.on('session/event', (session, event) => {
    if (session.id !== sessionId || signal.aborted) return
    if (event.type === 'user/message' && event.data.source.kind === 'user'
      && 'rpcId' in event.data.source && event.data.source.rpcId === requestId) receipt.accepted = true
    if (!observed().accepted) return
    if (event.type === 'assistant/message') {
      const content = event.data.message.content.filter(part => part.type === 'text').map(part => part.text).join('')
      if (content.trim()) receipt.reply = content
    }
    if (event.type === 'turn/end') receipt.endedWithError = event.data.reason.kind !== 'completed'
  })
  try {
    await controller.prompt({ sessionId, requestId, mode: 'queue', content: [{ type: 'text',
      text: `[${message.channel} · ${message.chat_id} · ${message.sender_id}]\n${message.text}` }] }, signal)
    await cancellable(incoming.reply('DH 已收到，正在处理。需要确认的操作请在 DH 页面批准。', false), signal)
    await cancellable(agent.whenIdle(), signal)
    signal.throwIfAborted()
    // Receipt commits while the Agent drains its inbox, after prompt admission can return.
    if (!observed().accepted) {
      await cancellable(incoming.reply('这条消息已接收，请在 DH 查看原任务记录。', true), signal)
      return
    }
    const { reply, endedWithError } = observed()
    if (endedWithError) throw new Error('Remote task did not complete.')
    await cancellable(incoming.reply(shorten(reply || '任务已结束，请在 DH 查看执行记录。', bounds.maxTextBytes), true), signal)
  } catch {
    if (!lifetime.aborted) {
      await cancellable(incoming.reply('任务未能完成。请在 DH 查看模型配置、确认请求和执行记录。', true),
        AbortSignal.any([lifetime, AbortSignal.timeout(bounds.timeoutMs)]))
    }
    throw new Error('DH remote task failed or timed out.')
  } finally { off() }
}
