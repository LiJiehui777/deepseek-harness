/** Built demo UI and real Flowable routing; only model responses are fixtures. */
import { randomUUID } from 'node:crypto'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { chromium } from 'playwright'
import { LlmAdapter } from '@deepseek-ai/dsh-llm'
import type { GenerateOptions, LlmModelInfo, LlmProviderInfo, StreamChunk } from '@deepseek-ai/dsh-llm'
import { describe, expect, it } from 'vitest'
import { captureStableAria, compareOrRefreshGolden, launchWebScaffold, watchConsole, webSnapshotMode } from '../../../../apps/web/tests/scaffold.ts'
import { REPO_ROOT } from '../../../../apps/web/tests/support.ts'
import { FlowableClient, string } from '../src/host/flowable.ts'
import type { ProcessId } from '../src/shared/runtime.ts'

const baseUrl = process.env.DSH_FLOWABLE_TEST_URL
const password = process.env.DSH_FLOWABLE_TEST_PASSWORD
const MODE = webSnapshotMode()
const prompts = JSON.parse(await readFile(join(import.meta.dirname, 'expected/demo-prompts.expected.json'), 'utf8')) as { zh: string[] }
const zh = {
  demoName: '企业微信待办风控演示（模拟）', edit: '编辑流程', saveServer: '保存到服务端', publish: '发布给 DH 使用',
  engineInputs: '启动参数（JSON 对象）', startPublished: '试运行已发布版本', engineApprove: '审核通过并继续',
  demoClassify: 'DH 分类与优先级分析', demoFinalReview: '人工确认演示简报', refreshEngine: '刷新引擎状态',
  demoClassifyTask: prompts.zh[0]!, demoBriefTask: prompts.zh[1]!,
}

class DemoModel extends LlmAdapter {
  calls = 0
  override providerInfo(provider: string): LlmProviderInfo { return { id: provider, name: 'Demo fixture' } }
  override listModels(provider: string): Promise<readonly LlmModelInfo[]> {
    return Promise.resolve([{ provider, id: 'fixture', name: 'Demo fixture' }])
  }
  override async * stream(options: GenerateOptions): AsyncIterable<StreamChunk> {
    expect(options.tools ?? []).toEqual([])
    this.calls++
    const content = JSON.stringify(options.messages)
    const classify = content.includes(zh.demoClassifyTask)
    const routine = content.includes('DEMO-N01')
    if (classify) {
      expect(content).toContain('simulated-wecom-todos')
      expect(content).toContain('simulation')
    } else expect(content).toContain(zh.demoBriefTask)
    const text = `【模拟演示】${routine ? 'routine：2 条普通待办，按计划整理。DEMO-N01、DEMO-N02。'
      : 'risk：4 条待办，DEMO-Q01 逾期且缺检验报告，建议优先复核。'}\n基准日：2026-11-03。`
      + (classify ? '分类与优先级仅为建议。' : '这是处理简报草稿，未发消息，未修改待办。')
    yield { type: 'block-start', index: 0, blockType: 'text' }
    yield { type: 'block-end', index: 0, block: { type: 'text', text } }
    yield { type: 'finish', reason: { kind: 'stop' } }
  }
}

