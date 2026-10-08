/** Native Web tool-card registration. */
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import { QualityReportCard } from './QualityReportCard.tsx'
import { en, zh } from './locales.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Report-review dictionaries. */
    qualityReport: keyof typeof en
  }
}
/** Required slot registry and locale services. */
export const inject = ['slots', 'locale']
/**
 * Install the review card and release both contributions on unload.
 * @param ctx - browser plugin context.
 */
export function apply(ctx: Context): void {
  ctx.effect(() => ctx.locale.register('qualityReport', { en, zh }), 'quality-report dictionaries')
  ctx.slots.inject('tool.call.toolview', () => ctx.slots.register(
    { name: 'tool.call.toolview', key: 'quality_report_review', locale: 'qualityReport' },
    QualityReportCard,
  ))
}
