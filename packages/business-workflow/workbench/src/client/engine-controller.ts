/** Registration-owned observable over the generated Host API; components own no subscriptions. */
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-api-remotes/client'
import { createSnapshotStore, type SnapshotStore } from '@deepseek-ai/dsh-client-store'
import type { RemoteResult } from '@deepseek-ai/dsh-typert-protocol'
import type { EngineHealth, ProcessDetail, ProcessId, ProcessSummary, StartProcessRequest, WorkItemId, WorkflowTemplate, SaveTemplateRequest, StartPublishedRequest } from '../shared/runtime.ts'

/** Browser projection of engine reads and one pending operator operation. */
export interface EngineState {
  health: EngineHealth | null
  templates: WorkflowTemplate[]
  runs: ProcessSummary[]
  detail: ProcessDetail | null
  busy: boolean
  error: string
}
/** Plain callbacks and an observable bound by the renderer as useEngine. */
export interface EngineFace {
  hooks: { engine: SnapshotStore<EngineState> }
  saveTemplate: (request: SaveTemplateRequest) => Promise<WorkflowTemplate | undefined>
  publishTemplate: (id: string, revision: number) => Promise<WorkflowTemplate | undefined>
  unpublishTemplate: (id: string, revision: number) => Promise<WorkflowTemplate | undefined>
  refreshEngine: () => void
  startPublishedProcess: (request: StartPublishedRequest) => void
  startProcess: (request: StartProcessRequest) => void
  openProcess: (id: ProcessId) => void
  reviewProcess: (id: ProcessId, task: WorkItemId, approve: boolean) => void
  arriveProcess: (id: ProcessId, execution: WorkItemId) => void
  cancelProcess: (id: ProcessId) => void
}

const unwrap = <T>(result: RemoteResult<T>): T => {
  if (!result.ok) throw new Error(result.error.message)
  return result.value
}

/** Keeps accepted engine data in one store and drains reads before disposal. */
export class EngineController {
  private readonly store = createSnapshotStore<EngineState>({ health: null, templates: [], runs: [], detail: null, busy: false, error: '' })
  private closed = false
  private pending: Promise<void> | undefined
  private mutation: Promise<void> | undefined
  private timer: ReturnType<typeof setTimeout> | undefined
  private selected: ProcessId | undefined

  constructor(private readonly api: Context['remote']['businessWorkflows']) {}
  private isClosed(): boolean { return this.closed }

  /** Create the private injection face. @returns callbacks and the renderer-owned hook source. */
  face(): EngineFace {
    return { hooks: { engine: this.store },
      saveTemplate: request => this.editCatalog(() => this.api.saveTemplate(request)),
      publishTemplate: (id, revision) => this.editCatalog(() => this.api.publishTemplate(id, revision)),
      unpublishTemplate: (id, revision) => this.editCatalog(() => this.api.unpublishTemplate(id, revision)),
      refreshEngine: () => { void this.load() },
      startPublishedProcess: (request) => { this.perform(() => this.api.startPublished(request)) },
      startProcess: (request) => { this.perform(() => this.api.start(request)) },
      openProcess: (id) => { this.selected = id; void this.load() },
      reviewProcess: (id, task, approve) => { this.perform(() => this.api.review(id, task, approve)) },
      arriveProcess: (id, execution) => { this.perform(() => this.api.arrive(id, execution)) },
      cancelProcess: (id) => { this.perform(() => this.api.cancel(id)) },
    }
  }

  /** Refresh accepted state; concurrent refreshes share one read. */
  load(): Promise<void> {
    if (this.isClosed()) return Promise.resolve()
    if (this.pending) return this.pending
    clearTimeout(this.timer)
    this.pending = this.read().catch((error: unknown) => {
      if (!this.isClosed()) this.store.update((state) => { state.error = error instanceof Error ? error.message : 'ENGINE_REQUEST_FAILED' })
    }).finally(() => {
      this.pending = undefined
      const interval = this.store.getSnapshot().health?.refreshIntervalMs
      if (!this.isClosed() && interval) this.timer = setTimeout(() => { void this.load() }, interval)
    })
    return this.pending
  }

  private async read(): Promise<void> {
    const templates = unwrap(await this.api.templates())
    if (!this.isClosed()) this.store.update((state) => { state.templates = templates })
    const health = unwrap(await this.api.health())
    if (this.isClosed()) return
    this.store.update((state) => { state.health = health })
    if (!health.connected) return
    const runs = unwrap(await this.api.list())
    if (this.isClosed()) return
    this.selected ??= runs[0]?.id
    const selected = this.selected
    const detail = selected === undefined ? null : unwrap(await this.api.detail(selected))
    if (!this.isClosed() && this.selected === selected) this.store.update((state) => {
      state.runs = runs; state.detail = detail; state.error = ''
    })
  }

  private async editCatalog(operation: () => Promise<RemoteResult<WorkflowTemplate>>): Promise<WorkflowTemplate | undefined> {
    if (this.isClosed() || this.mutation) return undefined
    let record: WorkflowTemplate | undefined
    this.store.update((state) => { state.busy = true; state.error = '' })
    this.mutation = (async () => {
      await this.pending
      try {
        if (this.isClosed()) return
        record = unwrap(await operation())
        await this.load()
      } catch (error) {
        if (!this.isClosed()) this.store.update((state) => { state.error = error instanceof Error ? error.message : 'ENGINE_REQUEST_FAILED' })
      } finally {
        if (!this.isClosed()) this.store.update((state) => { state.busy = false })
      }
    })()
    try { await this.mutation; return record } finally { this.mutation = undefined }
  }

  private perform(operation: () => Promise<RemoteResult<ProcessDetail>>): void {
    if (this.isClosed() || this.mutation) return
    this.store.update((state) => { state.busy = true; state.error = '' })
    this.mutation = (async () => {
      await this.pending
      try {
        if (this.isClosed()) return
        const detail = unwrap(await operation())
        this.selected = detail.id
        if (!this.isClosed()) this.store.update((state) => { state.detail = detail })
        await this.load()
      } catch (error) {
        if (!this.isClosed()) this.store.update((state) => { state.error = error instanceof Error ? error.message : 'ENGINE_REQUEST_FAILED' })
      } finally {
        if (!this.isClosed()) this.store.update((state) => { state.busy = false })
        this.mutation = undefined
      }
    })()
  }

  /** Stop polling and await submitted reads and writes. */
  async dispose(): Promise<void> {
    this.closed = true
    clearTimeout(this.timer)
    await this.pending
    await this.mutation
  }
}
