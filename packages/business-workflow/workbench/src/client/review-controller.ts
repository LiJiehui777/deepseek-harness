/** Session-owned review reads and explicit operator decisions over the existing Flowable tasks. */
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-api-remotes/client'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { RemoteResult } from '@deepseek-ai/dsh-typert-protocol'
import { createSnapshotStore, type SnapshotStore } from '@deepseek-ai/dsh-client-store'
import type { ConversationReviews, ConversationReviewTask, ConversationReviewDetail, ProcessDetail, ProcessId } from '../shared/runtime.ts'

/** One conversation's pending reviews and selected, task-addressed detail. */
export interface ReviewState {
  inbox: ConversationReviews | null
  selected: ConversationReviewTask | null
  detail: ConversationReviewDetail | null
  busy: boolean
  inboxError: string
  detailError: boolean
  submitError: 'stale' | 'unconfirmed' | null
  followError: boolean
  decision: 'approved' | 'rejected' | null
  progress: { id: ProcessId; detail: ProcessDetail | null; error: string } | null
}
/** Plain review controls and renderer-owned observation. */
export interface ReviewFace {
  hooks: { workflowReviews: SnapshotStore<ReviewState> }
  refreshReviews: () => void
  openReview: (task: ConversationReviewTask) => void
  closeReview: () => void
  decideReview: (approved: boolean) => void
  followProcess: (id: ProcessId) => void
  openProgress: (id: ProcessId) => void
  closeProgress: () => void
}
const unwrap = <T>(result: RemoteResult<T>): T => {
  if (!result.ok) throw new Error(result.error.message)
  return result.value
}

const submitError = (error: unknown): NonNullable<ReviewState['submitError']> => {
  const message = error instanceof Error ? error.message : ''
  return /CURRENT_HUMAN_TASK_REQUIRED|FLOWABLE_HTTP_(404|409)/.test(message) ? 'stale' : 'unconfirmed'
}

/** Serialize reads and decisions, ignore replaced selections, and drain accepted work at disposal. */
export class ReviewController {
  private readonly store = createSnapshotStore<ReviewState>({ inbox: null, selected: null, detail: null,
    busy: false, inboxError: '', detailError: false, submitError: null, followError: false, decision: null, progress: null })
  private operation: Promise<void> | undefined
  private timer: ReturnType<typeof setTimeout> | undefined
  private ready = false
  private readinessVersion = 0
  private closed = false

  constructor(private readonly api: Context['remote']['businessWorkflows'], private readonly sessionId: SessionId,
    private readonly onDecision: () => void, private readonly isSessionReady: () => boolean) {}

  private canRead(): boolean { return !this.closed && this.isSessionReady() }

  /** Start reading once history and Host activation are ready; pause when either is lost. */
  syncReadiness(): void {
    const ready = this.canRead()
    if (this.ready === ready) return
    this.ready = ready
    this.readinessVersion++
    clearTimeout(this.timer)
    if (ready) void this.enqueue(() => this.read())
  }

  /** Obtain callbacks and the standard slot hook source. @returns the private review face. */
  face(): ReviewFace {
    return {
      hooks: { workflowReviews: this.store },
      refreshReviews: () => {
        if (this.canRead() && !this.store.getSnapshot().busy) void this.enqueue(() => this.read(true))
      },
      openReview: (task) => {
        if (!this.canRead() || this.store.getSnapshot().busy) return
        this.select(task)
        void this.enqueue(() => this.read())
      },
      closeReview: () => { this.select(null) },
      decideReview: (approved) => { this.decide(approved) },
      openProgress: (id) => {
        if (!this.canRead() || this.store.getSnapshot().busy) return
        this.select(null)
        this.store.update((state) => { state.progress = { id, detail: null, error: '' } })
        void this.enqueue(() => this.readProgress(this.readinessVersion))
      },
      closeProgress: () => { this.store.update((state) => { state.progress = null }) },
      followProcess: (id) => { this.follow(id) },
    }
  }

  private select(task: ConversationReviewTask | null): void {
    this.store.update((state) => {
      state.selected = task; state.detail = null; state.decision = null; state.detailError = false; state.submitError = null
      if (task) state.progress = null
    })
  }

  /** Refresh pending tasks and any open detail; overlapping refreshes share one operation. @returns settled read. */
  load(): Promise<void> {
    if (!this.canRead()) return Promise.resolve()
    return this.operation ?? this.enqueue(() => this.read())
  }

  private isCurrentRead(version: number): boolean { return this.canRead() && this.readinessVersion === version }

