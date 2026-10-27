/** Native authorization ownership for an isolated official WeCom office connection. */
import { createHash } from 'node:crypto'
import { mkdir, mkdtemp, open, rm } from 'node:fs/promises'
import { homedir } from 'node:os'
import { basename, isAbsolute, join, resolve } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import type { ToolRunContext } from '@deepseek-ai/dsh-tools'
import { AuthorizationDeclinedError } from '@deepseek-ai/dsh-authorization'
import { credentialKey } from '@deepseek-ai/dsh-credentials'
import type { Config } from '../index.ts'
import type { WecomOfficeCapability, WecomOfficeCapabilityStatus, WecomOfficeError, WecomOfficeStatus } from '../types.ts'
import type { WecomOfficeSettings } from './config.ts'
import { OFFICE_CAPABILITIES, OFFICE_METHODS, OFFICE_OPERATIONS, officeProjection, officeRequest } from './operations.ts'
import type { OfficeOperation } from './operations.ts'
import { OfficeError, OfficeRuntime, officeJson } from './runtime.ts'
import { result } from '../limits.ts'
import { registerOfficeTools } from './tools.ts'
import { requireLocalOfficeConversation } from './policy.ts'

const key = credentialKey('enterprise-connectors', 'wecom-office')
interface Attempt {
  directory: string
  controller: AbortController
  expiresAt: number
  finished: Promise<void>
}
function failure(error: unknown): WecomOfficeError {
  return error instanceof OfficeError ? error.code : 'connection-failed'
}
function object(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : undefined
}

/** One DH home's office account, independent of its message-robot connection. */
export class WecomOffice {
  private readonly directory: string
  private readonly homeBinding: string
  private readonly runtime: OfficeRuntime
  private attempt: Attempt | undefined
  private error: WecomOfficeError | '' = ''
  private authorizerName = ''
  private corporationName = ''
  private capabilities: WecomOfficeCapabilityStatus[] = OFFICE_CAPABILITIES.map(id => ({ id, state: 'unknown' }))
  private lifetime = new AbortController()
  private tail: Promise<unknown> = Promise.resolve()
  private transitions: Promise<unknown> = Promise.resolve()
  private removeTools: (() => Promise<void>) | undefined
  private closing = false
  private checking = false

  /**
   * @param ctx - owning plugin scope with credentials, tools and optional web services.
   * @param settings - current saved office policy, independent of robot settings.
   * @param config - deployment deadlines, private storage and complete-result limits.
   */
  constructor(private readonly ctx: Context, private readonly settings: () => WecomOfficeSettings, private readonly config: Config) {
    const configured = config.wecomOfficeRuntime.directory
    if (configured && !isAbsolute(configured)) throw new Error('WeCom office directory must be absolute.')
    this.directory = resolve(configured || join(process.env.DSH_HOME ?? join(homedir(), '.dsh'), 'connections', 'wecom-office'))
    this.homeBinding = createHash('sha256').update(this.directory).digest('hex')
    this.runtime = new OfficeRuntime(ctx, config.wecomOfficeRuntime)
    ctx.inject(['authorization'], scope => scope.effect(() => scope.authorization.registerFlow({
      key, label: 'WeCom office', methods: [{ id: 'qr', label: 'WeCom QR authorization' }],
      run: async (session) => {
        const attempt = this.attempt
        if (!attempt) throw new OfficeError('not-authorized')
        const signal = AbortSignal.any([session.signal, attempt.controller.signal, AbortSignal.timeout(config.oauthTimeoutMs)])
        const credentials = join(attempt.directory, 'credentials')
        await this.runtime.checkVersion(attempt.directory, credentials, signal)
        await this.runtime.run(['auth', 'init', '--noninteractive', '--no-browser', '--output-qrcode', join(attempt.directory, 'qrcode.png')],
          attempt.directory, credentials, signal)
        const state = await this.runtime.run(['auth', 'show', '--status'], attempt.directory, credentials, signal)
        if (state !== 'authorized') throw new OfficeError('not-authorized')
        await this.ctx.credentials.modifyRecord(key, () => {
          signal.throwIfAborted()
          if (this.attempt !== attempt || !this.settings().enabled || this.closing) throw new OfficeError('cancelled')
          return Promise.resolve({ kind: 'grant', payload: { version: 1, home: this.homeBinding, directory: basename(attempt.directory) } })
        })
      },
    }), 'wecom.office-authorization'))
    ctx.effect(() => async () => { await this.dispose() }, 'wecom.office-lifetime')
  }

