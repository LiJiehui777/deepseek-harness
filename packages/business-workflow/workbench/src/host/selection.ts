/** Conversation binding reduces model-visible tools and enforces the same restriction at dispatch. */
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-system-prompt'
import type {} from '@deepseek-ai/dsh-tools'
import type { WorkflowChoice } from '../shared/runtime.ts'

const allowed = new Set(['business_workflow_list', 'business_workflow_start', 'business_workflow_status', 'business_workflow_cancel'])
/** Ordinary chat can suggest workflows but cannot create a new instance. */
export const ordinaryInstruction = 'This conversation is in ordinary chat mode. You may discuss or recommend published business workflows, '
  + 'but cannot start one. Ask the user to manually select a workflow in the conversation workflow selector before requesting execution. '
  + 'Do not change the selection or use another tool or service to bypass it. Existing runs remain active; use their returned runId for progress questions.'
/** Stable model instruction; selected workflow metadata is a separate durable prompt context. */
export const selectionInstruction = 'This conversation is bound to the selected published business workflow. '
  + 'Use business_workflow_list to inspect its declared inputs, then business_workflow_start when the user requests execution. '
  + 'Ask for missing required inputs. Selecting a workflow alone does not request execution. '
  + 'For progress questions, query the runId already returned; do not start again. '
  + 'Starting suspends further model steps. The conversation remains pending without model polling while the workflow runs or waits for human review. '
  + 'Approval resumes engine execution automatically; saved completion or failure evidence resumes this conversation for a final response. '
  + 'Human review is available from this conversation\'s review card or the workflow page and requires the user\'s explicit UI action. Event confirmation stays in the workflow page. If the selected version is unavailable, ask the user to reselect it. '
  + 'Only the user can change this binding or return to ordinary chat through the workflow selector.'

/** Install plugin-owned admission and prompt contributions over the authoritative binding table.
 * @param ctx - tools and prompt registries.
 * @param selected - authoritative per-conversation choice; null allows ordinary chat.
 */
export function installSelectionPolicy(ctx: Context, selected: (owner: string) => WorkflowChoice | null): void {
  const ownerFor = (scope: object | undefined) => ctx.agents.list().find(agent => agent === scope)?.id
  // A registry guard is monotonic: later scope registrations cannot restore denied bodies.
  ctx.tools.guard((exec) => {
    if (!exec.agent) return
    const choice = selected(exec.agent.id)
    if (!choice && exec.name === 'business_workflow_start') return 'WORKFLOW_SELECTION_REQUIRED'
    if (choice && !allowed.has(exec.name)) return 'WORKFLOW_CONVERSATION_REQUIRES_SELECTED_WORKFLOW'
  })
  ctx.on('tools/model-denied', (definition, scope) => {
    const owner = ownerFor(scope)
    if (!owner) return
    const choice = selected(owner)
    if (choice && !allowed.has(definition.name)) return 'WORKFLOW_CONVERSATION_REQUIRES_SELECTED_WORKFLOW'
    if (!choice && definition.name === 'business_workflow_start') return 'WORKFLOW_SELECTION_REQUIRED'
  })
  ctx.systemPrompt.context({ name: 'business-workflow:conversation', order: ctx.systemPrompt.getSectionOrder('TOOL_WORKFLOW'),
    text: ({ scope }) => {
      const owner = ownerFor(scope)
      const choice = owner ? selected(owner) : null
      return owner ? choice ? `${selectionInstruction}\n\nSelected workflow: ${JSON.stringify(choice)}` : ordinaryInstruction : ''
    },
  })
}
