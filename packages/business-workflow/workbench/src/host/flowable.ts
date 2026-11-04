/** Private authenticated Flowable REST adapter, with bounded calls and no automatic mutation retries. */

/** Flowable deployment connection settings. */
export interface FlowableConnection {
  baseUrl: string
  username: string
  requestTimeoutMs: number
}

/** Expected engine transport or response failure, safe to report without response bodies or credentials. */
export class FlowableError extends Error {}

/** Admit an engine response object. */
export function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new FlowableError('FLOWABLE_INVALID_RESPONSE')
  return value as Record<string, unknown>
}
/** Admit one required identifier or string field. */
export function string(value: unknown): string {
  if (typeof value !== 'string') throw new FlowableError('FLOWABLE_INVALID_RESPONSE')
  return value
}

/** REST operations share the host lifetime and resolve the current credential for every call. */
export class FlowableClient {
  constructor(
    private readonly config: FlowableConnection,
    private readonly password: () => Promise<string>,
    private readonly lifetime: AbortSignal,
  ) {
    const url = new URL(config.baseUrl)
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) {
      throw new Error('Flowable baseUrl requires an HTTP(S) URL without credentials, query, or fragment')
    }
    if (url.protocol === 'http:' && !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)) {
      throw new Error('Remote Flowable connections require HTTPS')
    }
  }

  /** Execute one REST operation; POST and PUT failures are never retried here. */
  async request(path: string, method = 'GET', body?: unknown): Promise<unknown> {
    const password = await this.password()
    const multipart = body instanceof FormData
    let response: Response
    try {
      response = await fetch(`${this.config.baseUrl.replace(/\/$/, '')}/${path}`, {
        method, redirect: 'error',
        headers: { Authorization: `Basic ${Buffer.from(`${this.config.username}:${password}`).toString('base64')}`,
          ...(body === undefined || multipart ? {} : { 'Content-Type': 'application/json' }) },
        ...(body === undefined ? {} : { body: multipart ? body : JSON.stringify(body) }),
        signal: AbortSignal.any([this.lifetime, AbortSignal.timeout(this.config.requestTimeoutMs)]),
      })
    } catch (cause) {
      if (this.lifetime.aborted) throw this.lifetime.reason
      throw new FlowableError('FLOWABLE_UNAVAILABLE', { cause })
    }
    if (!response.ok) {
      await response.body?.cancel()
      throw new FlowableError(`FLOWABLE_HTTP_${response.status}`)
    }
    if (response.status === 204) return null
    const text = await response.text()
    if (!text) return null
    try { return JSON.parse(text) as unknown } catch { throw new FlowableError('FLOWABLE_INVALID_RESPONSE') }
  }

  /** Read an engine object through response validation. */
  async read(path: string): Promise<Record<string, unknown>> { return object(await this.request(path)) }

  /** Read a paged engine collection; callers use bounded result windows. */
  async list(path: string): Promise<Record<string, unknown>[]> {
    const response = object(await this.request(path))
    if (!Array.isArray(response.data)) throw new FlowableError('FLOWABLE_INVALID_RESPONSE')
    return response.data.map(object)
  }
}
