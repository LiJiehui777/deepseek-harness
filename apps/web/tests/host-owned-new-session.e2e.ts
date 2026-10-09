/** Built Web contract for host-owned New Session with per-conversation knowledge selection. */
import { createServer } from 'node:http'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Browser, Page } from 'playwright'
import { chromium } from 'playwright'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { compareOrRefreshGolden, webSnapshotMode, launchWebScaffold, type WebScaffold } from './scaffold.ts'
import { connectFreshWorkspace, newEnglishPage } from './support.ts'

const EXPECTED = fileURLToPath(new URL('./expected/host-channel-plugins/panel.expected.md', import.meta.url))
const MODE = webSnapshotMode()

describe('web e2e: host-owned New Session', () => {
  let scaffold: WebScaffold
  let browser: Browser
  let page: Page
  let root: string
  let nativeOrigin: string
  const host = createServer((_request, response) => {
    response.setHeader('Content-Type', 'text/html; charset=utf-8')
    response.end(`<!doctype html><title>Knowledge selection host</title>
      <iframe title="Harness conversation" src="${scaffold.authenticatedUrl}" style="width:1500px;height:900px"></iframe>
      <dialog aria-label="Reference knowledge bases"><p>Choose reference knowledge bases for the new conversation</p>
      <button onclick="this.closest('dialog').close()">Cancel</button></dialog>
      <dialog aria-label="Channel accounts"><p id="channel-name"></p>
      <button onclick="this.closest('dialog').close()">Cancel</button></dialog>
      <script>window.requests=0;window.addEventListener('message',event=>{
        const frame=document.querySelector('iframe');
        if(event.source!==frame.contentWindow||event.origin!==${JSON.stringify(nativeOrigin)} )return;
        if(event.data?.type==='ragflow.workbench.channel-status-request') {
          frame.contentWindow.postMessage({type:'ragflow.workbench.channel-status',channels:[
            {channel:'feishu',configuredAccounts:1,enabled:true,boundAccountName:'Research bot'},
            {channel:'wecom',configuredAccounts:0,enabled:false}]},event.origin);
        } else if(event.data?.type==='ragflow.workbench.manage-channel'&&['feishu','wecom'].includes(event.data.channel)) {
          document.querySelector('#channel-name').textContent=event.data.channel;
          document.querySelector('[aria-label="Channel accounts"]').showModal();
        } else if(event.data?.type==='ragflow.workbench.new-conversation') {
          window.requests++;document.querySelector('[aria-label="Reference knowledge bases"]').showModal();
        }
      });</script>`)
  })

  beforeAll(async () => {
    await new Promise<void>(resolve => host.listen(0, '127.0.0.1', resolve))
    const address = host.address()
    if (address === null || typeof address === 'string') throw new Error('missing test host port')
    const hostUrl = `http://127.0.0.1:${address.port}`
    root = await mkdtemp(join(tmpdir(), 'host-new-session-'))
    const overlay = join(root, 'host.patch.yml')
    await writeFile(overlay, `- id: ui-brand-official\n  disabled: true\n- id: ui-host-return\n  config:\n    returnUrl: ${hostUrl}/workbench\n    newConversationUrl: ${hostUrl}/workbench/conversation?new=1\n    channelManagementUrl: ${hostUrl}/user-setting/chat-channel\n    hostName: RAGFlow\n    agentName: Conversation A\n    workspaceName: Workbench\n    datasetNames: [Knowledge A]\n`)
    scaffold = await launchWebScaffold({ extraOverlayPath: overlay })
    nativeOrigin = new URL(scaffold.authenticatedUrl).origin
    browser = await chromium.launch()
    page = await newEnglishPage(browser)
    await page.goto(scaffold.authenticatedUrl, { waitUntil: 'load' })
    await connectFreshWorkspace(page, scaffold.workspaceCwd, 'host-new-session')
    await page.goto(hostUrl, { waitUntil: 'load' })
    await page.frameLocator('iframe').getByRole('button', { name: 'New session', exact: true }).first().waitFor()
  }, 180_000)

  afterAll(async () => {
    await browser?.close()
    await scaffold?.close()
    await new Promise<void>(resolve => host.close(() => { resolve() }))
    if (root !== undefined) await rm(root, { recursive: true, force: true })
  })

  it('opens host knowledge selection from the native button and cancellation retains the current Session', async () => {
    const frame = page.frameLocator('iframe')
    const composer = frame.locator('[data-composer-input]')
    await composer.fill('Keep this unsent conversation draft')
    await frame.getByRole('button', { name: 'New session', exact: true }).first().click()
    const dialog = page.getByRole('dialog', { name: 'Reference knowledge bases' })
    await dialog.waitFor({ timeout: 15_000 })
    expect(await page.evaluate(() => (window as unknown as { requests: number }).requests)).toBe(1)
    await dialog.getByRole('button', { name: 'Cancel' }).click()
    expect(await composer.innerText()).toBe('Keep this unsent conversation draft')
    expect(await frame.getByText('Conversation A', { exact: true }).count()).toBeGreaterThan(0)
    await frame.getByRole('button', { name: 'New session', exact: true }).nth(1).click()
    await dialog.waitFor()
    expect(await page.evaluate(() => (window as unknown as { requests: number }).requests)).toBe(2)
    await dialog.getByRole('button', { name: 'Cancel' }).click()
    expect(await composer.innerText()).toBe('Keep this unsent conversation draft')
  })
  it('manages both read-only channel plugins from native Settings without losing the draft', async () => {
    const frame = page.frameLocator('iframe')
    const composer = frame.locator('[data-composer-input]')
    await composer.fill('Keep this unsent conversation draft')
    await frame.getByRole('button', { name: 'Settings', exact: true }).click()
    const settings = frame.getByRole('dialog', { name: 'Settings' })
    await settings.getByRole('button', { name: 'Plugins', exact: true }).click()
    await settings.getByRole('tab', { name: 'Connections', exact: true }).click()
    await settings.getByText('Bound account: Research bot', { exact: true }).waitFor()
    const panel = settings.getByRole('tabpanel', { name: 'Connections' })
    await compareOrRefreshGolden(EXPECTED, await panel.ariaSnapshot(), MODE)
    const managers = panel.getByRole('button', { name: 'Manage accounts', exact: true })
    for (const [index, channel] of ['feishu', 'wecom'].entries()) {
      await managers.nth(index).click()
      const dialog = page.getByRole('dialog', { name: 'Channel accounts' })
      await dialog.waitFor()
      expect(await dialog.locator('p').innerText()).toBe(channel)
      await dialog.getByRole('button', { name: 'Cancel' }).click()
      expect(await settings.isVisible()).toBe(true)
    }
    await settings.getByRole('button', { name: 'Close', exact: true }).click()
    expect(await composer.innerText()).toBe('Keep this unsent conversation draft')
  })

})