  /** Synchronize tool visibility with saved settings; disabling immediately cancels owned work. */
  configure(): void {
    if (this.settings().enabled && !this.closing) {
      if (this.lifetime.signal.aborted) this.lifetime = new AbortController()
      this.removeTools ??= this.ctx.effect(() => registerOfficeTools(this.ctx, this), 'wecom.office-tools')
    } else {
      void this.removeTools?.(); this.removeTools = undefined
      this.lifetime.abort(); this.attempt?.controller.abort()
    }
  }

  private async binding(): Promise<string | undefined> {
    const record = await this.ctx.credentials.readRecord(key)
    const payload = record?.kind === 'grant' ? object(record.payload) : undefined
    if (!payload || payload.version !== 1 || payload.home !== this.homeBinding) return undefined
    if (typeof payload.directory !== 'string' || !/^connection-[a-zA-Z0-9_-]{6,64}$/.test(payload.directory)) throw new OfficeError('invalid-result')
    return join(this.directory, payload.directory)
  }
  private sequential<T>(work: () => Promise<T>): Promise<T> {
    const value = this.tail.then(work)
    this.tail = value.catch(() => undefined)
    return value
  }
  private transition<T>(work: () => Promise<T>): Promise<T> {
    const value = this.transitions.then(work)
    this.transitions = value.catch(() => undefined)
    return value
  }
  private async privateRoot(): Promise<void> {
    await mkdir(this.directory, { recursive: true, mode: 0o700 })
  }
  private async cleanup(directory: string): Promise<void> {
    if (await this.binding() !== directory) await rm(directory, { recursive: true, force: true })
  }

  /**
   * Return browser-only state, including a pending attempt's private QR image.
   * @returns current account metadata; no credentials or raw CLI diagnostics.
   */
  async status(): Promise<WecomOfficeStatus> {
    const enabled = this.settings().enabled && !this.closing
    const attempt = this.attempt
    let qrImage = ''
    if (enabled && attempt && !attempt.controller.signal.aborted) {
      try {
        const file = await open(join(attempt.directory, 'qrcode.png'), 'r')
        try {
          const limit = this.config.wecomOfficeRuntime.maxOutputBytes
          const info = await file.stat()
          if (!info.isFile() || info.size > limit) throw new OfficeError('too-large')
          const bytes = Buffer.alloc(Math.min(info.size + 1, limit + 1))
          const { bytesRead } = await file.read(bytes, 0, bytes.length, 0)
          if (bytesRead > limit) throw new OfficeError('too-large')
          const png = bytes.subarray(0, bytesRead)
          if (png.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) qrImage = `data:image/png;base64,${png.toString('base64')}`
        } finally { await file.close() }
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw new OfficeError('invalid-result')
      }
    }
    const binding = enabled ? await this.binding() : undefined
    return { state: !enabled ? 'disabled' : attempt && !attempt.controller.signal.aborted ? 'pending'
      : this.checking ? 'checking' : binding && this.error !== 'not-authorized' ? 'authorized' : 'unauthorized',
    error: enabled ? this.error : '', authorizerName: this.authorizerName, corporationName: this.corporationName,
    qrImage, expiresAt: attempt?.expiresAt ?? 0, pollIntervalMs: this.config.wecomOfficeRuntime.pollIntervalMs,
    capabilities: this.capabilities.map(row => ({ ...row })) }
  }

