/** Opt-in real Flowable acceptance; each run owns a separate tenant and cleans its deployments. */
import Storage, { storageBackendServiceKey } from '@deepseek-ai/dsh-storage'
import * as StorageDomain from '@deepseek-ai/dsh-storage-domain'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import { MemoryStorageBackend } from '../../../storage/storage-domain/tests/helpers/memory-backend.ts'
import { randomUUID } from 'node:crypto'
import { Context } from '@deepseek-ai/cordis'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import BusinessWorkflows, { type Config } from '../src/index.ts'
import { createTemplate, serializeDraft } from '../src/shared/draft.ts'
import { FlowableClient, string } from '../src/host/flowable.ts'
import type { ProcessId, WorkItemId } from '../src/shared/runtime.ts'
import type { WorkflowDraft } from '../src/shared/types.ts'

const password = process.env.DSH_FLOWABLE_TEST_PASSWORD
const baseUrl = process.env.DSH_FLOWABLE_TEST_URL

describe.skipIf(!password || !baseUrl)('business workflow against Flowable', () => {
  const tenant = `dh-test-${randomUUID().slice(0, 12)}`
  const config: Config = { baseUrl: baseUrl ?? '', username: 'dh-workflow', passwordEnv: 'TEST_PASSWORD', tenantId: tenant,
    requestTimeoutMs: 5000, pollIntervalMs: 100, analysisTimeoutMs: 1000, lockDurationMs: 30000, maxTemplates: 8 }
  const ctx = new Context()
  let fiber: ReturnType<typeof ctx.plugin>
  let service: BusinessWorkflows
  const api = new FlowableClient(config, () => Promise.resolve(password ?? ''), new AbortController().signal)
  const fixture = (): WorkflowDraft => {
    const draft = createTemplate('real', 'Flowable integration test', '', [
      { kind: 'start', name: 'Start' }, { kind: 'action', action: 'core.echo', name: 'Pass data' },
      { kind: 'human', name: 'Review', role: 'Reviewer' }, { kind: 'wait', name: 'Wait for receipt' },
      { kind: 'condition', name: 'Approved?', instruction: 'approved is true' },
      { kind: 'end', name: 'Passed' }, { kind: 'end', name: 'Failed' },
    ])
    Object.assign(draft.nodes[4]!, { source: '', field: 'approved', otherwise: 'real-6' })
    draft.nodes[5]!.next = ''
    draft.nodes[6]!.source = 'real-4'
    return draft
  }

  beforeAll(async () => {
    // Agent calls are covered by the built Loader/replay scenario. This suite
    // drives only native engine tasks and the deterministic input-pass handler.
    for (const name of ['typert', 'agentDefaultModel', 'sessions'] as const) ctx.provide(name, {} as never)
    ctx.provide('agents', { list: () => [], get: () => undefined, currentInitiator: () => undefined } as never)
    await ctx.plugin(Storage).await()
    const backend = new MemoryStorageBackend()
    ctx.storage.backend.register('memory', backend)
    ctx.provide(storageBackendServiceKey('memory'), backend)
    await ctx.plugin(StorageDomain, { backend: 'memory' }).await()
    await ctx.plugin(SystemPrompt).await()
    await ctx.plugin(ToolRuntime).await()
    ctx.provide('credentials', { resolve: () => Promise.resolve({ value: password, source: 'env' }) } as never)
    fiber = ctx.plugin(BusinessWorkflows, config)
    await fiber.await()
    service = ctx.businessWorkflows
  })
  afterAll(async () => {
    await ctx.fiber.dispose()
    const deployments = await api.list(`service/repository/deployments?tenantId=${tenant}&size=100`)
    for (const deployment of deployments) await api.request(`service/repository/deployments/${string(deployment.id)}?cascade=true`, 'DELETE')
  })

  it('persists publications, validates inputs, rejects stale edits, and pins accepted runs', async () => {
    const draft = fixture()
    draft.description = 'Verify inventory data with explicit human review'
    draft.inputs = [{ name: 'approved', description: 'Approval flag', type: 'boolean', required: true }]
    let saved = await service.saveTemplate({ id: draft.id, expectedRevision: 0, draftJson: serializeDraft(draft) })
    await expect(service.startPublished({ id: draft.id, version: 1, requestId: randomUUID(), inputJson: '{}' })).rejects.toThrow('WORKFLOW_PUBLICATION_NOT_CURRENT')
    saved = await service.publishTemplate(saved.id, saved.revision)
    expect(saved.published?.version).toBe(1)
    await expect(service.saveTemplate({ id: draft.id, expectedRevision: 0, draftJson: serializeDraft(draft) })).rejects.toThrow('WORKFLOW_REVISION_CONFLICT')
    for (const inputJson of ['{}', '{"approved":"yes"}', '{"approved":true,"extra":1}']) {
      await expect(service.startPublished({ id: draft.id, version: 1, requestId: randomUUID(), inputJson })).rejects.toThrow()
    }
    const request = { id: draft.id, version: 1, requestId: randomUUID(), inputJson: '{"approved":true}' }
    const run = await service.startPublished(request)
    expect((await service.startPublished(request)).id).toBe(run.id)
    draft.name = 'Changed editable draft'
    saved = await service.saveTemplate({ id: draft.id, expectedRevision: saved.revision, draftJson: serializeDraft(draft) })
    expect(saved.published?.draftJson).not.toContain('Changed editable draft')
    await fiber.dispose()
    expect(ctx.tools.get('business_workflow_start')).toBeUndefined()
    fiber = ctx.plugin(BusinessWorkflows, config)
    await fiber.await()
    service = ctx.businessWorkflows
    expect((await service.templates())[0]?.draftJson).toContain('Changed editable draft')
    expect((await service.detail(run.id)).workflowVersion).toBe(1)
    saved = await service.publishTemplate(saved.id, saved.revision)
    expect(saved.published?.version).toBe(2)
    await expect(service.startPublished({ ...request, requestId: randomUUID() })).rejects.toThrow('WORKFLOW_PUBLICATION_NOT_CURRENT')
    await service.unpublishTemplate(saved.id, saved.revision)
    await expect(service.startPublished({ ...request, version: 2, requestId: randomUUID() })).rejects.toThrow('WORKFLOW_PUBLICATION_NOT_CURRENT')
    expect((await service.detail(run.id)).name).not.toBe(draft.name)
    await service.cancel(run.id)
  })

  it('reports the actual version and preserves gates and history across DH reload', async () => {
    expect(await service.health()).toMatchObject({ connected: true, version: '8.0.0' })
    const request = { requestId: randomUUID(), draftJson: serializeDraft(fixture()), inputJson: '{"approved":true}' }
    const initial = await service.start(request)
    expect((await service.start(request)).id).toBe(initial.id)
    await expect.poll(async () => (await service.detail(initial.id)).items.map(item => item.kind)).toEqual(['human'])
    let run = await service.detail(initial.id)
    expect(run.results.some(result => result.nodeId === 'real-1')).toBe(true)
    await expect(service.arrive(run.id, 'not-current' as WorkItemId)).rejects.toThrow('CURRENT_WAIT_REQUIRED')
    const humanId = run.items[0]!.id
    await fiber.dispose()
    fiber = ctx.plugin(BusinessWorkflows, config)
    await fiber.await()
    service = ctx.businessWorkflows
    expect((await service.detail(run.id)).items[0]!.id).toBe(humanId)
    const approving = service.review(run.id, humanId, true)
    await expect(service.review(run.id, humanId, false)).rejects.toThrow('WORKFLOW_REVIEW_BUSY')
    run = await approving
    expect(run.items.map(item => item.kind)).toEqual(['wait'])
    await expect(service.review(run.id, humanId, true)).rejects.toThrow('CURRENT_HUMAN_TASK_REQUIRED')
    await service.arrive(run.id, run.items[0]!.id)
    await expect.poll(async () => (await service.detail(run.id)).status).toBe('completed')
    run = await service.detail(run.id)
    expect(run.completed).toContain('real-5')
    expect(run.completed).not.toContain('real-6')
  })

  it('routes false conditions, cancels rejections, and blocks missing connectors', async () => {
    let run = await service.start({ requestId: randomUUID(), draftJson: serializeDraft(fixture()), inputJson: '{"approved":false}' })
    await expect.poll(async () => (await service.detail(run.id)).items.map(item => item.kind)).toEqual(['human'])
    run = await service.detail(run.id)
    run = await service.review(run.id, run.items[0]!.id, true)
    await service.arrive(run.id, run.items[0]!.id)
    await expect.poll(async () => (await service.detail(run.id)).status).toBe('completed')
    expect((await service.detail(run.id)).completed).toContain('real-6')
    const draft = fixture()
    draft.nodes[1]!.action = 'mes.read'
    run = await service.start({ requestId: randomUUID(), draftJson: serializeDraft(draft), inputJson: '{}' })
    expect(run.items[0]).toMatchObject({ status: 'unavailable', kind: 'action' })
    await expect(service.review(run.id, run.items[0]!.id, true)).rejects.toThrow('CURRENT_HUMAN_TASK_REQUIRED')
    expect((await service.cancel(run.id)).status).toBe('canceled')
    run = await service.start({ requestId: randomUUID(), draftJson: serializeDraft(fixture()), inputJson: '{}' })
    await expect.poll(async () => (await service.detail(run.id)).items.map(item => item.kind)).toEqual(['human'])
    run = await service.detail(run.id)
    expect((await service.review(run.id, run.items[0]!.id, false)).status).toBe('canceled')
  })

  it('refuses foreign process identities and malformed draft input', async () => {
    await expect(service.start({ requestId: randomUUID(), draftJson: '{}', inputJson: '{}' })).rejects.toThrow()
    await expect(service.detail('not-an-owned-process' as ProcessId)).rejects.toThrow()
  })

  it('shows terminal worker failures without advancing or retrying the node', async () => {
    const draft = fixture()
    draft.nodes[1]!.field = 'missing'
    const run = await service.start({ requestId: randomUUID(), draftJson: serializeDraft(draft), inputJson: '{}' })
    await expect.poll(async () => (await service.detail(run.id)).items[0]?.status).toBe('failed')
    const detail = await service.detail(run.id)
    expect(detail.items[0]).toMatchObject({ nodeId: 'real-1', error: 'WORKFLOW_INPUT_NOT_AVAILABLE' })
    expect(detail.completed).not.toContain('real-1')
    expect(detail.items.some(item => item.kind === 'human')).toBe(false)
    await service.cancel(run.id)
  })

  it('stops a WeCom action when the saved connector is unavailable', async () => {
    const draft = fixture()
    draft.nodes[1]!.action = 'wecom.todos.list'
    const run = await service.start({ requestId: randomUUID(), draftJson: serializeDraft(draft), inputJson: '{}' })
    await expect.poll(async () => (await service.detail(run.id)).items[0]?.error).toBe('WECOM_TODOS_UNAVAILABLE')
    expect((await service.detail(run.id)).completed).not.toContain('real-1')
    await service.cancel(run.id)
  })
})
