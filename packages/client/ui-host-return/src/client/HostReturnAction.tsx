/** Brand-row action that leaves the native Harness surface for its host app. */
import { IconChevronLeftOutline14 } from '@deepseek-ai/dsh-client-ui-primitives'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import { NS } from './locales.ts'
import css from './HostReturnAction.module.css'

/** Static configuration projected into the slot component. */
export interface HostReturnActionInjected {
  returnUrl: string
  hostName: string
}

/** Full props for the root-scoped brand-row action. */
export type HostReturnActionProps =
  PropsRuntime<'sidebar.brand.action'>
  & PropsLocale<typeof NS>
  & InjectFace<HostReturnActionInjected>

/** Return the top-level browser context to the host from standalone or embedded Web. */
export function HostReturnAction({ returnUrl, hostName, t }: HostReturnActionProps) {
  const label = t('action', { host: hostName })
  return (
    <a
      className={css.action}
      href={returnUrl}
      target="_top"
      aria-label={label}
      title={label}
    >
      <IconChevronLeftOutline14 size={16} />
    </a>
  )
}
