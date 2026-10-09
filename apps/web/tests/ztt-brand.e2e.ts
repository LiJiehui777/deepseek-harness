// Standalone product identity through the real shipped Loader composition.
import { mkdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'
import { expect, it } from 'vitest'
import { captureStableAria, compareOrRefreshGolden, launchWebScaffold, watchConsole, webSnapshotMode } from './scaffold.ts'
import { ZH_BROWSER_LOCALE } from './support.ts'

it('renders the ZTT identity, keeps sidebar navigation usable, and retains native connector settings', async () => {
  const scaffold = await launchWebScaffold({ extraOverlayPath: fileURLToPath(new URL('../../cli/config/examples/ragflow/cordis.yml', import.meta.url)) })
  const browser = await chromium.launch()
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 960 }, locale: ZH_BROWSER_LOCALE })
    const tripwire = watchConsole(page)
    await page.goto(scaffold.authenticatedUrl, { waitUntil: 'load' })
    await page.getByText('连接企业知识，辅助质量工作', { exact: true }).waitFor()
    await expect.poll(() => page.title()).toBe('中天质量智能体')
    expect(await page.getByText('中天质量智能体', { exact: true }).count()).toBe(2)
    expect(await page.getByText('DSH Local Build', { exact: true }).count()).toBe(0)
    expect(await page.locator('img[src="./ztt-mark.svg"]').evaluateAll(images => images.every(image => (image as HTMLImageElement).complete && (image as HTMLImageElement).naturalWidth > 0))).toBe(true)
    const snapshot = await captureStableAria(page, 'body', scaffold.workspaceCwd)
    await compareOrRefreshGolden(fileURLToPath(new URL('./expected/ztt-brand/home.expected.md', import.meta.url)), snapshot, webSnapshotMode())
    const artifacts = fileURLToPath(new URL('../../../.artifacts/', import.meta.url))
    await mkdir(artifacts, { recursive: true })
    await page.screenshot({ path: `${artifacts}/ztt-quality-home.png` })
    await page.getByRole('button', { name: '收起侧边栏', exact: true }).click()
    await page.getByRole('button', { name: '打开侧边栏', exact: true }).waitFor()
    await page.getByRole('button', { name: '打开侧边栏', exact: true }).click()
    await page.getByText('中天科技 · 质量工作台', { exact: true }).waitFor()
    await page.setViewportSize({ width: 390, height: 844 })
    await page.getByText('连接企业知识，辅助质量工作', { exact: true }).waitFor()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
    await page.setViewportSize({ width: 1440, height: 960 })
    await page.getByRole('button', { name: '设置', exact: true }).click()
    const dialog = page.getByRole('dialog', { name: '设置', exact: true })
    await dialog.getByRole('button', { name: '插件', exact: true }).click()
    await dialog.getByRole('button', { name: '展开设置: RAGFlow 连接器' }).click()
    await dialog.getByLabel('RAGFlow 服务地址', { exact: true }).waitFor()
    expect(tripwire.pageErrors).toEqual([])
  } finally {
    await browser.close()
    await scaffold.close()
  }
}, 60000)
