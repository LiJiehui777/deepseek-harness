/** Compact, state-first presentation of one conversation-owned engine run. */
import { useState } from 'react'
import clsx from 'clsx'
import { Button, Menu, Tag, Tooltip, IconCheckOutlineRegular, IconClockOutlineRegular,
  IconEllipsisOutlineRegular, IconLoadingOutlineRegular, IconRefreshOutlineRegular,
  IconWarningOutlineRegular } from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import type { ConversationFollow, ConversationReviewTask, ProcessId } from '../shared/runtime.ts'
import type { ReviewFace } from './review-controller.ts'
import css from './ConversationReviews.module.css'

type Props = PropsLocale<'business-workflow'> & Pick<ReviewFace, 'openReview' | 'openProgress' | 'followProcess' | 'refreshReviews'> & {
  id: ProcessId
  follow: ConversationFollow | undefined
  tasks: ConversationReviewTask[]
  name: string
  running: boolean
  busy: boolean
}

/** Render current work, explicit review actions, and secondary workflow identity.
 * @param props - Engine checkpoints and task-addressed UI actions for one run.
 * @returns a compact progress or review card with an accessible action menu.
 */
export function ConversationProcessCard({ id, follow, tasks, name, running, busy, t,
  openReview, openProgress, followProcess, refreshReviews }: Props) {
  const [menuOpen, setMenuOpen] = useState(false)
  const phase = follow?.phase ?? 'human'
  const reviewing = tasks.length > 0
  const moving = phase === 'running' || phase === 'settling'
  const title = reviewing ? t('progressReview') : phase === 'running' && follow?.stepKind === 'agent'
    ? t('progressAnalyzing') : t(`progressPhase.${phase}`)
  const canFollow = !follow || !running
  return <article className={css.process} aria-label={name} data-phase={phase}
    data-review-process={id} data-follow-process={follow ? id : undefined}>
    <header className={css.processHeader}>
      <span className={clsx(css.mark, moving && css.moving, phase === 'blocked' && css.blocked)} aria-hidden>
        {moving ? <IconLoadingOutlineRegular className={css.spin} />
          : phase === 'wait' ? <IconClockOutlineRegular /> : <IconWarningOutlineRegular />}
      </span>
      <div className={css.heading}><h3>{title}</h3><p>{t(`followPhase.${phase}`)}</p></div>
      <Menu open={menuOpen} portal side="bottom" align="end"
        anchor={<Tooltip label={t('progressMore')} portal side="top">
          <Button variant="ghost" size="sm" className={css.more} aria-label={t('progressMore')}
            aria-haspopup="menu" aria-expanded={menuOpen} onClick={() => { setMenuOpen(!menuOpen) }}>
            <IconEllipsisOutlineRegular />
          </Button>
        </Tooltip>}
        items={[
          { id: 'refresh', label: t('progressRefresh'), icon: <IconRefreshOutlineRegular />, disabled: busy },
          ...(canFollow ? [{ id: 'follow', label: t('followResume'), disabled: busy }] : []),
        ]}
        onClose={() => { setMenuOpen(false) }} onSelect={(key) => {
          setMenuOpen(false)
          if (key === 'refresh') refreshReviews()
          if (key === 'follow') followProcess(id)
        }}>
        {follow && <p className={css.menuHint}>{t('followStopHint')}</p>}
      </Menu>
    </header>
    {reviewing ? <div className={css.reviewTasks}>{tasks.map(task => <section key={task.taskId}
      className={css.task} data-review-task={task.taskId}>
      <div><h4>{task.name}</h4><p>{t('reviewStepHint')}</p></div>
      <Button variant="primary" size="sm" disabled={busy} onClick={() => { openReview(task) }}>{t('reviewOpen')}</Button>
    </section>)}</div> : follow && <ol className={css.progress} aria-label={t('progressSteps')}>
      <li className={css.done}><span className={css.stepMark} aria-hidden><IconCheckOutlineRegular /></span>
        <span className={css.stepText}><small>{t('progressDone')}</small>{follow.previousStep || t('progressStarted')}</span></li>
      <li className={css.current} aria-current="step"><span className={css.stepMark} aria-hidden>
        {moving ? <IconLoadingOutlineRegular className={css.spin} />
          : phase === 'wait' ? <IconClockOutlineRegular /> : <IconWarningOutlineRegular />}</span>
      <span className={css.stepText}><small>{t('reviewCurrentStep')}</small>
        {phase === 'settling' ? t('progressFeedback') : follow.step || t(`reviewPhase.${phase}`)}</span></li>
      {phase !== 'settling' && <li><span className={css.stepMark} aria-hidden />
        <span className={css.stepText}><small>{t('progressAfterward')}</small>{t('progressFeedback')}</span></li>}
    </ol>}
    <footer className={css.processFooter}><div className={css.identity}><span>{name}</span>
      {follow?.simulated && <Tag>{t('progressSimulation')}</Tag>}</div>
    <Button variant="ghost" size="sm" disabled={busy} onClick={() => { openProgress(id) }}>{t('progressOpen')}</Button>
    </footer>
  </article>
}
