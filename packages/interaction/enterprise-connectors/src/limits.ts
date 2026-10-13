/** Wire-input validation and cancellation shared by enterprise providers. */

/**
 * Validate a configured provider endpoint without credential-bearing URL fields.
 * @param value - configured URL.
 * @param websocket - whether WebSocket protocols are required.
 * @returns normalized endpoint without a trailing slash.
 */
export function endpoint(value: string, websocket: boolean): string {
  const url = new URL(value)
  const protocols = websocket ? ['ws:', 'wss:'] : ['http:', 'https:']
  if (!protocols.includes(url.protocol) || url.username || url.password || url.search || url.hash) {
    throw new Error('Invalid enterprise connection endpoint.')
  }
  return url.href.replace(/\/$/, '')
}
/**
 * Serialize the complete tool result within its UTF-8 byte bound.
 * @param value - JSON-compatible provider projection.
 * @param maximum - complete-result byte limit.
 * @returns complete serialized JSON.
 */
export function result(value: unknown, maximum: number): string {
  const text = JSON.stringify(value)
  if (Buffer.byteLength(text) > maximum) throw new Error('Enterprise result is too large; request a smaller page.')
  return text
}
/**
 * Require a bounded text tool argument.
 * @param value - untrusted tool argument.
 * @param maximum - UTF-8 byte limit.
 * @returns validated nonempty text.
 */
export function text(value: unknown, maximum: number): string {
  if (typeof value !== 'string' || !value.trim() || Buffer.byteLength(value) > maximum) {
    throw new Error('Expected nonempty text within the configured byte limit.')
  }
  return value
}
/**
 * Require a provider identifier, never a URL or path.
 * @param value - untrusted provider ID.
 * @returns validated identifier.
 */
export function identifier(value: unknown): string {
  if (typeof value !== 'string' || !/^[a-zA-Z0-9_@.:-]{1,256}$/.test(value)) throw new Error('Invalid enterprise resource ID.')
  return value
}
/**
 * Require a bounded one-page request, leaving pagination explicit to callers.
 * @param value - untrusted page size, or undefined for the configured size.
 * @param maximum - configured page limit.
 * @returns validated page size.
 */
export function pageSize(value: unknown, maximum: number): number {
  const size = value ?? maximum
  if (typeof size !== 'number' || !Number.isSafeInteger(size) || size < 1 || size > maximum) throw new Error('Invalid page_size.')
  return size
}
/**
 * Stop waiting at cancellation without leaving an unhandled provider rejection.
 * @param pending - provider operation to observe.
 * @param signal - caller deadline or lifetime cancellation.
 * @returns provider result before cancellation.
 */
export async function cancellable<T>(pending: Promise<T>, signal: AbortSignal): Promise<T> {
  signal.throwIfAborted()
  let abort!: () => void
  const cancelled = new Promise<never>((_resolve, reject) => {
    abort = () => { reject(new Error('Enterprise operation cancelled or timed out.')) }
    signal.addEventListener('abort', abort, { once: true })
  })
  try { return await Promise.race([pending, cancelled]) }
  finally { signal.removeEventListener('abort', abort) }
}
/**
 * Shorten an interval-wide reply on Unicode code point boundaries.
 * @param value - assistant reply.
 * @param maximum - UTF-8 byte limit including the truncation suffix.
 * @returns bounded reply.
 */
export function shorten(value: string, maximum: number): string {
  if (Buffer.byteLength(value) <= maximum) return value
  let remaining = maximum - Buffer.byteLength('\n…请在 DH 查看完整结果。')
  let head = ''
  for (const point of value) {
    remaining -= Buffer.byteLength(point)
    if (remaining < 0) break
    head += point
  }
  return head + '\n…请在 DH 查看完整结果。'
}
