import type { Context as ClientContext } from '@deepseek-ai/cordis'
// Type-only: pulls the ctx.remote merge into this program.
import type { RagflowDataset } from '@deepseek-ai/dsh-api-remotes/client'
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
  /** Current names from the saved connection; never persisted with the IDs. */
  datasets: RagflowDataset[]
  catalogStatus: 'idle' | 'loading' | 'ready' | 'error'
  catalogHasMore: boolean
  /** Endpoint or key edits must be saved before browsing that connection. */
  catalogNeedsSave: boolean
}

/** Actions and observable state injected into the connector card. */
export interface RagflowCardFace extends CardActions {
  /** Reload the first catalog page without changing the selection. */
  loadDatasets: () => void
  /** Append the next bounded catalog page. */
  loadMoreDatasets: () => void
  /** Stage one knowledge-base selection or removal. */
  toggleDataset: (id: string) => void
  hooks: {
    ragflowCard: SnapshotStore<RagflowCardState>
  }
}

/** Stage connection settings and write keys through the DH credentials API. */
export class RagflowCardController {
  private readonly form: CardForm<RagflowSettings>
  private readonly store: SnapshotStore<RagflowCardState>
  private credential: CredentialState = { ref: '', configured: false, writable: true }
  private datasets: RagflowDataset[] = []
  private catalogStatus: RagflowCardState['catalogStatus'] = 'idle'
  private catalogHasMore = false
  private catalogPage = 0
  private catalogRequest: AbortController | undefined
  private connection: string
  private readonly unsubscribe: () => void
  private disposed = false

  /**
   * @param scope - the bound settings scope for the `ragflow-connector` namespace.
   * @param ctx - the card plugin's context, whose `remote.credentials` namespace
   * answers for the credential the section references.
   */
  constructor(
    private readonly scope: SettingsScope<RagflowSettings>,
    private readonly ctx: ClientContext,
  ) {
    this.connection = this.connectionOf()
    this.form = new CardForm(
      scope,
      [{ ...textField('baseURL'), parse: (text) => { try { const url = new URL(text); return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password && !url.search && !url.hash ? { kind: 'set', value: text } : undefined } catch { return undefined } } }, { field: 'datasetIds', equals: (stored, staged) => Array.isArray(stored) && Array.isArray(staged) && stored.length === staged.length && stored.every((id, index) => id === staged[index]), format: value => Array.isArray(value) ? value.join(', ') : '', parse: (text) => { const ids = [...new Set(text.split(/[,，\s]+/).filter(Boolean))]; return ids.length <= 100 && ids.every(id => /^[a-zA-Z0-9_-]{1,128}$/.test(id)) ? { kind: 'set', value: ids } : undefined } },
        { field: 'enabled', format: value => String(value === true), parse: text => ({ kind: 'set', value: text === 'true' }) }],
      [{ field: API_KEY_FIELD, write: text => this.writeKey(text) }],
    )
    this.store = this.form.bind(() => this.projection())
    this.unsubscribe = scope.subscribe(() => {
      const connection = this.connectionOf()
      if (connection !== this.connection) {
        this.connection = connection
        this.invalidateCatalog()
      }
      void this.readCredential()
    })
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
      datasets: this.datasets,
      catalogStatus: this.catalogStatus,
      catalogHasMore: this.catalogHasMore,
      catalogNeedsSave: this.needsSave(),
    }
  }

  private async readCredential(): Promise<void> {
    if (this.isDisposed()) return
    const ref = refOf(this.scope.getSnapshot())
    if (ref !== this.credential.ref) {
      this.credential = { ref, configured: false, writable: true }
      this.store.set(this.projection())
    }
    const response = await this.ctx.remote.credentials.describe([ref])
    if (this.isDisposed() || !response.ok || ref !== refOf(this.scope.getSnapshot())) return
    const view = response.value[ref]
    const next: CredentialState = {
      ref,
      configured: view?.configured ?? false,
      writable: view?.writable ?? true,
    }
    if (next.configured !== this.credential.configured || next.writable !== this.credential.writable) {
      this.credential = next
      this.store.set(this.projection())
    }
    if (next.configured && this.catalogStatus === 'idle') void this.loadCatalog(false)
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
    if (this.isDisposed() || ref !== this.credential.ref) return
    this.invalidateCatalog()
    void this.readCredential()
  }

  /**
   * Build the face the card's slot registration injects.
   * @returns the card's snapshot and its form actions.
   */
  inject(): RagflowCardFace {
    return {
      hooks: { ragflowCard: this.store }, ...this.form.actions(),
      loadDatasets: () => { void this.loadCatalog(false) },
      loadMoreDatasets: () => { if (this.catalogHasMore) void this.loadCatalog(true) },
      toggleDataset: (id) => {
        if (this.isDisposed() || !this.form.shell().writable || this.form.shell().saving || this.needsSave()) return
        const selected = this.form.field('datasetIds').text.split(/[,，\s]+/).filter(Boolean)
        if (selected.includes(id)) this.form.actions().edit('datasetIds', selected.filter(value => value !== id).join(', '))
        else if (selected.length < 100 && this.datasets.some(row => row.id === id)) this.form.actions().edit('datasetIds', [...selected, id].join(', '))
      },
    }
  }

  /** Invalidate Host-specific metadata and pending reads after reconnecting. */
  resetConnection(): void {
    if (this.isDisposed()) return
    this.invalidateCatalog()
    void this.readCredential()
  }

  /** Release catalog requests and the controller-owned scope subscription. */
  dispose(): void {
    this.disposed = true
    this.catalogRequest?.abort()
    this.unsubscribe()
  }

  private isDisposed(): boolean {
    return this.disposed
  }

  private connectionOf(): string {
    const snapshot = this.scope.getSnapshot()
    return JSON.stringify([snapshot.status, snapshot.value?.baseURL, refOf(snapshot)])
  }

  private needsSave(): boolean {
    return this.form.field('baseURL').text.trim() !== (this.scope.getSnapshot().value?.baseURL ?? '')
      || this.form.field(API_KEY_FIELD).text.trim() !== ''
  }

  private invalidateCatalog(): void {
    this.catalogRequest?.abort()
    this.catalogRequest = undefined
    this.datasets = []
    this.catalogStatus = 'idle'
    this.catalogPage = 0
    this.catalogHasMore = false
    this.store.set(this.projection())
  }

  private async loadCatalog(append: boolean): Promise<void> {
    if (this.isDisposed() || !this.form.shell().available || this.needsSave() || !this.credential.configured
      || this.catalogStatus === 'loading') return
    const request = new AbortController()
    this.catalogRequest = request
    const page = append ? this.catalogPage + 1 : 1
    this.catalogStatus = 'loading'
    this.store.set(this.projection())
    try {
      const response = await this.ctx.remote.ragflow.listDatasets(page, request.signal)
      if (request.signal.aborted || this.isDisposed() || this.catalogRequest !== request) return
      if (response.ok) {
        const rows = new Map((append ? this.datasets : []).map(row => [row.id, row]))
        for (const row of response.value.datasets) rows.set(row.id, row)
        this.datasets = [...rows.values()]
        this.catalogPage = response.value.page
        this.catalogHasMore = response.value.has_more
        this.catalogStatus = 'ready'
      } else this.catalogStatus = 'error'
    } catch {
      // Transport failures may reject before a Remote result is available.
      if (request.signal.aborted || this.isDisposed() || this.catalogRequest !== request) return
      this.catalogStatus = 'error'
    }
    if (this.catalogRequest === request) this.catalogRequest = undefined
    this.store.set(this.projection())
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
