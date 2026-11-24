/** Native configuration pages for the separately authorized RAGFlow and MES. */
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import type {} from '@deepseek-ai/dsh-client-ui-plugin-manager/client'
import type {} from '@deepseek-ai/dsh-api-remotes/client'
import { RagflowCardController, RAGFLOW_NS } from './ragflow-card-controller.ts'
import { RagflowCard } from './RagflowCard.tsx'
import { PostgresCardController, POSTGRES_NS } from './postgres-card-controller.ts'
import { PostgresCard } from './PostgresCard.tsx'
import { en, zh, type PluginsSettingsLocaleKey } from './locales.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Saved connector configuration copy. */
    'settings.connectors': PluginsSettingsLocaleKey
  }
}

/** The companion requires only saved-account operations and native configuration forms. */
export const inject = ['slots', 'locale', 'remote', 'remote.credentials', 'remote.ragflow', 'configForms']

/** Register account pages while the corresponding Host namespace is served.
 * @param ctx - browser plugin context owning forms, registrations and their cleanup.
 */
export function apply(ctx: Context): void {
  const t = ctx.locale.bind('settings.connectors')
  ctx.effect(() => ctx.locale.register('settings.connectors', { en, zh }), 'connector dictionaries')
  const ragflow = new RagflowCardController(ctx.configForms.get(RAGFLOW_NS), ctx)
  const postgres = new PostgresCardController(ctx.configForms.get(POSTGRES_NS), ctx)
  ctx.effect(() => () => { ragflow.dispose(); postgres.dispose() }, 'connector form lifetime')
  ctx.on('connection/reset', () => { ragflow.resetConnection(); postgres.resetConnection() })
  ctx.effect(() => ctx.remote.$on('credentials/reference-updated', (ref) => {
    ragflow.refreshCredential(ref); postgres.refreshCredential(ref)
  }), 'connector credential updates')
  ctx.effect(() => ctx.configForms.whileServed([RAGFLOW_NS], () => ctx.slots.inject('plugins.item', () => ctx.slots.register({
    name: 'plugins.item', id: 'ragflow-connector', order: -10, label: () => t('ragflowTitle'),
    locale: 'settings.connectors', inject: () => ragflow.inject(),
  }, RagflowCard))), 'RAGFlow configuration page')
  ctx.effect(() => ctx.configForms.whileServed([POSTGRES_NS], () => ctx.slots.inject('plugins.item', () => ctx.slots.register({
    name: 'plugins.item', id: POSTGRES_NS, order: -7, label: () => t('mesTitle'),
    locale: 'settings.connectors', inject: () => postgres.inject(),
  }, PostgresCard))), 'PostgreSQL configuration page')
}
