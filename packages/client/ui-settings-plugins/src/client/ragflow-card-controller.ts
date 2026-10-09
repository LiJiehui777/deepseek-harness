import type { Context as ClientContext } from '@deepseek-ai/cordis'
// Type-only: pulls the ctx.remote merge into this program.
import type {} from '@deepseek-ai/dsh-api-remotes/client'
import type { SnapshotStore } from '@deepseek-ai/dsh-client-store'
import type { SettingsScope, SettingsScopeSnapshot } from '@deepseek-ai/dsh-client-ui-settings/client'
import {
  CardForm, textField,
  type CardActions, type CardFieldState, type CardShell,
} from './card-form.ts'

/** Host settings namespace paired with this native card. */
export const RAGFLOW_NS = 'ragflow-connector'

const DEFAULT_API_KEY_REF = 'RAGFLOW_API_KEY'

const API_KEY_FIELD = 'apiKey'

/** Public settings metadata; the API Key stays in the credentials domain. */
export interface RagflowSettings {
  apiKeyEnv?: string
  baseURL?: string
  datasetIds?: string[]
  enabled?: boolean
}

interface CredentialState {
  ref: string
  configured: boolean
  writable: boolean
}

/** Staged connector controls and credential presence, without the saved secret. */
export interface RagflowCardState extends CardShell {
  baseURL: CardFieldState
  datasetIds: CardFieldState
  enabled: CardFieldState
  apiKey: CardFieldState
  apiKeyConfigured: boolean
  apiKeyWritable: boolean
}

/** Actions and observable state injected into the connector card. */
export interface RagflowCardFace extends CardActions {
  hooks: {
    ragflowCard: SnapshotStore<RagflowCardState>
  }
}

/** Stage connection settings and write keys through the DH credentials API. */
export class RagflowCardController {
  private readonly form: CardForm<RagflowSettings>
  private readonly store: SnapshotStore<RagflowCardState>
  private credential: CredentialState = { ref: '', configured: false, writable: true }

  /**
   * @param scope - the bound settings scope for the `ragflow-connector` namespace.
   * @param ctx - the card plugin's context, whose `remote.credentials` namespace
   * answers for the credential the section references.
   */
  constructor(
    private readonly scope: SettingsScope<RagflowSettings>,
    private readonly ctx: ClientContext,
  ) {
    this.form = new CardForm(
      scope,
      [{ ...textField('baseURL'), parse: (text) => { try { const url = new URL(text); return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password && !url.search && !url.hash ? { kind: 'set', value: text } : undefined } catch { return undefined } } }, { field: 'datasetIds', equals: (stored, staged) => Array.isArray(stored) && Array.isArray(staged) && stored.length === staged.length && stored.every((id, index) => id === staged[index]), format: value => Array.isArray(value) ? value.join(', ') : '', parse: (text) => { const ids = [...new Set(text.split(/[,，\s]+/).filter(Boolean))]; return ids.length <= 100 && ids.every(id => /^[a-zA-Z0-9_-]{1,128}$/.test(id)) ? { kind: 'set', value: ids } : undefined } },
        { field: 'enabled', format: value => String(value === true), parse: text => ({ kind: 'set', value: text === 'true' }) }],
      [{ field: API_KEY_FIELD, write: text => this.writeKey(text) }],
    )
    this.store = this.form.bind(() => this.projection())
    scope.subscribe(() => { void this.readCredential() })
    void this.readCredential()
  }

  private projection(): RagflowCardState {
    return {
      ...this.form.shell(),
      baseURL: this.form.field('baseURL'),
      datasetIds: this.form.field('datasetIds'),
      enabled: this.form.field('enabled'),
      apiKey: this.form.field(API_KEY_FIELD),
      apiKeyConfigured: this.credential.configured,
      apiKeyWritable: this.credential.writable,
    }
  }

  private async readCredential(): Promise<void> {
    const ref = refOf(this.scope.getSnapshot())
    if (ref !== this.credential.ref) {
      this.credential = { ref, configured: false, writable: true }
      this.store.set(this.projection())
    }
    const response = await this.ctx.remote.credentials.describe([ref])
    if (!response.ok || ref !== refOf(this.scope.getSnapshot())) return
    const view = response.value[ref]
    const next: CredentialState = {
      ref,
      configured: view?.configured ?? false,
      writable: view?.writable ?? true,
    }
    if (next.configured === this.credential.configured && next.writable === this.credential.writable) return
    this.credential = next
    this.store.set(this.projection())
  }

  /**
   * Re-read after the Host reports a change to the reference this card watches.
   *
   * A key can be written from somewhere else — the Models page addresses the
   * same reference — and the settings section does not change when it is, so
   * without this the badge keeps reporting a state the Host already replaced.
   * @param ref - the reference the Host reports as changed.
   */
  refreshCredential(ref: string): void {
    if (ref !== this.credential.ref) return
    void this.readCredential()
  }

  /**
   * Build the face the card's slot registration injects.
   * @returns the card's snapshot and its form actions.
   */
  inject(): RagflowCardFace {
    return { hooks: { ragflowCard: this.store }, ...this.form.actions() }
  }

  /**
   * Write the staged key, then re-read whether the Host now holds one.
   * @param value - the staged credential literal.
   * @returns whether the Host reports a configured credential afterwards.
   */
  private async writeKey(value: string): Promise<boolean> {
    const result = await this.ctx.remote.credentials.set(refOf(this.scope.getSnapshot()), value)
    if (!result.ok) return false
    await this.readCredential()
    return this.credential.configured
  }
}

/**
 * The credential reference the section names, or the provider's default.
 * @param snapshot - the current scope snapshot.
 * @returns the reference to address.
 */
function refOf(snapshot: SettingsScopeSnapshot<RagflowSettings>): string {
  const declared = snapshot.value?.apiKeyEnv
  return declared !== undefined && declared.length > 0 ? declared : DEFAULT_API_KEY_REF
}
