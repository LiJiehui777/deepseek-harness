/** Host configuration for Workspace navigation and the optional enhanced startup policy. */
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-host-webserver'
import z from '@deepseek-ai/schemastery'
import { WORKSPACE_BOOTSTRAP_GLOBAL } from './config.ts'
import type { WorkspaceNavigationConfig } from './types.ts'

/** Live Workspace navigation and startup preferences. */
export type Config = WorkspaceNavigationConfig

/** Live Workspace navigation and startup preferences. */
export const Config = z.object({
  recentViewLimit: z.natural().default(10).volatile(),
  resumeRecentSession: z.boolean().default(false),
})

/** Project an explicit restore policy into the authenticated page.
 * @param ctx - Host plugin context.
 * @param config - navigation preferences from the Loader.
 */
export function apply(ctx: Context, config: Config): void {
  if (config.resumeRecentSession !== true) return
  ctx.on('webserver/index-inject', (table) => {
    table.push({ kind: 'global', name: WORKSPACE_BOOTSTRAP_GLOBAL, value: { resumeRecentSession: true } })
  })
}
