// @vitest-environment jsdom
import { render, screen, fireEvent } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { cleanup } from '@testing-library/react'
import { stubSettingsScope } from '@deepseek-ai/dsh-client-test-runtime'
import { RagflowCardController, type RagflowSettings } from '../src/client/ragflow-card-controller.ts'
import type { RagflowCardProps } from '../src/client/RagflowCard.tsx'
import { RagflowCard } from '../src/client/RagflowCard.tsx'
import { zh, type PluginsSettingsLocaleKey } from '../src/client/locales.ts'

afterEach(cleanup)
it('shows the native RAGFlow card and stages service address, datasets and enablement', async () => {
  const host = stubSettingsScope<RagflowSettings>()
  host.publish({ status: 'ready', writable: true, value: { baseURL: 'http://localhost:9380', datasetIds: [], enabled: false }, base: {}, user: {} })
  const describe = vi.fn(async () => ({ ok: true, value: { RAGFLOW_API_KEY: { configured: true, writable: true } } }))
  const set = vi.fn(async () => ({ ok: true, value: undefined }))
  const controller = new RagflowCardController(host.scope, { remote: { credentials: { describe, set } } } as never)
  const face = controller.inject()
  await vi.waitFor(() => { expect(face.hooks.ragflowCard.getSnapshot().apiKeyConfigured).toBe(true) })
  const props = {
    ...face,
    useRagflowCard: (selector: (state: unknown) => unknown) => selector(face.hooks.ragflowCard.getSnapshot()),
    t: (key: PluginsSettingsLocaleKey) => zh[key],
  } as unknown as RagflowCardProps
  render(<RagflowCard {...props} />)
  fireEvent.click(screen.getByRole('button', { name: '展开设置: RAGFlow 连接器' }))
  expect(screen.getByText('已配置 API Key。')).toBeTruthy()
  fireEvent.change(screen.getByLabelText('RAGFlow 服务地址'), { target: { value: 'http://localhost:9381' } })
  fireEvent.change(screen.getByLabelText('允许检索的知识库 ID'), { target: { value: 'kb_a, kb_b, kb_a' } })
  fireEvent.click(screen.getByRole('checkbox', { name: '启用 RAGFlow 连接' }))
  const state = face.hooks.ragflowCard.getSnapshot()
  expect(state.baseURL.text).toBe('http://localhost:9381')
  expect(state.enabled.text).toBe('true')
  expect(host.mutate).not.toHaveBeenCalled()
  expect(set).not.toHaveBeenCalled()
})
it('writes the API Key through credentials without including it in settings mutations', async () => {
  const host = stubSettingsScope<RagflowSettings>()
  host.publish({ status: 'ready', writable: true, value: { baseURL: 'http://localhost:9380', datasetIds: [], enabled: false }, base: {}, user: {} })
  const describe = vi.fn(async () => ({ ok: true, value: { RAGFLOW_API_KEY: { configured: true, writable: true } } }))
  const set = vi.fn(async () => ({ ok: true, value: undefined }))
  const controller = new RagflowCardController(host.scope, { remote: { credentials: { describe, set } } } as never)
  const face = controller.inject()
  face.edit('apiKey', 'new-private-key')
  face.save()
  await vi.waitFor(() => { expect(set).toHaveBeenCalledWith('RAGFLOW_API_KEY', 'new-private-key') })
  expect(JSON.stringify(host.mutate.mock.calls)).not.toContain('new-private-key')
})
