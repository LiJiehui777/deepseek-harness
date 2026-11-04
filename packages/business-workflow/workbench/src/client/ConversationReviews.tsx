/** Review cards above the conversation composer, with DH-owned details over the same engine task. */
import { useMemo } from 'react'
import clsx from 'clsx'
import { Button, Modal, MarkdownText, Tag, IconWarningOutline16, IconCheckOutline16 } from '@deepseek-ai/dsh-client-ui-primitives'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type {} from '@deepseek-ai/dsh-client-ui-session/client'
import type { ReviewFace } from './review-controller.ts'
import { parseDraft } from '../shared/draft.ts'
import css from './ConversationReviews.module.css'

type Props = PropsRuntime<'conversation.input.dock'> & PropsLocale<'business-workflow'> & InjectFace<ReviewFace>

/** Show only the current conversation's reviews; inspection never submits a decision.
 * @param props - Session runtime, localized text, and scoped review controls.
 * @returns a pending-task card and an optional task-addressed review dialog.
 */
export function ConversationReviews({ useSession, useWorkflowReviews, refreshReviews, openReview, closeReview,
  decideReview, followProcess, t }: Props) {
  const session = useSession(value => value)
  const state = useWorkflowReviews(value => value)
  const labels = useMemo(() => ({ code: { copyLabel: t('reviewCopy'), copiedLabel: t('reviewCopied') }, footnotes: t('reviewFootnotes') }), [t])
  if (session.subagent !== null || session.removed || session.openState !== 'open') return null
  const { inbox, selected, detail, decision } = state
  const following = inbox?.following ?? []
  if (!selected && !inbox?.items.length && !following.length && !state.error) return null
  const waiting = following.some(value => value.phase === 'human')
  const title = following.length ? t(waiting ? 'followWaiting' : 'followRunning') : t('reviewCard')
  const run = detail?.process
  const processes = [...new Set([...following.map(value => value.processId), ...(inbox?.items ?? []).map(value => value.processId)])]
    .map(id => ({ id, follow: following.find(value => value.processId === id),
      tasks: (inbox?.items ?? []).filter(value => value.processId === id) }))
  const draft = run ? parseDraft(run.draftJson) : null
  const item = run?.items.find(value => value.id === selected?.taskId && value.kind === 'human')
  const node = draft?.nodes.find(value => value.id === item?.nodeId)
  const canReview = !!item && detail?.inputJson !== null && !state.busy && !state.error && !decision
  const value: unknown = detail?.inputJson ? JSON.parse(detail.inputJson) : null
  const error = state.error.includes('CURRENT_HUMAN_TASK_REQUIRED') || state.error.includes('FLOWABLE_HTTP_404')
    || state.error.includes('FLOWABLE_HTTP_409') ? t('reviewStale') : t('reviewFailed')
  return <>
    {(!!inbox?.items.length || !!following.length || !!state.error) && <section
      className={css.card} aria-label={title} data-conversation-reviews>
      <header className={css.cardHeader}><span className={css.mark}><IconWarningOutline16 /></span>
        <div className={css.heading}><strong>{title}</strong><span>
          {following.length ? t('followNoModelPolling') : t('reviewCount', { count: inbox?.total ?? 0 })}
        </span></div>
        <Button variant="ghost" size="sm" onClick={refreshReviews} disabled={state.busy}>{t('reviewRefresh')}</Button>
      </header>
      {state.error && <p role="alert" className={css.error}>{error}</p>}
      <div className={css.processes}>{processes.map(process => <article key={process.id} className={css.process}
        data-review-process={process.id} data-follow-process={process.follow ? process.id : undefined}>
        <header className={css.processHeader}>
          <div className={css.processIdentity}><span className={css.eyebrow}>{t('reviewWorkflowLabel')}</span>
            <h3>{process.follow?.name ?? (run?.id === process.id ? run.name : t('reviewWorkflowInstance'))}</h3>
            <small>{t('engineInstanceId')} · {process.id}</small>
          </div>
          <Tag>{t(`reviewPhase.${process.follow?.phase ?? 'human'}`)}</Tag>
        </header>
        <div className={css.steps}>
          {process.tasks.map(task => <section key={task.taskId} className={css.task} data-review-task={task.taskId}>
            <div><span className={css.stepLabel}>{t('reviewCurrentStep')}<span aria-hidden> · </span>{t('human')}</span>
              <h4>{task.name}</h4><p>{t('reviewStepHint')}</p>
            </div>
            <Button variant="outline" size="sm" disabled={state.busy} onClick={() => { openReview(task) }}>{t('reviewOpen')}</Button>
          </section>)}
          {!process.tasks.length && process.follow && <section className={css.task}>
            <div><span className={css.stepLabel}>{t('reviewCurrentStep')}</span>
              {process.follow.step && <h4>{process.follow.step}</h4>}<p>{t(`followPhase.${process.follow.phase}`)}</p>
            </div>
          </section>}
        </div>
        {(!process.follow || !session.running) && <footer className={css.processFooter}>
          <Button variant="ghost" size="sm" disabled={state.busy}
            onClick={() => { followProcess(process.id) }}>{t('followResume')}</Button>
        </footer>}
      </article>)}</div>
      {inbox && inbox.total > inbox.items.length && <p className={css.caption}>{t('reviewWindow', { count: inbox.items.length })}</p>}
      {!!following.length && <p className={css.caption}>{t('followStopHint')}</p>}
    </section>}
    <Modal open={!!selected} onClose={closeReview} title={t('reviewTitle')} closeLabel={t('reviewClose')}
      className={clsx(css.dialog)} contentClassName={clsx(css.content)}
      footer={<>
        {canReview || state.busy ? <><Button variant="outline" disabled={!canReview} onClick={() => { decideReview(false) }}>{t('engineReject')}</Button>
          <Button variant="primary" disabled={!canReview} onClick={() => { decideReview(true) }}>{state.busy ? t('reviewSubmitting') : t('engineApprove')}</Button></>
          : <Button variant="outline" onClick={closeReview}>{t('reviewClose')}</Button>}
      </>}>
      <div data-conversation-review-detail>
        <header className={css.detailHeader}><span className={css.eyebrow}>{run?.name ?? t('reviewLoading')}</span>
          <h3>{selected?.name}</h3><p className={css.caption}>{t('engineInstanceId')} · {selected?.processId}</p>
          {run && <Tag>{t(`process.${run.status}`)}</Tag>}
        </header>
        {state.error && <div role="alert" className={css.error}>{error}<Button variant="ghost" onClick={refreshReviews}>{t('reviewRefresh')}</Button></div>}
        {decision && <p role="status" className={css.success}><IconCheckOutline16 />{t(decision === 'approved' ? 'reviewApproved' : 'reviewRejected')}</p>}
        {!detail && !state.error && <p role="status">{t('reviewLoading')}</p>}
        {detail && !item && !decision && <p role="status" className={css.notice}>{t('reviewResolved')}</p>}
        {item && <>
          <p className={css.notice}>{t('reviewWaiting')}</p>
          <section className={css.section}><h4>{t('reviewInput')}</h4>
            {typeof value === 'string' ? <MarkdownText text={value} labels={labels} /> : <pre className={css.json}>{JSON.stringify(value, null, 2)}</pre>}
          </section>
          {node?.instruction && <section className={css.section}><h4>{t('reviewInstructions')}</h4><p className={css.instructions}>{node.instruction}</p></section>}
        </>}
        {!!run?.results.length && <section className={css.section}><h4>{t('reviewEvidence')}</h4>
          {run.results.map(result => <details key={result.nodeId} className={css.evidence}>
            <summary>{draft?.nodes.find(value => value.id === result.nodeId)?.name}</summary>
            <pre className={css.json}>{JSON.stringify(JSON.parse(result.json) as unknown, null, 2)}</pre>
          </details>)}
        </section>}
        <p className={css.caption}>{t('localOperator')}</p>
      </div>
    </Modal>
  </>
}
