/**
 * The ragflow provider's card: its endpoint, its allowed knowledge bases,
 * and the key — which is written through the credentials domain, never into
 * the settings section, so the literal never rides a response.
 */

import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { SecretField, ValueField } from './fields.tsx'
import { PluginCard } from './PluginCard.tsx'
import type { RagflowCardFace } from './ragflow-card-controller.ts'
import type {} from './slot-contract.ts'

/** Props the renderer binds for the ragflow card. */
export type RagflowCardProps =
  PropsRuntime<'settings.plugin.item'>
  & PropsLocale<'settings.plugins'>
  & InjectFace<RagflowCardFace>

/**
 * Render the ragflow card.
 * @param props - locale copy, the card snapshot, and its form actions.
 * @returns the card.
 */
export function RagflowCard(props: RagflowCardProps) {
  const { t } = props
  const state = props.useRagflowCard(snapshot => snapshot)
  const disabled = !state.writable
  return (
    <PluginCard
      t={t}
      titleKey="ragflowTitle"
      descriptionKey="ragflowDescription"
      state={state}
      onSave={props.save}
      onDiscard={props.discard}
    >
      <SecretField
        id="plugin-config-ragflow-key"
        label={t('ragflowApiKey')}
        hint={t('ragflowApiKeyHint')}
        // The credentials domain accepts a key even when the settings document
        // itself is read-only; they are separate stores with separate refusals.
        // Its own writability is what disables this control — a key sourced
        // from the process environment cannot be written from here.
        disabled={!state.apiKeyWritable}
        text={state.apiKey.text}
        configured={state.apiKeyConfigured}
        stateLabel={state.apiKeyConfigured ? t('ragflowApiKeySet') : t('ragflowApiKeyUnset')}
        onEdit={(text) => { props.edit('apiKey', text) }}
      />
      <ValueField
        id="plugin-config-ragflow-endpoint"
        label={t('ragflowBaseUrl')}
        hint={t('ragflowBaseUrlHint')}
        overriddenLabel={t('overridden')}
        resetLabel={t('reset')}
        invalidLabel={t('ragflowInvalidUrl')}
        disabled={disabled}
        {...state.baseURL}
        onEdit={(text) => { props.edit('baseURL', text) }}
        onReset={() => { props.resetField('baseURL') }}
      />
      <ValueField
        id="plugin-config-ragflow-datasets"
        label={t('ragflowDatasets')}
        hint={t('ragflowDatasetsHint')}
        overriddenLabel={t('overridden')} resetLabel={t('reset')} invalidLabel={t('ragflowInvalidDatasets')}
        disabled={disabled} {...state.datasetIds}
        onEdit={(text) => { props.edit('datasetIds', text) }} onReset={() => { props.resetField('datasetIds') }}
      />
      <label>
        <input type="checkbox" checked={state.enabled.text === 'true'} disabled={disabled}
          onChange={(event) => { props.edit('enabled', String(event.target.checked)) }} />
        {t('ragflowEnabled')}
      </label>
    </PluginCard>
  )
}