  private async read(reconcileSubmission = false): Promise<void> {
    if (!this.canRead()) return
    const version = this.readinessVersion
    try {
      const inbox = unwrap(await this.api.conversationReviews(this.sessionId))
      if (!this.isCurrentRead(version)) return
      this.store.update((state) => {
        state.inbox = inbox
        state.inboxError = inbox.error
        if (!inbox.error && reconcileSubmission) state.followError = false
        if (inbox.error && state.progress) state.progress.error = inbox.error
      })
      if (inbox.error) return
    } catch (error) {
      if (this.isCurrentRead(version)) this.store.update((state) => {
        state.inboxError = error instanceof Error ? error.message : 'WORKFLOW_INBOX_READ_FAILED'
        if (state.progress) state.progress.error = state.inboxError
      })
      return
    }
    await this.readReview(version, reconcileSubmission)
    await this.readProgress(version)
  }

  private async readReview(version: number, reconcileSubmission: boolean): Promise<void> {
    const { selected } = this.store.getSnapshot()
    if (!selected || !this.isCurrentRead(version)) return
    const stillSelected = () => this.isCurrentRead(version) && this.store.getSnapshot().selected === selected
    try {
      const detail = unwrap(await this.api.conversationReviewDetail(this.sessionId, selected.processId, selected.taskId))
      if (stillSelected()) this.store.update((state) => {
        state.detail = detail
        state.detailError = false
        if (reconcileSubmission || detail.inputJson === null) state.submitError = null
      })
    } catch {
      if (stillSelected()) this.store.update((state) => { state.detailError = true })
    }
  }

  private async readProgress(version: number): Promise<void> {
    const selected = this.store.getSnapshot().progress
    if (!this.isCurrentRead(version) || !selected) return
    try {
      const detail = unwrap(await this.api.conversationProcessDetail(this.sessionId, selected.id))
      if (this.isCurrentRead(version) && this.store.getSnapshot().progress === selected) this.store.update((state) => {
        state.progress = { id: selected.id, detail, error: '' }
      })
    } catch (error: unknown) {
      if (this.isCurrentRead(version) && this.store.getSnapshot().progress === selected) this.store.update((state) => {
        state.progress = { ...selected, error: error instanceof Error ? error.message : 'WORKFLOW_PROGRESS_FAILED' }
      })
    }
  }

  private async submit(selected: ConversationReviewTask, approved: boolean): Promise<void> {
    let process: ProcessDetail
    try {
      process = unwrap(await this.api.reviewFromConversation(this.sessionId, selected.processId, selected.taskId, approved))
    } catch (error) {
      if (!this.closed && this.store.getSnapshot().selected === selected) this.store.update((state) => {
        state.submitError = submitError(error)
      })
      return
    }
    if (this.closed) return
    if (this.store.getSnapshot().selected === selected) this.store.update((state) => {
      state.detail = { process, inputJson: null }; state.detailError = false; state.decision = approved ? 'approved' : 'rejected'
    })
    this.onDecision()
    await this.read()
  }

  private decide(approved: boolean): void {
    const { selected, detail, busy, inboxError, detailError, submitError, decision } = this.store.getSnapshot()
    if (!this.canRead() || busy || inboxError || detailError || submitError || decision
      || !selected || !detail || detail.inputJson === null) return
    this.write(() => this.submit(selected, approved))
  }

  private follow(id: ProcessId): void {
    if (!this.canRead() || this.store.getSnapshot().busy) return
    this.store.update((state) => { state.followError = false })
    this.write(async () => {
      try {
        unwrap(await this.api.followFromConversation(this.sessionId, id))
      } catch {
        if (!this.closed) this.store.update((state) => { state.followError = true })
        return
      }
      await this.read()
    })
  }

  private write(operation: () => Promise<void>): void {
    this.store.update((state) => { state.busy = true })
    void this.enqueue(async () => {
      try { await operation() } finally {
        if (!this.closed) this.store.update((state) => { state.busy = false })
      }
    })
  }

  private enqueue(operation: () => Promise<void>): Promise<void> {
    if (this.closed) return Promise.resolve()
    clearTimeout(this.timer)
    const pending = (this.operation ?? Promise.resolve()).then(operation).finally(() => {
      if (this.operation !== pending) return
      this.operation = undefined
      const interval = this.store.getSnapshot().inbox?.refreshIntervalMs
      if (this.canRead() && interval) this.timer = setTimeout(() => { void this.load() }, interval)
    })
    this.operation = pending
    return pending
  }

  /** Stop polling and await queued reads and accepted decisions. @returns after quiescence. */
  async dispose(): Promise<void> {
    this.closed = true
    clearTimeout(this.timer)
    await this.operation
  }
}
