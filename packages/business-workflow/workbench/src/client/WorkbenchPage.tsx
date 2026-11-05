/** Business workflow authoring UI, with clearly separated browser-only previews. */
import { useRef, useState } from 'react'
import clsx from 'clsx'
import { randomUUID } from '@deepseek-ai/dsh-util-crypto'
import { Button, Input, Tag } from '@deepseek-ai/dsh-client-ui-primitives'
import type { InjectFace, PropsLocale, PropsStore } from '@deepseek-ai/dsh-client-ui-slots'
import type { EngineFace } from './engine-controller.ts'
import { EnginePanel } from './EnginePanel.tsx'
import { NodeInspector } from './NodeInspector.tsx'
import { NODE_KINDS, draftNode, parseDraft, serializeDraft } from '../shared/draft.ts'
import type { createWorkbenchStore } from './store.ts'
import type { NodeKind, PreviewRun, WorkflowDraft } from '../shared/types.ts'
import css from './Workbench.module.css'

type Props = PropsStore<ReturnType<typeof createWorkbenchStore>> & PropsLocale<'business-workflow'> & InjectFace<EngineFace> & {
  download: (text: string) => void
}
type Translator = Props['t']
type Actions = Props['actions']
const kindKey = (kind: NodeKind) => kind === 'action' ? 'kind.action' as const : kind

