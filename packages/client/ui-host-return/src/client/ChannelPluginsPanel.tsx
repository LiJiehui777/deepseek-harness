/** Native Plugins-settings page for host-owned channel accounts. */
import { useCallback, useEffect, useState } from 'react'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import { NS } from './locales.ts'
import css from './ChannelPluginsPanel.module.css'

type Channel = 'feishu' | 'wecom'
interface Status {
  channel: Channel
  configuredAccounts: number
  enabled: boolean
  boundAccountName?: string
}

/** Public host destinations, without platform credentials or tool authority. */
export interface ChannelPluginsPanelInjected {
  managementUrl: string
  hostOrigin: string
}
/** Props bound by the native Plugins-settings tab renderer. */
export type ChannelPluginsPanelProps = PropsRuntime<'settings.plugins.tab'>
  & PropsLocale<typeof NS> & InjectFace<ChannelPluginsPanelInjected>

function statuses(value: unknown): Status[] | undefined {
  if (!Array.isArray(value) || value.length !== 2) return undefined
  const channels = new Set<Channel>()
  const result: Status[] = []
  for (const entry of value as unknown[]) {
    if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) return undefined
    const { channel, enabled, configuredAccounts, boundAccountName } = entry as Record<string, unknown>
    if ((channel !== 'feishu' && channel !== 'wecom') || channels.has(channel)
      || typeof enabled !== 'boolean' || typeof configuredAccounts !== 'number' || !Number.isInteger(configuredAccounts)
      || configuredAccounts < 0 || configuredAccounts > 100000 || boundAccountName !== undefined
      && (typeof boundAccountName !== 'string' || boundAccountName.length === 0 || boundAccountName.length > 255)) return undefined
    channels.add(channel)
    result.push({ channel, configuredAccounts, enabled,
      ...(boundAccountName === undefined ? {} : { boundAccountName }) })
  }
  return result
}

/**
 * Render the two read-only plugins and delegate account management to the authenticated host.
 * @param props - localized copy and validated host navigation.
 * @returns the shared plugin management page.
 */
export function ChannelPluginsPanel(props: ChannelPluginsPanelProps) {
  const { t, managementUrl, hostOrigin } = props
  const [state, setState] = useState<Status[]>()
  const embedded = window.parent !== window
  useEffect(() => {
    if (!embedded) return
    const receive = (event: MessageEvent) => {
      if (event.source !== window.parent || event.origin !== hostOrigin) return
      const data: unknown = event.data
      if (typeof data !== 'object' || data === null) return
      const payload = data as Record<string, unknown>
      if (payload.type !== 'ragflow.workbench.channel-status') return
      const next = statuses(payload.channels)
      if (next !== undefined) setState(next)
    }
    window.addEventListener('message', receive)
    window.parent.postMessage({ type: 'ragflow.workbench.channel-status-request' }, hostOrigin)
    return () => { window.removeEventListener('message', receive) }
  }, [embedded, hostOrigin])
  const manage = useCallback((channel: Channel) => {
    if (embedded) {
      window.parent.postMessage({ type: 'ragflow.workbench.manage-channel', channel }, hostOrigin)
    } else {
      const destination = new URL(managementUrl)
      destination.searchParams.set('channel', channel)
      window.location.assign(destination.href)
    }
  }, [embedded, managementUrl, hostOrigin])
  return <section className={css.panel}>
    <p className={css.intro}>{t('channelsIntro')}</p>
    {(['feishu', 'wecom'] as const).map(channel => <ChannelCard key={channel}
      channel={channel} status={state?.find(item => item.channel === channel)} t={t}
      embedded={embedded} manage={manage} />)}
  </section>
}

function ChannelCard({ channel, status, t, embedded, manage }: {
  channel: Channel
  status: Status | undefined
  t: ChannelPluginsPanelProps['t']
  embedded: boolean
  manage: (channel: Channel) => void
}) {
  const onManage = useCallback(() => { manage(channel) }, [manage, channel])
  return <article className={css.card}>
    <div className={css.heading}><h3>{t(channel === 'feishu' ? 'feishuPlugin' : 'wecomPlugin')}</h3>
      {status && <span className={css.badge}>{t(status.enabled ? 'channelEnabled' : 'channelDisabled')}</span>}
    </div>
    <p>{t(channel === 'feishu' ? 'feishuScope' : 'wecomScope')}</p>
    <p className={css.status}>{status
      ? status.configuredAccounts > 0 ? t('channelConfigured', { count: String(status.configuredAccounts) }) : t('channelEmpty')
      : t(embedded ? 'channelLoading' : 'channelStandalone')}</p>
    {status?.boundAccountName && <p>{t('channelBound', { name: status.boundAccountName })}</p>}
    <div className={css.actions}><span>{t('channelReadOnly')}</span><button type="button" onClick={onManage}>{t('channelManage')}</button></div>
  </article>
}
