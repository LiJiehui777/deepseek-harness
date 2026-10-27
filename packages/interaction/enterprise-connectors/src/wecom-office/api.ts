/** Fixed office operation dispatch, discovery and approvals shared by native tools. */
import type { Context } from '@deepseek-ai/cordis'
import type { ToolRunContext } from '@deepseek-ai/dsh-tools'
import type {} from '@deepseek-ai/dsh-user-approval'
import { z } from 'zod'
import type { OfficeMethod } from './methods.ts'
import { OFFICE_API_METHODS } from './methods.ts'
import { OfficeSchema } from './schema.ts'
import { OfficeError } from './runtime.ts'

/** Validated method selection with immutable JSON arguments. */
export interface OfficeApiRequest {
  method: string
  spec: OfficeMethod
  mode: 'describe' | 'read' | 'write'
  arguments: Record<string, unknown>
}

/**
 * Validate method membership, operation risk and serialized argument bounds before execution.
 * @param mode - native tool's operation mode, never inferred from model claims.
 * @param input - model arguments.
 * @param maximumBytes - complete JSON input bound.
 * @returns allowlisted operation and independently parsed JSON payload.
 */
export function officeApiRequest(mode: OfficeApiRequest['mode'], input: unknown, maximumBytes: number): OfficeApiRequest {
  const args = z.object({ method: z.string().min(1).max(128),
    arguments_json: z.string().default('{}') }).strict().parse(input)
  const spec = Object.hasOwn(OFFICE_API_METHODS, args.method) ? OFFICE_API_METHODS[args.method] : undefined
  if (!spec || (mode !== 'describe' && mode !== spec.mode)) throw new OfficeError('permission-denied')
  if (Buffer.byteLength(args.arguments_json) > maximumBytes) throw new OfficeError('too-large')
  let parsed: unknown
  try { parsed = JSON.parse(args.arguments_json) } catch { throw new OfficeError('invalid-result') }
  return { method: args.method, spec, mode, arguments: z.record(z.string(), z.unknown()).parse(parsed) }
}

/**
 * Read one fixed method's current official schema.
 * @param method - allowlisted provider method.
 * @param call - scoped, bounded CLI execution.
 * @returns normalized request validator and safe response projector.
 */
export async function officeApiSchema(method: string,
  call: (args: string[]) => Promise<Record<string, unknown>>): Promise<OfficeSchema> {
  if (!Object.hasOwn(OFFICE_API_METHODS, method)) throw new OfficeError('permission-denied')
  return new OfficeSchema(method, await call(['schema', 'get', method]))
}

/**
 * Require a native one-shot grant inside the mutation executor, including alternate callers.
 * @param ctx - owning plugin context.
 * @param request - exact method and immutable arguments already shown by the tool call.
 * @param exec - caller Session and call identity.
 * @param signal - user cancellation and connection lifetime.
 */
export async function approveOfficeWrite(ctx: Context, request: OfficeApiRequest,
  exec: ToolRunContext, signal: AbortSignal): Promise<void> {
  if (request.mode !== 'write') return
  const approval = ctx.get('approval')
  if (!approval || !exec.agent) throw new OfficeError('permission-denied')
  const outcome = await approval.request({ agent: exec.agent, toolName: 'wecom_office_write', callId: exec.callId,
    reason: `Approve this exact WeCom operation: ${request.method}. It may send, change, delete or share resources.`, signal })
  if (outcome !== 'allowed-once') throw new OfficeError('permission-denied')
  signal.throwIfAborted()
}
