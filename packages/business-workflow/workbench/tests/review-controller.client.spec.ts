/** Review polling must not turn stale selections or duplicate clicks into another task's approval. */
import { brandString } from '@deepseek-ai/dsh-brand'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import { afterEach, expect, it, vi } from 'vitest'
import { ReviewController } from '../src/client/review-controller.ts'
import type { ConversationReviewDetail, ConversationReviewTask, ProcessId, WorkItemId } from '../src/shared/runtime.ts'

const owner = brandString<SessionId>('review-owner')
const task: ConversationReviewTask = { processId: brandString<ProcessId>('process'), taskId: brandString<WorkItemId>('task'), name: 'Review' }
const next = { ...task, taskId: brandString<WorkItemId>('next-task') }
const detail = (selected = task, inputJson: string | null = '"Evidence"'): ConversationReviewDetail => ({
  process: { id: selected.processId, name: 'Pinned workflow', status: 'running', startedAt: '', endedAt: '',
    draftJson: '', inputJson: '{}', ownerSessionId: owner, workflowId: 'review', workflowVersion: 1,
    items: [{ id: selected.taskId, nodeId: 'human', name: selected.name, kind: 'human', status: 'waiting', error: '' }], completed: [], results: [] }, inputJson,
})
const ok = <T>(value: T) => ({ ok: true as const, value })
afterEach(() => { vi.useRealTimers() })

it('coalesces polling, sends one exact decision, and refreshes pending tasks after commit', async () => {
  vi.useFakeTimers()
  let items = [task]
  const read = vi.fn(async () => ok({ items, total: items.length, following: [], refreshIntervalMs: 100, error: '' }))
  const review = vi.fn(async () => { items = []; return ok(detail().process) })
  const committed = vi.fn()
  const controller = new ReviewController({ conversationReviews: read,
    conversationReviewDetail: async () => ok(detail()), reviewFromConversation: review } as never, owner, committed)
  const face = controller.face(), source = face.hooks.workflowReviews
  await Promise.all([controller.load(), controller.load()])
  expect(read).toHaveBeenCalledTimes(1)
  face.openReview(task)
  await controller.load()
  face.decideReview(true); face.decideReview(false)
  await controller.load()
  expect(review).toHaveBeenCalledExactlyOnceWith(owner, task.processId, task.taskId, true)
  expect(committed).toHaveBeenCalledTimes(1)
  expect(source.getSnapshot().decision).toBe('approved')
  expect(source.getSnapshot().inbox?.items).toEqual([])
  await controller.dispose()
  const count = read.mock.calls.length
  await vi.advanceTimersByTimeAsync(1000)
  expect(read).toHaveBeenCalledTimes(count)
})

it('discards a replaced detail response and prevents an ended task from being submitted', async () => {
  let resolve!: (value: ReturnType<typeof ok<ConversationReviewDetail>>) => void
  const oldRead = new Promise<ReturnType<typeof ok<ConversationReviewDetail>>>((done) => { resolve = done })
  const review = vi.fn()
  const controller = new ReviewController({
    conversationReviews: async () => ok({ items: [next], total: 1, following: [], refreshIntervalMs: 1000, error: '' }),
    conversationReviewDetail: vi.fn().mockImplementationOnce(() => oldRead).mockResolvedValue(ok(detail(next, null))),
    reviewFromConversation: review,
  } as never, owner, () => {})
  const face = controller.face(), source = face.hooks.workflowReviews
  face.openReview(task)
  await vi.waitFor(() => { expect(source.getSnapshot().inbox?.total).toBe(1) })
  face.openReview(next)
  resolve(ok(detail()))
  await controller.load()
  expect(source.getSnapshot().selected?.taskId).toBe(next.taskId)
  expect(source.getSnapshot().detail?.inputJson).toBeNull()
  face.decideReview(true)
  expect(review).not.toHaveBeenCalled()
  await controller.dispose()
})

it('keeps retrying after an engine outage and recovers pending tasks', async () => {
  vi.useFakeTimers()
  const read = vi.fn().mockResolvedValueOnce(ok({ items: [], total: 0, following: [], refreshIntervalMs: 100, error: 'FLOWABLE_UNAVAILABLE' }))
    .mockResolvedValue(ok({ items: [task], total: 1, following: [], refreshIntervalMs: 100, error: '' }))
  const controller = new ReviewController({ conversationReviews: read } as never, owner, () => {})
  await controller.load()
  expect(controller.face().hooks.workflowReviews.getSnapshot().error).toBe('FLOWABLE_UNAVAILABLE')
  await vi.advanceTimersByTimeAsync(100)
  expect(controller.face().hooks.workflowReviews.getSnapshot().inbox?.items).toEqual([task])
  expect(controller.face().hooks.workflowReviews.getSnapshot().error).toBe('')
  await controller.dispose()
})

