/** Official SDK adapters; provider credentials and unredacted exceptions stay on the Host. */
import * as Lark from '@larksuiteoapi/node-sdk'
import { WSClient, type TextMessage, type WsFrame } from '@wecom/aibot-node-sdk'
import axios from 'axios'
import { z } from 'zod'
import type { Config } from './index.ts'
import type { FeishuSettings, WecomSettings } from './config.ts'
import type { CapturedEnterpriseMessage } from './types.ts'
import { cancellable, endpoint, identifier, pageSize, text } from './limits.ts'

/** Normalized ingress with a provider-owned reply operation. */
export interface IncomingMessage {
  message: CapturedEnterpriseMessage
  trigger: boolean
  reply: (content: string, finish: boolean) => Promise<void>
}
/** One SDK lifetime and its authenticated outbound operation. */
export interface ProviderConnection {
  close: () => void
  send: (chatId: string, content: string) => Promise<void>
}
/** SDK event handlers; the caller owns tracking asynchronous ingress. */
export interface ProviderCallbacks {
  message: (value: IncomingMessage) => void
  state: (value: 'connecting' | 'connected' | 'error') => void
}
// SDK debug messages may include request bodies or authentication fields.
const wecomText = z.object({ aibotid: z.string().min(1).max(256), msgid: z.string().min(1).max(256),
  chattype: z.enum(['single', 'group']), chatid: z.string().min(1).max(256).optional(),
  from: z.object({ userid: z.string().min(1).max(256) }), text: z.object({ content: z.string() }) })
const logger = { debug() {}, info() {}, warn() {}, error() {}, trace() {} }

function sdkHttp(bounds: Config, signal: AbortSignal) {
  const http = axios.create({
    timeout: bounds.timeoutMs, maxContentLength: bounds.maxResultBytes,
    maxBodyLength: bounds.maxResultBytes, maxRedirects: 0, signal,
  })
  http.interceptors.response.use(response => response.data as typeof response)
  // The SDK consumes data-only responses while Axios retains its envelope declaration.
  return http as unknown as NonNullable<ConstructorParameters<typeof Lark.Client>[0]['httpInstance']>
}
/**
 * Build an account-local SDK with bounded, cancellable HTTP and no redirects.
 * @param account - saved application settings.
 * @param secret - resolved Host-only application secret.
 * @param bounds - deployment limits.
 * @param signal - operation or connection lifetime.
 * @returns the official Feishu API client.
 */
export function feishuClient(account: FeishuSettings, secret: string, bounds: Config, signal: AbortSignal): Lark.Client {
  return new Lark.Client({
    appId: account.appId, appSecret: secret, domain: endpoint(account.baseURL, false),
    appType: Lark.AppType.SelfBuild, // Axios retains its envelope type after the data-only response interceptor.
    httpInstance: sdkHttp(bounds, signal), logger,
  })
}
function checked<T extends { code?: number | undefined }>(value: T): T {
  if (value.code !== 0) throw new Error('Feishu rejected the operation. Check application permissions and resource visibility.')
  return value
}
function allowedChat(account: FeishuSettings, value: unknown): string {
  const id = identifier(value)
  if (account.allowedChats.length && !account.allowedChats.includes(id)) throw new Error('Chat is outside the configured scope.')
  return id
}
function documentId(value: unknown): { id: string; wiki: boolean } {
  if (typeof value === 'string' && value.startsWith('https://')) {
    const url = new URL(value)
    const match = /^\/(docx|wiki)\/([a-zA-Z0-9_-]+)\/?$/.exec(url.pathname)
    if (!/(^|\.)(feishu\.cn|larksuite\.com)$/.test(url.hostname) || !match) throw new Error('Use a Feishu Docx or Wiki link.')
    return { id: match[2] ?? '', wiki: match[1] === 'wiki' }
  }
  return { id: identifier(value), wiki: false }
}
/**
 * Read one authorized Feishu page or document through the official SDK.
 * @param client - an operation-local authenticated SDK.
 * @param account - current saved read policy.
 * @param bounds - result and page limits.
 * @param operation - registered native tool operation.
 * @param args - untrusted tool JSON arguments.
 * @param userToken - optional Host-only user grant; omitted requests use application identity.
 * @returns projected metadata and text, without tokens or SDK transport objects.
 */
