/** Feishu OAuth: native authorization flow, browser-bound PKCE callback and atomic credential refresh. */
import { createHash, randomBytes } from 'node:crypto'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Context } from '@deepseek-ai/cordis'
import { AuthorizationDeclinedError, type AuthorizationSession } from '@deepseek-ai/dsh-authorization'
import { credentialKey, credentialRef, type CredentialRecord } from '@deepseek-ai/dsh-credentials'
import type {} from '@deepseek-ai/dsh-host-webserver'
import type {} from '@deepseek-ai/dsh-client-connection'
import axios from 'axios'
import { z } from 'zod'
import type { Config } from './index.ts'
import type { FeishuSettings } from './config.ts'
import type { FeishuAuthorizationStatus } from './types.ts'
import { cancellable, endpoint } from './limits.ts'

const key = credentialKey('enterprise-connectors', 'feishu-user')
const callbackPath = '/auth/feishu/callback'
const cookieName = 'dsh_feishu_oauth'
const tokenResponse = z.object({ code: z.literal(0), access_token: z.string().min(1).max(16384),
  expires_in: z.number().int().positive().max(31536000), refresh_token: z.string().min(1).max(16384).optional(),
  refresh_token_expires_in: z.number().int().nonnegative().max(31536000).optional(), scope: z.string().max(16384).optional() })
const grantSchema = z.object({ version: z.literal(1), binding: z.string(), accessToken: z.string().min(1),
  expiresAt: z.number(), refreshToken: z.string().optional(), refreshExpiresAt: z.number().optional(),
  scopes: z.array(z.string()), userName: z.string(), userId: z.string() })
class ConsentExpired extends Error {}
type Grant = z.infer<typeof grantSchema>
interface Attempt {
  state: string
  verifier: string
  cookie: string
  binding: string
  redirectURI: string
  authorizeURL: string
  abort: AbortController
  accept: (code: string) => void
  finished: Promise<void>
  started: boolean
}
function hash(value: string): string { return createHash('sha256').update(value).digest('base64url') }
function grant(record: CredentialRecord | undefined, binding: string): Grant | undefined {
  const value = record?.kind === 'grant' ? grantSchema.safeParse(record.payload) : undefined
  return value?.success && value.data.binding === binding ? value.data : undefined
}
/** One Feishu account's user grant; no credential is exposed through its status. */
export class FeishuAuthorization {
  private attempt: Attempt | undefined
  private error: FeishuAuthorizationStatus['error'] = ''
  private beginning = false
  private localRedirectURI: (() => string) | undefined
  private routeAvailable = false
  private generation = new AbortController()
  private flowPending: Promise<void> | undefined
  private refreshPending: Promise<string> | undefined

