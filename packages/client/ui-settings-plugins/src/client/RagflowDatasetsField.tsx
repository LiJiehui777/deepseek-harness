/** Name-based, staged knowledge-base selection with a bounded scroll area. */
import { useEffect, useRef, useState } from 'react'
import { IconChevronDownOutline14, Tag } from '@deepseek-ai/dsh-client-ui-primitives'
import type { RagflowCardFace, RagflowCardState } from './ragflow-card-controller.ts'
import type { PluginsSettingsLocaleKey } from './locales.ts'
import fields from './fields.module.css'
import css from './RagflowDatasetsField.module.css'

interface DatasetFieldProps {
  state: RagflowCardState
  t: (key: PluginsSettingsLocaleKey) => string
  toggleDataset: RagflowCardFace['toggleDataset']
  loadDatasets: RagflowCardFace['loadDatasets']
  loadMoreDatasets: RagflowCardFace['loadMoreDatasets']
  onReset: () => void
}

/**
 * Render names while staging only dataset IDs; missing names remain removable.
 * @param props - catalog snapshot, localized copy and staged form actions.
 * @returns an accessible multi-select disclosure with paginated discovery.
 */
export function RagflowDatasetsField(props: DatasetFieldProps) {
  const { state, t } = props
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const root = useRef<HTMLDivElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    if (!open) return
    const closeOutside = (event: PointerEvent) => {
      if (event.target instanceof Node && !root.current?.contains(event.target)) setOpen(false)
    }
    document.addEventListener('pointerdown', closeOutside)
    return () => { document.removeEventListener('pointerdown', closeOutside) }
  }, [open])
  const selected = state.datasetIds.text.split(/[,，\s]+/).filter(Boolean)
  const names = new Map(state.datasets.map(row => [row.id, row.name]))
  const unknown = (id: string) => `${t('ragflowDatasetUnknown')} (${id.slice(0, 8)})`
  const rows = [...state.datasets, ...selected.filter(id => !names.has(id)).map(id => ({ id, name: unknown(id) }))]
  const visible = rows.filter(row => row.name.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()))
  const disabled = !state.writable || state.saving
  const loading = state.catalogStatus === 'loading'
  const canLoad = state.apiKeyConfigured && !state.catalogNeedsSave && !loading
  return (
    <div ref={root} className={fields.field} onKeyDown={(event) => {
      if (event.key === 'Escape' && open) { event.preventDefault(); event.stopPropagation(); setOpen(false); trigger.current?.focus() }
    }}>
      <div className={fields.head}>
        <label className={fields.label} htmlFor="plugin-config-ragflow-datasets">{t('ragflowDatasets')}</label>
        {state.datasetIds.overridden ? <span className={fields.badges}>
          <Tag tone="neutral">{t('overridden')}</Tag>
          <button type="button" className={fields.reset} disabled={disabled} onClick={props.onReset}>{t('reset')}</button>
        </span> : null}
      </div>
      <button ref={trigger} id="plugin-config-ragflow-datasets" type="button" className={css.trigger}
        aria-haspopup="dialog" aria-expanded={open} aria-controls="ragflow-dataset-options"
        onClick={() => {
          setOpen(!open)
          if (!open && state.catalogStatus === 'idle') props.loadDatasets()
        }}>
        <span className={css.summary}>{selected.length ? selected.map(id => names.get(id) ?? unknown(id)).join('、') : t('ragflowChooseDatasets')}</span>
        <IconChevronDownOutline14 />
      </button>
      <p className={state.datasetIds.invalid ? fields.invalid : fields.hint}>
        {t(state.datasetIds.invalid ? 'ragflowInvalidDatasets' : 'ragflowDatasetsHint')}
      </p>
      {open ? <div id="ragflow-dataset-options" role="dialog" aria-label={t('ragflowDatasets')} className={css.panel}>
        <input type="search" className={fields.input} aria-label={t('ragflowSearchDatasets')}
          placeholder={t('ragflowSearchDatasets')} value={search} onChange={(event) => { setSearch(event.target.value) }} />
        {state.catalogNeedsSave || !state.apiKeyConfigured ? <p className={fields.hint} role="status">{t('ragflowCatalogSaveFirst')}</p> : null}
        {loading ? <p className={fields.hint} role="status">{t('ragflowCatalogLoading')}</p> : null}
        {state.catalogStatus === 'error' ? <p className={fields.invalid} role="status">{t('ragflowCatalogFailed')}</p> : null}
        <div className={css.options} role="group" aria-label={t('ragflowChooseDatasets')}>
          {visible.map(row => <label key={row.id} className={css.option} title={row.id}>
            <input type="checkbox" checked={selected.includes(row.id)}
              disabled={disabled || state.catalogNeedsSave || (!selected.includes(row.id) && selected.length >= 100)}
              onChange={() => { props.toggleDataset(row.id) }} />
            <span>{row.name}</span>
          </label>)}
          {!visible.length && state.catalogStatus === 'ready' ? <p className={fields.hint}>{t('ragflowCatalogEmpty')}</p> : null}
        </div>
        <div className={css.actions}>
          <button type="button" className={css.action} disabled={!canLoad} onClick={props.loadDatasets}>{t('ragflowCatalogRefresh')}</button>
          {state.catalogHasMore ? <button type="button" className={css.action} disabled={!canLoad} onClick={props.loadMoreDatasets}>{t('ragflowCatalogMore')}</button> : null}
        </div>
      </div> : null}
    </div>
  )
}
