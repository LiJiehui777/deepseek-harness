import { executeOne } from './execute.ts'
/** Actual Flowable and shipped connector execution, with fixture CLI and model responses. */
import { randomUUID } from 'node:crypto'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { chromium } from 'playwright'
import { brandString } from '@deepseek-ai/dsh-brand'
import { LlmAdapter } from '@deepseek-ai/dsh-llm'
import type { GenerateOptions, LlmModelInfo, LlmProviderInfo, StreamChunk, ToolCallId } from '@deepseek-ai/dsh-llm'
import { describe, expect, it } from 'vitest'
import { captureStableAria, compareOrRefreshGolden, launchWebScaffold, watchConsole, webSnapshotMode } from '../../../../apps/web/tests/scaffold.ts'
import { REPO_ROOT } from '../../../../apps/web/tests/support.ts'
import { FlowableClient, string } from '../src/host/flowable.ts'
import type { SessionId } from '@deepseek-ai/dsh-session'
import type { ProcessId } from '../src/shared/runtime.ts'
import type {} from '@deepseek-ai/dsh-enterprise-connectors'

const baseUrl = process.env.DSH_FLOWABLE_TEST_URL
const password = process.env.DSH_FLOWABLE_TEST_PASSWORD
const MODE = webSnapshotMode()
const summary = '待办 td_quality：Review inspection report。建议先核对检验报告，再由质量人员确认。本次只读取首 10 项未完成待办；返回 1 项，has_more=false，truncated=false。'

class TodoModel extends LlmAdapter {
  calls = 0
  chatCalls = 0
  ordinaryCalls = 0
  readonly analysisRelease = Promise.withResolvers<undefined>()
  override providerInfo(provider: string): LlmProviderInfo { return { id: provider, name: 'Workflow fixture' } }
  override listModels(provider: string): Promise<readonly LlmModelInfo[]> { return Promise.resolve([{ provider, id: 'fixture', name: 'Fixture' }]) }
  override async * stream(options: GenerateOptions): AsyncIterable<StreamChunk> {
    if ((options.tools ?? []).some(tool => tool.name === 'business_workflow_list')
      && !(options.tools ?? []).some(tool => tool.name === 'business_workflow_start')) {
      this.ordinaryCalls++
      expect(JSON.stringify(options.messages)).toContain('This conversation is in ordinary chat mode.')
      yield { type: 'block-start', index: 0, blockType: 'text' }
      yield { type: 'block-end', index: 0, block: { type: 'text', text: '请先在输入框旁手动选择企业微信待办整理工作流，再发送执行需求。' } }
      yield { type: 'finish', reason: { kind: 'stop' } }
      return
    }
    if ((options.tools ?? []).some(tool => tool.name === 'business_workflow_start')) {
      expect((options.tools ?? []).map(tool => tool.name).sort()).toEqual(['business_workflow_cancel', 'business_workflow_list', 'business_workflow_start', 'business_workflow_status'])
      expect(JSON.stringify(options.messages)).toContain('This conversation is bound to the selected published business workflow.')
      this.chatCalls++
      if (this.chatCalls <= 2) {
        const name = this.chatCalls === 1 ? 'business_workflow_list' : 'business_workflow_start'
        if (this.chatCalls === 2) expect(JSON.stringify(options.messages)).toContain('wecom-todos')
        const args = this.chatCalls === 1 ? {} : { workflowId: 'wecom-todos', version: 1, inputs: {} }
        yield { type: 'block-start', index: 0, blockType: 'tool-call' }
        yield { type: 'block-end', index: 0, block: { type: 'tool-call', id: brandString<ToolCallId>(`workflow-chat-${this.chatCalls}`), name, arguments: JSON.stringify(args) } }
        yield { type: 'finish', reason: { kind: 'tool-calls' } }
        return
      }
      expect(JSON.stringify(options.messages)).toContain('runId')
      if (this.chatCalls > 2) {
        expect(JSON.stringify(options.messages)).toContain('already-started workflow has completed')
        expect(JSON.stringify(options.messages)).toContain(summary)
      }
      yield { type: 'block-start', index: 0, blockType: 'text' }
      yield { type: 'block-end', index: 0, block: { type: 'text', text: '工作流已完成，人工审核通过。最终整理结果：' + summary } }
      yield { type: 'finish', reason: { kind: 'stop' } }
      return
    }
    this.calls++
    await this.analysisRelease.promise
    expect(options.tools ?? []).toEqual([])
    const input = JSON.stringify(options.messages)
    expect(input).toContain('td_quality')
    expect(input).toContain('Review inspection report')
    expect(input).not.toContain('fixture-secret')
    yield { type: 'block-start', index: 0, blockType: 'text' }
    yield { type: 'block-end', index: 0, block: { type: 'text', text: summary } }
    yield { type: 'finish', reason: { kind: 'stop' } }
  }
}

