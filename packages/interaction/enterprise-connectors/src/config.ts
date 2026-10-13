/** Deployment and live settings for the two independently authorized connections. */
import Schema from '@deepseek-ai/schemastery'

/** Shared account policy. Empty sender lists deny every remote task. */
export interface AccountPolicy {
  /** Whether the account may connect or issue tool requests. */
  enabled: boolean
  /** Host credential reference, never a literal provider secret. */
  secretRef: string
  /** Whether authorized incoming text may trigger DH tasks. */
  receiveEnabled: boolean
  /** Whether tools may request proactive sends after native approval. */
  sendEnabled: boolean
  /** Exact sender IDs admitted as remote task authors; empty denies all. */
  allowedSenders: string[]
  /** Optional chat scope for reads and ingress; proactive sends require explicit membership. */
  allowedChats: string[]
  /** Absolute remote-task workspace; empty uses a dedicated directory in the DH home. */
  workspacePath: string
  /** Native Agent preset used when creating remote conversations. */
  agentPreset: string
}
/** Feishu/Lark self-built application connection. */
export interface FeishuSettings extends AccountPolicy {
  /** Self-built Feishu or Lark application ID. */
  appId: string
  /** Feishu OpenAPI origin; mainland Feishu is the default. */
  baseURL: string
  /** Whether resource reads are available. */
  readEnabled: boolean
  /** Identity used for resource reads; user mode requires a saved OAuth grant. */
  readIdentity: 'app' | 'user'
  /** Exact Web callback URI registered in Feishu; empty uses the loopback Web port. */
  redirectURI: string
  /** User permissions requested at consent, including offline_access for refresh. */
  userScopes: string[]
}
/** Enterprise WeChat intelligent-bot connection. */
export interface WecomSettings extends AccountPolicy {
  /** Enterprise WeChat intelligent-bot ID. */
  botId: string
  /** Official or privately deployed intelligent-bot WebSocket endpoint. */
  websocketURL: string
}
const policy = {
  /** Whether the account may connect or issue tool requests. */
  enabled: Schema.boolean().default(false),
  /** Whether authorized incoming text may trigger DH tasks. */
  receiveEnabled: Schema.boolean().default(false),
  /** Whether tools may request proactive sends after native approval. */
  sendEnabled: Schema.boolean().default(false),
  /** Exact sender IDs admitted as remote task authors; empty denies all. */
  allowedSenders: Schema.array(Schema.string()).max(100).default([]),
  /** Optional chat scope for reads and ingress; proactive sends require explicit membership. */
  allowedChats: Schema.array(Schema.string()).max(100).default([]),
  /** Absolute remote-task workspace; empty uses a dedicated directory in the DH home. */
  workspacePath: Schema.string().default(''),
  /** Native Agent preset used when creating remote conversations. */
  agentPreset: Schema.string().default('standard'),
}
/** Native settings section for the Feishu account; secrets resolve separately. */
export const FeishuSettings: Schema<FeishuSettings> = Schema.object({
  ...policy, appId: Schema.string().default(''),
  /** Host credential reference, never a literal provider secret. */
  secretRef: Schema.string().default('FEISHU_APP_SECRET'),
  /** Feishu OpenAPI origin; mainland Feishu is the default. */
  baseURL: Schema.string().default('https://open.feishu.cn'),
  /** Whether resource reads are available. */
  readEnabled: Schema.boolean().default(true),
  /** Identity used for resource reads; user mode requires a saved OAuth grant. */
  readIdentity: Schema.union(['app', 'user']).default('app'),
  /** Exact Web callback URI registered in Feishu; empty uses the loopback Web port. */
  redirectURI: Schema.string().default(''),
  /** User permissions requested at consent, including offline_access for refresh. */
  userScopes: Schema.array(Schema.string().pattern(/^[a-zA-Z0-9_:.-]{1,128}$/)).min(1).max(30)
    .default(['im:chat:read', 'im:message:readonly', 'im:message.group_msg:get_as_user', 'offline_access']),
})
/** Native settings section for the WeCom account; this is the intelligent bot Secret. */
export const WecomSettings: Schema<WecomSettings> = Schema.object({
  ...policy, botId: Schema.string().default(''),
  /** Host credential reference, never a literal provider secret. */
  secretRef: Schema.string().default('WECOM_BOT_SECRET'),
  /** Official or privately deployed intelligent-bot WebSocket endpoint. */
  websocketURL: Schema.string().default('wss://openws.work.weixin.qq.com'),
})