it('drains an accepted decision queued behind a read when its Session scope is disposed', async () => {
  let resolveRead!: (value: ReturnType<typeof ok<ConversationReviewDetail>>) => void
  const paused = new Promise<ReturnType<typeof ok<ConversationReviewDetail>>>((done) => { resolveRead = done })
  const readDetail = vi.fn().mockResolvedValueOnce(ok(detail())).mockReturnValueOnce(paused)
  const review = vi.fn(async () => ok(detail().process))
  const controller = new ReviewController({
    conversationReviews: async () => ok({ items: [task], total: 1, following: [], refreshIntervalMs: 1000, error: '' }),
    conversationReviewDetail: readDetail, reviewFromConversation: review,
  } as never, owner, () => {})
  const face = controller.face()
  face.openReview(task); await controller.load()
  const refreshing = controller.load()
  await vi.waitFor(() => { expect(readDetail).toHaveBeenCalledTimes(2) })
  face.decideReview(true)
  let drained = false
  const disposal = controller.dispose().then(() => { drained = true })
  await Promise.resolve()
  expect(drained).toBe(false)
  resolveRead(ok(detail()))
  await refreshing; await disposal
  expect(review).toHaveBeenCalledExactlyOnceWith(owner, task.processId, task.taskId, true)
  face.decideReview(false)
  expect(review).toHaveBeenCalledTimes(1)
})

it('reads progress only after inspection, retains evidence on failure, and stops detail polling after close', async () => {
  const process = detail().process
  const readProgress = vi.fn().mockResolvedValue(ok(process))
  const review = vi.fn()
  const controller = new ReviewController({
    conversationReviews: async () => ok({ items: [task], total: 1, following: [], refreshIntervalMs: 1000, error: '' }),
    conversationProcessDetail: readProgress, reviewFromConversation: review,
  } as never, owner, () => {})
  try {
    await controller.load()
    expect(readProgress).not.toHaveBeenCalled()
    const face = controller.face(), source = face.hooks.workflowReviews
    face.openProgress(task.processId)
    await controller.load()
    expect(readProgress).toHaveBeenCalledExactlyOnceWith(owner, task.processId)
    expect(source.getSnapshot().progress?.detail).toEqual(process)
    expect(source.getSnapshot().selected).toBeNull()
    face.decideReview(true)
    expect(review).not.toHaveBeenCalled()
    readProgress.mockRejectedValueOnce(new Error('FLOWABLE_UNAVAILABLE'))
    await controller.load()
    expect(source.getSnapshot().progress?.detail).toEqual(process)
    expect(source.getSnapshot().progress?.error).toBe('FLOWABLE_UNAVAILABLE')
    await controller.load()
    expect(source.getSnapshot().progress?.error).toBe('')
    face.closeProgress()
    const count = readProgress.mock.calls.length
    await controller.load()
    expect(readProgress).toHaveBeenCalledTimes(count)
  } finally { await controller.dispose() }
})

it('discards a progress response after selection replacement and drains a closed in-flight read', async () => {
  const first = Promise.withResolvers<ReturnType<typeof ok<ReturnType<typeof detail>['process']>>>()
  const second = Promise.withResolvers<ReturnType<typeof ok<ReturnType<typeof detail>['process']>>>()
  const readProgress = vi.fn().mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise)
  const controller = new ReviewController({
    conversationReviews: async () => ok({ items: [], total: 0, following: [], refreshIntervalMs: 1000, error: '' }),
    conversationProcessDetail: readProgress,
  } as never, owner, () => {})
  const face = controller.face(), source = face.hooks.workflowReviews
  try {
    face.openProgress(task.processId)
    await vi.waitFor(() => { expect(readProgress).toHaveBeenCalledTimes(1) })
    const other = brandString<ProcessId>('other-process')
    face.openProgress(other)
    first.resolve(ok(detail().process))
    await vi.waitFor(() => { expect(readProgress).toHaveBeenCalledTimes(2) })
    expect(source.getSnapshot().progress).toEqual({ id: other, detail: null, error: '' })
    face.closeProgress()
    const disposal = controller.dispose()
    second.resolve(ok({ ...detail().process, id: other }))
    await disposal
    expect(source.getSnapshot().progress).toBeNull()
  } finally {
    first.resolve(ok(detail().process)); second.resolve(ok(detail().process))
    await controller.dispose()
  }
})
