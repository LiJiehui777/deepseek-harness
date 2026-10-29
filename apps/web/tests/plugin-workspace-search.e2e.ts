/** Connector credentials must not filter the sidebar through its collapsed search field. */
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'
import { expect, it } from 'vitest'
import type {} from '@deepseek-ai/dsh-workspace'
import { captureStableAria, compareOrRefreshGolden, launchWebScaffold, seedSession, webSnapshotMode, watchConsole } from './scaffold.ts'

it('retains existing Workspace sessions while opening connector credential forms', async () => {
  const scaffold = await launchWebScaffold({ pluginManagement: true, extraOverlayPath: fileURLToPath(new URL('../../cli/config/examples/ztt/cordis.yml', import.meta.url)) })
  try {
    const sessionFixture = await readFile(fileURLToPath(new URL('../../../snapshots/web/message-feedback-protocol/session.v3.jsonl', import.meta.url)), 'utf8')
    const sessionId = await seedSession(scaffold, sessionFixture, 'plugin-workspace-search')
    const workspace = await scaffold.ctx.workspaceRegistry.create(scaffold.workspaceCwd, '质量工作区')
    await workspace.attachSession(sessionId)
    const browser = await chromium.launch()
    try {
      const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, locale: 'zh-CN' })
      const tripwire = watchConsole(page)
      await page.goto(scaffold.authenticatedUrl)
      const tree = page.getByRole('tree', { name: '会话', exact: true })
      const workspaceRow = tree.getByRole('treeitem').filter({ has: page.getByText('质量工作区', { exact: true }) }).first()
      await workspaceRow.waitFor()
      if (await workspaceRow.getAttribute('aria-expanded') !== 'true') await workspaceRow.click()
      await tree.getByText('新会话', { exact: true }).waitFor()
      await expect.poll(() => tree.getByRole('treeitem').count()).toBeGreaterThan(1)
      const rowCount = await tree.getByRole('treeitem').count()
      await page.getByRole('button', { name: '插件', exact: true }).click()
      const panel = page.locator('[data-plugin-panel]')
      const searchInput = page.getByPlaceholder('搜索会话…', { exact: true })
      for (const id of ['ragflow-connector', 'feishu-connector', 'wecom-connector']) {
        await page.locator(`[data-plugin-item="${id}"] button`).first().click()
        await panel.locator(`[data-plugin-item-detail="${id}"]`).waitFor()
        expect(await searchInput.isDisabled()).toBe(true)
        expect(await searchInput.getAttribute('autocomplete')).toBe('off')
        // Password managers can dispatch native input events without focusing the hidden field.
        await searchInput.evaluate((element: HTMLInputElement) => {
          const descriptor = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')
          if (descriptor?.set === undefined) throw new Error('Missing native input setter')
          descriptor.set.call(element, 'saved-connector-account')
          element.dispatchEvent(new Event('input', { bubbles: true }))
        })
        await expect.poll(() => tree.getByRole('treeitem').count()).toBe(rowCount)
        expect(await page.getByText('无匹配会话', { exact: true }).count()).toBe(0)
        expect(workspace.sessionIds).toContain(sessionId)
        await panel.getByRole('button', { name: '返回插件', exact: true }).click()
      }
      await page.getByRole('button', { name: '搜索会话', exact: true }).click()
      await searchInput.fill('no-matching-quality-session')
      await page.getByText('无匹配会话', { exact: true }).waitFor()
      await page.getByRole('button', { name: '清除搜索', exact: true }).click()
      await expect.poll(() => tree.getByRole('treeitem').count()).toBe(rowCount)
      expect(await searchInput.isDisabled()).toBe(true)
      await compareOrRefreshGolden(fileURLToPath(new URL('./expected/plugin-workspace-search/sidebar-header.expected.md', import.meta.url)), await captureStableAria(page, '[class*="sectionHeader"]:has(input[placeholder="搜索会话…"])', scaffold.workspaceCwd), webSnapshotMode())
      expect(tripwire.pageErrors).toEqual([])
    } finally {
      await browser.close()
    }
  } finally {
    await scaffold.close()
  }
})
