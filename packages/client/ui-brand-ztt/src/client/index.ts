/** ZTT presentation composed through the existing browser slots. */
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
import { ZttDocumentTitle, ZttHero, ZttMark, ZttName } from './Brand.tsx'
import { en, NS, zh, type ZttBrandKey } from './locales.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Standalone ZTT product identity. */
    'ztt-brand': ZttBrandKey
  }
}

/** Services required by the presentation-only plugin. */
export const inject = ['slots', 'locale']

/** Install localized brand occupants; each follows its declaring slot lifecycle. */
export function apply(ctx: Context): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-brand-ztt: dictionaries')
  ctx.slots.inject('sidebar.brand.mark', () => ctx.slots.register({ name: 'sidebar.brand.mark' }, ZttMark))
  ctx.slots.inject('sidebar.brand.name', () => ctx.slots.register({ name: 'sidebar.brand.name', locale: NS }, ZttName))
  ctx.slots.inject('conversation.hero.brand.mark', () => ctx.slots.register({ name: 'conversation.hero.brand.mark' }, ZttMark))
  ctx.slots.inject('conversation.hero.identity', () => ctx.slots.register({ name: 'conversation.hero.identity', locale: NS }, ZttHero))
  ctx.slots.inject('shell.document-title', () => ctx.slots.register({ name: 'shell.document-title', locale: NS }, ZttDocumentTitle))
}
