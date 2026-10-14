/** Staged enterprise account settings; credentials use the native write-only provider. */
import type { Context } from '@deepseek-ai/cordis'
import type { EnterpriseChannel, EnterpriseConnectionStatus, FeishuAuthorizationStatus } from '@deepseek-ai/dsh-api-remotes/client'
import type { SnapshotStore } from '@deepseek-ai/dsh-client-store'
import type { SettingsScope } from '@deepseek-ai/dsh-client-ui-settings/client'
import { CardForm, textField, type CardActions, type CardFieldState, type CardShell } from './card-form.ts'

/** Public settings only; provider secrets never enter this object. */
export interface EnterpriseSettings {
  enabled?: boolean
  secretRef?: string
  appId?: string
  botId?: string
  baseURL?: string
  websocketURL?: string
  receiveEnabled?: boolean
  sendEnabled?: boolean
  readIdentity?: 'app' | 'user'
  redirectURI?: string
  userScopes?: string[]
  readEnabled?: boolean
  allowedSenders?: string[]
  allowedChats?: string[]
  workspacePath?: string
  agentPreset?: string
}
/** One card's staged fields and redacted connection status. */
export interface EnterpriseCardState extends CardShell {
  channel: EnterpriseChannel
  fields: Record<string, CardFieldState>
  secret: CardFieldState
  secretConfigured: boolean
  secretWritable: boolean
  status?: EnterpriseConnectionStatus
  authorization?: FeishuAuthorizationStatus
  authorizationFailed: boolean
  authorizationURL: string
  checking: boolean
}
/** Actions injected into either account's card. */
export interface EnterpriseCardFace extends CardActions {
  authorize: () => void
  revoke: () => void
  reconnect: () => void
  refresh: () => void
  allowLatest: (kind: 'sender' | 'chat') => void
  hooks: { enterpriseCard: SnapshotStore<EnterpriseCardState> }
}
/** Account-local form controller shared by the two provider cards. */
export class EnterpriseCardController {
  private readonly form: CardForm<EnterpriseSettings>
  private readonly store: SnapshotStore<EnterpriseCardState>
  private readonly fields: string[]
  private readonly unsubscribe: () => void
  private configured = false
  private writable = true
  private status: EnterpriseConnectionStatus | undefined
  private authorization: FeishuAuthorizationStatus | undefined
  private authorizationFailed = false
  private authorizationURL = ''
  private popup: Window | null = null
  private poll: ReturnType<typeof setTimeout> | undefined
  private checking = false
  private generation = 0
  private disposed = false

