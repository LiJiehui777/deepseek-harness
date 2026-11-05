/** Read-only engine evidence for the run selected from the conversation card. */
import clsx from 'clsx'
import { Button, Modal, Tag, IconLoadingOutlineRegular } from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import type { ReviewFace, ReviewState } from './review-controller.ts'
import { parseDraft } from '../shared/draft.ts'
import css from './ConversationReviews.module.css'

type Props = PropsLocale<'business-workflow'> & Pick<ReviewFace, 'closeProgress' | 'refreshReviews' | 'openReview'>
  & Pick<ReviewState, 'progress'> & { busy: boolean }

/** Inspect completed and current steps without predicting condition branches or submitting decisions.
 * @param props - Selected run, retained engine evidence, and explicit inspection controls.
 * @returns an engine-backed progress dialog, or nothing when closed.
 */
export function ConversationProgress({ progress, busy, t, closeProgress, refreshReviews, openReview }: Props) {
  const run = progress?.detail
  const draft = run ? parseDraft(run.draftJson) : null
  const names = new Map(draft?.nodes.map(node => [node.id, node.name]))
  return <Modal open={!!progress} onClose={closeProgress} title={t('progressTitle')} closeLabel={t('progressClose')}
    className={clsx(css.dialog)} contentClassName={clsx(css.content)} footer={<>
      <Button variant="outline" disabled={busy} onClick={refreshReviews}>{t('progressRefresh')}</Button>
      <Button variant="primary" onClick={closeProgress}>{t('progressClose')}</Button>
    </>}>
    <div data-conversation-progress-detail>
      {progress?.error && <p role="alert" className={css.error}>{t('progressFailed')}</p>}
      {!run && !progress?.error && <div className={css.loading} role="status" aria-label={t('progressLoading')}>
        <IconLoadingOutlineRegular className={css.spin} /></div>}
      {run && <>
        <header className={css.detailHeader}><h3>{run.name}</h3><Tag>{t(`process.${run.status}`)}</Tag></header>
        <p className={css.caption}>{t('progressHistoryHint')}</p>
        <ol className={css.history} aria-label={t('progressSteps')}>
          {run.completed.map(id => <li key={id}><span>{names.get(id)}</span><Tag>{t('progressDone')}</Tag></li>)}
          {run.items.map(item => <li key={item.id} aria-current="step" className={css.historyCurrent}>
            <div><span>{item.name}</span><p>{t(`work.${item.status}`)}</p>
              {item.error && <><p className={css.error}>{t('progressBlockedHint')}</p>
                <details className={css.evidence}><summary>{t('progressErrorDetails')}</summary><pre className={css.json}>{item.error}</pre></details>
              </>}</div>
            {item.kind === 'human' && <Button variant="primary" size="sm" disabled={busy}
              onClick={() => { openReview({ processId: run.id, taskId: item.id, name: item.name }) }}>{t('reviewOpen')}</Button>}
          </li>)}
        </ol>
        <details className={css.evidence}><summary>{t('progressRunInfo')}</summary>
          <dl className={css.runInfo}><dt>{t('engineInstanceId')}</dt><dd>{run.id}</dd>
            <dt>{t('progressVersion')}</dt><dd>{run.workflowVersion || t('draft')}</dd>
          </dl><p className={css.caption}>{t('followStopHint')}</p>
        </details>
        {run.results.length > 0 && <section className={css.section}><h4>{t('engineResults')}</h4>
          {run.results.map((result) => {
            const value: unknown = JSON.parse(result.json)
            return <details key={result.nodeId} className={css.evidence}>
              <summary>{names.get(result.nodeId)}</summary>
              <pre className={css.json}>{JSON.stringify(value, null, 2)}</pre>
            </details>
          })}
        </section>}
      </>}
    </div>
  </Modal>
}
