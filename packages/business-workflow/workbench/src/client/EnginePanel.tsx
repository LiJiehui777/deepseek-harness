/** Render Flowable state and explicit local-operator actions. */
import { Button, Tag } from '@deepseek-ai/dsh-client-ui-primitives'
import type { InjectFace, PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import type { EngineFace, EngineState } from './engine-controller.ts'
import { parseDraft } from '../shared/draft.ts'
import css from './Workbench.module.css'

type Props = InjectFace<EngineFace> & PropsLocale<'business-workflow'> & { state: EngineState; inbox: boolean }

function outputText(json: string): string {
  const value: unknown = JSON.parse(json)
  if (value && typeof value === 'object' && 'result' in value && typeof value.result === 'string') return value.result
  return JSON.stringify(value, null, 2)
}

/** Display durable runs, current review/wait items, and stored node outputs. */
export function EnginePanel(props: Props) {
  const { state, t } = props
  const run = state.detail
  const draft = run ? parseDraft(run.draftJson) : null
  return <div>
    <div className={css.sectionHeader}><p className={css.caption}>{t('engineStateSource')}</p>
      <Button variant="outline" disabled={state.busy} onClick={props.refreshEngine}>{t('refreshEngine')}</Button></div>
    {state.health && !state.health.connected && <p role="status" className={css.feedback}>{t('engineOffline')} · {state.health.error}</p>}
    {state.error && <p role="alert" className={css.feedback}>{t('engineError')} · {state.error}</p>}
    {state.runs.length === 0 ? <p className={css.empty}>{t('emptyInstances')}</p> : <div className={css.runs}>
      <aside className={css.runList}>{state.runs.map(item => <button key={item.id} type="button"
        className={css.runRow} disabled={state.busy} onClick={() => { props.openProcess(item.id) }}>
        <strong>{item.name}</strong><span>{t(`process.${item.status}`)}</span><small>{item.id}</small>
      </button>)}</aside>
      {run && <section className={css.runDetail} data-engine-process={run.id}>
        <header className={css.sectionHeader}><h3>{run.name}</h3><Tag>{t(`process.${run.status}`)}</Tag></header>
        <p className={css.caption}>{t('engineInstanceId')} · {run.id}</p>
        <p>{t('localOperator')}</p>{run.ownerSessionId && <p className={css.caption}>{t('fromConversation')} · {run.ownerSessionId}</p>}
        {(props.inbox ? run.items.filter(item => item.kind === 'human') : run.items).map(item => <div key={item.id} className={css.feedback}>
          <strong>{item.name}</strong><p>{t(`work.${item.status}`)}</p>
          {item.error && <p>{item.error === 'DEMO_TODO_SCENARIO_INVALID' ? t('demoInvalidScenario')
            : item.error === 'CONNECTOR_NOT_CONFIGURED' ? t('missingConnector')
              : item.error === 'WECOM_TODOS_UNAVAILABLE' ? t('wecomUnavailable')
                : item.error === 'WECOM_TODOS_READ_FAILED' ? t('wecomReadFailed')
                  : item.error === 'WORKFLOW_STEP_TIMED_OUT' ? t('stepTimedOut') : item.error}</p>}
          <div className={css.actions}>
            {item.kind === 'human' && <>
              <Button variant="primary" disabled={state.busy} onClick={() => { props.reviewProcess(run.id, item.id, true) }}>{t('engineApprove')}</Button>
              <Button variant="outline" disabled={state.busy} onClick={() => { props.reviewProcess(run.id, item.id, false) }}>{t('engineReject')}</Button>
            </>}
            {item.kind === 'wait' && <Button variant="primary" disabled={state.busy}
              onClick={() => { props.arriveProcess(run.id, item.id) }}>{t('engineArrive')}</Button>}
          </div>
        </div>)}
        {props.inbox && !run.items.some(item => item.kind === 'human') && <p>{t('emptyInbox')}</p>}
        <h4>{t('engineCompleted')}</h4><ol>{run.completed.map(id => <li key={id}>{draft?.nodes.find(node => node.id === id)?.name}</li>)}</ol>
        {run.results.length > 0 && <><h4>{t('engineResults')}</h4>{run.results.map(result => <details key={result.nodeId}>
          <summary>{draft?.nodes.find(node => node.id === result.nodeId)?.name}</summary>
          <pre className={css.result}>{outputText(result.json)}</pre>
        </details>)}</>}
        {run.status === 'running' && <div className={css.actions}><Button variant="outline" disabled={state.busy}
          onClick={() => { props.cancelProcess(run.id) }}>{t('engineCancel')}</Button></div>}
      </section>}
    </div>}
  </div>
}
