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
 * Render one account action: scan, cancel a pending scan, or disconnect.
 * @param props - locale-owned labels, callbacks and account metadata.
 * @returns account connection controls without requiring prior configuration.
 */
export function WecomOfficeSection({ state, actions, t }: Props) {
  if (!state.available) return null
  const pending = state.status?.state === 'pending'
  const connected = state.status?.state === 'authorized'
  const extended = ['contacts', 'meetings', 'mail', 'messages'].every(field => state.fields[field]?.text === 'true')
  const disabled = !state.writable || state.saving || state.busy || pending
  const blocked = state.dirty || disabled
  const status: PluginsSettingsLocaleKey = connected ? 'wecomOfficeAuthorized'
    : pending ? 'wecomOfficePending' : state.status?.state === 'checking' ? 'wecomOfficeChecking' : 'wecomOfficeDisabled'
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
    {connected && !extended ? <div>
      <p className={fields.hint}>{t('wecomOfficeExtendHint')}</p>
      <button type="button" disabled={blocked} onClick={actions.extend}>{t('wecomOfficeExtend')}</button>
    </div> : null}
    {pending ? <div className={css.officeQr}>
      {state.status?.qrImage ? <img src={state.status.qrImage} alt={t('wecomOfficeQrAlt')} /> : <p>{t('wecomOfficePreparingQr')}</p>}
      <p className={fields.hint}>{t('wecomOfficeQrHint')}</p>
      <button type="button" disabled={state.busy} onClick={actions.cancel}>{t('wecomOfficeCancel')}</button>
    </div> : <div className={css.actions}>
      <button type="button" disabled={blocked} onClick={connected ? actions.disconnect : actions.scan}>{t(connected ? 'wecomOfficeDisconnect' : 'wecomOfficeScan')}</button>
    </div>}
  </section>
}
