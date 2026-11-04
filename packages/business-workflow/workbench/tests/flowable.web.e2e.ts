import { executeOne } from './execute.ts'
/** Real shipped DH/Flowable composition with a keyless recorded DH analysis turn. */
import { randomUUID } from 'node:crypto'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'
import { brandString } from '@deepseek-ai/dsh-brand'
import type { ToolCallId } from '@deepseek-ai/dsh-llm'
import type { Agent } from '@deepseek-ai/dsh-agent'
import { describe, expect, it } from 'vitest'
import {
  captureStableAria, compareOrRefreshGolden, launchWebScaffold, watchConsole, webSnapshotMode,
} from '../../../../apps/web/tests/scaffold.ts'
import { REPO_ROOT } from '../../../../apps/web/tests/support.ts'
import { FlowableClient, string } from '../src/host/flowable.ts'
import type { ProcessId } from '../src/shared/runtime.ts'
import type {} from '../src/index.ts'

const MODE = webSnapshotMode()
const password = process.env.DSH_FLOWABLE_TEST_PASSWORD
const baseUrl = process.env.DSH_FLOWABLE_TEST_URL
const EXPECTED = fileURLToPath(new URL('./expected/', import.meta.url))

describe.skipIf(!password || !baseUrl || MODE === 'record')('business workflow: built DH and real Flowable', () => {
  it('runs a restricted DH analysis, handles engine tasks, and reloads persisted history', async () => {
    const folder = await mkdtemp(join(tmpdir(), 'dh-flowable-web-'))
    const tenant = `dh-web-${randomUUID().slice(0, 12)}`
    const overlayPath = join(folder, 'cordis.yml')
    const overlay = (await readFile(join(REPO_ROOT, 'apps/cli/config/examples/ztt/cordis.yml'), 'utf8'))
      .replace('passwordEnv: DH_FLOWABLE_PASSWORD', 'passwordEnv: DSH_FLOWABLE_TEST_PASSWORD')
      .replace('tenantId: dh-business', `tenantId: ${tenant}`)
      .replace('baseUrl: http://127.0.0.1:8082/flowable-rest/', `baseUrl: ${baseUrl}`)
    await writeFile(overlayPath, overlay)
    const scaffold = await launchWebScaffold({ extraOverlayPath: overlayPath,
      replayFixture: join(REPO_ROOT, 'snapshots/session/text-turn/session.v1.jsonl'), compareReplaySession: false })
    const observedTools: string[][] = []
    let toolBodyCalls = 0
    const denied: boolean[] = []
    let analysisAgent: Agent | undefined
    scaffold.ctx.on('agent/created', ({ agent }) => { analysisAgent = agent })
    scaffold.ctx.on('llm/stream', async function* (options, next) {
      observedTools.push((options.tools ?? []).map(tool => tool.name))
      const agent = analysisAgent
      if (!agent) throw new Error('Analysis agent was not published')
      // A late scope-owned tool bypasses allow-list visibility; the execution
      // guard must still prevent its body from running.
      agent.ctx.tools.register({ name: 'workflow_denial_probe', description: 'Test-only execution probe',
        parameters: { type: 'object', properties: {} },
        output: { schema: { type: 'string' }, render: (_args, value) => [{ type: 'text', text: value as string }] },
        execute: () => { toolBodyCalls++; return Promise.resolve('unexpected execution') },
      })
      const result = await executeOne(agent.ctx, { agent, name: 'workflow_denial_probe', arguments: {},
        callId: brandString<ToolCallId>('denial-probe'), signal: new AbortController().signal,
      })
      denied.push(result.isError)
      yield* next()
    })
    const browser = await chromium.launch()
    let failure: unknown
    try {
      const page = await browser.newPage({ viewport: { width: 1680, height: 1100 }, locale: 'zh-CN' })
      const tripwire = watchConsole(page)
      await page.goto(scaffold.authenticatedUrl, { waitUntil: 'load' })
      await page.getByRole('button', { name: '工作流', exact: true }).click()
      const panel = page.locator('[data-business-workflow-view]')
      await panel.getByText('Flowable 8.0.0 已连接', { exact: true }).waitFor()
      const example = panel.getByRole('article').filter({ has: page.getByRole('heading', { name: 'Flowable 接入验证', exact: true }) })
      await example.getByRole('button', { name: '编辑流程', exact: true }).click()
      await panel.getByRole('button', { name: /^系统动作 传递验证数据/ }).click()
      await panel.getByRole('button', { name: '添加DH 分析节点', exact: true }).click()
      await panel.getByLabel('节点名称', { exact: true }).fill('受限 DH 分析')
      await panel.getByRole('button', { name: '检查草稿', exact: true }).click()
      await panel.getByText('草稿结构检查通过。实际节点与业务权限由服务端执行检查。', { exact: true }).waitFor()
      await panel.getByRole('button', { name: '启动 Flowable 执行', exact: true }).click()
      await panel.getByRole('button', { name: '审核通过并继续', exact: true }).waitFor({ timeout: 30_000 })
      expect(observedTools).toEqual([[]])
      expect(denied).toEqual([true])
      expect(toolBodyCalls).toBe(0)
      const id = await panel.locator('[data-engine-process]').getAttribute('data-engine-process') as ProcessId
      let run = await scaffold.ctx.businessWorkflows.detail(id)
      const analysis = run.results.map(row => JSON.parse(row.json) as Record<string, unknown>).find(row => typeof row.sessionId === 'string')
      expect(analysis?.result).toBeTruthy()
      const capture = async (name: string): Promise<void> => {
        await panel.getByRole('button', { name: '刷新引擎状态', exact: true }).click({ trial: true })
        const aria = (await captureStableAria(page, '[data-business-workflow-view]', scaffold.workspaceCwd)).split(id).join('<process-id>')
        await mkdir(EXPECTED, { recursive: true })
        await compareOrRefreshGolden(join(EXPECTED, `${name}.expected.md`), aria, MODE)
      }
      await capture('engine-human')
      const directory = process.env.DSH_WORKFLOW_SCREENSHOT_DIR
      if (directory) {
        await mkdir(directory, { recursive: true })
        await page.screenshot({ path: join(directory, 'DH_Flowable_真实审核.png'), fullPage: true })
      }
      await panel.getByRole('button', { name: '审核通过并继续', exact: true }).click()
      await panel.getByRole('button', { name: '确认数据已到达', exact: true }).waitFor()
      await capture('engine-wait')
      await panel.getByRole('button', { name: '确认数据已到达', exact: true }).click()
      await panel.getByText('已完成', { exact: true }).first().waitFor({ timeout: 15_000 })
      await capture('engine-completed')
      await page.reload({ waitUntil: 'load' })
      await page.getByRole('button', { name: '工作流', exact: true }).click()
      await panel.getByRole('button', { name: '引擎实例', exact: true }).click()
      await panel.getByText('已完成', { exact: true }).first().waitFor()
      run = await scaffold.ctx.businessWorkflows.detail(id)
      expect(run.status).toBe('completed')
      expect(run.completed).toContain('engine-check-5')
      expect(run.completed).not.toContain('engine-check-6')
      expect(tripwire.pageErrors).toEqual([])
    } catch (error) {
      failure = error
      const page = browser.contexts()[0]?.pages()[0]
      if (page) console.error('Flowable browser failure state:', await page.locator('[data-business-workflow-view]').ariaSnapshot())
      for (const row of await scaffold.ctx.businessWorkflows.list()) {
        console.error('Flowable current work:', (await scaffold.ctx.businessWorkflows.detail(row.id)).items)
      }
    } finally {
      await browser.close()
      const cleanup = await Promise.allSettled([scaffold.close()])
      const api = new FlowableClient({ baseUrl: baseUrl ?? '', username: 'dh-workflow', requestTimeoutMs: 5000 },
        () => Promise.resolve(password ?? ''), new AbortController().signal)
      for (const deployment of await api.list(`service/repository/deployments?tenantId=${tenant}&size=100`)) {
        await api.request(`service/repository/deployments/${string(deployment.id)}?cascade=true`, 'DELETE')
      }
      await rm(folder, { recursive: true, force: true })
      const failures = [...failure === undefined ? [] : [failure],
        ...cleanup.flatMap(result => result.status === 'rejected' ? [result.reason as unknown] : [])]
      if (failures.length) throw new AggregateError(failures, 'Flowable browser acceptance failed')
    }
  }, 120_000)
})
