// Independent DH's optional RAGFlow overlay through the shipped Web composition.
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import { chromium } from 'playwright'
import { expect, it } from 'vitest'
import { captureStableAria, compareOrRefreshGolden, launchWebScaffold, watchConsole, webSnapshotMode } from './scaffold.ts'
import { ZH_BROWSER_LOCALE } from './support.ts'

it('persists the independent RAGFlow connection through native plugin settings without exposing the saved key', async () => {
  const scaffold = await launchWebScaffold({ extraOverlayPath: fileURLToPath(new URL('../../cli/config/examples/ragflow/cordis.yml', import.meta.url)) })
  const browser = await chromium.launch()
  try {
    const page = await browser.newPage({ viewport: { width: 1680, height: 1000 }, locale: ZH_BROWSER_LOCALE })
    const tripwire = watchConsole(page)
    await page.goto(scaffold.authenticatedUrl, { waitUntil: 'load' })
    await page.getByRole('button', { name: '设置', exact: true }).click()
    const dialog = page.getByRole('dialog', { name: '设置' })
    await dialog.getByRole('button', { name: '插件', exact: true }).click()
    await dialog.getByRole('button', { name: '展开设置: RAGFlow 连接器' }).click()
    await dialog.getByText('尚未配置 API Key。', { exact: true }).waitFor()
    const snapshot = await captureStableAria(page, '[role="dialog"]', scaffold.workspaceCwd)
    await compareOrRefreshGolden(fileURLToPath(new URL('./expected/ragflow-connector/settings.expected.md', import.meta.url)), snapshot, webSnapshotMode())
    await dialog.getByLabel('RAGFlow API Key', { exact: true }).fill('fixture-private-ragflow-key')
    await dialog.getByLabel('RAGFlow 服务地址', { exact: true }).fill('http://127.0.0.1:9380')
    await dialog.getByLabel('允许检索的知识库 ID', { exact: true }).fill('kb_a, kb_b, kb_a')
    await dialog.getByRole('checkbox', { name: '启用 RAGFlow 连接' }).check()
    await dialog.getByRole('button', { name: '保存', exact: true }).click()
    const expand = dialog.getByRole('button', { name: '展开设置: RAGFlow 连接器' })
    await expand.waitFor()
    const document = await readFile(join(scaffold.harnessHome, 'settings.yaml'), 'utf8')
    expect(document).toContain('ragflow-connector:')
    expect(document).toContain('baseURL: http://127.0.0.1:9380')
    expect(document).toContain('enabled: true')
    expect(document).toContain('- kb_a')
    expect(document).toContain('- kb_b')
    expect(document).not.toContain('fixture-private-ragflow-key')
    await expand.click()
    await dialog.getByText('已配置 API Key。', { exact: true }).waitFor()
    expect(await dialog.getByLabel('RAGFlow API Key', { exact: true }).inputValue()).toBe('')
    expect(await dialog.getByLabel('允许检索的知识库 ID', { exact: true }).inputValue()).toBe('kb_a, kb_b')
    expect(await dialog.getByRole('checkbox', { name: '启用 RAGFlow 连接' }).isChecked()).toBe(true)
    await dialog.getByLabel('RAGFlow 服务地址', { exact: true }).fill('file:///invalid')
    await expect.poll(() => dialog.getByRole('button', { name: '保存', exact: true }).isDisabled()).toBe(true)
    await dialog.getByText('请填写 HTTP(S) 服务地址，不含账号密码、查询参数或锚点。', { exact: true }).waitFor()
    expect(tripwire.pageErrors).toEqual([])
  } finally {
    await browser.close()
    await scaffold.close()
  }
}, 60000)
