/** Conversation-level workflow choice beside the existing permission control. */
import { useState } from 'react'
import clsx from 'clsx'
import { Menu, IconChevronDownOutlineRegular, IconNewChatOutlineRegular, IconRefreshOutlineRegular } from '@deepseek-ai/dsh-client-ui-primitives'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type {} from '@deepseek-ai/dsh-client-ui-session/client'
import type { ConversationChoiceFace } from './conversation-controller.ts'
import type { WorkflowChoice } from '../shared/runtime.ts'
import { WorkflowIcon } from './WorkbenchPage.tsx'
import css from './WorkflowChooser.module.css'

type Props = PropsRuntime<'conversation.input.left'> & PropsLocale<'business-workflow'> & InjectFace<ConversationChoiceFace>
const key = (choice: WorkflowChoice) => `${choice.id}:${choice.version}`

/** Render a permission-style menu over server-owned selection; picking never starts a workflow.
 * @param props - Session runtime, localized copy, and private selector face.
 * @returns an anchored workflow menu for local root conversations.
 */
export function WorkflowChooser({ useSession, useWorkflowChoice, choose, reload, t }: Props) {
  const state = useWorkflowChoice(value => value)
  const session = useSession(value => value)
  const [open, setOpen] = useState(false)
  if (session.subagent !== null) return null
  const selected = state.value?.selection
  const blocked = session.running || session.removed || session.openState !== 'open' || state.busy
  const label = selected ? t('chooserBound', { name: selected.name, version: selected.version }) : t('chooserNormal')
  const error = state.error.includes('REVISION_CONFLICT') ? t('chooserConflict')
    : state.error.includes('NATIVE_TOOLS_REQUIRED') ? t('chooserNativeRequired') : t('chooserFailed')
  return <div className={css.root} data-workflow-chooser>
    <Menu open={open} portal side="top" autoFocus={!state.busy}
      anchor={<button type="button" className={css.trigger} disabled={blocked}
        title={t('chooserHint')} aria-label={t('chooserLabel', { name: label })}
        aria-haspopup="menu" aria-expanded={open} onClick={() => { if (!open) reload(); setOpen(!open) }}>
        <WorkflowIcon size={14} /><span className={css.name}>{selected ? selected.name : t('chooserButton')}</span>
        <span className={clsx(css.chevron, open && css.chevronOpen)} aria-hidden><IconChevronDownOutlineRegular /></span>
      </button>}
      items={[
        { id: 'ordinary', label: t('chooserNormal'), icon: <IconNewChatOutlineRegular />, disabled: state.busy || !state.value },
        ...(state.value?.choices ?? []).map(choice => ({ id: key(choice),
          label: t('chooserBound', { name: choice.name, version: choice.version }),
          icon: <WorkflowIcon size={16} />, disabled: state.busy })),
      ]}
      footer={[{ id: 'refresh', label: t('chooserReload'), icon: <IconRefreshOutlineRegular />, disabled: state.busy }]}
      selectedId={selected ? key(selected) : 'ordinary'} onClose={() => { setOpen(false) }}
      onSelect={(id) => { void (async () => {
        if (id === 'refresh') { reload(); return }
        const value = id === 'ordinary' ? null : state.value?.choices.find(choice => key(choice) === id)
        if (value === undefined) return
        if (await choose(value)) setOpen(false)
      })() }}>
      <div className={css.notice}>
        <p>{t('chooserRequirement')}</p>
        {state.value && state.value.choices.length === 0 && <p>{t('chooserEmpty')}</p>}
        {state.value && !state.value.selectedAvailable && <p role="status">{t('chooserUnavailable')}</p>}
        {state.error && <p role="alert">{error}</p>}
      </div>
    </Menu>
  </div>
}
