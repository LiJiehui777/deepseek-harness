/** Host-provided Agent identity for the dsh Web surface. */
import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import {
  HostAgentDocumentTitle,
  HostAgentHero,
  HostAgentMark,
  HostAgentName,
  type HostAgentBrandingInjected,
} from './HostAgentBranding.tsx'
import { HostReturnAction, type HostReturnActionInjected } from './HostReturnAction.tsx'
import { en, NS, zh, type HostReturnKey } from './locales.ts'
import { readHostReturnBootstrap } from '../config.ts'

export type { HostAgentBrandingInjected } from './HostAgentBranding.tsx'
export type { HostReturnKey } from './locales.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Copy for leaving dsh Web and returning to its embedding application. */
    'host-return': HostReturnKey
  }
}

/** Services required by localization and slot registration. */
export const inject = ['slots', 'locale']

/** Register Agent branding when Web boot contains a validated host payload. */
export function apply(ctx: ClientContext): void {
  const bootstrap = readHostReturnBootstrap(globalThis)
  if (bootstrap === undefined) return
  const { hostName, agentName, workspaceName, datasetNames } = bootstrap
  const branding = (): HostAgentBrandingInjected => ({
    agentName,
    workspaceName,
    hostName,
    datasetNames,
  })
  const returnAction = (): HostReturnActionInjected => ({ returnUrl: bootstrap.returnUrl, hostName })
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-host-return: dictionaries')
  ctx.slots.inject('sidebar.brand.action', () => ctx.slots.register({
    name: 'sidebar.brand.action',
    locale: NS,
    inject: returnAction,
  }, HostReturnAction))
  ctx.slots.inject('sidebar.brand.mark', () => ctx.slots.register({
    name: 'sidebar.brand.mark',
    inject: branding,
  }, HostAgentMark))
  ctx.slots.inject('sidebar.brand.name', () => ctx.slots.register({
    name: 'sidebar.brand.name',
    locale: NS,
    inject: branding,
  }, HostAgentName))
  ctx.slots.inject('conversation.hero.brand.mark', () => ctx.slots.register({
    name: 'conversation.hero.brand.mark',
    inject: branding,
  }, HostAgentMark))
  ctx.slots.inject('conversation.hero.identity', () => ctx.slots.register({
    name: 'conversation.hero.identity',
    locale: NS,
    inject: branding,
  }, HostAgentHero))
  ctx.slots.inject('shell.document-title', () => ctx.slots.register({
    name: 'shell.document-title',
    inject: branding,
  }, HostAgentDocumentTitle))
}
