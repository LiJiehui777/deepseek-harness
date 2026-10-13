/** Browser-safe status and captured-message metadata for enterprise connections. */
export type EnterpriseChannel = 'feishu' | 'wecom'

/** Authentication and transport status; never contains provider credentials. */
export interface EnterpriseConnectionStatus {
  channel: EnterpriseChannel
  state: 'disabled' | 'missing-credentials' | 'connecting' | 'connected' | 'error'
  error: string
  receivedMessages: number
  lastSenderId: string
  lastChatId: string
}

/** A text message observed through this connection, rather than arbitrary platform history. */
export interface CapturedEnterpriseMessage {
  channel: EnterpriseChannel
  chat_id: string
  sender_id: string
  message_id: string
  text: string
  received_at: number
  direction: 'incoming' | 'outgoing'
}

/** Public user-consent metadata; tokens and OAuth codes remain on the Host. */
export interface FeishuAuthorizationStatus {
  identity: 'app' | 'user'
  state: 'pending' | 'authorized' | 'unauthorized'
  error: '' | 'cancelled' | 'expired' | 'failed'
  redirectURI: string
  requestedScopes: string[]
  grantedScopes: string[]
  userName: string
}
