/** Session-owned projection of the server binding; reloads on open and reconnect. */
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-api-remotes/client'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { RemoteResult } from '@deepseek-ai/dsh-typert-protocol'
import { createSnapshotStore, type SnapshotStore } from '@deepseek-ai/dsh-client-store'
import type { ConversationWorkflowState, WorkflowChoice } from '../shared/runtime.ts'

/** Accepted selector state; pending writes retain the committed choice. */
export interface ConversationChoiceState {
  value: ConversationWorkflowState | null
  busy: boolean
  error: string
}
/** Plain selector callbacks and renderer-owned observation. */
export interface ConversationChoiceFace {
  hooks: { workflowChoice: SnapshotStore<ConversationChoiceState> }
  reload: () => void
  choose: (choice: WorkflowChoice | null) => Promise<boolean>
}
const unwrap = <T>(value: RemoteResult<T>): T => {
  if (!value.ok) throw new Error(value.error.message)
  return value.value
}

/** Own one Session's selector reads and mutations, drained by the Session scope. */
export class ConversationChoiceController {
  private readonly store = createSnapshotStore<ConversationChoiceState>({ value: null, busy: false, error: '' })
  private pending: Promise<void> | undefined
  private closed = false
  constructor(private readonly api: Context['remote']['businessWorkflows'], private readonly sessionId: SessionId) {}

  /** Obtain callbacks and the standard slot hook source. @returns the selector face. */
  face(): ConversationChoiceFace {
    return { hooks: { workflowChoice: this.store }, reload: () => { void this.load() }, choose: choice => this.select(choice) }
  }

  /** Refresh on mount, menu open, or reconnection. @returns the shared pending operation. */
  load(): Promise<void> {
    if (this.closed) return Promise.resolve()
    if (this.pending) return this.pending
    return this.perform(async () => unwrap(await this.api.conversationWorkflow(this.sessionId)))
  }

  private async select(choice: WorkflowChoice | null): Promise<boolean> {
    if (this.closed || this.pending) return false
    const current = this.store.getSnapshot().value
    if (!current) return false
    let accepted = false
    await this.perform(async () => {
      const value = unwrap(await this.api.selectConversationWorkflow(this.sessionId, { expectedRevision: current.revision,
        selection: choice ? { id: choice.id, version: choice.version } : null }))
      accepted = true
      return value
    })
    return accepted
  }

  private perform(operation: () => Promise<ConversationWorkflowState>): Promise<void> {
    this.store.update((state) => { state.busy = true; state.error = '' })
    this.pending = operation().then((value) => {
      if (!this.closed) this.store.update((state) => { state.value = value })
    }).catch((error: unknown) => {
      if (!this.closed) this.store.update((state) => { state.error = error instanceof Error ? error.message : 'WORKFLOW_SELECTION_FAILED' })
    }).finally(() => {
      this.pending = undefined
      if (!this.closed) this.store.update((state) => { state.busy = false })
    })
    return this.pending
  }

  /** Stop accepting work and drain the submitted operation. @returns after quiescence. */
  async dispose(): Promise<void> { this.closed = true; await this.pending }
}