describe.skipIf(!baseUrl || !password || MODE === 'record')('WeCom → DH → Flowable review', () => {
  it('reads through the saved connector, passes reference data to DH, and stops at review', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'wecom-flowable-'))
    const tenant = `dh-wecom-${randomUUID().slice(0, 12)}`
    const overlayPath = join(directory, 'cordis.yml')
    const fixture = join(REPO_ROOT, 'packages/interaction/enterprise-connectors/tests/fixtures/wecom-office-cli.mjs')
    const base = (await readFile(join(REPO_ROOT, 'apps/cli/config/examples/ztt/cordis.yml'), 'utf8'))
      .replace('passwordEnv: DH_FLOWABLE_PASSWORD', 'passwordEnv: DSH_FLOWABLE_TEST_PASSWORD')
      .replace('tenantId: dh-business', `tenantId: ${tenant}`)
      .replace('baseUrl: http://127.0.0.1:8082/flowable-rest/', `baseUrl: ${baseUrl}`)
    await writeFile(overlayPath, base + '\n- id: agent-default-model\n  config:\n    provider: wecom-workflow-fixture\n    model: fixture\n'
      + '- insert:\n'
      + '    - id: office-connector\n      name: "@deepseek-ai/dsh-enterprise-connectors"\n      config:\n'
      + '        wecom:\n          websocketURL: ws://127.0.0.1:1\n        wecomOffice:\n          enabled: true\n          todos: true\n'
      + `        wecomOfficeRuntime:\n          directory: ${JSON.stringify(join(directory, 'account'))}\n`
      + `          command: ${JSON.stringify([process.execPath, fixture, directory])}\n        timeoutMs: 3000\n`)
    await writeFile(join(directory, 'approve'), '')
    const scaffold = await launchWebScaffold({ extraOverlayPath: overlayPath })
    const model = new TodoModel()
    const unregister = scaffold.ctx.llm.registerAdapter(['wecom-workflow-fixture'], model)
    const denials: Promise<boolean>[] = []
    const boundaries: Array<{ id: string; type: string; reason: string }> = []
    scaffold.ctx.on('session/event', (session, event) => {
      if (event.type === 'turn/start' || event.type === 'turn/end') boundaries.push({ id: session.id, type: event.type,
        reason: event.type === 'turn/end' ? event.data.reason.kind : '' })
    })
    scaffold.ctx.on('agent/created', ({ agent }) => {
      const names = agent.ctx.tools.schemas(agent).map(tool => tool.name)
      if (names.length !== 1 || names[0] !== 'wecom_office_list_todos') return
      for (const [name, args] of [
        ['wecom_office_list_todos', { page_size: 20, status_filter: ['proceed'] }],
        ['wecom_office_write', {}],
      ] as const) denials.push(executeOne(agent.ctx, { agent, name, arguments: args,
        callId: brandString<ToolCallId>(`denial-${name}`), signal: new AbortController().signal,
      }).then(result => result.isError))
    })
    const browser = await chromium.launch()
    try {
      await scaffold.ctx.enterpriseConnectors.authorizeWecomOffice()
      await expect.poll(async () => (await scaffold.ctx.enterpriseConnectors.wecomOfficeStatus()).state,
        { timeout: 30000 }).toBe('authorized')
      const page = await browser.newPage({ viewport: { width: 1680, height: 1100 }, locale: 'zh-CN' })
      const tripwire = watchConsole(page)
      await page.goto(scaffold.authenticatedUrl)
      await page.getByRole('button', { name: '工作流', exact: true }).click()
      const panel = page.locator('[data-business-workflow-view]')
      await panel.getByText('Flowable 8.0.0 已连接', { exact: true }).waitFor()
      const card = panel.getByRole('article').filter({ has: page.getByRole('heading', { name: '企业微信待办整理', exact: true }) })
      await card.getByRole('button', { name: '编辑流程', exact: true }).click()
      await panel.getByRole('button', { name: '保存到服务端', exact: true }).click()
      await panel.getByRole('button', { name: '发布给 DH 使用', exact: true }).click()
      await panel.getByText('已发布 · v1', { exact: true }).waitFor()
      await page.reload()
      await page.getByRole('button', { name: '工作流', exact: true }).click()
      await panel.locator('[data-saved-workflow="wecom-todos"]').getByText('已发布 · v1', { exact: true }).waitFor()
      // The actual chat uses normal logged tool calls; the worker starts an independent restricted analysis.
      await page.getByRole('button', { name: '新建会话', exact: true }).first().click()
      await page.getByRole('textbox', { name: '选择工作区' }).click()
      const workspace = join(scaffold.workspaceCwd, 'chat-workspace')
      await mkdir(workspace, { recursive: true })
      const picker = page.getByRole('dialog', { name: '选择工作区目录' })
      await picker.getByRole('button', { name: '编辑路径' }).click()
      const pathInput = picker.getByRole('textbox', { name: '编辑路径' })
      await pathInput.fill(workspace)
      await pathInput.press('Enter')
      await picker.getByRole('button', { name: '打开', exact: true }).click()
      const composer = page.locator('[data-composer-input][contenteditable="true"]').first()
      await composer.waitFor()
      await composer.fill('帮我整理待办')
      const ordinarySettled = scaffold.whenTurnSettled()
      await composer.press('Enter')
      const ordinaryId = await ordinarySettled
      expect(model.ordinaryCalls).toBe(1)
      expect(await scaffold.ctx.businessWorkflows.list()).toEqual([])
      const ordinaryOwner = scaffold.ctx.agents.get(ordinaryId)
      if (!ordinaryOwner) throw new Error('Ordinary conversation missing')
      const ordinaryStart = await executeOne(ordinaryOwner.ctx, { agent: ordinaryOwner, name: 'business_workflow_start',
        arguments: { workflowId: 'wecom-todos', version: 1, inputs: {} },
        callId: brandString<ToolCallId>('ordinary-denied'), signal: new AbortController().signal })
      expect(ordinaryStart.isError).toBe(true)
      expect(JSON.stringify(ordinaryStart)).toContain('WORKFLOW_SELECTION_REQUIRED')
      await expect(scaffold.ctx.agents.withInitiator(ordinaryOwner, () => scaffold.ctx.businessWorkflows.startPublished({
        id: 'wecom-todos', version: 1, requestId: randomUUID(), inputJson: '{}' }))).rejects.toThrow('WORKFLOW_USE_SELECTED_START_TOOL')
      await expect(scaffold.ctx.agents.withInitiator(ordinaryOwner, () => scaffold.ctx.businessWorkflows.start({
        requestId: randomUUID(), draftJson: '{}', inputJson: '{}' }))).rejects.toThrow('WORKFLOW_USE_SELECTED_START_TOOL')
      await expect(scaffold.ctx.agents.withInitiator(ordinaryOwner, () => scaffold.ctx.businessWorkflows.selectConversationWorkflow(
        ordinaryId, { expectedRevision: 0, selection: { id: 'wecom-todos', version: 1 } }))).rejects.toThrow('WORKFLOW_UI_ACTION_REQUIRED')
      expect((await scaffold.ctx.businessWorkflows.conversationWorkflow(ordinaryId)).selection).toBeNull()
      boundaries.length = 0
      await page.getByRole('button', { name: '选择工作流：普通聊天', exact: true }).click()
      await page.getByRole('menuitem', { name: '企业微信待办整理 · v1', exact: true }).click({ trial: true })
      const pickerAria = await captureStableAria(page, '[role="menu"]', scaffold.workspaceCwd)
      await compareOrRefreshGolden(join(import.meta.dirname, 'expected/workflow-chooser.expected.md'), pickerAria, MODE)
      await page.getByRole('menuitem', { name: '企业微信待办整理 · v1', exact: true }).click()
      await page.getByRole('button', { name: '选择工作流：企业微信待办整理 · v1', exact: true }).waitFor()
      expect(await scaffold.ctx.businessWorkflows.list()).toEqual([])
      await composer.fill('帮我整理待办')
      await composer.press('Enter')
      await expect.poll(() => model.chatCalls).toBe(2)
      const reviews = page.locator('[data-conversation-reviews]')
      await reviews.getByRole('heading', { name: '正在分析', exact: true }).waitFor({ timeout: 30000 })
      expect(await reviews.getByRole('button', { name: '查看并审核', exact: true }).count()).toBe(0)
      expect(await reviews.getByText('等待期间不调用模型', { exact: true }).count()).toBe(0)
      const runningAria = await captureStableAria(page, '[data-conversation-reviews]', scaffold.workspaceCwd)
      await compareOrRefreshGolden(join(import.meta.dirname, 'expected/conversation-running.expected.md'), runningAria, MODE)
      const progressScreenshots = process.env.DSH_WORKFLOW_SCREENSHOT_DIR
      if (progressScreenshots) {
        await mkdir(progressScreenshots, { recursive: true })
        await reviews.screenshot({ path: join(progressScreenshots, 'DH_执行中_浅色.png') })
      }
      await reviews.getByRole('button', { name: '查看进度', exact: true }).click()
      const progressDialog = page.getByRole('dialog', { name: '执行详情', exact: true })
      await progressDialog.getByText('DH 整理待办和建议', { exact: true }).waitFor()
      expect(await progressDialog.getByRole('button', { name: '审核通过并继续', exact: true }).count()).toBe(0)
      await progressDialog.getByText('运行信息', { exact: true }).click()
      const progressAria = await captureStableAria(page, '[data-conversation-progress-detail]', scaffold.workspaceCwd)
      await compareOrRefreshGolden(join(import.meta.dirname, 'expected/conversation-progress.expected.md'), progressAria, MODE)
      await progressDialog.getByRole('button', { name: '关闭执行详情', exact: true }).last().click()
      await page.setViewportSize({ width: 390, height: 844 })
      expect(await reviews.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true)
      const cardHeight = await reviews.locator('[data-review-process]').evaluate(element => element.getBoundingClientRect().height)
      expect(cardHeight).toBeLessThan(360)
      await page.emulateMedia({ colorScheme: 'dark' })
      await expect.poll(() => page.evaluate(() => document.body.hasAttribute('data-ds-dark-theme'))).toBe(true)
      if (progressScreenshots) await reviews.screenshot({ path: join(progressScreenshots, 'DH_执行中_深色窄屏.png') })
      await page.emulateMedia({ colorScheme: 'light' })
      await expect.poll(() => page.evaluate(() => document.body.hasAttribute('data-ds-dark-theme'))).toBe(false)
      await page.setViewportSize({ width: 1680, height: 1100 })
      model.analysisRelease.resolve(undefined)
      await page.reload()
      await page.getByRole('treeitem').filter({ hasText: '帮我整理待办' }).first().click()
      await page.getByRole('button', { name: '选择工作流：企业微信待办整理 · v1', exact: true }).waitFor()
      await reviews.getByRole('button', { name: '查看并审核', exact: true }).waitFor({ timeout: 30000 })
      const workflowGroup = reviews.getByRole('article', { name: '企业微信待办整理', exact: true })
      expect(await workflowGroup.count()).toBe(1)
      expect(await workflowGroup.getByRole('heading', { name: '确认待办处理建议', exact: true }).count()).toBe(1)
      expect(await reviews.getByText('确认待办处理建议', { exact: true }).count()).toBe(1)
      await page.setViewportSize({ width: 390, height: 844 })
      expect(await workflowGroup.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true)
      expect(await workflowGroup.getByRole('heading', { name: '需要你审核', exact: true }).count()).toBe(1)
      expect(await workflowGroup.getByRole('heading', { name: '企业微信待办整理', exact: true }).count()).toBe(0)
      expect(await reviews.getByText('实例编号', { exact: true }).count()).toBe(0)
      expect(await workflowGroup.getByRole('button', { name: '查看并审核', exact: true }).isVisible()).toBe(true)
      await workflowGroup.getByRole('button', { name: '更多操作', exact: true }).click()
      await page.getByRole('menuitem', { name: '刷新状态', exact: true }).waitFor()
      const menuBounds = await page.getByRole('menu').boundingBox()
      expect(menuBounds && menuBounds.x >= 0 && menuBounds.x + menuBounds.width <= 390).toBe(true)
      await page.keyboard.press('Escape')
      expect(await page.getByRole('menu').count()).toBe(0)
      const hierarchyScreenshots = process.env.DSH_WORKFLOW_SCREENSHOT_DIR
      if (hierarchyScreenshots) {
        await mkdir(hierarchyScreenshots, { recursive: true })
        await reviews.screenshot({ path: join(hierarchyScreenshots, 'DH_待审核_窄屏.png') })
      }
      await page.setViewportSize({ width: 1680, height: 1100 })
      if (progressScreenshots) await reviews.screenshot({ path: join(progressScreenshots, 'DH_待审核_浅色.png') })
      await reviews.getByRole('button', { name: '查看并审核', exact: true }).click()
      const reviewDialog = page.getByRole('dialog', { name: '工作流审核', exact: true })
      await reviewDialog.getByRole('heading', { name: '本次待审核内容', exact: true }).waitFor()
      expect(await reviewDialog.getByText(summary, { exact: true }).count()).toBe(1)
      const reviewCardAria = await captureStableAria(page, '[data-conversation-reviews]', scaffold.workspaceCwd)
      await compareOrRefreshGolden(join(import.meta.dirname, 'expected/conversation-reviews.expected.md'), reviewCardAria, MODE)
      const reviewDetailAria = await captureStableAria(page, '[role="dialog"]', scaffold.workspaceCwd)
      await compareOrRefreshGolden(join(import.meta.dirname, 'expected/conversation-review-detail.expected.md'), reviewDetailAria, MODE)
      await reviewDialog.getByRole('button', { name: '关闭审核详情', exact: true }).click()
      await page.getByRole('button', { name: '工作流', exact: true }).click()
      await panel.getByRole('button', { name: '引擎实例', exact: true }).click()
      await panel.getByRole('button', { name: '审核通过并继续', exact: true }).waitFor({ timeout: 30000 })
      const id = await panel.locator('[data-engine-process]').getAttribute('data-engine-process') as ProcessId
      let run = await scaffold.ctx.businessWorkflows.detail(id)
      expect(run.completed).toEqual(['wecom-todos-0', 'wecom-todos-1', 'wecom-todos-2'])
      expect(run.results.find(row => row.nodeId === 'wecom-todos-2')?.json).toContain(summary)
      expect(run.items.map(item => item.kind)).toEqual(['human'])
      expect(model.calls).toBe(1)
      expect(run.ownerSessionId).toBeTruthy()
      expect(run.workflowVersion).toBe(1)
      const owner = scaffold.ctx.agents.get(brandString<SessionId>(run.ownerSessionId))
      if (!owner) throw new Error('Workflow chat owner missing')
      const call = (name: string, args: unknown, callId: string, agent = owner) => executeOne(agent.ctx, { agent, name, arguments: args,
        callId: brandString<ToolCallId>(callId), signal: new AbortController().signal })
      expect(owner.status).toBe('running')
      expect(boundaries.filter(event => event.id === owner.id && event.type === 'turn/end')).toEqual([])
      expect(model.chatCalls).toBe(2)
      expect((await scaffold.ctx.businessWorkflows.conversationReviews(owner.id)).following).toMatchObject([{ processId: id, phase: 'human' }])
      const binding = await scaffold.ctx.businessWorkflows.conversationWorkflow(owner.id)
      expect(binding.selection).toMatchObject({ id: 'wecom-todos', version: 1 })
      let probeCalls = 0
      const removeProbe = owner.ctx.tools.register({ name: 'workflow_outside_probe', description: 'Test-only bypass probe',
        parameters: { type: 'object', properties: {} },
        output: { schema: { type: 'string' }, render: (_args, value) => [{ type: 'text', text: value as string }] },
        execute: () => { probeCalls++; return Promise.resolve('probe') },
      })
      expect((await call('workflow_outside_probe', {}, 'blocked-probe')).isError).toBe(true)
      expect(probeCalls).toBe(0)
      expect((await call('wecom_office_list_todos', { page_size: 10, status_filter: ['proceed'] }, 'direct-office-bypass')).isError).toBe(true)
      expect((await call('business_workflow_start', { workflowId: 'other-flow', version: 1, inputs: {} }, 'outside-selection')).isError).toBe(true)
      const status = await call('business_workflow_status', { runId: id }, 'query-owned')
      expect(status.isError).toBe(false)
      expect(status.value).toMatchObject({ awaitingHuman: true, runId: id })
      const replayed = await call('business_workflow_start', { workflowId: 'wecom-todos', version: 1, inputs: {} }, 'workflow-chat-2')
      expect(replayed.value).toMatchObject({ runId: id })
      expect((await call('business_workflow_start', { workflowId: 'wecom-todos', version: 1, inputs: { sessionId: 'forged' } }, 'invalid-input')).isError).toBe(true)
      const foreign = await scaffold.ctx.agents.create({ sessionId: brandString<SessionId>(randomUUID()),
        meta: { cwd: workspace }, signal: new AbortController().signal })
      const localParent = foreign.agent.session.header.id
      await scaffold.ctx.sessions.flush(foreign.agent.session)
      await foreign.dispose()
      const localFork = await scaffold.ctx.agents.create({ sessionId: brandString<SessionId>(randomUUID()),
        meta: { cwd: workspace, parentSession: localParent }, signal: new AbortController().signal })
      const remoteId = brandString<SessionId>(`enterprise-workflow-${randomUUID()}`)
      const remote = await scaffold.ctx.agents.create({ sessionId: remoteId, meta: { cwd: workspace },
        signal: new AbortController().signal })
      await scaffold.ctx.sessions.flush(remote.agent.session)
      await remote.dispose()
      const fork = await scaffold.ctx.agents.create({ sessionId: brandString<SessionId>(randomUUID()),
        meta: { cwd: workspace, parentSession: remoteId }, signal: new AbortController().signal })
      try {
        expect((await call('business_workflow_list', {}, 'local-fork-list', localFork.agent)).isError).toBe(false)
        expect((await call('business_workflow_status', { runId: id }, 'foreign-status', localFork.agent)).isError).toBe(true)
        expect((await scaffold.ctx.businessWorkflows.conversationReviews(localFork.agent.id)).items).toEqual([])
        await expect(scaffold.ctx.businessWorkflows.conversationProcessDetail(localFork.agent.id, id))
          .rejects.toThrow('WORKFLOW_PROCESS_NOT_OWNED_BY_CONVERSATION')
        await expect(scaffold.ctx.businessWorkflows.conversationReviewDetail(localFork.agent.id, id, run.items[0]!.id))
          .rejects.toThrow('WORKFLOW_PROCESS_NOT_OWNED_BY_CONVERSATION')
        await expect(scaffold.ctx.businessWorkflows.reviewFromConversation(localFork.agent.id, id, run.items[0]!.id, true))
          .rejects.toThrow('WORKFLOW_PROCESS_NOT_OWNED_BY_CONVERSATION')
        expect((await call('business_workflow_cancel', { runId: id }, 'foreign-cancel', localFork.agent)).isError).toBe(true)
        expect((await call('business_workflow_start', { workflowId: 'wecom-todos', version: 1, inputs: {} }, 'remote-fork-start', fork.agent)).isError).toBe(true)
      } finally { await localFork.dispose(); await fork.dispose() }
      // Chat tools have no approval entry point; native review remains current.
      expect(scaffold.ctx.tools.get('business_workflow_approve')).toBeUndefined()
      expect((await scaffold.ctx.businessWorkflows.detail(id)).items.map(item => item.kind)).toEqual(['human'])
      expect(await Promise.all(denials)).toEqual([true, true])
      await panel.locator('summary').filter({ hasText: 'DH 整理待办和建议' }).click()
      const aria = (await captureStableAria(page, '[data-business-workflow-view]', scaffold.workspaceCwd)).split(run.ownerSessionId).join('<session-id>')
      await compareOrRefreshGolden(join(import.meta.dirname, 'expected/wecom-human.expected.md'), aria, MODE)
      const screenshots = process.env.DSH_WORKFLOW_SCREENSHOT_DIR
      if (screenshots) {
        await mkdir(screenshots, { recursive: true })
        await page.screenshot({ path: join(screenshots, 'DH_企业微信_流程审核示例.png'), fullPage: true })
      }
      await page.getByRole('treeitem').filter({ hasText: '帮我整理待办' }).first().click()
      expect(await page.getByRole('button', { name: '选择工作流：企业微信待办整理 · v1', exact: true }).isDisabled()).toBe(true)
      expect(model.chatCalls).toBe(2)
      await reviews.getByRole('button', { name: '查看并审核', exact: true }).click()
      await reviewDialog.getByRole('heading', { name: '本次待审核内容', exact: true }).waitFor()
      if (screenshots) await page.screenshot({ path: join(screenshots, 'DH_会话内工作流审核.png'), fullPage: true })
      const reviewedTask = run.items[0]!.id
      await reviewDialog.getByRole('button', { name: '审核通过并继续', exact: true }).click()
      await expect.poll(async () => (await scaffold.ctx.businessWorkflows.detail(id)).status).toBe('completed')
      await reviewDialog.getByText('已审核通过，流程将继续执行。', { exact: true }).waitFor()
      await reviewDialog.getByRole('button', { name: '关闭审核详情', exact: true }).last().click()
      await reviews.waitFor({ state: 'hidden' })
      await expect(scaffold.ctx.businessWorkflows.reviewFromConversation(owner.id, id, reviewedTask, true)).rejects.toThrow('CURRENT_HUMAN_TASK_REQUIRED')
      await page.getByRole('button', { name: '工作流', exact: true }).click()
      await panel.locator('[data-engine-process]').getByText('已完成', { exact: true }).waitFor()
      run = await scaffold.ctx.businessWorkflows.detail(id)
      expect(run.completed).toContain('wecom-todos-4')
      await owner.whenIdle()
      expect(boundaries.filter(event => event.id === owner.id).map(event => event.type)).toEqual(['turn/start', 'turn/end'])
      expect(model.chatCalls).toBe(3)
      await page.getByRole('treeitem').filter({ hasText: '帮我整理待办' }).first().click()
      await page.getByText('工作流已完成，人工审核通过。最终整理结果：' + summary, { exact: true }).waitFor()
      await expect(scaffold.ctx.businessWorkflows.selectConversationWorkflow(owner.id, { expectedRevision: 0, selection: null }))
        .rejects.toThrow('WORKFLOW_BINDING_REVISION_CONFLICT')
      await page.getByRole('button', { name: '选择工作流：企业微信待办整理 · v1', exact: true }).click()
      await page.getByRole('menuitem', { name: '普通聊天', exact: true }).click()
      await page.getByRole('button', { name: '选择工作流：普通聊天', exact: true }).waitFor()
      const cleared = await scaffold.ctx.businessWorkflows.conversationWorkflow(owner.id)
      expect(cleared.selection).toBeNull()
      expect(cleared.revision).toBe(binding.revision + 1)
      const clearedStart = await call('business_workflow_start', { workflowId: 'wecom-todos', version: 1, inputs: {} }, 'cleared-denied')
      expect(clearedStart.isError).toBe(true)
      expect(JSON.stringify(clearedStart)).toContain('WORKFLOW_SELECTION_REQUIRED')
      expect((await scaffold.ctx.businessWorkflows.list()).length).toBe(1)
      expect((await call('workflow_outside_probe', {}, 'restored-probe')).isError).toBe(false)
      expect(probeCalls).toBe(1)
      removeProbe()
      expect((await scaffold.ctx.businessWorkflows.detail(id)).status).toBe('completed')
      const saved = (await scaffold.ctx.businessWorkflows.templates())[0]!
      const editable = JSON.parse(saved.draftJson) as {
        version: number
        draft: {
          nodes: Array<{ kind: string; id: string; next: string; source: string; field: string }>
        }
      }
      editable.draft.nodes = editable.draft.nodes.filter(node => ['start', 'human', 'end'].includes(node.kind))
      editable.draft.nodes[0]!.next = editable.draft.nodes[1]!.id
      editable.draft.nodes[1]!.source = ''; editable.draft.nodes[1]!.field = ''
      const changed = await scaffold.ctx.businessWorkflows.saveTemplate({ id: saved.id,
        expectedRevision: saved.revision, draftJson: JSON.stringify(editable) })
      await scaffold.ctx.businessWorkflows.publishTemplate(saved.id, changed.revision)
      await page.getByRole('button', { name: '选择工作流：普通聊天', exact: true }).click()
      await page.getByRole('menuitem', { name: '企业微信待办整理 · v2', exact: true }).click()
      await page.getByRole('button', { name: '选择工作流：企业微信待办整理 · v2', exact: true }).waitFor()
      expect((await call('business_workflow_start', { workflowId: saved.id, version: 1, inputs: {} }, 'stale-publication')).isError).toBe(true)
      const second = await call('business_workflow_start', { workflowId: saved.id, version: 2, inputs: {} }, 'cancel-new-run')
      expect(second.isError).toBe(false)
      const secondId = (second.value as { runId: string }).runId
      expect((await call('business_workflow_cancel', { runId: secondId }, 'cancel-own-run')).value).toMatchObject({ status: 'canceled' })
      const third = await call('business_workflow_start', { workflowId: saved.id, version: 2, inputs: {} }, 'external-review-run')
      const thirdId = (third.value as { runId: ProcessId }).runId
      await page.getByRole('treeitem').filter({ hasText: '帮我整理待办' }).first().click()
      await reviews.getByRole('button', { name: '查看并审核', exact: true }).click()
      await reviewDialog.getByRole('heading', { name: '本次待审核内容', exact: true }).waitFor()
      const thirdRun = await scaffold.ctx.businessWorkflows.detail(thirdId)
      await scaffold.ctx.businessWorkflows.review(thirdId, thirdRun.items[0]!.id, false)
      await reviewDialog.getByText('此审核任务已处理或流程已终止。当前详情不会自动切换到下一项审核。', { exact: true }).waitFor()
      expect(await reviewDialog.getByRole('button', { name: '审核通过并继续', exact: true }).count()).toBe(0)
      await reviewDialog.getByRole('button', { name: '关闭审核详情', exact: true }).last().click()
      const calls = (await readFile(join(directory, 'calls.ndjson'), 'utf8')).split('\n').filter(Boolean)
        .map(line => JSON.parse(line) as { args?: string[] }).flatMap(row => row.args ? [row.args] : [])
      expect(calls.filter(args => args[0] === 'todo' && args[1] === 'list')).toHaveLength(1)
      expect(calls.some(args => args.includes('send') || args.includes('create') || args.includes('update'))).toBe(false)
      expect(tripwire.pageErrors).toEqual([])
    } finally {
      model.analysisRelease.resolve(undefined)
      await browser.close()
      unregister()
      await scaffold.close()
      const api = new FlowableClient({ baseUrl: baseUrl ?? '', username: 'dh-workflow', requestTimeoutMs: 5000 },
        () => Promise.resolve(password ?? ''), new AbortController().signal)
      for (const deployment of await api.list(`service/repository/deployments?tenantId=${tenant}&size=100`)) {
        await api.request(`service/repository/deployments/${string(deployment.id)}?cascade=true`, 'DELETE')
      }
      await rm(directory, { recursive: true, force: true })
    }
  }, 90000)
})
