/** Staged office settings and a generation-fenced native QR authorization view. */
import type { Context } from '@deepseek-ai/cordis'
import type { WecomOfficeStatus } from '@deepseek-ai/dsh-api-remotes/client'
import type { SnapshotStore } from '@deepseek-ai/dsh-client-store'
import type { SettingsScope } from '@deepseek-ai/dsh-client-ui-settings/client'
import { CardForm } from './card-form.ts'
import type { CardActions, CardFieldState, CardShell } from './card-form.ts'

/** Independent office permissions, without message-robot credentials. */
export interface OfficeSettings {
  enabled?: boolean
  documents?: boolean
  files?: boolean
  calendar?: boolean
  todos?: boolean
  contacts?: boolean
  meetings?: boolean
  mail?: boolean
  messages?: boolean
}
/** One office subsection's saved-state projection and transient interaction state. */
export interface WecomOfficeCardState extends CardShell {
  fields: Record<string, CardFieldState>
  status?: WecomOfficeStatus
  busy: boolean
  requestFailed: boolean
}
/** Plain callbacks consumed by the native office subsection. */
export interface WecomOfficeActions extends CardActions {
  scan: () => void
  extend: () => void
  check: () => void
  cancel: () => void
  disconnect: () => void
}

/** Account-local form and pending-QR polling; never starts consent automatically. */
export class WecomOfficeCardController {
  private readonly form: CardForm<OfficeSettings>
  /** Current form and transient account metadata for the parent native card. */
  readonly source: SnapshotStore<WecomOfficeCardState>
  private status: WecomOfficeStatus | undefined
  private busy = false
  private requestFailed = false
  private disposed = false
  private generation = 0
  private poll: ReturnType<typeof setTimeout> | undefined
  private readonly unsubscribe: () => void
  private readonly fields = ['enabled', 'documents', 'files', 'calendar', 'todos', 'contacts', 'meetings', 'mail', 'messages'] as const

  /**
   * @param scope - independent office settings namespace.
   * @param ctx - authenticated native enterprise Remote namespace.
   * @param connected - refresh parent message status after QR connection completes.
   */
  constructor(private readonly scope: SettingsScope<OfficeSettings>, private readonly ctx: Context,
    private readonly connected?: () => void) {
    this.form = new CardForm(scope, this.fields.map(field => ({ field,
      format: (value: unknown) => String(value === true), parse: (value: string) => ({ kind: 'set' as const, value: value === 'true' }),
    })), [])
    this.source = this.form.bind(() => this.projection())
    this.unsubscribe = scope.subscribe(() => { void this.refresh() })
    void this.refresh()
  }
  private projection(): WecomOfficeCardState {
    return { ...this.form.shell(), fields: Object.fromEntries(this.fields.map(field => [field, this.form.field(field)])),
      ...(this.status ? { status: this.status } : {}), busy: this.busy, requestFailed: this.requestFailed }
  }
  private current(generation: number): boolean { return !this.disposed && generation === this.generation }
  private publish(): void { if (!this.disposed) this.source.set(this.projection()) }
  private pollPending(): void {
    clearTimeout(this.poll)
    this.poll = undefined
    if (this.status?.state === 'pending' && !this.disposed) this.poll = setTimeout(() => {
      this.poll = undefined; void this.refresh()
    }, this.status.pollIntervalMs)
  }

  /** Re-read after settings commits or a transport reset, discarding late responses. */
  async refresh(): Promise<void> {
    if (this.disposed || this.busy || !this.form.shell().available) return
    const generation = ++this.generation
    try {
      const response = await this.ctx.remote.enterpriseConnections.wecomOfficeStatus()
      if (!this.current(generation)) return
      this.requestFailed = !response.ok
      const completed = this.status?.state === 'pending' && response.ok && response.value.state === 'authorized'
      if (response.ok) this.status = response.value
      this.publish(); this.pollPending()
      if (completed) { await this.action('check'); if (this.current(generation + 1)) this.connected?.() }
    } catch {
      if (this.current(generation)) { this.requestFailed = true; this.publish() }
    }
  }
  private async action(kind: 'scan' | 'extend' | 'check' | 'cancel' | 'disconnect'): Promise<void> {
    if (this.disposed || this.busy || this.form.shell().dirty || !this.form.shell().writable) return
    clearTimeout(this.poll)
    const generation = ++this.generation
    this.busy = true; this.requestFailed = false; this.publish()
    try {
      if (kind === 'scan' || kind === 'extend') {
        const snapshot = this.scope.getSnapshot()
        const value = snapshot.value
        const operations: Array<{ op: 'set'; path: string[]; value: boolean }> = []
        const selected = kind === 'scan' ? this.fields : ['contacts', 'meetings', 'mail', 'messages'] as const
        for (const field of selected) if (!value?.[field]) operations.push({ op: 'set', path: [field], value: true })
        if (operations.length) {
          await this.scope.mutate(operations, snapshot.revision)
          const saved = this.scope.getSnapshot().value
          if (!selected.every(field => saved?.[field])) throw new Error('Office connection settings were not saved.')
        }
      }
      if (!this.current(generation)) return
      const remote = this.ctx.remote.enterpriseConnections
      const response = kind === 'scan' ? await remote.authorizeWecomOffice()
        : kind === 'check' || kind === 'extend' ? await remote.checkWecomOffice()
          : kind === 'cancel' ? await remote.cancelWecomOffice() : await remote.disconnectWecomOffice()
      if (!this.current(generation)) return
      this.requestFailed = !response.ok
      if (response.ok) this.status = response.value
    } catch {
      if (this.current(generation)) this.requestFailed = true
    } finally {
      if (this.current(generation)) { this.busy = false; this.publish(); this.pollPending() }
    }
  }
  /**
   * Build callbacks; advanced edits stay staged and connecting saves initial permissions.
   * @returns the subsection's complete action face.
   */
  actions(): WecomOfficeActions {
    return { ...this.form.actions(), extend: () => { void this.action('extend') }, scan: () => { void this.action('scan') }, check: () => { void this.action('check') },
      cancel: () => { void this.action('cancel') }, disconnect: () => { void this.action('disconnect') } }
  }
  /** Stop polling and reject responses from an obsolete native page. */
  dispose(): void { this.disposed = true; this.generation++; clearTimeout(this.poll); this.unsubscribe(); this.form.dispose() }
}