export async function readFeishu(
  client: Lark.Client, account: FeishuSettings, bounds: Config, operation: string, args: Record<string, unknown>, userToken?: string,
): Promise<unknown> {
  const options = userToken === undefined ? undefined : Lark.withUserAccessToken(userToken)
  const page = { page_size: pageSize(args.page_size, bounds.maxPageSize),
    ...(args.cursor === undefined ? {} : { page_token: text(args.cursor, 4096) }) }
  if (operation === 'chats') {
    const response = checked(await client.im.v1.chat.list({ params: page }, options))
    return { channel: 'feishu', items: (response.data?.items ?? [])
      .filter(row => !account.allowedChats.length || account.allowedChats.includes(row.chat_id ?? ''))
      .map(row => ({ chat_id: row.chat_id, name: row.name })),
    has_more: response.data?.has_more ?? false, next_cursor: response.data?.page_token ?? '' }
  }
  if (operation === 'messages') {
    const response = checked(await client.im.v1.message.list({ params: {
      ...page, container_id_type: 'chat', container_id: allowedChat(account, args.chat_id), sort_type: 'ByCreateTimeDesc',
    } }, options))
    return { channel: 'feishu', chat_id: args.chat_id,
      items: (response.data?.items ?? []).map(row => ({ message_id: row.message_id,
        sender_id: row.sender?.id, message_type: row.msg_type, create_time: row.create_time,
        content: row.msg_type === 'text' ? row.body?.content : undefined })),
      has_more: response.data?.has_more ?? false, next_cursor: response.data?.page_token ?? '' }
  }
  if (operation === 'document') {
    const resource = documentId(args.resource)
    let id = resource.id
    if (resource.wiki) {
      const node = checked(await client.wiki.v2.space.getNode({ params: { token: id } }, options)).data?.node
      if (node?.obj_type !== 'docx' || !node.obj_token) throw new Error('The Wiki node must contain a Docx document.')
      id = node.obj_token
    }
    const response = checked(await client.docx.v1.document.rawContent({ path: { document_id: id } }, options))
    return { channel: 'feishu', document_id: id, content: response.data?.content ?? '' }
  }
  throw new Error('Unsupported Feishu operation.')
}
/**
 * Connect the official Feishu event client, or verify an API-only account.
 * @param account - saved application settings and remote-task switch.
 * @param secret - Host-owned secret.
 * @param bounds - HTTP and handshake bounds.
 * @param signal - lifetime cancellation.
 * @param callbacks - status and normalized message consumers.
 * @returns an authenticated provider lifetime.
 */
export async function connectFeishu(
  account: FeishuSettings, secret: string, bounds: Config, signal: AbortSignal, callbacks: ProviderCallbacks,
): Promise<ProviderConnection> {
  const client = feishuClient(account, secret, bounds, signal)
  const send = async (chatId: string, content: string) => {
    signal.throwIfAborted()
    checked(await client.im.v1.message.create({ params: { receive_id_type: 'chat_id' },
      data: { receive_id: chatId, msg_type: 'text', content: JSON.stringify({ text: content }) } }))
  }
  const info: { code?: number | undefined; bot?: { open_id?: string } } = await client.request({
    method: 'GET', url: `${endpoint(account.baseURL, false)}/open-apis/bot/v3/info/`,
  })
  checked(info)
  if (!account.receiveEnabled) {
    callbacks.state('connected')
    return { close() {}, send }
  }
  const botId = info.bot?.open_id
  if (!botId) throw new Error('Feishu did not return the configured bot identity.')
  let markReady!: () => void
  let markFailed!: () => void
  const ready = new Promise<void>((resolve, reject) => {
    markReady = resolve
    markFailed = () => { reject(new Error('Feishu authentication failed.')) }
  })
  const ws = new Lark.WSClient({ appId: account.appId, appSecret: secret, domain: endpoint(account.baseURL, false),
    logger, httpInstance: sdkHttp(bounds, signal), handshakeTimeoutMs: bounds.timeoutMs,
    onReady: () => { if (!signal.aborted) { callbacks.state('connected'); markReady() } },
    onReconnected: () => { if (!signal.aborted) callbacks.state('connected') },
    onReconnecting: () => { if (!signal.aborted) callbacks.state('connecting') },
    onError: () => { if (!signal.aborted) { callbacks.state('error'); markFailed() } },
  })
  const close = () => { ws.close({ force: true }) }
  signal.addEventListener('abort', close, { once: true })
  try {
    await cancellable(Promise.all([ready, ws.start({ eventDispatcher: new Lark.EventDispatcher({ logger }).register({
      'im.message.receive_v1': (data) => {
        if (signal.aborted || data.sender.sender_type !== 'user' || data.message.message_type !== 'text') return
        let content: unknown
        try { content = JSON.parse(data.message.content) }
        catch { return } // Non-JSON text envelopes are not admitted as tasks.
        if (!content || typeof content !== 'object' || !('text' in content) || typeof content.text !== 'string') return
        callbacks.message({ message: { channel: 'feishu', chat_id: data.message.chat_id,
          sender_id: data.sender.sender_id?.open_id ?? '', message_id: data.message.message_id,
          text: content.text.replace(/@_user_\d+/g, '').trim(), received_at: Date.now(), direction: 'incoming' },
        trigger: data.message.chat_type === 'p2p' || !!data.message.mentions?.some(mention => mention.id.open_id === botId),
        reply: reply => send(data.message.chat_id, reply) })
      },
    }) })]), AbortSignal.any([signal, AbortSignal.timeout(bounds.timeoutMs)]))
    return { close: () => { signal.removeEventListener('abort', close); close() }, send }
  } catch {
    signal.removeEventListener('abort', close)
    close()
    throw new Error('Feishu connection failed. Check App ID, Secret and long-connection subscriptions.')
  }
}
/**
 * Authenticate the official WeCom WebSocket SDK and normalize text events.
 * @param account - saved intelligent-bot settings.
 * @param secret - Host-owned bot Secret.
 * @param bounds - heartbeat, retry, payload and deadline bounds.
 * @param signal - connection lifetime.
 * @param callbacks - status and normalized message consumers.
 * @returns the authenticated provider lifetime.
 */
