/**
 * The PostgreSQL connector's card: the endpoint, the database and role, and the
 * credential reference — which is written through the credentials domain, never
 * into the settings section, so the literal never rides a response.
 *
 * The card stages what the user types and writes it on save, like every other
 * connector card. A saved edit reaches the running plugin through its volatile
 * settings reference, so no restart is required.
 */

import type { Context as ClientContext } from '@deepseek-ai/cordis'
// Type-only: pulls the ctx.remote merge into this program.
import type {} from '@deepseek-ai/dsh-api-remotes/client'
import type { SnapshotStore } from '@deepseek-ai/dsh-client-store'
import type { ConfigForm, ConfigFormSnapshot } from '@deepseek-ai/dsh-client-ui-settings/client'
import {
  CardForm, numberField, textField,
  type CardActions, type CardFieldState, type CardSecretSpec, type CardShell,
} from './card-form.ts'

/** Host settings namespace paired with this native card. */
export const POSTGRES_NS = 'tool-postgres-connector'

/** The credential field name, addressing the reference the section names. */
const PASSWORD_FIELD = 'password'

/** Public settings metadata; the password stays in the credentials domain. */
export interface PostgresSettings {
  enabled?: boolean
  host?: string
  port?: number
  database?: string
  user?: string
  passwordEnv?: string
  ssl?: boolean
  maxConnections?: number
  timeoutMs?: number
}

/** Staged connector controls and credential presence, without the saved secret. */
export interface PostgresCardState extends CardShell {
  host: CardFieldState
  port: CardFieldState
  database: CardFieldState
  user: CardFieldState
  ssl: CardFieldState
  enabled: CardFieldState
  password: CardFieldState
  /** The reference the password is stored under, as the section currently names it. */
  passwordReference: string
  passwordConfigured: boolean
  passwordWritable: boolean
}

/** Actions and observable state injected into the connector card. */
export interface PostgresCardFace extends CardActions {
  hooks: {
    postgresCard: SnapshotStore<PostgresCardState>
  }
}

/** Stage connection settings and write the password through the DH credentials API. */
export class PostgresCardController {
  private readonly form: CardForm<PostgresSettings>
  private readonly store: SnapshotStore<PostgresCardState>
  private credential: { ref: string; configured: boolean; writable: boolean } = { ref: '', configured: false, writable: true }
  private readonly unsubscribe: () => void
  private disposed = false

  /**
   * @param scope - the bound settings scope for the `tool-postgres-connector` namespace.
   * @param ctx - the card plugin's context, whose `remote.credentials` namespace
   * answers for the credential the section references.
   */
  constructor(
    private readonly scope: ConfigForm<PostgresSettings>,
    private readonly ctx: ClientContext,
  ) {
    const secret: CardSecretSpec = { field: PASSWORD_FIELD, write: text => this.writeSecret(text) }
    this.form = new CardForm(
      scope,
      [
        textField('host'),
        numberField('port'),
        textField('database'),
        textField('user'),
        { field: 'enabled', format: value => String(value === true), parse: text => ({ kind: 'set', value: text === 'true' }) },
        { field: 'ssl', format: value => String(value === true), parse: text => ({ kind: 'set', value: text === 'true' }) },
      ],
      [secret],
    )
    this.store = this.form.bind(() => this.projection())
    this.unsubscribe = scope.subscribe(() => { void this.readCredential() })
    void this.readCredential()
  }

  private projection(): PostgresCardState {
    const ref = referenceOf(this.scope.getSnapshot())
    return {
      ...this.form.shell(),
      host: this.form.field('host'),
      port: this.form.field('port'),
      database: this.form.field('database'),
      user: this.form.field('user'),
      ssl: this.form.field('ssl'),
      enabled: this.form.field('enabled'),
      password: this.form.field(PASSWORD_FIELD),
      passwordReference: ref,
      passwordConfigured: this.credential.configured,
      passwordWritable: this.credential.writable,
    }
  }

  /**
   * Read whether the Host holds a value for the current reference.
   *
   * The literal never travels back, so the card can only report presence; that
   * is what its badge shows.
   * @returns settlement after the redacted read.
   */
  private async readCredential(): Promise<void> {
    if (this.isDisposed()) return
    const ref = referenceOf(this.scope.getSnapshot())
    if (ref !== this.credential.ref) {
      this.credential = { ref, configured: false, writable: true }
      this.store.set(this.projection())
    }
    if (ref === '') return
    const response = await this.ctx.remote.credentials.describe([ref])
    if (this.isDisposed() || !response.ok || ref !== referenceOf(this.scope.getSnapshot())) return
    const view = response.value[ref]
    const next = { ref, configured: view?.configured ?? false, writable: view?.writable ?? true }
    if (next.configured !== this.credential.configured || next.writable !== this.credential.writable) {
      this.credential = next
      this.store.set(this.projection())
    }
  }

  /**
   * Re-read after the Host reports a change to the reference this card watches.
   * @param ref - the reference the Host reports as changed.
   */
  refreshCredential(ref: string): void {
    if (this.isDisposed() || ref !== referenceOf(this.scope.getSnapshot())) return
    void this.readCredential()
  }

  /** Re-read credential presence after the transport reconnects. */
  resetConnection(): void {
    if (this.isDisposed()) return
    void this.readCredential()
  }

  /**
   * Build the face the card's slot registration injects.
   * @returns the card's snapshot and its form actions.
   */
  inject(): PostgresCardFace {
    return { hooks: { postgresCard: this.store }, ...this.form.actions() }
  }

  /** Release the controller-owned scope subscription. */
  dispose(): void {
    this.disposed = true
    this.unsubscribe()
    this.form.dispose()
  }

  private isDisposed(): boolean {
    return this.disposed
  }

  /**
   * Write the staged password, then re-read whether the Host now holds one.
   * @param value - the staged credential literal.
   * @returns whether the Host reports a configured credential afterwards.
   */
  private async writeSecret(value: string): Promise<boolean> {
    const ref = referenceOf(this.scope.getSnapshot())
    if (ref === '') return false
    const result = await this.ctx.remote.credentials.set(ref, value)
    if (!result.ok) return false
    await this.readCredential()
    return this.credential.configured
  }
}

/**
 * The credential reference the section names, or the connector's default.
 *
 * An empty reference means the section clears the field, which leaves the
 * connector unable to resolve a password; the card reports that rather than
 * silently addressing the default.
 * @param snapshot - the current scope snapshot.
 * @returns the reference to address, or an empty string.
 */
function referenceOf(snapshot: ConfigFormSnapshot<PostgresSettings>): string {
  return snapshot.value?.passwordEnv ?? ''
}