/** Node glyph shared by the palette, graph, and existing DH sidebar. */
export function WorkflowIcon({ size = 18 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true">
    <rect x="3" y="3" width="7" height="5" rx="1.5" /><rect x="14" y="16" width="7" height="5" rx="1.5" />
    <path d="M6.5 8v8a2.5 2.5 0 0 0 2.5 2.5h5M10 5.5h5A2.5 2.5 0 0 1 17.5 8v8" />
  </svg>
}

function Select({ label, value, onChange, children }: {
  label: string
  value: string
  onChange: (value: string) => void
  children: React.ReactNode
}) {
  return <label className={css.field}><span>{label}</span>
    <select value={value} onChange={(event) => { onChange(event.target.value) }}>{children}</select>
  </label>
}

function Graph({ draft, selected, choose, t }: { draft: WorkflowDraft; selected: string; choose: (id: string) => void; t: Translator }) {
  const position = (index: number) => ({ x: (index % 3) * 244 + 20, y: Math.floor(index / 3) * 152 + 24 })
  const height = Math.ceil(draft.nodes.length / 3) * 152 + 20
  return <div className={css.canvasScroll}>
    <div className={css.canvas} style={{ height }} role="group" aria-label={t('graph')}>
      <svg className={css.edges} width="752" height={height} aria-hidden="true">
        <defs><marker id="business-workflow-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="currentColor" /></marker></defs>
        {draft.nodes.flatMap((node, index) => [node.next, ...(node.kind === 'condition' ? [node.otherwise] : [])].map((id, branch) => {
          const target = draft.nodes.findIndex(item => item.id === id)
          if (target < 0) return null
          const a = position(index), b = position(target)
          const fromX = a.x + 104, fromY = a.y + 102, toX = b.x + 104, toY = b.y
          const adjacent = a.y === b.y && b.x === a.x + 244
          const entryY = a.y === b.y ? b.y + 102 : toY
          const path = adjacent ? `M${a.x + 208},${a.y + 51} H${b.x}`
            : `M${fromX},${fromY} V${fromY + (branch ? 12 : 24)} H${toX} V${entryY}`
          return <g key={`${node.id}-${branch}`}>
            <path d={path} fill="none" stroke="currentColor" strokeWidth="1.5"
              strokeDasharray={branch ? '5 4' : undefined} markerEnd="url(#business-workflow-arrow)" />
            {node.kind === 'condition' && <text x={adjacent ? a.x + 220 : fromX + 8}
              y={adjacent ? a.y + 43 : fromY + 18} fontSize="11" fill="currentColor">{t(branch ? 'branchNo' : 'branchYes')}</text>}
          </g>
        }))}
      </svg>
      {draft.nodes.map((node, index) => {
        const point = position(index)
        return <button type="button" key={node.id} className={clsx(css.node, selected === node.id && css.nodeSelected)}
          style={{ left: point.x, top: point.y }} onClick={() => { choose(node.id) }} aria-pressed={selected === node.id}>
          <span className={css.nodeKind}><WorkflowIcon size={15} />{t(kindKey(node.kind))}</span>
          <strong>{node.name}</strong>
          <small>{node.kind === 'action' ? t(`action.${node.action}`) : node.kind === 'human' ? node.role : t('draft')}</small>
        </button>
      })}
    </div>
  </div>
}

function PreviewDetails({ run, actions, t }: { run: PreviewRun; actions: Actions; t: Translator }) {
  const current = draftNode(run.draft, run.current)
  const finished = ['completed', 'rejected', 'stopped'].includes(run.status)
  return <section className={css.runDetail}>
    <header className={css.sectionHeader}><h3>{run.draft.name}</h3><Tag tone={run.status === 'completed' ? 'success' : 'warning'}>{t(`status.${run.status}`)}</Tag></header>
    <p>{t('snapshot')}</p>
    <h4>{t('current')}</h4><strong>{current.name}</strong>
    <div className={css.actions}>
      {run.status === 'ready' && <Button variant="primary" onClick={() => { actions.advance(run.id, 'next') }}>{t('advance')}</Button>}
      {run.status === 'human' && <>
        <Button variant="primary" onClick={() => { actions.advance(run.id, 'approve') }}>{t('approve')}</Button>
        <Button variant="outline" onClick={() => { actions.advance(run.id, 'reject') }}>{t('reject')}</Button>
      </>}
      {run.status === 'event' && <Button variant="primary" onClick={() => { actions.advance(run.id, 'arrived') }}>{t('arrive')}</Button>}
      {!finished && <Button variant="outline" onClick={() => { actions.stop(run.id) }}>{t('stop')}</Button>}
    </div>
    <h4>{t('completed')}</h4>
    <ol>{run.completed.map(id => <li key={id}>{draftNode(run.draft, id).name}</li>)}</ol>
  </section>
}

/** Render the single workbench panel through the DH slot store and locale shares. */
export function WorkbenchPage(props: Props) {
  const { useStore, actions, t, download } = props
  const state = useStore(value => value)
  const engine = props.useEngine(value => value)
  const [conditionPasses, setConditionPasses] = useState(true)
  const [inputJson, setInputJson] = useState('{}')
  const input = useRef<HTMLInputElement>(null)
  const draft = state.drafts.find(item => item.id === state.selectedId)
  if (!draft) throw new Error('workflow-draft-missing')
  const saved = engine.templates.find(item => item.id === draft.id)
  const savedCurrent = saved?.revision === state.revision && saved.draftJson === serializeDraft(draft)
  const node = draftNode(draft, state.selectedNode)
  const run = state.runs.find(item => item.id === state.selectedRun)
  const tasks = state.runs.filter(item => item.status === 'human')
  const importFile = async (file: File): Promise<void> => {
    try {
      if (file.size > 131072) throw new Error('draft-size')
      actions.importDraft(parseDraft(await file.text()))
    } catch { actions.notice('invalidImport') }
  }
  return <div className={css.root} data-business-workflow-view={state.view}>
    <header className={css.header}><div><div className={css.eyebrow}><WorkflowIcon />{t('panel')}</div><h1>{t('panel')}</h1><p>{t('subtitle')}</p></div>
      <div className={css.actions}><Button variant="outline" onClick={() => { input.current?.click() }}>{t('import')}</Button>
        <Button variant="primary" onClick={() => { actions.newDraft() }}>{t('newFlow')}</Button></div>
      <input ref={input} className={css.fileInput} type="file" accept="application/json,.json" aria-label={t('importLabel')}
        onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ''; if (file) void importFile(file) }} />
    </header>
    <div className={css.notice}><Tag tone={engine.health?.connected ? 'success' : 'warning'}>
      {engine.health?.connected ? t('engineConnected', { version: engine.health.version }) : t('engineOffline')}</Tag><span>{t('scope')}</span></div>
    <nav className={css.tabs} aria-label={t('panel')}>
      {(['flows', 'editor', 'instances', 'inbox', 'runs', 'tasks'] as const).map(view => <Button key={view} variant={state.view === view ? 'primary' : 'ghost'}
        aria-current={state.view === view ? 'page' : undefined} onClick={() => { actions.view(view) }}>{t(view)}{view === 'tasks' && tasks.length ? ` (${tasks.length})` : ''}</Button>)}
    </nav>
    {state.notice && <p role="status" className={css.feedback}>{t(state.notice)}</p>}
    {engine.error && state.view !== 'instances' && state.view !== 'inbox' && <p role="alert" className={css.feedback}>{t('engineError')} · {engine.error}</p>}
    {state.view === 'flows' && <><h2>{t('serverFlows')}</h2><p>{t('agentUsage')}</p><div className={css.flowGrid}>
      {engine.templates.length === 0 && <p>{t('noSavedFlows')}</p>}
      {engine.templates.map((item) => {
        const value = parseDraft(item.draftJson)
        return <article key={item.id} className={css.flowCard} data-saved-workflow={item.id}>
          <Tag tone={item.published ? 'success' : 'warning'}>{item.published ? t('published', { version: item.published.version }) : t('savedDraft')}</Tag>
          <h2>{value.name}</h2><p>{value.description}</p><div className={css.actions}>
            <Button variant="outline" disabled={engine.busy} onClick={() => { actions.openSaved(item) }}>{t('edit')}</Button>
            {item.published && <Button variant="outline" disabled={engine.busy} onClick={() => { void props.unpublishTemplate(item.id, item.revision) }}>{t('unpublish')}</Button>}
          </div>
        </article>
      })}
    </div><h2>{t('sampleFlows')}</h2></>}
    {state.view === 'flows' && <div className={css.flowGrid}>{state.drafts.filter(item => !engine.templates.some(saved => saved.id === item.id)).map(item => <article key={item.id} className={css.flowCard}>
      <div className={css.sectionHeader}><WorkflowIcon size={24} /><Tag>{t('draft')}</Tag></div><h2>{item.name}</h2><p>{item.description}</p>
      <div className={css.sectionHeader}><span>{t('nodes', { count: item.nodes.length })}</span><Button variant="outline" onClick={() => { actions.open(item.id) }}>{t('edit')}</Button></div>
    </article>)}</div>}
    {state.view === 'editor' && <>
      <div className={css.editorHeader}>
        <label className={css.field}><span>{t('flowName')}</span><Input value={draft.name} onChange={(event) => { actions.editDraft({ name: event.target.value, description: draft.description }) }} /></label>
        <label className={css.field}><span>{t('description')}</span><Input value={draft.description} onChange={(event) => { actions.editDraft({ name: draft.name, description: event.target.value }) }} /></label>
        <div className={css.actions}>
          <Button variant="primary" disabled={engine.busy} onClick={() => { void (async () => {
            const value = await props.saveTemplate({ id: draft.id, expectedRevision: state.revision, draftJson: serializeDraft(draft) })
            if (value) actions.openSaved(value)
          })() }}>{t('saveServer')}</Button>
          <Button variant="outline" disabled={engine.busy || !savedCurrent || !engine.health?.connected} onClick={() => { void (async () => {
            const value = await props.publishTemplate(draft.id, state.revision)
            if (value) actions.openSaved(value)
          })() }}>{t('publish')}</Button>
          <Button variant="outline" onClick={() => { actions.duplicate() }}>{t('duplicate')}</Button>
          <Button variant="outline" onClick={() => { download(serializeDraft(draft)); actions.notice('exported') }}>{t('export')}</Button>
          <Button variant="outline" onClick={() => { actions.validate() }}>{t('validate')}</Button>
        </div>
      </div>
      <p className={css.caption}>{t('draftLifetime')} {saved?.published && <Tag tone="success">{t('published', { version: saved.published.version })}</Tag>}</p>
      <details className={clsx(css.feedback, css.configuration)}><summary>{t('advancedSettings')}</summary>
        <h3>{t('inputFields')}</h3><p className={css.caption}>{t('inputFieldsHint')}</p>
        {draft.inputs.map((field, index) => <div className={css.actions} key={index}>
          <label className={css.field}><span>{t('inputName')}</span><Input value={field.name} onChange={(event) => { actions.editInputs(draft.inputs.map((item, i) => i === index ? { ...item, name: event.target.value } : item)) }} /></label>
          <label className={css.field}><span>{t('description')}</span><Input value={field.description} onChange={(event) => { actions.editInputs(draft.inputs.map((item, i) => i === index ? { ...item, description: event.target.value } : item)) }} /></label>
          <Select label={t('inputType')} value={field.type} onChange={(value) => { actions.editInputs(draft.inputs.map((item, i) => i === index ? { ...item, type: value as typeof field.type } : item)) }}>
            {(['string', 'number', 'boolean'] as const).map(type => <option key={type} value={type}>{t(`input.${type}`)}</option>)}
          </Select>
          <label><input type="checkbox" checked={field.required} onChange={(event) => { actions.editInputs(draft.inputs.map((item, i) => i === index ? { ...item, required: event.target.checked } : item)) }} />{t('inputRequired')}</label>
          <Button variant="outline" onClick={() => { actions.editInputs(draft.inputs.filter((_item, i) => i !== index)) }}>{t('removeInput')}</Button>
        </div>)}
        <Button variant="outline" disabled={draft.inputs.length >= 16} onClick={() => { actions.editInputs([...draft.inputs, { name: `field${draft.inputs.length + 1}`, description: '', type: 'string', required: true }]) }}>{t('addInput')}</Button>
      </details>
      {state.issues !== null && <div role="status" className={css.feedback}>{state.issues.length === 0 ? t('valid') : <ul>{state.issues.map((issue, index) => <li key={index}>
        {draft.nodes.find(item => item.id === issue.nodeId)?.name}{issue.nodeId ? ': ' : ''}{t(`issue.${issue.code}`)}
      </li>)}</ul>}</div>}
      <div className={css.editor}>
        <aside className={css.palette}><h3>{t('library')}</h3><p>{t('addHint')}</p>
          {NODE_KINDS.filter(kind => kind !== 'start' && kind !== 'end').map(kind => <Button key={kind} variant="outline"
            disabled={node.kind === 'end' || draft.nodes.length >= 64} aria-label={t('addNode', { kind: t(kindKey(kind)) })} onClick={() => { actions.add(kind) }}>
            <WorkflowIcon size={15} />{t(kindKey(kind))}
          </Button>)}
        </aside>
        <Graph draft={draft} selected={node.id} choose={actions.selectNode} t={t} />
        <NodeInspector key={node.id} className={css.properties} node={node} nodes={draft.nodes}
          step={draft.nodes.findIndex(item => item.id === node.id) + 1} t={t} onChange={actions.editNode} onDelete={actions.remove} />
      </div>
      <details className={clsx(css.feedback, css.configuration)}><summary>{t('developerDebug')}</summary>
        <p className={css.caption}>{t('developerDebugHint')}</p>
        <div className={css.previewBar}>
          <label className={css.field}><span>{t('engineInputs')}</span><textarea rows={3} value={inputJson}
            onChange={(event) => { setInputJson(event.target.value) }} /></label>
          {saved?.published && <Button variant="outline" disabled={engine.busy || !engine.health?.connected} onClick={() => {
            const publication = saved.published
            if (!publication) return
            props.startPublishedProcess({ id: saved.id, version: publication.version, requestId: randomUUID(),
              inputJson: parseDraft(publication.draftJson).inputs.length ? inputJson : '{}' })
            actions.view('instances')
          }}>{t('startPublished')}</Button>}
          <Button variant="primary" disabled={engine.busy || !engine.health?.connected} onClick={() => {
            props.startProcess({ requestId: randomUUID(), draftJson: serializeDraft(draft), inputJson })
            actions.view('instances')
          }}>{t('engineStart')}</Button>
        </div>
        <div className={css.previewBar}>
          <select aria-label={t('condition')} value={String(conditionPasses)} onChange={(event) => { setConditionPasses(event.target.value === 'true') }}>
            <option value="true">{t('passes')}</option><option value="false">{t('fails')}</option>
          </select>
          <Button variant="primary" onClick={() => { actions.preview(conditionPasses) }}>{t('preview')}</Button>
        </div>
      </details>
    </>}
    {(state.view === 'instances' || state.view === 'inbox') && <EnginePanel {...props} state={engine} inbox={state.view === 'inbox'} />}
    {state.view === 'runs' && (state.runs.length === 0 ? <p className={css.empty}>{t('emptyRuns')}</p> : <div className={css.runs}>
      <aside className={css.runList}>{state.runs.map(item => <button type="button" key={item.id} className={clsx(css.runRow, item.id === state.selectedRun && css.runSelected)} onClick={() => { actions.selectRun(item.id) }}>
        <strong>{item.draft.name}</strong><span>{t(`status.${item.status}`)}</span><small>{item.completed.length} / {item.draft.nodes.length}</small>
      </button>)}</aside>{run && <PreviewDetails run={run} actions={actions} t={t} />}
    </div>)}
    {state.view === 'tasks' && (tasks.length === 0 ? <p className={css.empty}>{t('emptyTasks')}</p> : <div className={css.flowGrid}>{tasks.map(item => <article key={item.id} className={css.flowCard}>
      <Tag tone="warning">{t('status.human')}</Tag><h2>{item.draft.name}</h2><p>{draftNode(item.draft, item.current).role}</p>
      <Button variant="outline" onClick={() => { actions.selectRun(item.id) }}>{t('inspect')}</Button>
    </article>)}</div>)}
  </div>
}
