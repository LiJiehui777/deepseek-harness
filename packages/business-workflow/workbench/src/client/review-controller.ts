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
  error: string
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

/** Serialize reads and decisions, ignore replaced selections, and drain accepted work at disposal. */
export class ReviewController {
  private readonly store = createSnapshotStore<ReviewState>({ inbox: null, selected: null, detail: null,
    busy: false, error: '', decision: null, progress: null })
  private operation: Promise<void> | undefined
  private timer: ReturnType<typeof setTimeout> | undefined
  private closed = false

  constructor(private readonly api: Context['remote']['businessWorkflows'], private readonly sessionId: SessionId,
    private readonly onDecision: () => void) {}

  private isClosed(): boolean { return this.closed }

  /** Obtain callbacks and the standard slot hook source. @returns the private review face. */
  face(): ReviewFace {
    return { hooks: { workflowReviews: this.store }, refreshReviews: () => { void this.load() },
      openReview: (task) => {
        if (this.isClosed() || this.store.getSnapshot().busy) return
        this.store.update((state) => { state.selected = task; state.detail = null; state.error = ''; state.decision = null; state.progress = null })
        void this.enqueue(() => this.read())
      },
      closeReview: () => {
        this.store.update((state) => { state.selected = null; state.detail = null; state.decision = null; state.error = '' })
      },
      decideReview: (approved) => { this.decide(approved) },
      openProgress: (id) => {
        if (this.isClosed() || this.store.getSnapshot().busy) return
        this.store.update((state) => {
          state.selected = null; state.detail = null; state.decision = null; state.error = ''
          state.progress = { id, detail: null, error: '' }
        })
        void this.enqueue(() => this.readProgress())
      },
      closeProgress: () => { this.store.update((state) => { state.progress = null }) },
      followProcess: (id) => {
        if (this.isClosed() || this.store.getSnapshot().busy) return
        this.store.update((state) => { state.busy = true; state.error = '' })
        void this.enqueue(async () => {
          try { unwrap(await this.api.followFromConversation(this.sessionId, id)); await this.read() } finally {
            if (!this.isClosed()) this.store.update((state) => { state.busy = false })
          }
        })
      },
    }
  }

  /** Refresh pending tasks and any open detail; overlapping refreshes share one operation. @returns settled read. */
  load(): Promise<void> {
    if (this.isClosed()) return Promise.resolve()
    return this.operation ?? this.enqueue(() => this.read())
  }

  private async read(): Promise<void> {
    if (this.isClosed()) return
    const inbox = unwrap(await this.api.conversationReviews(this.sessionId))
    if (this.isClosed()) return
    this.store.update((state) => { state.inbox = inbox; state.error = inbox.error })
    if (inbox.error) {
      this.store.update((state) => { if (state.progress) state.progress.error = inbox.error })
      return
    }
    const selected = this.store.getSnapshot().selected
    if (selected) {
      const detail = unwrap(await this.api.conversationReviewDetail(this.sessionId, selected.processId, selected.taskId))
      if (!this.isClosed() && this.store.getSnapshot().selected === selected) this.store.update((state) => { state.detail = detail })
    }
    await this.readProgress()
  }

  private async readProgress(): Promise<void> {
    const selected = this.store.getSnapshot().progress
    if (this.isClosed() || !selected) return
    try {
      const detail = unwrap(await this.api.conversationProcessDetail(this.sessionId, selected.id))
      if (!this.isClosed() && this.store.getSnapshot().progress === selected) this.store.update((state) => {
        state.progress = { id: selected.id, detail, error: '' }
      })
    } catch (error: unknown) {
      if (!this.isClosed() && this.store.getSnapshot().progress === selected) this.store.update((state) => {
        state.progress = { ...selected, error: error instanceof Error ? error.message : 'WORKFLOW_PROGRESS_FAILED' }
      })
    }
  }

  private decide(approved: boolean): void {
    const { selected, detail, busy, error, decision } = this.store.getSnapshot()
    if (this.isClosed() || busy || error || decision || !selected || !detail || detail.inputJson === null) return
    this.store.update((state) => { state.busy = true; state.error = '' })
    void this.enqueue(async () => {
      try {
        const process = unwrap(await this.api.reviewFromConversation(this.sessionId, selected.processId, selected.taskId, approved))
        if (this.isClosed()) return
        if (this.store.getSnapshot().selected === selected) this.store.update((state) => {
          state.detail = { process, inputJson: null }; state.decision = approved ? 'approved' : 'rejected'
        })
        this.onDecision()
        await this.read()
      } finally {
        if (!this.isClosed()) this.store.update((state) => { state.busy = false })
      }
    })
  }

  private enqueue(operation: () => Promise<void>): Promise<void> {
    if (this.isClosed()) return Promise.resolve()
    clearTimeout(this.timer)
    const pending = (this.operation ?? Promise.resolve()).then(operation).catch((error: unknown) => {
      if (!this.isClosed()) this.store.update((state) => { state.error = error instanceof Error ? error.message : 'WORKFLOW_REVIEW_FAILED' })
    }).finally(() => {
      if (this.operation !== pending) return
      this.operation = undefined
      const interval = this.store.getSnapshot().inbox?.refreshIntervalMs
      if (!this.isClosed() && interval) this.timer = setTimeout(() => { void this.load() }, interval)
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
