/**
 * The PostgreSQL connector's card.
 *
 * It stages the endpoint, the database and role, and the credential reference,
 * and writes the password through the credentials domain. A saved edit reaches
 * the running plugin through its volatile settings reference, so the connection
 * is replaced without a restart.
 */

import type { PluginConfigViewProps } from '@deepseek-ai/dsh-client-ui-plugin-manager/client'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { SecretField, ValueField } from './fields.tsx'
import { PluginCard } from './PluginCard.tsx'
import type { PostgresCardFace } from './postgres-card-controller.ts'
import css from './fields.module.css'
/** Props the renderer binds for the postgres card. */
export type PostgresCardProps =
  PropsRuntime<'plugins.item'>
  & PropsLocale<'settings.connectors'>
  & InjectFace<PostgresCardFace> & Partial<PluginConfigViewProps>

/**
 * Render the postgres card.
 * @param props - locale copy, the card snapshot, and its form actions.
 * @returns the card.
 */
export function PostgresCard(props: PostgresCardProps) {
  const { t } = props
  const state = props.usePostgresCard(snapshot => snapshot)
  if (props.view === 'summary') return <>{props.t('mesDescription')}</>
  const disabled = !state.writable
  return (
    <PluginCard standalone
      t={t}
      titleKey="mesTitle"
      descriptionKey="mesDescription"
      state={state}
      onSave={props.save}
      onDiscard={props.discard}
    >
      <div className={css.row}>
        <ValueField
          id="plugin-config-postgres-host"
          label={t('mesHost')}
          hint={t('mesHostHint')}
          overriddenLabel={t('overridden')}
          resetLabel={t('reset')}
          invalidLabel={t('mesInvalidHost')}
          disabled={disabled}
          {...state.host}
          onEdit={(text) => { props.edit('host', text) }}
          onReset={() => { props.resetField('host') }}
        />
        <ValueField
          id="plugin-config-postgres-port"
          label={t('mesPort')}
          hint={t('mesPortHint')}
          overriddenLabel={t('overridden')}
          resetLabel={t('reset')}
          invalidLabel={t('invalidNumber')}
          disabled={disabled}
          numeric
          {...state.port}
          onEdit={(text) => { props.edit('port', text) }}
          onReset={() => { props.resetField('port') }}
        />
      </div>
      <ValueField
        id="plugin-config-postgres-database"
        label={t('mesDatabase')}
        hint={t('mesDatabaseHint')}
        overriddenLabel={t('overridden')}
        resetLabel={t('reset')}
        invalidLabel={t('mesInvalidDatabase')}
        disabled={disabled}
        {...state.database}
        onEdit={(text) => { props.edit('database', text) }}
        onReset={() => { props.resetField('database') }}
      />
      <ValueField
        id="plugin-config-postgres-user"
        label={t('mesUser')}
        hint={t('mesUserHint')}
        overriddenLabel={t('overridden')}
        resetLabel={t('reset')}
        invalidLabel={t('mesInvalidUser')}
        disabled={disabled}
        {...state.user}
        onEdit={(text) => { props.edit('user', text) }}
        onReset={() => { props.resetField('user') }}
      />
      <SecretField
        id="plugin-config-postgres-password"
        label={t('mesPassword')}
        hint={t('mesPasswordHint')}
        // The credentials domain accepts a value even when the settings document
        // is read-only; its own writability is what disables this control.
        disabled={!state.passwordWritable}
        text={state.password.text}
        configured={state.passwordConfigured}
        stateLabel={state.passwordConfigured ? t('mesPasswordSet') : t('mesPasswordUnset')}
        onEdit={(text) => { props.edit('password', text) }}
      />
      <p className={css.hint}>{t('mesPasswordReference')}: <code>{state.passwordReference || t('mesPasswordReferenceEmpty')}</code></p>      <label>
        <input type="checkbox" checked={state.enabled.text === 'true'} disabled={disabled}
          onChange={(event) => { props.edit('enabled', String(event.target.checked)) }} />
        {t('mesEnabled')}
      </label>
    </PluginCard>
  )
}
