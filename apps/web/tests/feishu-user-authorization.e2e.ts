/** Real Web OAuth callback, native credential records and user-token resource reads against a local provider. */
import { createHash } from 'node:crypto'
import { once } from 'node:events'
import { createServer, type Server } from 'node:http'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { chromium, type Browser } from 'playwright'
import { afterEach, expect, it } from 'vitest'
import { credentialKey } from '@deepseek-ai/dsh-credentials'
import { ToolCallId } from '@deepseek-ai/dsh-llm'
import type {} from '@deepseek-ai/dsh-enterprise-connectors'
import { launchWebScaffold, watchConsole, type WebScaffold } from './scaffold.ts'

let server: Server | undefined
let browser: Browser | undefined
let scaffold: WebScaffold | undefined
let directory: string | undefined
afterEach(async () => {
  try { await browser?.close() }
  finally {
    browser = undefined
    try { await scaffold?.close() }
    finally {
      scaffold = undefined
      if (server) {
        server.closeAllConnections()
        await new Promise<void>((resolve, reject) => { server!.close(error => error ? reject(error) : resolve()) })
      }
      server = undefined
      if (directory) await rm(directory, { recursive: true, force: true })
      directory = undefined
    }
  }
})
it('authorizes in the same browser, reads as the user, rotates one refresh token and disconnects without app fallback', async () => {
  const tokens: Array<Record<string, unknown>> = []
  const reads: Array<{ path: string; auth: string | undefined }> = []
  let challenge = ''
  let callback = ''
  let expired = false
  server = createServer((req, res) => {
    void (async () => {
      const url = new URL(req.url!, 'http://fixture.invalid')
      if (url.pathname === '/authorize') {
        challenge = url.searchParams.get('code_challenge')!
        expect(url.searchParams.get('code_challenge_method')).toBe('S256')
        expect(url.searchParams.get('scope')).toContain('im:message.group_msg:get_as_user')
        callback = `${url.searchParams.get('redirect_uri')}?${new URLSearchParams({ state: url.searchParams.get('state')!, code: 'fixture-code' })}`
        res.writeHead(200, { 'Content-Type': 'text/html' })
        res.end(`<a href="${callback.replaceAll('&', '&amp;')}" id="accept">Authorize fixture user</a>`)
        return
      }
      const chunks: Buffer[] = []
      for await (const chunk of req as AsyncIterable<Uint8Array>) chunks.push(Buffer.from(chunk))
      const body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString()) as Record<string, unknown> : {}
      let data: unknown = { code: 0, bot: { open_id: 'bot_a' } }
      if (url.pathname.endsWith('/oauth/token')) {
        tokens.push(body)
        if (expired) { res.writeHead(400, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'invalid_grant', error_description: 'fixture-oauth-secret' })); return }
        data = { code: 0, access_token: tokens.length === 1 ? 'fixture-user-token' : 'fixture-user-rotated', expires_in: 7200,
          refresh_token: tokens.length === 1 ? 'fixture-refresh-token' : 'fixture-refresh-rotated', refresh_token_expires_in: 86400,
          scope: 'im:chat:read im:message:readonly im:message.group_msg:get_as_user offline_access' }
      } else if (url.pathname.endsWith('/user_info')) data = { code: 0, data: { name: 'Quality fixture user', open_id: 'user_a' } }
      else if (url.pathname.includes('tenant_access_token')) data = { code: 0, tenant_access_token: 'fixture-app-token', expire: 7200 }
      else if (url.pathname.endsWith('/messages') || url.pathname.endsWith('/chats')) {
        reads.push({ path: url.pathname, auth: req.headers.authorization })
        data = { code: 0, data: { items: [], has_more: false } }
      }
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify(data))
    })().catch(() => { res.destroy() })
  })
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const address = server.address()
  if (!address || typeof address !== 'object') throw new Error('Missing fixture port')
  directory = await mkdtemp(join(tmpdir(), 'feishu-oauth-web-'))
  const overlay = join(directory, 'cordis.patch.yml')
  await writeFile(overlay, `- insert:\n    - id: enterprise-authorization\n      name: '@deepseek-ai/dsh-authorization'\n    - id: enterprise-connectors\n      name: '@deepseek-ai/dsh-enterprise-connectors'\n      config:\n        feishu:\n          secretRef: DSH_TEST_FEISHU_OAUTH_SECRET\n          baseURL: http://127.0.0.1:${address.port}\n        timeoutMs: 2000\n`)
  scaffold = await launchWebScaffold({ extraOverlayPath: overlay })
  browser = await chromium.launch()
  const context = await browser.newContext({ locale: 'en-US' })
  const page = await context.newPage()
  const tripwire = watchConsole(page)
  await page.goto(scaffold.authenticatedUrl)
  await page.getByRole('button', { name: 'Settings', exact: true }).click()
  const settings = page.getByRole('dialog', { name: 'Settings', exact: true })
  await settings.getByRole('button', { name: 'Plugins', exact: true }).click()
  const feishu = settings.getByRole('listitem').filter({ has: page.getByRole('button', { name: /settings: Feishu connector$/ }) })
  await feishu.getByRole('button', { name: 'Show settings: Feishu connector', exact: true }).click()
  await feishu.getByLabel('App ID', { exact: true }).fill('cli_0123456789abcdef')
  await feishu.getByLabel('App Secret', { exact: true }).fill('fixture-oauth-secret')
  await feishu.getByRole('checkbox', { name: 'Enable this connection', exact: true }).check()
  await feishu.getByRole('checkbox', { name: 'Use my Feishu account for reads', exact: true }).check()
  await feishu.getByRole('button', { name: 'Save', exact: true }).click()
  await feishu.getByRole('button', { name: 'Show settings: Feishu connector', exact: true }).click()
  const execute = (name: string, args: unknown = {}) => scaffold!.ctx.tools.execute({ name,
    callId: ToolCallId(`oauth-${name}`), arguments: args, signal: new AbortController().signal })
  const blocked = await execute('feishu_read_messages', { chat_id: 'chat_a' })
  expect(blocked.isError).toBe(true)
  expect(reads).toHaveLength(0)
  const popupEvent = page.waitForEvent('popup')
  await feishu.getByRole('button', { name: 'Authorize my Feishu account', exact: true }).click()
  const popup = await popupEvent
  await popup.locator('#accept').waitFor()
  expect(tokens).toHaveLength(0)
  const bad = new URL(callback)
  bad.searchParams.set('state', 'incorrect-state')
  expect((await context.request.get(bad.href, { maxRedirects: 0 })).status()).toBe(400)
  const outsider = await browser.newContext()
  try {
    expect((await outsider.request.get(callback, { maxRedirects: 0 })).status()).toBe(400)
    const start = await feishu.getByRole('link', { name: 'Open Feishu authorization page', exact: true }).getAttribute('href')
    expect((await outsider.request.get(start!, { maxRedirects: 0 })).status()).toBe(401)
  }
  finally { await outsider.close() }
  await popup.locator('#accept').click()
  await feishu.getByText('Account authorized: Quality fixture user', { exact: true }).waitFor()
  expect(tokens).toHaveLength(1)
  expect(tokens[0]?.client_secret).toBe('fixture-oauth-secret')
  expect(createHash('sha256').update(String(tokens[0]?.code_verifier)).digest('base64url')).toBe(challenge)
  expect(tokens[0]?.redirect_uri).toBe(callback.split('?')[0])
  expect((await context.request.get(callback, { maxRedirects: 0 })).status()).toBe(400)
  expect((await execute('feishu_read_messages', { chat_id: 'chat_a' })).isError).toBe(false)
  expect(reads.at(-1)?.auth).toBe('Bearer fixture-user-token')
  const key = credentialKey('enterprise-connectors', 'feishu-user')
  await scaffold.ctx.credentials.modifyRecord(key, (record) => {
    if (record?.kind !== 'grant' || typeof record.payload !== 'object' || record.payload === null) throw new Error('Missing fixture grant')
    return Promise.resolve({ kind: 'grant', payload: { ...record.payload, expiresAt: 0 } })
  })
  const refreshed = await Promise.all([execute('feishu_list_chats'), execute('feishu_read_messages', { chat_id: 'chat_a' })])
  expect(refreshed.every(value => !value.isError)).toBe(true)
  expect(tokens).toHaveLength(2)
  expect(tokens[1]?.grant_type).toBe('refresh_token')
  expect(tokens[1]?.refresh_token).toBe('fixture-refresh-token')
  expect(reads.slice(-2).every(row => row.auth === 'Bearer fixture-user-rotated')).toBe(true)
  const settingsText = await readFile(join(scaffold.harnessHome, 'settings.yaml'), 'utf8')
  expect(settingsText).not.toContain('fixture-user-token')
  expect(settingsText).not.toContain('fixture-refresh-token')
  const publicStatus = JSON.stringify(await scaffold.ctx.enterpriseConnectors.feishuAuthorization())
  expect(publicStatus).not.toContain('fixture-user')
  expect(publicStatus).not.toContain('fixture-refresh')
  const fullGrant = await scaffold.ctx.credentials.readRecord(key)
  if (fullGrant?.kind !== 'grant' || typeof fullGrant.payload !== 'object' || fullGrant.payload === null) throw new Error('Missing saved grant')
  await scaffold.ctx.credentials.modifyRecord(key, () => Promise.resolve({ kind: 'grant', payload: { ...fullGrant.payload, scopes: ['im:chat:read'] } }))
  const countBeforeMissingScope = reads.length
  expect((await execute('feishu_read_messages', { chat_id: 'chat_a' })).isError).toBe(true)
  expect(reads).toHaveLength(countBeforeMissingScope)
  await scaffold.ctx.credentials.modifyRecord(key, () => Promise.resolve({ kind: 'grant', payload: { ...fullGrant.payload, expiresAt: 0 } }))
  expired = true
  const expiredRead = await execute('feishu_list_chats')
  expect(expiredRead.isError).toBe(true)
  expect(JSON.stringify(expiredRead)).not.toContain('fixture-oauth-secret')
  expect((await scaffold.ctx.enterpriseConnectors.feishuAuthorization()).state).toBe('unauthorized')
  expired = false
  await feishu.getByRole('button', { name: 'Disconnect my account', exact: true }).click()
  await feishu.getByText('Account not authorized', { exact: true }).waitFor()
  expect(await scaffold.ctx.credentials.readRecord(key)).toBeUndefined()
  const readCount = reads.length
  expect((await execute('feishu_list_chats')).isError).toBe(true)
  expect(reads).toHaveLength(readCount)
  const pendingPopupEvent = page.waitForEvent('popup')
  await feishu.getByRole('button', { name: 'Authorize my Feishu account', exact: true }).click()
  const pendingPopup = await pendingPopupEvent
  await pendingPopup.locator('#accept').waitFor()
  await feishu.getByRole('button', { name: 'Disconnect my account', exact: true }).click()
  await feishu.getByText('Account not authorized', { exact: true }).waitFor()
  expect((await context.request.get(callback, { maxRedirects: 0 })).status()).toBe(400)
  expect(await scaffold.ctx.credentials.readRecord(key)).toBeUndefined()
  expect(tripwire.pageErrors).toEqual([])
})