  /**
   * @param scope - native settings namespace for one account.
   * @param ctx - browser services exposing credential metadata and saved-account operations.
   * @param channel - the provider this card configures.
   */
  constructor(private readonly scope: SettingsScope<EnterpriseSettings>, private readonly ctx: Context,
    private readonly channel: EnterpriseChannel) {
    const id = channel === 'feishu' ? 'appId' : 'botId'
    const url = channel === 'feishu' ? 'baseURL' : 'websocketURL'
    const booleans = ['enabled', 'receiveEnabled', 'sendEnabled', ...(channel === 'feishu' ? ['readEnabled'] : [])]
    this.fields = [id, url, ...(channel === 'feishu' ? ['readIdentity', 'redirectURI', 'userScopes'] : []), 'workspacePath', 'agentPreset', 'allowedSenders', 'allowedChats', ...booleans]
    this.form = new CardForm(scope, [textField(id), ...(channel === 'feishu' ? [textField('redirectURI'),
      { field: 'readIdentity', format: (value: unknown) => value === 'user' ? 'user' : 'app',
        parse: (value: string) => value === 'app' || value === 'user' ? { kind: 'set' as const, value } : undefined },
      { field: 'userScopes', format: (value: unknown) => Array.isArray(value) ? value.join(', ') : '',
        parse: (value: string) => { const scopes = [...new Set(value.split(/[,\s]+/).filter(Boolean))]
          return scopes.length > 0 && scopes.length <= 30 && scopes.every(item => /^[a-zA-Z0-9_:.-]{1,128}$/.test(item))
            ? { kind: 'set' as const, value: scopes } : undefined } },
    ] : []), textField('workspacePath'), textField('agentPreset'),
    { ...textField(url), parse: (value) => {
      try {
        const parsed = new URL(value)
        const protocols = channel === 'feishu' ? ['https:', 'http:'] : ['wss:', 'ws:']
        return protocols.includes(parsed.protocol) && !parsed.username && !parsed.password && !parsed.search && !parsed.hash
          ? { kind: 'set', value } : undefined
      } catch { return undefined }
    } },
    ...['allowedSenders', 'allowedChats'].map(field => ({ field,
      format: (value: unknown) => Array.isArray(value) ? value.join(', ') : '',
      equals: (stored: unknown, staged: unknown) => JSON.stringify(stored) === JSON.stringify(staged),
      parse: (value: string) => {
        const ids = [...new Set(value.split(/[,，\s]+/).filter(Boolean))]
        return ids.length <= 100 && ids.every(item => /^[a-zA-Z0-9_@.:-]{1,256}$/.test(item))
          ? { kind: 'set' as const, value: ids } : undefined
      },
    })),
    ...booleans.map(field => ({ field, format: (value: unknown) => String(value === true),
      parse: (value: string) => ({ kind: 'set' as const, value: value === 'true' }) })),
    ], [{ field: 'secret', write: async (value) => {
      const response = await ctx.remote.credentials.set(this.reference(), value)
      if (!response.ok) return false
      await this.refresh()
      return this.configured
    } }])
    this.store = this.form.bind(() => this.projection())
    this.unsubscribe = scope.subscribe(() => { void this.refresh() })
    void this.refresh()
  }
  private isDisposed(): boolean { return this.disposed }
  private reference(): string {
    return this.scope.getSnapshot().value?.secretRef || (this.channel === 'feishu' ? 'FEISHU_APP_SECRET' : 'WECOM_BOT_SECRET')
  }
  private projection(): EnterpriseCardState {
    return { ...this.form.shell(), channel: this.channel,
      fields: Object.fromEntries(this.fields.map(field => [field, this.form.field(field)])), secret: this.form.field('secret'),
      secretConfigured: this.configured, secretWritable: this.writable, checking: this.checking,
      authorizationURL: this.authorizationURL, authorizationFailed: this.authorizationFailed,
      ...(this.authorization === undefined ? {} : { authorization: this.authorization }),
      ...(this.status === undefined ? {} : { status: this.status }) }
  }
  /**
   * Re-read credential presence and status after commits, credential updates or reconnect.
   * @returns when the current-generation read settles; stale replies are ignored.
   */
  async refresh(): Promise<void> {
    if (this.isDisposed() || !this.form.shell().available) return
    const generation = ++this.generation
    const ref = this.reference()
    try {
      const [credentials, statuses, authorization] = await Promise.all([
        this.ctx.remote.credentials.describe([ref]), this.ctx.remote.enterpriseConnections.status(),
        this.channel === 'feishu' ? this.ctx.remote.enterpriseConnections.feishuAuthorization() : Promise.resolve(undefined),
      ])
      if (this.isDisposed() || generation !== this.generation) return
      if (credentials.ok) {
        this.configured = credentials.value[ref]?.configured ?? false
        this.writable = credentials.value[ref]?.writable ?? true
      }
      if (authorization?.ok) {
        const wasPending = this.authorization?.state === 'pending'
        this.authorization = authorization.value
        if (wasPending && authorization.value.state !== 'pending') {
          this.authorizationURL = ''; this.popup?.close(); this.popup = null
        }
        if (authorization.value.state === 'pending' && this.poll === undefined) this.poll = setTimeout(() => {
          this.poll = undefined; void this.refresh()
        }, 2000)
      }
      if (statuses.ok) this.status = statuses.value.find(row => row.channel === this.channel)
      this.store.set(this.projection())
    } catch { /* A disconnected Host retains the last credential-free snapshot until reconnect. */ }
  }
  /**
   * Refresh when this card's credential reference changes.
   * @param ref - Host-published credential reference.
   */
  refreshCredential(ref: string): void {
    if (ref === this.reference()) void this.refresh()
  }
  /**
   * Build the framework-bound snapshot and account actions.
   * @returns a plain injected face, with no service objects or credentials.
   */
  inject(): EnterpriseCardFace {
    return { ...this.form.actions(), hooks: { enterpriseCard: this.store },
      authorize: () => { this.authorize() },
      revoke: () => { void this.revoke() },
      refresh: () => { void this.refresh() },
      reconnect: () => { void this.reconnect() },
      allowLatest: (kind) => {
        const value = kind === 'sender' ? this.status?.lastSenderId : this.status?.lastChatId
        if (!value || !this.form.shell().writable || this.form.shell().saving) return
        const field = kind === 'sender' ? 'allowedSenders' : 'allowedChats'
        const values = this.form.field(field).text.split(/[,，\s]+/).filter(Boolean)
        if (!values.includes(value)) this.form.actions().edit(field, [...values, value].join(', '))
      },
    }
  }
  private authorize(): void {
    if (this.isDisposed() || this.checking || this.form.shell().dirty || this.channel !== 'feishu') return
    // Open synchronously within the click gesture; a blocked popup leaves an ordinary link.
    this.authorizationFailed = false
    this.popup?.close()
    this.popup = window.open('about:blank', '_blank')
    if (this.popup) this.popup.opener = null
    this.checking = true
    this.store.set(this.projection())
    void this.ctx.remote.enterpriseConnections.authorizeFeishu().then(async (response) => {
      if (this.isDisposed()) return
      if (response.ok) {
        this.authorizationURL = response.value
        if (this.popup) this.popup.location.replace(response.value)
      } else { this.authorizationFailed = true; this.popup?.close(); this.popup = null }
      await this.refresh()
    }).catch(() => { this.authorizationFailed = true; this.popup?.close(); this.popup = null }).finally(() => {
      this.checking = false
      if (!this.isDisposed()) this.store.set(this.projection())
    })
  }
  private async revoke(): Promise<void> {
    if (this.isDisposed() || this.checking || this.form.shell().dirty) return
    this.checking = true
    this.authorizationFailed = false
    this.store.set(this.projection())
    try {
      const response = await this.ctx.remote.enterpriseConnections.revokeFeishu()
      this.authorizationFailed = !response.ok
      this.authorizationURL = ''; await this.refresh()
    } catch { this.authorizationFailed = true }
    finally { this.checking = false; if (!this.isDisposed()) this.store.set(this.projection()) }
  }
  private async reconnect(): Promise<void> {
    if (this.isDisposed() || this.checking || this.form.shell().dirty || !this.form.shell().available) return
    this.checking = true
    this.store.set(this.projection())
    try {
      const response = await this.ctx.remote.enterpriseConnections.reconnect(this.channel)
      if (!this.isDisposed() && response.ok) this.status = response.value.find(row => row.channel === this.channel)
    } catch {
      if (!this.isDisposed()) this.status = { channel: this.channel, state: 'error', error: 'connection-failed',
        receivedMessages: 0, lastSenderId: '', lastChatId: '' }
    } finally {
      this.checking = false
      if (!this.isDisposed()) this.store.set(this.projection())
    }
  }
  /** Release this card's subscriptions and reject late metadata publication. */
  dispose(): void { this.disposed = true; clearTimeout(this.poll); this.popup?.close(); this.generation++; this.unsubscribe() }
}