  /**
   * @param ctx - Host scope with credentials and native authorization.
   * @param account - current saved Feishu settings.
   * @param config - request, refresh and authorization deadlines.
   */
  constructor(private readonly ctx: Context, private readonly account: () => FeishuSettings, private readonly config: Config) {
    ctx.effect(() => ctx.authorization.registerFlow({ key, label: 'Feishu', methods: [{ id: 'oauth', label: 'Feishu OAuth' }],
      run: (session) => {
        const work = this.runFlow(session)
        this.flowPending = work
        return work.finally(() => { if (this.flowPending === work) this.flowPending = undefined })
      },
    }), 'feishu.authorization-flow')
    ctx.inject(['webServer', 'connection'], (scope) => {
      this.routeAvailable = true
      this.localRedirectURI = () => `http://127.0.0.1:${scope.webServer.port}${callbackPath}`
      scope.effect(() => scope.webServer.register({ kind: 'exact', path: '/auth/feishu/start', handler: (req, res) => {
        const rejection = scope.connection.requestRejection(req)
        if (rejection !== undefined) { res.writeHead(rejection); res.end(); return }
        this.startBrowser(req, res)
      } }), 'feishu.oauth-start')
      scope.effect(() => scope.webServer.register({ kind: 'exact', path: callbackPath,
        handler: (req, res) => this.callback(req, res) }), 'feishu.oauth-callback')
      scope.effect(() => () => { this.routeAvailable = false; this.localRedirectURI = undefined; this.invalidate() }, 'feishu.oauth-routes')
    })
    ctx.effect(() => async () => { const pending = [this.attempt?.finished, this.flowPending, this.refreshPending]; this.invalidate(); await Promise.allSettled(pending) }, 'feishu.oauth-lifetime')
  }
  private async runFlow(session: AuthorizationSession): Promise<void> {
    const attempt = this.attempt
    if (!attempt) throw new Error('Start Feishu authorization from Settings > Plugins.')
    const account = this.account()
    const signal = AbortSignal.any([session.signal, attempt.abort.signal, this.generation.signal])
    const code = await cancellable(new Promise<string>((resolve) => { attempt.accept = resolve }), signal)
    const secret = await this.secret()
    const token = await this.exchange(account, secret, { grant_type: 'authorization_code', code,
      redirect_uri: attempt.redirectURI, code_verifier: attempt.verifier }, signal)
    const user = await this.userInfo(account, token.access_token, signal)
    signal.throwIfAborted()
    if (attempt.binding !== this.binding(account)) throw new Error('Feishu account changed. Authorize again.')
    await this.ctx.credentials.modifyRecord(key, () => {
      signal.throwIfAborted()
      return Promise.resolve({ kind: 'grant', payload: this.makeGrant(token, attempt.binding, user) })
    })
  }
  private binding(account: FeishuSettings): string {
    return hash(JSON.stringify([account.appId, endpoint(account.baseURL, false), account.secretRef]))
  }
  private redirectURI(): string {
    const value = this.account().redirectURI || this.localRedirectURI?.() || ''
    const url = new URL(value)
    if ((url.protocol !== 'https:' && !(url.protocol === 'http:' && ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)))
      || url.username || url.password || url.search || url.hash || url.pathname !== callbackPath) {
      throw new Error('Use HTTPS or loopback HTTP with /auth/feishu/callback as the redirect URI.')
    }
    return url.href
  }
  private async secret(): Promise<string> {
    const resolved = await this.ctx.credentials.resolve(credentialRef(this.account().secretRef))
    if (!resolved?.value) throw new Error('Save the Feishu App ID and App Secret first.')
    return resolved.value
  }
  /**
   * Start one browser-bound authorization, replacing an unfinished attempt.
   * @returns a local start URL; that route checks DH browser authentication before redirecting to Feishu.
   */
  async begin(): Promise<string> {
    if (this.beginning) throw new Error('Feishu authorization is already starting.')
    this.beginning = true
    try { return await this.beginAttempt() } finally { this.beginning = false }
  }
  private async beginAttempt(): Promise<string> {
    const lifetime = this.generation.signal
    const account = this.account()
    if (!this.routeAvailable || !account.enabled || !account.appId.trim()) throw new Error('Enable and save the Feishu connector in the Web app first.')
    const origin = endpoint(account.baseURL, false)
    if (origin !== 'https://open.feishu.cn' && origin !== 'https://open.larksuite.com'
      && !/^http:\/\/127\.0\.0\.1:\d+$/.test(origin)) throw new Error('OAuth requires official Feishu/Lark or a loopback test endpoint.')
    await this.secret()
    lifetime.throwIfAborted()
    const previous = [this.attempt?.finished, this.flowPending]
    this.invalidate()
    const currentLifetime = this.generation.signal
    await Promise.allSettled(previous)
    currentLifetime.throwIfAborted()
    this.error = ''
    const redirectURI = this.redirectURI()
    const state = randomBytes(32).toString('base64url')
    const verifier = randomBytes(32).toString('base64url')
    const authorization = new URL(origin.startsWith('http:') ? `${origin}/authorize`
      : `https://accounts.${origin.includes('larksuite') ? 'larksuite.com' : 'feishu.cn'}/open-apis/authen/v1/authorize`)
    authorization.search = new URLSearchParams({ client_id: account.appId, response_type: 'code', redirect_uri: redirectURI,
      scope: account.userScopes.join(' '), state, code_challenge: hash(verifier), code_challenge_method: 'S256', prompt: 'consent' }).toString()
    const abort = new AbortController()
    const attempt: Attempt = { state, verifier, cookie: randomBytes(32).toString('base64url'), binding: this.binding(account),
      redirectURI, authorizeURL: authorization.href, abort, accept() {}, finished: Promise.resolve(), started: false }
    this.attempt = attempt
    const timer = setTimeout(() => { this.error = 'expired'; abort.abort() }, this.config.oauthTimeoutMs)
    attempt.finished = this.ctx.authorization.begin({ key, signal: abort.signal, interaction: {
      notify() {}, prompt() { return Promise.reject(new AuthorizationDeclinedError()) },
    } }).then((outcome) => { if (outcome.status !== 'authorized' && this.error === '') this.error = 'cancelled' })
      .catch(() => { if (this.error === '') this.error = 'failed' })
      .finally(() => { clearTimeout(timer); if (this.attempt === attempt) this.attempt = undefined })
    const start = new URL('/auth/feishu/start', redirectURI)
    start.searchParams.set('state', state)
    return start.href
  }
  private startBrowser(req: IncomingMessage, res: ServerResponse): void {
    const url = new URL(req.url ?? '/', 'http://dsh.invalid')
    const attempt = this.attempt
    if (req.method !== 'GET' || !attempt || attempt.started || url.searchParams.get('state') !== attempt.state
      || req.headers.host !== new URL(attempt.redirectURI).host) { res.writeHead(400); res.end(); return }
    attempt.started = true
    res.writeHead(303, { Location: attempt.authorizeURL, 'Set-Cookie': this.cookie(attempt, false),
      'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' })
    res.end()
  }
  private cookie(attempt: Attempt, clear: boolean): string {
    return `${cookieName}=${clear ? '' : attempt.cookie}; Path=/auth/feishu; HttpOnly; SameSite=Lax; Max-Age=${clear ? 0 : Math.ceil(this.config.oauthTimeoutMs / 1000)}${attempt.redirectURI.startsWith('https:') ? '; Secure' : ''}`
  }
  private async callback(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const url = new URL(req.url ?? '/', 'http://dsh.invalid')
    const attempt = this.attempt
    const cookie = (req.headers.cookie ?? '').split(';').map(value => value.trim()).find(value => value.startsWith(`${cookieName}=`))
    if (req.method !== 'GET' || !attempt?.started || url.searchParams.getAll('state').length !== 1
      || url.searchParams.get('state') !== attempt.state || cookie !== `${cookieName}=${attempt.cookie}`
      || req.headers.host !== new URL(attempt.redirectURI).host) { res.writeHead(400, { 'Cache-Control': 'no-store' }); res.end(); return }
    // Consume before the first await: duplicate callbacks cannot exchange the same code.
    attempt.started = false
    const code = url.searchParams.get('code')
    if (!url.searchParams.has('error') && code && code.length <= 4096 && url.searchParams.getAll('code').length === 1) attempt.accept(code)
    else { this.error = 'cancelled'; attempt.abort.abort() }
    await attempt.finished
    res.writeHead(303, { Location: '/', 'Set-Cookie': this.cookie(attempt, true), 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' })
    res.end()
  }
  private async exchange(account: FeishuSettings, secret: string, data: Record<string, string>, signal: AbortSignal) {
    try {
      const response = await axios.post<unknown>(`${endpoint(account.baseURL, false)}/open-apis/authen/v2/oauth/token`,
        { client_id: account.appId, client_secret: secret, ...data }, { signal, timeout: this.config.timeoutMs,
          maxContentLength: this.config.maxResultBytes, maxBodyLength: this.config.maxResultBytes, maxRedirects: 0 })
      return tokenResponse.parse(response.data)
    } catch (error) {
      if (axios.isAxiosError(error) && typeof error.response?.data === 'object' && error.response.data !== null
        && (error.response.data as { error?: unknown }).error === 'invalid_grant') throw new ConsentExpired('Authorize your Feishu account again.')
      throw new Error('Feishu user authorization failed. Check redirect URI, published user permissions, or authorize again.')
    }
  }
  private async userInfo(account: FeishuSettings, accessToken: string, signal: AbortSignal): Promise<{ userName: string; userId: string }> {
    try {
      const response = await axios.get<unknown>(`${endpoint(account.baseURL, false)}/open-apis/authen/v1/user_info`, {
        headers: { Authorization: `Bearer ${accessToken}` }, signal, timeout: this.config.timeoutMs,
        maxContentLength: this.config.maxResultBytes, maxRedirects: 0,
      })
      const value = z.object({ code: z.literal(0),
        data: z.object({ name: z.string().max(256), open_id: z.string().min(1).max(256) }),
      }).parse(response.data)
      return { userName: value.data.name, userId: value.data.open_id }
    } catch { throw new Error('Feishu did not confirm the authorized user. Authorize again.') }
  }
  private makeGrant(
    token: z.infer<typeof tokenResponse>, binding: string, user: { userName: string; userId: string }, previous?: Grant,
  ): Grant {
    const now = Date.now()
    return { version: 1, binding, ...user, accessToken: token.access_token, expiresAt: now + token.expires_in * 1000,
      scopes: token.scope === undefined ? previous?.scopes ?? [] : token.scope.split(/\s+/).filter(Boolean),
      ...(token.refresh_token === undefined ? previous?.refreshToken === undefined ? {} : { refreshToken: previous.refreshToken }
        : { refreshToken: token.refresh_token }),
      ...(token.refresh_token_expires_in === undefined
        ? previous?.refreshExpiresAt === undefined ? {} : { refreshExpiresAt: previous.refreshExpiresAt }
        : { refreshExpiresAt: now + token.refresh_token_expires_in * 1000 }) }
  }
  /**
   * Describe the current grant without returning access or refresh tokens.
   * @returns the read identity, callback URI, requested/granted permissions and authorization outcome.
   */
  async status(): Promise<FeishuAuthorizationStatus> {
    const account = this.account()
    const saved = grant(await this.ctx.credentials.readRecord(key), this.binding(account))
    return { identity: account.readIdentity, state: this.attempt ? 'pending' : saved && (saved.expiresAt > Date.now()
      || (saved.refreshToken && (saved.refreshExpiresAt === undefined || saved.refreshExpiresAt > Date.now()))) ? 'authorized' : 'unauthorized',
    error: this.error, redirectURI: this.routeAvailable ? this.redirectURI() : '', requestedScopes: [...account.userScopes],
    grantedScopes: saved?.scopes ?? [], userName: saved?.userName ?? '' }
  }
  /** Invalidate pending authorization and reads when the saved account or secret changes. */
  invalidate(): void { this.attempt?.abort.abort(); this.generation.abort(); this.generation = new AbortController() }
  /** Remove this DH home's grant and stop in-flight refreshes; platform-side consent is managed in Feishu. */
  async revoke(): Promise<void> {
    const pending = [this.attempt?.finished, this.flowPending, this.refreshPending]
    this.invalidate()
    await Promise.allSettled(pending)
    await this.ctx.credentials.deleteRecord(key)
    this.error = ''
  }
  /**
   * Resolve or atomically refresh the saved user token; never fall back to an app token.
   * @param operation - read capability to check against the actual granted scopes.
   * @param signal - caller cancellation, separate from shared refresh work.
   * @returns a Host-only access token.
   */
  async accessToken(operation: string, signal: AbortSignal): Promise<string> {
    const account = this.account()
    const binding = this.binding(account)
    const saved = grant(await this.ctx.credentials.readRecord(key), binding)
    const required = operation === 'document' ? ['docx:document:readonly'] : ['im:chat:read', ...(operation === 'messages' ? ['im:message:readonly', 'im:message.group_msg:get_as_user'] : [])]
    if (!saved || required.some(scope => !saved.scopes.includes(scope))) throw new Error('Authorize the required Feishu user permissions in Settings > Plugins > Feishu connector. User reads never fall back to application identity.')
    if (saved.expiresAt > Date.now() + this.config.oauthRefreshSkewMs) return saved.accessToken
    if (!this.refreshPending) {
      const lifetime = this.generation.signal
      this.refreshPending = this.ctx.credentials.modifyRecord(key, async (record) => {
        lifetime.throwIfAborted()
        const current = grant(record, binding)
        if (!current) throw new Error('Authorize your Feishu account again.')
        if (current.expiresAt > Date.now() + this.config.oauthRefreshSkewMs) return undefined
        if (!current.refreshToken || (current.refreshExpiresAt !== undefined && current.refreshExpiresAt <= Date.now())) throw new Error('Feishu user authorization has expired. Authorize again.')
        try {
          const token = await this.exchange(account, await this.secret(), { grant_type: 'refresh_token', refresh_token: current.refreshToken }, lifetime)
          lifetime.throwIfAborted()
          return { kind: 'grant', payload: this.makeGrant(token, binding, current, current) }
        } catch (error) {
          if (!(error instanceof ConsentExpired)) throw error
          this.error = 'expired'
          return { kind: 'grant', payload: { version: 1, binding, accessToken: current.accessToken,
            expiresAt: 0, scopes: current.scopes, userName: current.userName, userId: current.userId } }
        }
      }).then((record) => {
        lifetime.throwIfAborted()
        const current = grant(record, binding)
        if (!current || current.expiresAt <= Date.now() || required.some(scope => !current.scopes.includes(scope))) throw new Error('Authorize your Feishu account again.')
        return current.accessToken
      }).finally(() => { this.refreshPending = undefined })
    }
    await cancellable(this.refreshPending, signal)
    const refreshed = grant(await this.ctx.credentials.readRecord(key), binding)
    signal.throwIfAborted()
    if (!refreshed || required.some(scope => !refreshed.scopes.includes(scope))) throw new Error('Authorize your Feishu account again.')
    return refreshed.accessToken
  }
}
