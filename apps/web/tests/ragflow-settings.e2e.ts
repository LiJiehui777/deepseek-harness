/** The shipped Web settings picker, backed by an isolated RAGFlow HTTP fixture. */
import { once } from 'node:events'
import { createServer, type Server } from 'node:http'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium, type Browser } from 'playwright'
import { afterEach, expect, it } from 'vitest'
import { credentialRef } from '@deepseek-ai/dsh-credentials'
import { captureStableAria, compareOrRefreshGolden, launchWebScaffold, webSnapshotMode, watchConsole, type WebScaffold } from './scaffold.ts'

let provider: Server | undefined
let scaffold: WebScaffold | undefined
let browser: Browser | undefined
let directory: string | undefined
afterEach(async () => {
  await browser?.close()
  browser = undefined
  await scaffold?.close()
  scaffold = undefined
  if (provider) {
    provider.closeAllConnections()
    await new Promise<void>((resolve, reject) => { provider!.close((error) => { if (error) reject(error); else resolve() }) })
  }
  provider = undefined
  if (directory) await rm(directory, { recursive: true, force: true })
  directory = undefined
})
it('scrolls names, persists selected IDs, and retains the selection when RAGFlow is offline', async () => {
  let offline = false
  const auth: Array<string | undefined> = []
  const datasets = Array.from({ length: 24 }, (_, index) => ({ id: `kb_${index + 1}`, name: `质量知识库 ${String(index + 1).padStart(2, '0')}` }))
  provider = createServer((req, res) => {
    auth.push(req.headers.authorization)
    const page = Number(new URL(req.url!, 'http://fixture.invalid').searchParams.get('page'))
    res.writeHead(offline ? 503 : 200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify(offline ? { message: 'test-private-key' } : { code: 0, data: datasets.slice((page - 1) * 20, page * 20) }))
  })
  provider.listen(0, '127.0.0.1')
  await once(provider, 'listening')
  const address = provider.address()
  if (!address || typeof address !== 'object') throw new Error('Missing provider port')
  directory = await mkdtemp(join(tmpdir(), 'dhe-ragflow-settings-'))
  const overlay = join(directory, 'cordis.patch.yml')
  await writeFile(overlay, `- insert:\n    - id: ragflow-connector\n      name: '@deepseek-ai/dsh-tool-ragflow-connector'\n      config:\n        baseURL: http://127.0.0.1:${address.port}\n        apiKeyEnv: RAGFLOW_SETTINGS_TEST_KEY\n        datasetIds: [kb_2]\n        maxPageSize: 20\n`)
  scaffold = await launchWebScaffold({ extraOverlayPath: overlay })
  await scaffold.ctx.credentials.set(credentialRef('RAGFLOW_SETTINGS_TEST_KEY'), 'test-private-key')
  browser = await chromium.launch()
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, locale: 'zh-CN' })
  const tripwire = watchConsole(page)
  await page.goto(scaffold.authenticatedUrl)
  try {
    await page.getByRole('button', { name: '设置', exact: true }).waitFor({ timeout: 10_000 })
  } catch (error) {
    throw new Error(`Settings did not boot: ${JSON.stringify({ errors: tripwire.pageErrors, body: await page.locator('body').innerText() })}`, { cause: error })
  }
  await page.getByRole('button', { name: '设置', exact: true }).click()
  const settings = page.getByRole('dialog', { name: '设置', exact: true })
  await settings.getByRole('button', { name: '插件', exact: true }).click()
  await settings.getByRole('button', { name: '展开设置: RAGFlow 连接器' }).click()
  const choose = settings.getByLabel('允许检索的知识库', { exact: true })
  await expect.poll(() => choose.textContent()).toContain('质量知识库 02')
  await choose.click()
  const picker = page.getByRole('dialog', { name: '允许检索的知识库', exact: true })
  await picker.getByRole('button', { name: '刷新列表' }).waitFor()
  const options = picker.getByRole('group', { name: '选择知识库' })
  expect(await options.evaluate(element => element.scrollHeight > element.clientHeight)).toBe(true)
  const expected = fileURLToPath(new URL('./expected/ragflow-settings/datasets.expected.md', import.meta.url))
  await compareOrRefreshGolden(expected, await captureStableAria(page, '#ragflow-dataset-options', scaffold.workspaceCwd), webSnapshotMode())
  const before = await readFile(join(scaffold.harnessHome, 'settings.yaml'), 'utf8')
  await picker.getByRole('checkbox', { name: '质量知识库 01', exact: true }).check()
  await picker.getByRole('button', { name: '加载更多' }).click()
  await picker.getByRole('checkbox', { name: '质量知识库 24', exact: true }).check()
  expect(await readFile(join(scaffold.harnessHome, 'settings.yaml'), 'utf8')).toBe(before)
  await picker.getByRole('checkbox', { name: '质量知识库 24', exact: true }).uncheck()
  await page.keyboard.press('Escape')
  await expect.poll(() => picker.count()).toBe(0)
  expect(await settings.count()).toBe(1)
  await settings.getByRole('button', { name: '保存', exact: true }).click()
  const file = join(scaffold.harnessHome, 'settings.yaml')
  await expect.poll(async () => readFile(file, 'utf8')).toContain('kb_1')
  const saved = await readFile(file, 'utf8')
  expect(saved).toContain('kb_2')
  expect(saved).not.toContain('质量知识库')
  expect(saved).not.toContain('test-private-key')
  await settings.getByRole('button', { name: '展开设置: RAGFlow 连接器' }).click()
  await choose.click()
  offline = true
  await picker.getByRole('button', { name: '刷新列表' }).click()
  await picker.getByText('知识库加载失败，请检查已保存的连接后重试。原有选择已保留。').waitFor()
  expect(await picker.getByRole('checkbox', { name: '质量知识库 01', exact: true }).isChecked()).toBe(true)
  expect(await picker.getByRole('checkbox', { name: '质量知识库 02', exact: true }).isChecked()).toBe(true)
  expect(await readFile(file, 'utf8')).toBe(saved)
  expect(auth.every(value => value === 'Bearer test-private-key')).toBe(true)
  expect(tripwire.pageErrors).toEqual([])
})