  /**
   * Begin exactly one QR flow; an existing account remains available after a failed replacement.
   * @returns initial pending status; subsequent status reads expose the QR once written.
   */
  begin(): Promise<WecomOfficeStatus> {
    return this.transition(async () => {
      if (!this.settings().enabled || this.closing) throw new OfficeError('not-authorized')
      if (this.attempt) throw new OfficeError('unavailable')
      const authorization = this.ctx.get('authorization')
      if (!authorization || !this.ctx.get('subprocess')) throw new OfficeError('runtime-unavailable')
      this.lifetime.abort()
      await this.tail
      this.lifetime = new AbortController()
      await this.privateRoot()
      const directory = await mkdtemp(join(this.directory, 'connection-'))
      await mkdir(join(directory, 'credentials'), { mode: 0o700 })
      const old = await this.binding()
      const attempt: Attempt = { directory, controller: new AbortController(), expiresAt: Date.now() + this.config.oauthTimeoutMs,
        finished: Promise.resolve() }
      this.attempt = attempt
      this.error = ''
      attempt.finished = (async () => {
        try {
          const outcome = await authorization.begin({ key, method: 'qr', signal: attempt.controller.signal,
            interaction: { notify() {}, prompt() { return Promise.reject(new AuthorizationDeclinedError()) } },
          })
          if (outcome.status === 'authorized') {
            this.authorizerName = ''; this.corporationName = ''
            this.capabilities = OFFICE_CAPABILITIES.map(id => ({ id, state: 'unknown' }))
            if (old) await this.cleanup(old)
          } else this.error = 'cancelled'
        } catch (error: unknown) { this.error = attempt.controller.signal.aborted ? 'cancelled' : failure(error) }
        finally {
          await rm(join(directory, 'qrcode.png'), { force: true })
          await this.cleanup(directory)
          if (this.attempt === attempt) this.attempt = undefined
        }
      })()
      void attempt.finished.catch(() => { this.error = 'connection-failed'; if (this.attempt === attempt) this.attempt = undefined })
      return this.status()
    })
  }

  /**
   * Cancel only the pending QR attempt and await its process cleanup.
   * @returns status of the previously saved account, if any.
   */
  cancel(): Promise<WecomOfficeStatus> {
    return this.transition(async () => {
      const attempt = this.attempt
      attempt?.controller.abort()
      await attempt?.finished
      return this.status()
    })
  }

  /**
   * Stop account use and remove its local binding; platform-side consent is separate.
   * @returns disconnected metadata after owned work has settled.
   */
  disconnect(): Promise<WecomOfficeStatus> {
    return this.transition(async () => {
      this.lifetime.abort(); this.attempt?.controller.abort()
      await Promise.allSettled([this.attempt?.finished, this.tail])
      const old = await this.binding()
      await this.ctx.credentials.deleteRecord(key)
      if (old) await this.cleanup(old)
      this.authorizerName = ''; this.corporationName = ''; this.error = ''
      this.capabilities = OFFICE_CAPABILITIES.map(id => ({ id, state: 'unknown' }))
      if (this.settings().enabled && !this.closing) this.lifetime = new AbortController()
      return this.status()
    })
  }

  private async command(directory: string, args: readonly string[], signal: AbortSignal): Promise<Record<string, unknown>> {
    const credentials = join(directory, 'credentials')
    await this.runtime.checkVersion(directory, credentials, signal)
    return officeJson(await this.runtime.run(args, directory, credentials, signal))
  }

