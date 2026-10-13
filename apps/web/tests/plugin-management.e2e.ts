/** Native plugin pages, shared configuration and live Loader composition in an isolated enhanced profile. */
import { readFile, mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'
import { expect, it } from 'vitest'
import type {} from '@deepseek-ai/dsh-plugin-manager'
import { captureStableAria, compareOrRefreshGolden, launchWebScaffold, webSnapshotMode, watchConsole } from './scaffold.ts'

it('configures all three connectors and persists native enablement through the real Loader', async () => {
  const scaffold = await launchWebScaffold({ pluginManagement: true, extraOverlayPath: fileURLToPath(new URL('../../cli/config/examples/ztt/cordis.yml', import.meta.url)) })
  const browser = await chromium.launch()
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, locale: 'zh-CN' })
  const console = watchConsole(page)
  try {
    await page.goto(scaffold.authenticatedUrl)
    await page.getByRole('button', { name: '\u63d2\u4ef6', exact: true }).click({ timeout: 15_000 })
    const panel = page.locator('[data-plugin-panel]')
    await page.locator('[data-plugin-item="ragflow-connector"]').waitFor()
    for (const id of ['ragflow-connector', 'feishu-connector', 'wecom-connector']) {
      expect(await page.locator(`[data-plugin-item="${id}"]`).count()).toBe(1)
    }
    for (const id of ['feishu-connector', 'wecom-connector']) {
      const icon = page.locator(`[data-plugin-item="${id}"] svg[data-connector-icon="${id}"]`)
      expect(await icon.count()).toBe(1)
      expect(await icon.boundingBox()).toMatchObject({ width: 36, height: 36 })
    }
    await compareOrRefreshGolden(fileURLToPath(new URL('./expected/plugin-management/list.expected.md', import.meta.url)), await captureStableAria(page, '[data-plugin-group="basic"]', scaffold.workspaceCwd), webSnapshotMode())
    const artifacts = fileURLToPath(new URL('../../../.artifacts/', import.meta.url))
    await mkdir(artifacts, { recursive: true })
    await page.screenshot({ path: join(artifacts, 'enhanced-connector-icons.png') })
    await page.locator('[data-plugin-item="feishu-connector"] button').first().click()
    const feishu = panel.locator('[data-plugin-item-detail="feishu-connector"]')
    expect(await feishu.locator('svg[data-connector-icon="feishu-connector"]').count()).toBe(1)
    await feishu.getByLabel('App ID', { exact: true }).fill('cli_fixture_native_plugins')
    await feishu.getByLabel('App Secret', { exact: true }).fill('fixture-private-secret')
    await feishu.getByRole('button', { name: '\u4fdd\u5b58', exact: true }).click()
    const settings = join(scaffold.harnessHome, 'settings.yaml')
    await expect.poll(async () => readFile(settings, 'utf8')).toContain('cli_fixture_native_plugins')
    expect(await readFile(settings, 'utf8')).not.toContain('fixture-private-secret')
    await feishu.getByLabel('\u4f7f\u7528\u6211\u7684\u98de\u4e66\u8d26\u53f7\u8bfb\u53d6').check()
    await compareOrRefreshGolden(fileURLToPath(new URL('./expected/plugin-management/feishu.expected.md', import.meta.url)), (await captureStableAria(page, '[data-plugin-item-detail="feishu-connector"]', scaffold.workspaceCwd)).replaceAll(scaffold.baseUrl, '{{origin}}'), webSnapshotMode())
    await panel.getByRole('button', { name: '\u8fd4\u56de\u63d2\u4ef6', exact: true }).click()
    await page.locator('[data-plugin-item="wecom-connector"] button').first().click()
    await page.getByLabel('Bot ID', { exact: true }).waitFor()
    expect(await panel.locator('[data-plugin-item-detail="wecom-connector"] svg[data-connector-icon="wecom-connector"]').count()).toBe(1)
    await panel.getByRole('button', { name: '\u8fd4\u56de\u63d2\u4ef6', exact: true }).click()
    await page.locator('[data-plugin-item="ragflow-connector"] button').first().click()
    await page.getByLabel('\u5141\u8bb8\u68c0\u7d22\u7684\u77e5\u8bc6\u5e93', { exact: true }).waitFor()
    const protectedRows = await scaffold.ctx.pluginManager.listPlugins()
    for (const name of ['ui-settings', 'ui-layout', 'ui-renderer', 'ui-sidebar']) {
      const row = protectedRows.find(row => row.moduleName === '@deepseek-ai/dsh-client-' + name)
      expect(row).toMatchObject({ readOnlyReason: 'management-required' })
      if (row === undefined) throw new Error('Missing management dependency')
      expect(await scaffold.ctx.pluginManager.setPluginEnabled(row.entryId, false)).toMatchObject({ application: 'failed', error: { code: 'management-required' } })
    }
    await panel.getByRole('button', { name: '\u8fd4\u56de\u63d2\u4ef6', exact: true }).click()
    expect(await page.locator('[data-plugin-item="ragflow-connector"]').count()).toBe(1)
    const pkg = '@deepseek-ai/dsh-tool-ragflow-connector'
    expect(scaffold.ctx.tools.get('ragflow_retrieval')).toBeDefined()
    const disabledResult = await scaffold.ctx.pluginManager.setBundleEnabled(pkg, false)
    expect(disabledResult, JSON.stringify(disabledResult)).toMatchObject({ application: 'applied' })
    expect(scaffold.ctx.tools.get('ragflow_retrieval')).toBeUndefined()
    await expect.poll(() => page.locator('[data-plugin-item="ragflow-connector"]').count()).toBe(0)
    const profileFile = join(scaffold.harnessHome, 'profiles/scaffold/package.json')
    const disabled = JSON.parse(await readFile(profileFile, 'utf8')) as { dsh: { profile: { bundles: string[] } } }
    expect(disabled.dsh.profile.bundles).not.toContain(pkg)
    expect(await scaffold.ctx.pluginManager.setBundleEnabled(pkg, true)).toMatchObject({ application: 'applied' })
    expect(scaffold.ctx.tools.get('ragflow_retrieval')).toBeDefined()
    await expect.poll(() => page.locator('[data-plugin-item="ragflow-connector"]').count()).toBe(1)
    const fixture = join(scaffold.workspaceCwd, 'native-plugin-fixture')
    await mkdir(fixture)
    const fixtureName = 'dsh-enhanced-test-connector'
    await writeFile(join(fixture, 'package.json'), JSON.stringify({ name: fixtureName, version: '1.0.0', type: 'module', dsh: { bundle: { patch: './cordis.patch.yml' } } }))
    await writeFile(join(fixture, 'cordis.patch.yml'), '- insert:\n    - id: installed-fixture\n      name: ./plugin.mjs\n')
    await writeFile(join(fixture, 'plugin.mjs'), 'export function apply(ctx) { ctx.provide("fixtureConnector", true) }\n')
    const installation = await scaffold.ctx.pluginManager.installBundle(fixture)
    expect(installation, JSON.stringify(installation)).toMatchObject({ application: 'applied', bundle: fixtureName })
    const rows = await scaffold.ctx.pluginManager.listPlugins()
    const installed = rows.find(row => row.moduleName.endsWith('/plugin.mjs'))
    expect(installed).toMatchObject({ enabled: true, fiberPhase: 'active' })
    if (installed === undefined) throw new Error('Installed fixture is missing')
    expect(await scaffold.ctx.pluginManager.setPluginEnabled(installed.entryId, false)).toMatchObject({ application: 'applied' })
    expect((await scaffold.ctx.pluginManager.listPlugins()).find(row => row.entryId === installed.entryId)?.enabled).toBe(false)
    expect(await scaffold.ctx.pluginManager.removeBundle(fixtureName)).toMatchObject({ application: 'applied' })
    expect((await scaffold.ctx.pluginManager.listBundles()).some(bundle => bundle.name === fixtureName)).toBe(false)
    await page.reload()
    await page.getByRole('button', { name: '\u63d2\u4ef6', exact: true }).click()
    await page.locator('[data-plugin-item="feishu-connector"] button').first().click()
    expect(await page.getByLabel('App ID', { exact: true }).inputValue()).toBe('cli_fixture_native_plugins')
    expect(console.pageErrors).toEqual([])
  } finally {
    await browser.close()
    await scaffold.close()
  }
})
