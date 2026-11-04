/** Node-specific draft controls with an independently scrolling body and persistent actions. */
import type { ReactNode } from 'react'
import clsx from 'clsx'
import { Button, Input, IconSettingsOutline16, IconThinkOutline16, IconBranchOutline16, IconUserOutline16,
  IconLoadingOutline16, IconPlayOutline16, IconStopFill16, IconTrashOutline16, IconCodeOutline16,
  IconChevronDownOutline14, IconLinkOutline16 } from '@deepseek-ai/dsh-client-ui-primitives'
import type { Translate } from '@deepseek-ai/dsh-client-ui-slots'
import { ACTION_IDS } from '../shared/draft.ts'
import type { DraftNode, NodeKind } from '../shared/types.ts'
import type { WorkbenchKey } from './locales.ts'
import css from './NodeInspector.module.css'

type Props = {
  node: DraftNode
  nodes: readonly DraftNode[]
  step: number
  t: Translate<WorkbenchKey>
  className?: string | undefined
  onChange: (patch: Partial<Omit<DraftNode, 'id' | 'kind'>>) => void
  onDelete: () => void
}
const icons: Record<NodeKind, ReactNode> = {
  start: <IconPlayOutline16 />, action: <IconSettingsOutline16 />, agent: <IconThinkOutline16 />,
  condition: <IconBranchOutline16 />, human: <IconUserOutline16 />, wait: <IconLoadingOutline16 />, end: <IconStopFill16 />,
}

function Select({ label, value, onChange, children }: {
  label: string
  value: string
  onChange: (value: string) => void
  children: ReactNode
}) {
  return <label className={css.field}><span>{label}</span><span className={css.selectWrap}>
    <select className={clsx(css.control)} value={value} onChange={(event) => { onChange(event.target.value) }}>{children}</select>
    <IconChevronDownOutline14 className={css.selectArrow} />
  </span></label>
}

/** Edit the selected node without publishing or changing accepted instances.
 * @param props - node snapshot, localized labels, and draft-edit callbacks.
 * @returns grouped fields with a deletion control visible independently of body scrolling.
 */
export function NodeInspector({ node, nodes, step, t, className, onChange, onDelete }: Props) {
  const protectedNode = node.kind === 'start' || node.kind === 'end'
  const targets = nodes.filter(item => item.id !== node.id)
  const targetOptions = <><option value="">{t('none')}</option>
    {targets.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</>
  const kind = t(node.kind === 'action' ? 'kind.action' : node.kind)
  return <aside className={clsx(css.inspector, className)} aria-label={t('properties')} data-node-inspector data-kind={node.kind}>
    <header className={css.header}>
      <span className={css.icon} aria-hidden>{icons[node.kind]}</span>
      <div className={css.heading}><span>{t('properties')}</span><h3>{kind}</h3></div>
      <span className={css.step}>{t('inspectorStep', { index: String(step).padStart(2, '0') })}</span>
    </header>
    <div className={css.body} data-inspector-body>
      <section className={css.section} aria-label={t('inspectorBasic')}>
        <h4>{t('inspectorBasic')}</h4>
        <label className={css.field}><span>{t('nodeName')}</span><Input className={clsx(css.control)} value={node.name}
          onChange={(event) => { onChange({ name: event.target.value }) }} /></label>
      </section>
      {(node.kind === 'action' || node.kind === 'agent' || node.kind === 'human' || node.kind === 'wait') &&
        <section className={css.section} aria-label={t('inspectorTask')}>
          <h4>{t('inspectorTask')}</h4>
          {node.kind === 'action' && <Select label={t('action')} value={node.action} onChange={(value) => { onChange({ action: value as DraftNode['action'] }) }}>
            {ACTION_IDS.map(id => <option key={id} value={id}>{t(`action.${id}`)}</option>)}
          </Select>}
          {(node.kind === 'agent' || node.kind === 'wait') && <label className={css.field}>
            <span>{t('instruction')}</span><textarea className={clsx(css.control)} rows={node.kind === 'agent' ? 7 : 4}
              value={node.instruction} onChange={(event) => { onChange({ instruction: event.target.value }) }} />
          </label>}
          {node.kind === 'agent' && <p className={css.hint}>{t('inspectorAgentHint')}</p>}
          {node.kind === 'human' && <><label className={css.field}><span>{t('role')}</span>
            <Input className={clsx(css.control)} value={node.role} onChange={(event) => { onChange({ role: event.target.value }) }} />
          </label><p className={css.hint}>{t('inspectorHumanHint')}</p></>}
        </section>}
      {node.kind !== 'start' && <section className={css.section} aria-label={t('inspectorInput')}>
        <h4><IconLinkOutline16 />{t('inspectorInput')}</h4>
        <Select label={t('source')} value={node.source} onChange={(source) => { onChange({ source }) }}>
          <option value="">{t('startup')}</option>{targets.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
        </Select>
        <label className={css.field}><span>{t('field')}</span><Input className={clsx(css.control, css.code)} icon={<IconCodeOutline16 />}
          value={node.field} onChange={(event) => { onChange({ field: event.target.value }) }} /></label>
        <p className={css.hint}>{t(node.source ? 'inspectorUpstreamHint' : 'inspectorStartupHint')}</p>
      </section>}
      {node.kind === 'condition' && <section className={css.section} aria-label={t('inspectorCondition')}>
        <h4><IconBranchOutline16 />{t('inspectorCondition')}</h4>
        <div className={css.rule}>
          <Select label={t('operator')} value={node.operator} onChange={(operator) => { onChange({ operator: operator as DraftNode['operator'] }) }}>
            {(['eq', 'neq', 'exists'] as const).map(value => <option key={value} value={value}>{t(`operator.${value}`)}</option>)}
          </Select>
          {node.operator !== 'exists' && <label className={css.field}><span>{t('inspectorExpected')}</span>
            <Input className={clsx(css.control, css.code)} value={node.expected}
              onChange={(event) => { onChange({ expected: event.target.value }) }} />
          </label>}
        </div>
        <p className={css.hint}>{t('expected')}</p>
        <label className={css.field}><span>{t('inspectorRuleNote')}</span><textarea className={clsx(css.control)} rows={3}
          value={node.instruction} onChange={(event) => { onChange({ instruction: event.target.value }) }} /></label>
      </section>}
      {node.kind !== 'end' && <section className={css.section} aria-label={t('inspectorRouting')}>
        <h4>{t('inspectorRouting')}</h4>
        <div className={clsx(css.route, node.kind === 'condition' && css.routeYes)}>
          <Select label={t(node.kind === 'condition' ? 'inspectorTrue' : 'inspectorNext')} value={node.next}
            onChange={(next) => { onChange({ next }) }}>{targetOptions}</Select>
        </div>
        {node.kind === 'condition' && <div className={clsx(css.route, css.routeNo)}>
          <Select label={t('inspectorFalse')} value={node.otherwise}
            onChange={(otherwise) => { onChange({ otherwise }) }}>{targetOptions}</Select>
        </div>}
      </section>}
      {node.kind === 'end' && <p className={css.hint}>{t('inspectorEndHint')}</p>}
    </div>
    <footer className={css.footer}>
      <span>{t(protectedNode ? 'inspectorProtected' : 'inspectorDraftHint')}</span>
      <Button size="sm" variant="ghost" className={css.delete} icon={<IconTrashOutline16 />} disabled={protectedNode}
        title={protectedNode ? t('inspectorProtected') : undefined} onClick={onDelete}>{t('delete')}</Button>
    </footer>
  </aside>
}