export async function connectWecom(
  account: WecomSettings, secret: string, bounds: Config, signal: AbortSignal, callbacks: ProviderCallbacks,
): Promise<ProviderConnection> {
  const client = new WSClient({ botId: account.botId, secret, wsUrl: endpoint(account.websocketURL, true), logger,
    requestTimeout: bounds.timeoutMs, heartbeatInterval: bounds.heartbeatMs,
    reconnectInterval: bounds.reconnectMs, maxReconnectAttempts: bounds.maxReconnectAttempts,
    maxAuthFailureAttempts: 0, maxReplyQueueSize: bounds.maxPendingTasks,
    wsOptions: { maxPayload: bounds.maxResultBytes, handshakeTimeout: bounds.timeoutMs },
  })
  const close = () => { client.disconnect() }
  signal.addEventListener('abort', close, { once: true })
  const ready = new Promise<void>((resolve, reject) => {
    client.on('authenticated', () => { if (!signal.aborted) { callbacks.state('connected'); resolve() } })
    client.on('reconnecting', () => { if (!signal.aborted) callbacks.state('connecting') })
    client.on('disconnected', () => { if (!signal.aborted) callbacks.state('error') })
    client.on('error', () => { callbacks.state('error'); reject(new Error('WeCom connection failed.')) })
  })
  client.on('message.text', (frame: WsFrame<TextMessage>) => {
    const parsed = wecomText.safeParse(frame.body)
    if (signal.aborted || !parsed.success || parsed.data.aibotid !== account.botId) return
    const message = parsed.data
    if (message.chattype === 'group' && !message.chatid) return
    const streamId = `dhe-${message.msgid}`
    callbacks.message({ message: { channel: 'wecom', chat_id: message.chatid ?? message.from.userid,
      sender_id: message.from.userid, message_id: message.msgid, text: message.text.content,
      received_at: Date.now(), direction: 'incoming' }, trigger: true,
    reply: async (content, finish) => { await client.replyStream(frame, streamId, content, finish) } })
  })
  client.connect()
  try { await cancellable(ready, AbortSignal.any([signal, AbortSignal.timeout(bounds.timeoutMs)])) }
  catch {
    signal.removeEventListener('abort', close)
    close()
    throw new Error('WeCom connection failed. Check Bot ID, Secret and long-connection mode.')
  }
  return {
    close: () => { signal.removeEventListener('abort', close); close(); client.removeAllListeners() },
    send: async (chatId, content) => {
      signal.throwIfAborted()
      const response = await client.sendMessage(chatId, { msgtype: 'markdown', markdown: { content } })
      if (response.errcode !== 0) throw new Error('WeCom rejected the message.')
    },
  }
}
