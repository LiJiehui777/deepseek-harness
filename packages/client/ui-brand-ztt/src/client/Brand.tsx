import { useEffect } from 'react'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import { NS } from './locales.ts'
import css from './Brand.module.css'

/** Company mark shared by the sidebar and new-conversation hero. */
export function ZttMark({ size }: PropsRuntime<'sidebar.brand.mark'>) {
  return <img className={css.mark} src="./ztt-mark.svg" width={size} height={size} alt="" aria-hidden="true" />
}

/** Compact identity that remains legible in the expanded sidebar. */
export function ZttName({ t }: PropsLocale<typeof NS>) {
  return (
    <span className={css.sidebar}>
      <span className={css.name}>{t('name')}</span>
      <span className={css.company}>{t('company')}</span>
    </span>
  )
}

/** New-conversation identity describing the intended quality work. */
export function ZttHero({ t }: PropsLocale<typeof NS>) {
  return (
    <span className={css.hero}>
      <span className={css.title}>{t('name')}</span>
      <span className={css.tagline}>{t('tagline')}</span>
      <span className={css.tasks}>{t('tasks')}</span>
    </span>
  )
}

/** Keep the current session title under the standalone product identity. */
export function ZttDocumentTitle({ useSessions, usePanelInfo, t }:
PropsRuntime<'shell.document-title'> & PropsLocale<typeof NS>): null {
  const showSessionTitle = usePanelInfo(info => info.activePanelId === null)
  const sessionTitle = useSessions(state => !showSessionTitle || state.current === undefined
    ? undefined : state.byId[state.current]?.title)
  const productTitle = t('name')
  useEffect(() => {
    document.title = sessionTitle === undefined ? productTitle : `${sessionTitle} — ${productTitle}`
    return () => { document.title = productTitle }
  }, [productTitle, sessionTitle])
  return null
}
