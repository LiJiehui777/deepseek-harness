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
