// @vitest-environment jsdom
import { useSyncExternalStore } from 'react'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { stubSettingsScope } from '@deepseek-ai/dsh-client-test-runtime'
import { RagflowCardController, type RagflowSettings } from '../src/client/ragflow-card-controller.ts'
import type { RagflowCardProps } from '../src/client/RagflowCard.tsx'
import { RagflowCard } from '../src/client/RagflowCard.tsx'
import { zh, type PluginsSettingsLocaleKey } from '../src/client/locales.ts'

const controllers: RagflowCardController[] = []
afterEach(() => { cleanup(); for (const controller of controllers.splice(0)) controller.dispose() })
function bench(selected: string[] = [], configured = true) {
  const host = stubSettingsScope<RagflowSettings>()
  host.publish({ status: 'ready', writable: true, value: { baseURL: 'http://localhost:9380', datasetIds: selected, enabled: false }, base: {}, user: {}, revision: 1 })
  const describe = vi.fn(async () => ({ ok: true, value: { RAGFLOW_API_KEY: { configured, writable: true } } }))
  const set = vi.fn(async () => ({ ok: true, value: undefined }))
  const listDatasets = vi.fn(async (page: number, _signal: AbortSignal) => ({ ok: true, value: { datasets: page === 1 ? [{ id: 'kb_a', name: '质量知识库' }] : [{ id: 'kb_b', name: '设备知识库' }], page, has_more: page === 1 } }))
  const controller = new RagflowCardController(host.scope, {
    remote: { credentials: { describe, set }, ragflow: { listDatasets } },
  } as never)
  controllers.push(controller)
  const face = controller.inject()
  function View() {
    const state = useSyncExternalStore(listener => face.hooks.ragflowCard.subscribe(listener), () => face.hooks.ragflowCard.getSnapshot())
    const props = {
      ...face,
      useRagflowCard: (selector: (value: typeof state) => unknown) => selector(state),
      t: (key: PluginsSettingsLocaleKey) => zh[key],
    } as unknown as RagflowCardProps
    return <RagflowCard {...props} />
  }
  return { host, describe, set, listDatasets, controller, face, View }
}

it('selects knowledge bases by name across pages and stages only IDs until save', async () => {
  const { host, set, face, View } = bench()
  render(<View />)
  fireEvent.click(screen.getByRole('button', { name: '展开设置: RAGFlow 连接器' }))
  await screen.findByText('已配置 API Key。')
  fireEvent.click(screen.getByLabelText('允许检索的知识库'))
  fireEvent.click(await screen.findByRole('checkbox', { name: '质量知识库' }))
  fireEvent.click(screen.getByRole('button', { name: '加载更多' }))
  fireEvent.click(await screen.findByRole('checkbox', { name: '设备知识库' }))
  expect(face.hooks.ragflowCard.getSnapshot().datasetIds.text).toBe('kb_a, kb_b')
  expect(host.mutate).not.toHaveBeenCalled()
  expect(set).not.toHaveBeenCalled()
  fireEvent.keyDown(screen.getByRole('dialog', { name: '允许检索的知识库' }), { key: 'Escape' })
  expect(screen.queryByRole('dialog', { name: '允许检索的知识库' })).toBeNull()
  expect(screen.getByLabelText('允许检索的知识库').textContent).toContain('质量知识库、设备知识库')
  fireEvent.click(screen.getByRole('button', { name: '保存' }))
  await vi.waitFor(() => { expect(host.set).toHaveBeenCalledWith('datasetIds', ['kb_a', 'kb_b']) })
  expect(JSON.stringify(host.set.mock.calls)).not.toContain('知识库')
})
it('searches names, discards drafts, and preserves saved IDs whose names are not loaded', async () => {
  const { face, View } = bench(['kb_old'])
  render(<View />)
  fireEvent.click(screen.getByRole('button', { name: '展开设置: RAGFlow 连接器' }))
  fireEvent.click(screen.getByLabelText('允许检索的知识库'))
  await screen.findByRole('checkbox', { name: '质量知识库' })
  expect(screen.getByRole<HTMLInputElement>('checkbox', { name: /已选知识库，名称尚未加载/ }).checked).toBe(true)
  fireEvent.change(screen.getByRole('searchbox', { name: '搜索已加载的知识库' }), { target: { value: '质量' } })
  expect(screen.queryByRole('checkbox', { name: /名称尚未加载/ })).toBeNull()
  fireEvent.click(screen.getByRole('checkbox', { name: '质量知识库' }))
  expect(face.hooks.ragflowCard.getSnapshot().datasetIds.text).toBe('kb_old, kb_a')
  fireEvent.click(screen.getByRole('button', { name: '放弃修改' }))
  expect(face.hooks.ragflowCard.getSnapshot().datasetIds.text).toBe('kb_old')
})
it('retains selection on a failed refresh and ignores a response from an old connection', async () => {
  const { face, listDatasets, host, controller } = bench(['kb_a'])
  await vi.waitFor(() => { expect(face.hooks.ragflowCard.getSnapshot().catalogStatus).toBe('ready') })
  listDatasets.mockRejectedValueOnce(new Error('offline'))
  face.loadDatasets()
  await vi.waitFor(() => { expect(face.hooks.ragflowCard.getSnapshot().catalogStatus).toBe('error') })
  expect(face.hooks.ragflowCard.getSnapshot().datasetIds.text).toBe('kb_a')
  let finish!: (value: Awaited<ReturnType<typeof listDatasets>>) => void
  listDatasets.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve }))
  face.loadDatasets()
  const signal = listDatasets.mock.calls.at(-1)![1]
  host.publish({ value: { baseURL: 'http://localhost:9381', datasetIds: ['kb_a'] } })
  await vi.waitFor(() => { expect(face.hooks.ragflowCard.getSnapshot().catalogStatus).toBe('ready') })
  finish({ ok: true, value: { datasets: [{ id: 'stale', name: '过期知识库' }], page: 1, has_more: false } })
  await Promise.resolve()
  expect(signal.aborted).toBe(true)
  expect(face.hooks.ragflowCard.getSnapshot().datasets.some(row => row.id === 'stale')).toBe(false)
  const listeners = host.listenerCount()
  controller.dispose()
  expect(host.listenerCount()).toBe(listeners - 1)
})
it('writes the API Key through credentials without including it in settings mutations', async () => {
  const { face, set, host } = bench()
  face.edit('apiKey', 'new-private-key')
  face.save()
  await vi.waitFor(() => { expect(set).toHaveBeenCalledWith('RAGFLOW_API_KEY', 'new-private-key') })
  expect(JSON.stringify(host.mutate.mock.calls)).not.toContain('new-private-key')
})
it('requires saving endpoint or key edits before loading that catalog', async () => {
  const { face, listDatasets } = bench([], false)
  await vi.waitFor(() => { expect(face.hooks.ragflowCard.getSnapshot().apiKeyConfigured).toBe(false) })
  face.edit('baseURL', 'http://localhost:9381')
  face.loadDatasets()
  expect(face.hooks.ragflowCard.getSnapshot().catalogNeedsSave).toBe(true)
  expect(listDatasets).not.toHaveBeenCalled()
})
