/** RAGFlow-owned visual identity for one embedded Agent workspace. */
import { useEffect, useId, useRef, useState } from 'react'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import { NS } from './locales.ts'
import css from './HostAgentBranding.module.css'

/** Static identity projected from the RAGFlow Agent definition. */
export interface HostAgentBrandingInjected {
  agentName: string
  workspaceName: string
  hostName: string
  datasetNames: string[]
}

type BrandingFace = InjectFace<HostAgentBrandingInjected>

/** Agent-initial mark shared by the sidebar and blank-session welcome state. */
export function HostAgentMark({ size, className, agentName }: {
  size: number
  className?: string | undefined
} & BrandingFace) {
  const initial = Array.from(agentName)[0]?.toLocaleUpperCase() ?? 'A'
  return (
    <span
      className={`${css.mark}${className === undefined ? '' : ` ${className}`}`}
      style={{ width: size, height: size, fontSize: Math.max(12, Math.round(size * 0.48)) }}
      aria-hidden="true"
    >
      {initial}
    </span>
  )
}

/** Agent identity opens a compact, read-only view of its bound knowledge. */
export function HostAgentName({
  agentName,
  workspaceName,
  datasetNames,
  t,
}: PropsLocale<typeof NS> & BrandingFace) {
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  const dialogId = useId()

  useEffect(() => {
    if (!open) return
    const closeOutside = (event: PointerEvent) => {
      if (event.target instanceof Node && !root.current?.contains(event.target)) setOpen(false)
    }
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', closeOutside)
    document.addEventListener('keydown', closeOnEscape)
    return () => {
      document.removeEventListener('pointerdown', closeOutside)
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [open])

  return (
    <div ref={root} className={css.sidebarIdentity}>
      <button
        type="button"
        className={css.identityTrigger}
        aria-expanded={open}
        aria-controls={open ? dialogId : undefined}
        aria-haspopup="dialog"
        aria-label={t('knowledgeView')}
        title={t('knowledgeView')}
        onClick={() => { setOpen(value => !value) }}
      >
        <span className={css.sidebarAgentName}>{agentName}</span>
        <span className={css.sidebarWorkspaceName}>{workspaceName}</span>
      </button>
      {open && (
        <div
          id={dialogId}
          className={css.knowledgePopover}
          role="dialog"
          aria-label={t('knowledgeDialogTitle')}
        >
          <span className={css.knowledgePopoverTitle}>{t('knowledgeDialogTitle')}</span>
          <span className={css.knowledgePopoverHint}>{t('knowledgeDialogHint')}</span>
          {datasetNames.length === 0
            ? <span className={css.knowledgeEmpty}>{t('knowledgeNone')}</span>
            : (
              <ul className={css.knowledgeList}>
                {datasetNames.map((name, index) => (
                  <li className={css.knowledgeItem} key={`${name}-${index}`}>{name}</li>
                ))}
              </ul>
            )}
        </div>
      )}
    </div>
  )
}

/** Personalized empty-state copy plus the selected RAGFlow knowledge sources. */
export function HostAgentHero({ agentName, datasetNames, t }:
PropsRuntime<'conversation.hero.identity'> & PropsLocale<typeof NS> & BrandingFace) {
  const visibleDatasets = datasetNames.slice(0, 3)
  const remaining = datasetNames.length - visibleDatasets.length
  return (
    <span className={css.heroIdentity}>
      <span className={css.heroGreeting}>{t('greeting', { agent: agentName })}</span>
      <span className={css.heroMeta}>
        <span className={css.heroHelp}>{t('help')}</span>
        <span className={css.knowledgeRow}>
          <span className={css.knowledgeLabel}>{t('knowledge')}</span>
          {visibleDatasets.length === 0
            ? <span className={css.emptyKnowledge}>{t('knowledgeNone')}</span>
            : visibleDatasets.map(name => <span className={css.datasetChip} key={name}>{name}</span>)}
          {remaining > 0 && <span className={css.moreDatasets}>{t('knowledgeMore', { count: String(remaining) })}</span>}
        </span>
      </span>
    </span>
  )
}

/** Browser title keeps the active conversation title under the Agent identity. */
export function HostAgentDocumentTitle({
  agentName,
  hostName,
  useSessions,
  usePanelInfo,
}: PropsRuntime<'shell.document-title'> & BrandingFace): null {
  const showSessionTitle = usePanelInfo(info => info.activePanelId === null)
  const sessionTitle = useSessions((state) => {
    const current = state.current
    return !showSessionTitle || current === undefined ? undefined : state.byId[current]?.title
  })
  const productTitle = `${agentName} · ${hostName}`
  useEffect(() => {
    document.title = sessionTitle === undefined ? productTitle : `${sessionTitle} — ${productTitle}`
    return () => { document.title = productTitle }
  }, [productTitle, sessionTitle])
  return null
}
