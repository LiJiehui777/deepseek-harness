/** Native settings card for an independently authorized enterprise provider. */
import type { PluginConfigViewProps } from '@deepseek-ai/dsh-client-ui-plugin-manager/client'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { EnterpriseCardFace } from './enterprise-card-controller.ts'
import type { PluginsSettingsLocaleKey } from './locales.ts'
import { SecretField, ValueField } from './fields.tsx'
import { PluginCard } from './PluginCard.tsx'
import css from './fields.module.css'
import enterpriseCss from './EnterpriseCard.module.css'

/** Framework-bound card props; both accounts use independent snapshots. */
export type EnterpriseCardProps = PropsRuntime<'settings.plugin.item'> & PropsLocale<'settings.plugins'> & InjectFace<EnterpriseCardFace> & Partial<PluginConfigViewProps>

/**
 * Render account credentials, capabilities, sender scope and connection feedback.
 * @param props - one account's native settings actions and translated copy.
 * @returns the account card when its settings namespace is available.
 */
export function EnterpriseCard(props: EnterpriseCardProps) {
  const state = props.useEnterpriseCard(snapshot => snapshot)
  const { t } = props
  const feishu = state.channel === 'feishu'
  if (props.view === 'summary') return <>{t(feishu ? 'feishuDescription' : 'wecomDescription')}</>
  const disabled = !state.writable || state.saving
  const status: PluginsSettingsLocaleKey = state.status?.state === 'connected' ? 'enterpriseConnected'
    : state.status?.state === 'connecting' ? 'enterpriseConnecting'
      : state.status?.state === 'missing-credentials' ? 'enterpriseMissingSecret'
        : state.status?.state === 'error' ? 'enterpriseConnectionFailed' : 'enterpriseDisabled'
  const field = (name: string, label: PluginsSettingsLocaleKey, hint: PluginsSettingsLocaleKey) => (
    <ValueField key={name} id={`enterprise-${state.channel}-${name}`} label={t(label)} hint={t(hint)}
      overriddenLabel={t('overridden')} resetLabel={t('reset')} invalidLabel={t('enterpriseInvalid')}
      disabled={disabled} {...state.fields[name] as NonNullable<typeof state.fields[string]>}
      onEdit={(value) => { props.edit(name, value) }} onReset={() => { props.resetField(name) }} />
  )
  const toggle = (name: string, label: PluginsSettingsLocaleKey) => (
    <label key={name} className={enterpriseCss.toggle}><input type="checkbox" disabled={disabled} checked={state.fields[name]?.text === 'true'}
      onChange={(event) => { props.edit(name, String(event.target.checked)) }} />{t(label)}</label>
  )
  return <PluginCard standalone={props.view === 'page'} t={t} titleKey={feishu ? 'feishuTitle' : 'wecomTitle'} descriptionKey={feishu ? 'feishuDescription' : 'wecomDescription'}
    state={state} onSave={props.save} onDiscard={props.discard}>
    {field(feishu ? 'appId' : 'botId', feishu ? 'feishuAppId' : 'wecomBotId', feishu ? 'feishuSetupHint' : 'wecomSetupHint')}
    <SecretField id={`enterprise-${state.channel}-secret`} label={t(feishu ? 'feishuSecret' : 'wecomSecret')}
      hint={t('enterpriseSecretHint')} configured={state.secretConfigured} disabled={!state.secretWritable || state.saving}
      text={state.secret.text} stateLabel={t(state.secretConfigured ? 'enterpriseSecretSet' : 'enterpriseMissingSecret')}
      onEdit={(value) => { props.edit('secret', value) }} />
    <a className={enterpriseCss.link} href={feishu ? 'https://open.feishu.cn/app' : 'https://work.weixin.qq.com/'} target="_blank" rel="noreferrer">{t('enterpriseOpenConsole')}</a>
    {toggle('enabled', 'enterpriseEnable')}
    {feishu ? toggle('readEnabled', 'enterpriseRead') : <p className={css.hint}>{t('wecomHistoryHint')}</p>}
    {feishu ? <>
      {toggle('readIdentity', 'feishuReadIdentity')}
      <p className={css.hint}>{t('feishuUserHint')}</p>
      <div role="status" className={enterpriseCss.status}>
        <p>{t(state.authorization?.state === 'authorized' ? 'feishuAuthorized'
          : state.authorization?.state === 'pending' ? 'feishuPending' : 'feishuUnauthorized')}
        {state.authorization?.userName ? `: ${state.authorization.userName}` : ''}</p>
        {state.authorizationFailed ? <p className={css.invalid}>{t('feishuAuthFailed')}</p> : null}
        {state.authorization?.error ? <p className={css.invalid}>{t(state.authorization.error === 'cancelled' ? 'feishuAuthCancelled' : 'feishuAuthFailed')}</p> : null}
      </div>
      <label className={enterpriseCss.callback}>{t('feishuCallback')}
        <input readOnly value={state.authorization?.redirectURI ?? ''} onFocus={(event) => { event.target.select() }} />
      </label>
      <p className={css.hint}>{t('feishuCallbackHint')}</p>
      <div className={enterpriseCss.actions}>
        <button type="button" disabled={disabled || state.dirty || state.checking || state.fields.enabled?.text !== 'true' || !state.secretConfigured} onClick={props.authorize}>{t('feishuAuthorize')}</button>
        <button type="button" disabled={disabled || state.dirty || state.checking || state.authorization?.state === 'unauthorized'} onClick={props.revoke}>{t('feishuRevoke')}</button>
      </div>
      {state.authorizationURL ? <a href={state.authorizationURL} target="_blank" rel="noreferrer" className={enterpriseCss.link}>{t('feishuAuthLink')}</a> : null}
    </> : null}
    {toggle('receiveEnabled', 'enterpriseReceive')}
    <p className={css.hint}>{t('enterpriseReceiveHint')}</p>
    {field('allowedSenders', 'enterpriseSenders', 'enterpriseSendersHint')}
    {field('allowedChats', 'enterpriseChats', 'enterpriseChatsHint')}
    {toggle('sendEnabled', 'enterpriseSend')}
    <p className={css.hint}>{t('enterpriseSendHint')}</p>
    <details className={enterpriseCss.advanced}>
      <summary>{t('enterpriseAdvanced')}</summary>
      {field(feishu ? 'baseURL' : 'websocketURL', 'enterpriseEndpoint', feishu ? 'feishuEndpointHint' : 'wecomEndpointHint')}
      {feishu ? field('redirectURI', 'feishuRedirectURI', 'feishuRedirectHint') : null}
      {feishu ? field('userScopes', 'feishuUserScopes', 'feishuUserScopesHint') : null}
      {field('workspacePath', 'enterpriseWorkspace', 'enterpriseWorkspaceHint')}
      {field('agentPreset', 'enterprisePreset', 'enterprisePresetHint')}
    </details>
    <div role="status" className={enterpriseCss.status}>
      <p>{t(status)}</p>
      {state.status?.error === 'task-failed' ? <p className={css.invalid}>{t('enterpriseTaskFailed')}</p> : null}
      {state.status?.error === 'task-queue-full' ? <p className={css.invalid}>{t('enterpriseQueueFull')}</p> : null}
      {state.status?.lastSenderId ? <p>{t('enterpriseLastSender')}: {state.status.lastSenderId}</p> : null}
      {state.status?.lastChatId ? <p>{t('enterpriseLastChat')}: {state.status.lastChatId}</p> : null}
    </div>
    <div className={enterpriseCss.actions}>
      <button type="button" disabled={disabled || state.dirty || state.checking} onClick={props.reconnect}>
        {t(state.checking ? 'enterpriseConnecting' : 'enterpriseReconnect')}
      </button>
      <button type="button" disabled={state.checking} onClick={props.refresh}>{t('enterpriseRefresh')}</button>
      <button type="button" disabled={disabled || !state.status?.lastSenderId} onClick={() => { props.allowLatest('sender') }}>{t('enterpriseAllowSender')}</button>
      <button type="button" disabled={disabled || !state.status?.lastChatId} onClick={() => { props.allowLatest('chat') }}>{t('enterpriseAllowChat')}</button>
    </div>
    {state.dirty ? <p className={css.hint}>{t('enterpriseSaveFirst')}</p> : null}
  </PluginCard>
}
