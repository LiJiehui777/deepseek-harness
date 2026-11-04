/** Mount the isolated business-workflow workbench through existing DH panel slots. */
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import type {} from '@deepseek-ai/dsh-api-remotes/client'
import type { MainPanelId } from '@deepseek-ai/dsh-client-ui-layout/client'
import { WorkbenchPage, WorkflowIcon } from './WorkbenchPage.tsx'
import { createWorkbenchStore } from './store.ts'
import { en, NS, zh, type WorkbenchKey } from './locales.ts'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type {} from '@deepseek-ai/dsh-client-ui-session/client'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import { WorkflowChooser } from './WorkflowChooser.tsx'
import { ConversationChoiceController } from './conversation-controller.ts'
import { EngineController } from './engine-controller.ts'
import { ReviewController } from './review-controller.ts'
import { ConversationReviews } from './ConversationReviews.tsx'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Business-workflow editing and simulation copy. */
    'business-workflow': WorkbenchKey
  }
}

/** Required browser registration services. */
export const inject = ['slots', 'locale', 'remote', 'remote.businessWorkflows']

/** Register one sidebar entry and its editor without changing the Agent loop or native workflow service. */
export function apply(ctx: Context): void {
  const panel = 'business-workflow' as MainPanelId
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'business-workflow: locale')
  const t = ctx.locale.bind(NS)
  const store = createWorkbenchStore(t)
  const engine = new EngineController(ctx.remote.businessWorkflows)
  const face = engine.face()
  ctx.effect(() => () => engine.dispose(), 'business-workflow: engine projection')
  void engine.load()
  ctx.slots.inject('main', () => ctx.slots.register({
    name: 'main', key: panel, locale: NS, store,
    inject: () => ({
      ...face,
      download: (text: string): void => {
        const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }))
        const anchor = document.createElement('a')
        anchor.href = url
        anchor.download = 'workflow-draft.json'
        anchor.click()
        URL.revokeObjectURL(url)
      },
    }),
  }, WorkbenchPage))
  ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({
    name: 'sidebar.panellist', id: panel, order: 10, locale: NS, label: () => t('panel'),
  }, WorkflowIcon))
  ctx.inject(['sessions'], (scope) => {
    const controllers = new Map<SessionId, ConversationChoiceController>()
    const reviews = new Map<SessionId, ReviewController>()
    scope.on('connection/reset', () => {
      for (const controller of [...controllers.values(), ...reviews.values()]) void controller.load()
    })
    scope.effect(() => async () => {
      await Promise.all([...controllers.values(), ...reviews.values()].map(controller => controller.dispose()))
    })
    scope.slots.inject('conversation.input.left', () => scope.slots.register({
      name: 'conversation.input.left', id: 'business-workflow', order: 20, locale: NS,
      inject: (sessionId) => {
        let controller = controllers.get(sessionId)
        if (!controller) {
          const sessionScope = scope.sessions.scope(sessionId)
          if (!sessionScope) throw new Error('WORKFLOW_SESSION_SCOPE_MISSING')
          controller = new ConversationChoiceController(scope.remote.businessWorkflows, sessionId)
          const owned = controller
          controllers.set(sessionId, owned)
          sessionScope.effect(() => async () => { controllers.delete(sessionId); await owned.dispose() })
          void owned.load()
        }
        return controller.face()
      },
    }, WorkflowChooser))
    scope.slots.inject('conversation.input.dock', () => scope.slots.register({
      name: 'conversation.input.dock', id: 'business-workflow-reviews', order: 20, locale: NS,
      inject: (sessionId) => {
        let controller = reviews.get(sessionId)
        if (!controller) {
          const sessionScope = scope.sessions.scope(sessionId)
          if (!sessionScope) throw new Error('WORKFLOW_SESSION_SCOPE_MISSING')
          controller = new ReviewController(scope.remote.businessWorkflows, sessionId, () => { void engine.load() })
          const owned = controller
          reviews.set(sessionId, owned)
          sessionScope.effect(() => async () => { reviews.delete(sessionId); await owned.dispose() })
          void owned.load()
        }
        return controller.face()
      },
    }, ConversationReviews))
  })

}