describe.skipIf(!baseUrl || !password || MODE === 'record')('simulated WeCom risk review in Flowable', () => {
  it('routes both cases, pauses risk review before the brief, and preserves the final human gate', async () => {
    const folder = await mkdtemp(join(tmpdir(), 'dh-todo-demo-'))
    const tenant = `dh-demo-${randomUUID().slice(0, 12)}`
    const overlayPath = join(folder, 'cordis.yml')
    const overlay = (await readFile(join(REPO_ROOT, 'apps/cli/config/examples/ztt/cordis.yml'), 'utf8'))
      .replace('passwordEnv: DH_FLOWABLE_PASSWORD', 'passwordEnv: DSH_FLOWABLE_TEST_PASSWORD')
      .replace('tenantId: dh-business', `tenantId: ${tenant}`)
      .replace('baseUrl: http://127.0.0.1:8082/flowable-rest/', `baseUrl: ${baseUrl}`)
    await writeFile(overlayPath, overlay + '\n- id: agent-default-model\n  config:\n    provider: todo-demo-fixture\n    model: fixture\n')
    const scaffold = await launchWebScaffold({ extraOverlayPath: overlayPath })
    const model = new DemoModel()
    const unregister = scaffold.ctx.llm.registerAdapter(['todo-demo-fixture'], model)
    const browser = await chromium.launch()
    try {
      const page = await browser.newPage({ viewport: { width: 1680, height: 1100 }, locale: 'zh-CN' })
      const tripwire = watchConsole(page)
      await page.goto(scaffold.authenticatedUrl)
      await page.getByRole('button', { name: '工作流', exact: true }).click()
      const panel = page.locator('[data-business-workflow-view]')
      const sample = panel.getByRole('article').filter({ has: page.getByRole('heading', { name: zh.demoName, exact: true }) })
      await sample.getByRole('button', { name: zh.edit, exact: true }).click()
      await panel.getByRole('button', { name: zh.saveServer, exact: true }).click()
      await panel.getByRole('button', { name: zh.publish, exact: true }).click()
      await panel.getByText('已发布 · v1', { exact: true }).waitFor()
      await panel.getByText('开发调试', { exact: true }).click()
      await panel.getByLabel(zh.engineInputs).fill('{"scenario":"risk"}')
      await panel.getByRole('button', { name: zh.startPublished, exact: true }).click()
      await panel.getByRole('button', { name: zh.engineApprove, exact: true }).waitFor()
      const id = await panel.locator('[data-engine-process]').getAttribute('data-engine-process') as ProcessId
      let run = await scaffold.ctx.businessWorkflows.detail(id)
      expect(run.items[0]?.nodeId).toBe('wecom-todos-demo-4')
      expect(run.results.find(row => row.nodeId === 'wecom-todos-demo-1')?.json).toContain('"simulation":true')
      expect(run.results.some(row => row.nodeId === 'wecom-todos-demo-5')).toBe(false)
      expect(model.calls).toBe(1)
      await panel.locator('summary').filter({ hasText: '规则判断：是否逾期或缺资料' }).waitFor()
      await panel.locator('summary').filter({ hasText: zh.demoClassify }).click()
      const aria = await captureStableAria(page, '[data-business-workflow-view]', scaffold.workspaceCwd)
      await compareOrRefreshGolden(join(import.meta.dirname, 'expected/demo-risk-review.expected.md'), aria, MODE)
      await panel.getByRole('button', { name: zh.engineApprove, exact: true }).click()
      await expect.poll(async () => (await scaffold.ctx.businessWorkflows.detail(id)).items[0]?.nodeId,
        { timeout: 30000 }).toBe('wecom-todos-demo-6')
      await panel.getByText(zh.demoFinalReview, { exact: true }).first().waitFor()
      await panel.getByRole('button', { name: zh.refreshEngine, exact: true }).click({ trial: true })
      await panel.getByRole('button', { name: zh.engineApprove, exact: true }).click()
      await expect.poll(async () => (await scaffold.ctx.businessWorkflows.detail(id)).status).toBe('completed')
      run = await scaffold.ctx.businessWorkflows.detail(id)
      expect(run.completed).toContain('wecom-todos-demo-4')
      expect(model.calls).toBe(2)
      const routine = await scaffold.ctx.businessWorkflows.startPublished({ id: 'wecom-todos-demo', version: 1,
        requestId: randomUUID(), inputJson: '{"scenario":"routine"}' })
      await expect.poll(async () => (await scaffold.ctx.businessWorkflows.detail(routine.id)).items[0]?.nodeId,
        { timeout: 30000 }).toBe('wecom-todos-demo-6')
      run = await scaffold.ctx.businessWorkflows.detail(routine.id)
      expect(run.completed).not.toContain('wecom-todos-demo-4')
      expect(run.results.some(row => row.nodeId === 'wecom-todos-demo-5')).toBe(true)
      expect(model.calls).toBe(4)
      await scaffold.ctx.businessWorkflows.review(run.id, run.items[0]!.id, true)
      await expect.poll(async () => (await scaffold.ctx.businessWorkflows.detail(run.id)).status).toBe('completed')
      expect(tripwire.pageErrors).toEqual([])
    } finally {
      await browser.close()
      unregister()
      await scaffold.close()
      const api = new FlowableClient({ baseUrl: baseUrl ?? '', username: 'dh-workflow', requestTimeoutMs: 5000 },
        () => Promise.resolve(password ?? ''), new AbortController().signal)
      for (const deployment of await api.list(`service/repository/deployments?tenantId=${tenant}&size=100`)) {
        await api.request(`service/repository/deployments/${string(deployment.id)}?cascade=true`, 'DELETE')
      }
      await rm(folder, { recursive: true, force: true })
    }
  }, 90000)
})
