/** Host-side projection of optional initial Workspace navigation policy. */

import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-host-webserver'
import { WORKSPACE_BOOTSTRAP_GLOBAL, type WorkspaceConfig } from './config.ts'

export type { WorkspaceConfig as Config } from './config.ts'

/**
 * Project the Loader-row policy into the authenticated index page.
 * @param ctx - Host plugin Context owning the injection lifetime.
 * @param config - optional initial Session restoration policy.
 */
export function apply(ctx: Context, config: WorkspaceConfig = {}): void {
  if (config.resumeRecentSession !== undefined && typeof config.resumeRecentSession !== 'boolean') {
    throw new TypeError('ui-workspace.resumeRecentSession must be a boolean')
  }
  if (config.resumeRecentSession !== true) return
  ctx.on('webserver/index-inject', (table) => {
    table.push({ kind: 'global', name: WORKSPACE_BOOTSTRAP_GLOBAL, value: { resumeRecentSession: true } })
  })
}
