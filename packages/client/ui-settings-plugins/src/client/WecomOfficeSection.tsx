/** Native one-action QR connection with optional office permission controls. */
import type { WecomOfficeError } from '@deepseek-ai/dsh-api-remotes/client'
import type { PluginsSettingsLocaleKey } from './locales.ts'
import type { WecomOfficeActions, WecomOfficeCardState } from './wecom-office-controller.ts'
import css from './EnterpriseCard.module.css'
import fields from './fields.module.css'

const failures: Record<WecomOfficeError, PluginsSettingsLocaleKey> = {
  'runtime-unavailable': 'wecomOfficeRuntimeUnavailable', 'version-mismatch': 'wecomOfficeVersionMismatch',
  'not-authorized': 'wecomOfficeNotAuthorized', 'permission-denied': 'wecomOfficePermissionDenied',
  unavailable: 'wecomOfficeUnavailable', 'invalid-result': 'wecomOfficeInvalidResult', 'too-large': 'wecomOfficeTooLarge',
  timeout: 'wecomOfficeTimeout', cancelled: 'wecomOfficeCancelled', 'connection-failed': 'wecomOfficeConnectionFailed',
}
/** Pure subsection props; the parent card owns the framework subscription. */
interface Props {
  state: WecomOfficeCardState
  actions: WecomOfficeActions
  t: (key: PluginsSettingsLocaleKey) => string
}

/**
 * Render the QR connection and collapsed read-permission settings.
 * @param props - locale-owned labels, callbacks and account metadata.
 * @returns account connection controls without requiring prior configuration.
 */
export function WecomOfficeSection({ state, actions, t }: Props) {
  if (!state.available) return null
  const pending = state.status?.state === 'pending'
  const connected = state.status?.state === 'authorized'
  const disabled = !state.writable || state.saving || state.busy || pending
  const blocked = state.dirty || disabled
  const status: PluginsSettingsLocaleKey = connected ? 'wecomOfficeAuthorized'
    : pending ? 'wecomOfficePending' : state.status?.state === 'checking' ? 'wecomOfficeChecking' : 'wecomOfficeDisabled'
  const options = [
    ['documents', 'wecomOfficeDocuments'], ['files', 'wecomOfficeFiles'], ['calendar', 'wecomOfficeCalendar'], ['todos', 'wecomOfficeTodos'],
  ] as const
  const states = { unknown: 'wecomOfficeCapabilityUnknown', discoverable: 'wecomOfficeCapabilityDiscoverable', verified: 'wecomOfficeCapabilityVerified',
    unavailable: 'wecomOfficeUnavailable', 'permission-denied': 'wecomOfficePermissionDenied', error: 'wecomOfficeCapabilityError' } as const
  return <section className={css.office} aria-label={t('wecomOfficeTitle')}>
    <h4 className={css.sectionTitle}>{t('wecomOfficeTitle')}</h4>
    <p className={fields.hint}>{t('wecomOfficeHint')}</p>
    <div role="status" className={css.status}>
      <p>{t(status)}</p>
      {connected && state.status?.authorizerName ? <p>{state.status.authorizerName}
        {state.status.corporationName ? ` · ${state.status.corporationName}` : ''}</p> : null}
      {state.requestFailed ? <p className={fields.invalid}>{t('wecomOfficeConnectionFailed')}</p> : null}
      {state.status?.error ? <p className={fields.invalid}>{t(failures[state.status.error])}</p> : null}
    </div>
    {pending ? <div className={css.officeQr}>
      {state.status?.qrImage ? <img src={state.status.qrImage} alt={t('wecomOfficeQrAlt')} /> : <p>{t('wecomOfficePreparingQr')}</p>}
      <p className={fields.hint}>{t('wecomOfficeQrHint')}</p>
      <button type="button" disabled={state.busy} onClick={actions.cancel}>{t('wecomOfficeCancel')}</button>
    </div> : <div className={css.actions}>
      <button type="button" disabled={blocked} onClick={actions.scan}>{t(connected ? 'wecomOfficeReconnect' : 'wecomOfficeScan')}</button>
      {connected ? <button type="button" disabled={blocked} onClick={actions.disconnect}>{t('wecomOfficeDisconnect')}</button> : null}
    </div>}
    <details className={css.advanced}>
      <summary>{t('wecomOfficeAdvanced')}</summary>
      <label className={css.toggle}><input type="checkbox" checked={state.fields.enabled?.text === 'true'} disabled={disabled}
        onChange={(event) => { actions.edit('enabled', String(event.target.checked)) }} />{t('wecomOfficeEnabled')}</label>
      <fieldset className={css.officeCapabilities} disabled={disabled}>
        <legend>{t('wecomOfficeCapabilities')}</legend>
        {options.map(([id, label]) => <div key={id} className={css.officeCapability}>
          <label className={css.toggle}><input type="checkbox" checked={state.fields[id]?.text === 'true'}
            onChange={(event) => { actions.edit(id, String(event.target.checked)) }} />{t(label)}</label>
          <span>{t(states[state.status?.capabilities.find(row => row.id === id)?.state ?? 'unknown'])}</span>
        </div>)}
      </fieldset>
      <p className={fields.hint}>{t('wecomOfficeLocalOnly')}</p>
      {connected && !state.status?.authorizerName ? <p className={fields.hint}>{t('wecomOfficeIdentityUnknown')}</p> : null}
      {state.dirty ? <div className={css.actions}>
        <button type="button" disabled={disabled} onClick={actions.discard}>{t('discard')}</button>
        <button type="button" disabled={disabled || state.invalid} onClick={actions.save}>{t('wecomOfficeSave')}</button>
      </div> : null}
      {state.failed ? <p className={fields.invalid} role="status">{t('saveFailed')}</p> : null}
      {state.dirty ? <p className={fields.hint}>{t('wecomOfficeSaveFirst')}</p> : null}
      <button type="button" disabled={blocked || !connected} onClick={actions.check}>{t('wecomOfficeCheck')}</button>
    </details>
  </section>
}