  /**
   * Inspect the saved account identity and discover fixed read interfaces, without reading user resources.
   * @returns independent discovery results; discovery alone does not assert resource permission.
   */
  async check(): Promise<WecomOfficeStatus> {
    if (this.attempt || this.checking) return this.status()
    const lifetime = this.lifetime.signal
    this.checking = true
    try {
      await this.sequential(async () => {
        if (!this.settings().enabled) throw new OfficeError('not-authorized')
        const directory = await this.binding()
        if (!directory) throw new OfficeError('not-authorized')
        const signal = AbortSignal.any([lifetime, AbortSignal.timeout(this.config.timeoutMs)])
        this.error = ''
        try {
          const identity = await this.command(directory, ['identity', 'whoami'], signal)
          const person = object(identity.authorizer) ?? object(identity.authorizer_info) ?? object(identity.user_info)
          const corporation = object(identity.corporation) ?? object(identity.corp_info)
          const name = person?.name ?? person?.user_name
          const company = corporation?.name ?? corporation?.corp_name
          this.authorizerName = typeof name === 'string' ? name.slice(0, 256) : ''
          this.corporationName = typeof company === 'string' ? company.slice(0, 256) : ''
        } catch (error) { this.error = failure(error) }
        for (const capability of OFFICE_CAPABILITIES) {
          if (!this.settings()[capability]) continue
          try {
            for (const method of OFFICE_METHODS[capability]) {
              const schema = await this.command(directory, ['schema', 'get', method], AbortSignal.any([lifetime, AbortSignal.timeout(this.config.timeoutMs)]))
              if (schema.method !== method) throw new OfficeError('invalid-result')
            }
            lifetime.throwIfAborted()
            if (this.capabilities.find(row => row.id === capability)?.state !== 'verified') this.setCapability(capability, 'discoverable')
          } catch (error) {
            lifetime.throwIfAborted()
            const code = failure(error)
            this.setCapability(capability, code === 'unavailable' ? 'unavailable' : code === 'permission-denied' ? 'permission-denied' : 'error')
          }
        }
      })
    } catch (error) { this.error = failure(error) }
    finally { this.checking = false }
    return this.status()
  }
  private setCapability(id: WecomOfficeCapability, state: WecomOfficeCapabilityStatus['state']): void {
    this.capabilities = this.capabilities.map(row => row.id === id ? { id, state } : row)
  }

  /**
   * Execute one policy-checked read against the current saved office account.
   * @param operation - fixed native office operation.
   * @param input - untrusted model arguments.
   * @param exec - trusted calling agent and caller-owned cancellation.
   * @returns bounded, credential-free reference JSON.
   */
  async read(operation: OfficeOperation, input: unknown, exec: ToolRunContext): Promise<string> {
    await requireLocalOfficeConversation(this.ctx, exec.agent, exec.signal)
    const signal = exec.signal
    const capability = OFFICE_OPERATIONS[operation]
    const lifetime = this.lifetime.signal
    const request = officeRequest(operation, input, this.config.maxPageSize)
    return this.sequential(async () => {
      const policy = this.settings()
      if (!policy.enabled || !policy[capability] || this.closing) throw new OfficeError('permission-denied')
      const binding = await this.binding()
      if (!binding) throw new OfficeError('not-authorized')
      const deadline = AbortSignal.any([signal, lifetime, AbortSignal.timeout(this.config.timeoutMs)])
      deadline.throwIfAborted()
      const directory = await mkdtemp(join(binding, 'read-'))
      try {
        const credentials = join(binding, 'credentials')
        await this.runtime.checkVersion(directory, credentials, deadline)
        const args = [...request.command, '--json', JSON.stringify(request.payload)]
        const data = officeJson(await this.runtime.run(args, directory, credentials, deadline))
        const projected = await officeProjection(operation, data, directory,
          this.config.wecomOfficeRuntime.maxTextBytes, this.config.maxPageSize)
        deadline.throwIfAborted()
        if (!this.settings().enabled || !this.settings()[capability] || await this.binding() !== binding) throw new OfficeError('cancelled')
        const output = result({ channel: 'wecom-office', ...projected }, this.config.maxResultBytes)
        this.setCapability(capability, 'verified')
        return output
      } catch (error) {
        const code = failure(error)
        if (code === 'not-authorized') this.error = code
        this.setCapability(capability, code === 'unavailable' ? 'unavailable' : code === 'permission-denied' ? 'permission-denied' : 'error')
        if (error instanceof OfficeError) throw error
        throw new OfficeError(deadline.aborted ? 'cancelled' : 'invalid-result')
      } finally { await rm(directory, { recursive: true, force: true }) }
    })
  }

  private async dispose(): Promise<void> {
    this.closing = true
    await this.removeTools?.(); this.removeTools = undefined
    this.lifetime.abort(); this.attempt?.controller.abort()
    await Promise.allSettled([this.transitions, this.attempt?.finished, this.tail])
  }
}
