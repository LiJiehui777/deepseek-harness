/** Bounded, shell-free official CLI execution in connection-private directories. */
import assert from 'node:assert/strict'
import { constants } from 'node:fs'
import { open, realpath } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, isAbsolute, join, relative, sep } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-subprocess'
import type { WecomOfficeRuntimeConfig } from './config.ts'
import type { WecomOfficeError } from '../types.ts'

/** A sanitized failure; provider output and credentials never become diagnostics. */
export class OfficeError extends Error {
  /**
   * @param code - browser-safe failure category.
   */
  constructor(readonly code: WecomOfficeError) { super(`WeCom office operation failed (${code}).`) }
}

/**
 * Decode one bounded CLI JSON response and reject provider errors before projection.
 * @param output - stdout from a completed CLI process.
 * @returns validated top-level result record.
 */
export function officeJson(output: string): Record<string, unknown> {
  let value: unknown
  try { value = JSON.parse(output) } catch { throw new OfficeError('invalid-result') }
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new OfficeError('invalid-result')
  const record = value as Record<string, unknown>
  const error = record.error
  if (error && typeof error === 'object') {
    const code = (error as Record<string, unknown>).code
    throw new OfficeError(code === 853004 || code === 893201 ? 'not-authorized'
      : code === 853006 ? 'unavailable' : 'permission-denied')
  }
  if (typeof record.errcode === 'number' && record.errcode !== 0) {
    throw new OfficeError(record.errcode === 853004 ? 'not-authorized'
      : record.errcode === 853006 ? 'unavailable' : 'permission-denied')
  }
  return record
}

/** Official CLI adapter; all calls are owned by the enclosing connection generation. */
export class OfficeRuntime {
  private versionChecked = false
  /**
   * @param ctx - host with an optional local subprocess provider.
   * @param config - explicit execution and result limits.
   */
  constructor(private readonly ctx: Context, private readonly config: WecomOfficeRuntimeConfig) {}

  /**
   * Validate the pinned protocol version before reading or authorizing an account.
   * @param cwd - owned working directory.
   * @param credentials - connection-private official CLI configuration directory.
   * @param signal - caller deadline and connection lifetime.
   */
  async checkVersion(cwd: string, credentials: string, signal: AbortSignal): Promise<void> {
    if (this.versionChecked) return
    const version = await this.run(['--version'], cwd, credentials, signal)
    if (!/^wecom-cli 1\.3\.4(?:\s|$)/.test(version)) throw new OfficeError('version-mismatch')
    this.versionChecked = true
  }

  /**
   * Run one fixed command without a shell, spills, or inherited CLI overrides.
   * @param args - adapter-owned command and serialized, validated arguments.
   * @param cwd - private output directory owned by this operation.
   * @param credentials - private CLI configuration directory.
   * @param signal - deadline or cancellation for the entire managed process range.
   * @returns bounded stdout after the managed range has stopped.
   */
  async run(args: readonly string[], cwd: string, credentials: string, signal: AbortSignal): Promise<string> {
    const subprocess = this.ctx.get('subprocess')
    if (!subprocess) throw new OfficeError('runtime-unavailable')
    signal.throwIfAborted()
    const configured = this.config.command
    const bundled = () => join(dirname(createRequire(import.meta.url).resolve('@wecom/cli/package.json')), 'bin', 'wecom.js')
    const command = configured.length ? configured : [process.execPath, bundled()]
    const program = command[0]
    if (!program) throw new OfficeError('runtime-unavailable')
    const executable = await subprocess.resolveExecutable(program, {}, signal)
    const env: NodeJS.ProcessEnv = {}
    for (const name of Object.keys(process.env)) {
      if (/^WECOM_CLI_|^NODE_OPTIONS$|^NODE_PATH$/i.test(name)) env[name] = undefined
    }
    env.WECOM_CLI_CONFIG_DIR = credentials
    const controller = new AbortController()
    const lifetime = AbortSignal.any([signal, controller.signal])
    const handle = subprocess.spawn({ argv: [executable, ...command.slice(1), ...args], cwd, env,
      stdio: { stdin: 'ignore', stdout: 'pipe', stderr: { maxBytes: this.config.maxOutputBytes } },
      graceMs: this.config.graceMs, signal: lifetime })
    let bytes = 0
    const chunks: Buffer[] = []
    const collect = (chunk: Buffer | string) => {
      const value = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
      bytes += value.byteLength
      if (bytes > this.config.maxOutputBytes) controller.abort()
      else chunks.push(value)
    }
    const stdout = handle.stdout
    try {
      assert(stdout, 'A pipe stdout must be supplied by the subprocess provider.')
      stdout.on('data', collect)
      const outcome = await handle.done
      if (bytes > this.config.maxOutputBytes) throw new OfficeError('too-large')
      signal.throwIfAborted()
      const output = Buffer.concat(chunks).toString('utf8').trim()
      if (outcome.exitCode !== 0 || outcome.signal !== null) {
        try { officeJson(output) } catch (error) {
          if (error instanceof OfficeError && error.code !== 'invalid-result') throw error
        }
        throw new OfficeError('connection-failed')
      }
      return output
    } catch (error) {
      if (error instanceof OfficeError) throw error
      throw new OfficeError(signal.aborted ? (signal.reason instanceof Error && signal.reason.name === 'TimeoutError' ? 'timeout' : 'cancelled') : 'connection-failed')
    } finally {
      controller.abort()
      await handle.waitForExit()
      stdout?.off('data', collect)
    }
  }
}

/**
 * Read a CLI-generated document file only inside this operation's output directory.
 * @param file - untrusted file_path returned by the official CLI.
 * @param directory - private directory allocated for this operation.
 * @param maximum - bytes retained for this text read.
 * @returns bounded UTF-8 text and an explicit truncation flag.
 */
export async function readOfficeFile(file: string, directory: string, maximum: number): Promise<{ text: string; truncated: boolean }> {
  if (!isAbsolute(file)) throw new OfficeError('invalid-result')
  const root = await realpath(directory)
  const canonical = await realpath(file)
  const child = relative(root, canonical)
  if (!child || child.startsWith(`..${sep}`) || child === '..' || isAbsolute(child)) throw new OfficeError('invalid-result')
  const handle = await open(file, constants.O_RDONLY | constants.O_NOFOLLOW)
  try {
    const stat = await handle.stat()
    if (!stat.isFile()) throw new OfficeError('invalid-result')
    const buffer = Buffer.alloc(Math.min(stat.size, maximum))
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0)
    return { text: new TextDecoder().decode(buffer.subarray(0, bytesRead), { stream: stat.size > maximum }),
      truncated: stat.size > maximum }
  } finally { await handle.close() }
}
