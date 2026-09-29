/** Host-side projection of the configured return destination into Web boot. */

import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-host-webserver'
import {
  HOST_RETURN_BOOTSTRAP_GLOBAL,
  resolveHostReturnBootstrap,
  type HostReturnConfig,
} from './config.ts'

export type { HostReturnConfig as Config } from './config.ts'

/**
 * Project the Loader-row configuration into the authenticated index page.
 * Static browser plugins are composed by package name only, so their Host
 * configuration must cross the Host/Client boundary explicitly.
 */
export function apply(ctx: Context, config: HostReturnConfig = {}): void {
  const bootstrap = resolveHostReturnBootstrap(config)
  if (bootstrap === undefined) return
  ctx.on('webserver/index-inject', (table) => {
    table.push({ kind: 'global', name: HOST_RETURN_BOOTSTRAP_GLOBAL, value: bootstrap })
  })
}
