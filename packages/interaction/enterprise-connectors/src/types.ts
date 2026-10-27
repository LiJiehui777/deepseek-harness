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

/** Independently enabled office categories. */
export type WecomOfficeCapability = 'documents' | 'files' | 'calendar' | 'todos' | 'contacts' | 'meetings' | 'mail' | 'messages'
/** Sanitized failure categories shared by the Host and native settings card. */
export type WecomOfficeError = 'runtime-unavailable' | 'version-mismatch' | 'not-authorized'
  | 'permission-denied' | 'unavailable' | 'invalid-result' | 'too-large' | 'timeout' | 'cancelled' | 'connection-failed'
/** Discovery proves an interface exists; only a successful business read verifies access. */
export interface WecomOfficeCapabilityStatus {
  id: WecomOfficeCapability
  state: 'unknown' | 'discoverable' | 'verified' | 'unavailable' | 'permission-denied' | 'error'
}
/** Browser-only account metadata; no token or bot secret crosses this interface. */
export interface WecomOfficeStatus {
  state: 'disabled' | 'unauthorized' | 'pending' | 'authorized' | 'checking'
  error: WecomOfficeError | ''
  authorizerName: string
  corporationName: string
  qrImage: string
  expiresAt: number
  pollIntervalMs: number
  capabilities: WecomOfficeCapabilityStatus[]
}
