/** Built DH composition and keyless recorded-turn acceptance for the business editor. */
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'
import { describe, expect, it } from 'vitest'
import {
  captureStableAria, compareOrRefreshGolden, fixtureUserPrompts,
  launchWebScaffold, watchConsole, webSnapshotMode,
} from '../../../../apps/web/tests/scaffold.ts'
import { REPO_ROOT } from '../../../../apps/web/tests/support.ts'

const MODE = webSnapshotMode()
const EXPECTED = fileURLToPath(new URL('./expected/', import.meta.url))

// UI expectations belong here; the borrowed recording remains read-only and is
// not a business-execution fixture. No workflow preview may issue a model call.
describe.skipIf(MODE === 'record')('business-workflow: built ZTT composition', () => {
  it('retains chat, edits and exchanges a draft, and previews human and wait gates', async () => {
    const fixture = join(REPO_ROOT, 'snapshots/session/text-turn/session.v1.jsonl')
    const prompts = fixtureUserPrompts(await readFile(fixture, 'utf8'))
    expect(prompts).toHaveLength(1)
    const folder = await mkdtemp(join(tmpdir(), 'dh-workflow-preview-'))
    const overlayPath = join(folder, 'cordis.yml')
    await writeFile(overlayPath, (await readFile(join(REPO_ROOT, 'apps/cli/config/examples/ztt/cordis.yml'), 'utf8'))
      .replace('passwordEnv: DH_FLOWABLE_PASSWORD', 'passwordEnv: DSH_UNUSED_PREVIEW_CREDENTIAL'))
    const scaffold = await launchWebScaffold({
      extraOverlayPath: overlayPath,
      replayFixture: fixture, compareReplaySession: false,
    })
    const browser = await chromium.launch()
    let failure: unknown
    try {
      const page = await browser.newPage({ viewport: { width: 1680, height: 1100 }, locale: 'zh-CN' })
      const tripwire = watchConsole(page)
      await page.goto(scaffold.authenticatedUrl, { waitUntil: 'load' })
      await page.waitForSelector('[class*="frame"]', { timeout: 30_000 })
      const workspace = join(scaffold.workspaceCwd, 'workspace')
      await mkdir(workspace, { recursive: true })
      await page.getByRole('textbox', { name: '选择工作区' }).click()
      const picker = page.getByRole('dialog', { name: '选择工作区目录' })
      await picker.getByRole('button', { name: '编辑路径' }).click()
      const pathInput = picker.getByRole('textbox', { name: '编辑路径' })
      await pathInput.fill(workspace)
      await pathInput.press('Enter')
      await picker.getByRole('button', { name: '打开', exact: true }).click()
      await page.locator('[data-composer-input][contenteditable="true"]').first().waitFor()
      const settled = scaffold.whenTurnSettled()
      const composer = page.locator('[data-composer-input]').first()
      await composer.fill(prompts[0]!)
      await composer.press('Enter')
      await settled

      await page.getByRole('button', { name: '工作流', exact: true }).click()
      const panel = page.locator('[data-business-workflow-view]')
      await panel.getByRole('heading', { name: '工作流', exact: true }).waitFor()
      await mkdir(EXPECTED, { recursive: true })
      const capture = async (name: string): Promise<void> => {
        await compareOrRefreshGolden(join(EXPECTED, `${name}.expected.md`),
          await captureStableAria(page, '[data-business-workflow-view]', scaffold.workspaceCwd), MODE)
      }
      const screenshot = async (name: string): Promise<void> => {
        const directory = process.env['DSH_WORKFLOW_SCREENSHOT_DIR']
        if (!directory) return
        await mkdir(directory, { recursive: true })
        await page.screenshot({ path: join(directory, `${name}.png`), fullPage: true })
      }
      await capture('flows')
      await screenshot('DH工作流_流程列表')
      await panel.getByRole('button', { name: '编辑流程', exact: true }).first().click()
      await panel.getByLabel('流程名称', { exact: true }).fill('订单 A 入库核对')
      await panel.getByRole('button', { name: '添加DH 分析节点', exact: true }).click()
      await panel.getByLabel('节点名称', { exact: true }).fill('补充分析')
      await panel.getByRole('button', { name: '删除节点', exact: true }).click()
      await panel.getByRole('button', { name: '检查草稿', exact: true }).click()
      await panel.getByText('草稿结构检查通过。实际节点与业务权限由服务端执行检查。', { exact: true }).waitFor()
      await capture('editor')
      await screenshot('DH工作流_节点编排')

      // Delete only from a copy so the recorded preview keeps its original graph.
      await panel.getByRole('button', { name: '复制流程', exact: true }).click()
      await panel.getByRole('group', { name: '流程节点画布' }).getByRole('button').filter({ hasText: 'DH 分析数据差异' }).click()
      const inspector = panel.locator('[data-node-inspector]')
      const task = inspector.getByRole('textbox', { name: /任务说明/ })
      await task.fill('核对输入资料，并给出有依据的建议。')
      expect(await task.inputValue()).toBe('核对输入资料，并给出有依据的建议。')
      const inspectorAria = await captureStableAria(page, '[data-node-inspector]', scaffold.workspaceCwd)
      await compareOrRefreshGolden(join(EXPECTED, 'inspector.expected.md'), inspectorAria, MODE)
      const deleteNode = inspector.getByRole('button', { name: '删除节点', exact: true })
      await inspector.scrollIntoViewIfNeeded()
      const beforeScroll = await deleteNode.boundingBox()
      await inspector.locator('[data-inspector-body]').evaluate((element) => { element.scrollTop = element.scrollHeight })
      const afterScroll = await deleteNode.boundingBox()
      expect(afterScroll?.y).toBe(beforeScroll?.y)
      expect(await deleteNode.isEnabled()).toBe(true)
      await deleteNode.click()
      expect(await panel.getByRole('group', { name: '流程节点画布' }).getByRole('button').filter({ hasText: 'DH 分析数据差异' }).count()).toBe(0)
      expect(await panel.locator('[data-node-inspector]').getByRole('button', { name: '删除节点', exact: true }).isDisabled()).toBe(true)
      await panel.getByRole('button', { name: '我的流程', exact: true }).click()
      await panel.getByRole('article').filter({ has: page.getByRole('heading', { name: '订单 A 入库核对', exact: true }) })
        .getByRole('button', { name: '编辑流程', exact: true }).click()

      const downloadEvent = page.waitForEvent('download')
      await panel.getByRole('button', { name: '导出草稿', exact: true }).click()
      const download = await downloadEvent
      const downloadedPath = await download.path()
      if (!downloadedPath) throw new Error('draft export has no downloaded file')
      const draftBytes = await readFile(downloadedPath)
      expect(JSON.parse(draftBytes.toString())).toMatchObject({ draft: { name: '订单 A 入库核对' } })
      await panel.getByLabel('选择工作流草稿文件', { exact: true }).setInputFiles({
        name: 'workflow-draft.json', mimeType: 'application/json', buffer: draftBytes,
      })
      await panel.getByText('草稿已导入，可继续编辑并检查。', { exact: true }).waitFor()
      await panel.getByRole('button', { name: '新建模拟预览', exact: true }).click()
      for (let index = 0; index < 4; index++) {
        await panel.getByRole('button', { name: '模拟执行当前节点', exact: true }).click()
      }
      await panel.getByRole('button', { name: '模拟通过', exact: true }).waitFor()
      expect(await panel.getByRole('button', { name: '模拟执行当前节点', exact: true }).count()).toBe(0)
      await capture('human')
      await screenshot('DH工作流_模拟审核')
      await panel.getByRole('button', { name: '模拟待办 (1)', exact: true }).click()
      await panel.getByRole('button', { name: '查看预览', exact: true }).click()
      await panel.getByRole('button', { name: '模拟通过', exact: true }).click()
      await panel.getByRole('button', { name: '模拟执行当前节点', exact: true }).click()
      await panel.getByRole('button', { name: '模拟数据已到达', exact: true }).waitFor()
      expect(await panel.getByRole('button', { name: '模拟执行当前节点', exact: true }).count()).toBe(0)
      await panel.getByRole('button', { name: '模拟数据已到达', exact: true }).click()
      for (let index = 0; index < 3; index++) {
        await panel.getByRole('button', { name: '模拟执行当前节点', exact: true }).click()
      }
      await panel.getByText('预览完成', { exact: true }).first().waitFor()
      await capture('completed')
      expect(await panel.getByRole('button', { name: '模拟执行当前节点', exact: true }).count()).toBe(0)

      await panel.getByRole('button', { name: '流程编排', exact: true }).click()
      await page.setViewportSize({ width: 1024, height: 900 })
      const fits = await panel.evaluate(element => element.scrollWidth <= element.clientWidth)
      expect(fits).toBe(true)
      expect(tripwire.pageErrors).toEqual([])
    } catch (error) {
      failure = error
    } finally {
      await browser.close()
      const cleanup = await Promise.allSettled([scaffold.close()])
      await rm(folder, { recursive: true, force: true })
      const failures = [
        ...(failure === undefined ? [] : [failure]),
        ...cleanup.flatMap(result => result.status === 'rejected' ? [result.reason as unknown] : []),
      ]
      if (failures.length) throw new AggregateError(failures, 'business-workflow acceptance failed')
    }
  }, 120_000)
})
