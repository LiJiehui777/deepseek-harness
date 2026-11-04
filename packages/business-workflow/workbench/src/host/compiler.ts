/** Compile editor data into a closed BPMN subset; user text never becomes executable EL or scripts. */
import { createHash } from 'node:crypto'
import { validateDraft } from '../shared/draft.ts'
import type { WorkflowDraft } from '../shared/types.ts'

const escape = (value: string): string => value.replaceAll('&', '&amp;').replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&apos;')

/** Engine activity identifier; imported node identifiers are not interpolated into XML identifiers. */
export const activityId = (index: number): string => `n_${index}`
/** Process variable containing a node's JSON output. */
export const resultKey = (index: number): string => `dh_result_${index}`
/** Stable process key for one draft revision. */
export const processKey = (draftJson: string): string => `dh_business_${createHash('sha256').update(draftJson).digest('hex').slice(0, 24)}`

/**
 * Compile a validated acyclic draft into BPMN tasks, receive waits, and exclusive gateways.
 * @param draft - imported editor configuration.
 * @param key - host-generated process key.
 * @param tenant - trusted deployment namespace isolating worker topics.
 * @returns deployable BPMN XML without arbitrary executable content.
 */
export function compileBpmn(draft: WorkflowDraft, key: string, tenant: string): string {
  const issues = validateDraft(draft)
  if (issues.length) throw new Error(`INVALID_DRAFT: ${issues.map(item => item.code).join(', ')}`)
  for (const node of draft.nodes) {
    if (node.kind === 'condition' && node.operator !== 'exists') {
      const expected: unknown = JSON.parse(node.expected)
      if (expected !== null && typeof expected === 'object') throw new Error('CONDITION_EXPECTS_JSON_SCALAR')
    }
  }
  const indexOf = (id: string): number => draft.nodes.findIndex(node => node.id === id)
  const tasks = draft.nodes.map((node, index) => {
    const id = activityId(index), name = escape(node.name)
    switch (node.kind) {
      case 'start': return `<startEvent id="${id}" name="${name}"/>`
      case 'end': return `<endEvent id="${id}" name="${name}"/>`
      case 'human': return `<userTask id="${id}" name="${name}" flowable:assignee="dh-local-operator"/>`
      case 'wait': return `<receiveTask id="${id}" name="${name}"/>`
      case 'condition': return `<serviceTask id="${id}" name="${name}" flowable:type="external-worker" flowable:topic="dh.business.${escape(tenant)}.condition"/>`
        + `<exclusiveGateway id="${id}_gate" default="${id}_false"/>`
      case 'agent': return `<serviceTask id="${id}" name="${name}" flowable:type="external-worker" flowable:topic="dh.business.${escape(tenant)}.agent"/>`
      case 'action': return `<serviceTask id="${id}" name="${name}" flowable:type="external-worker" flowable:topic="dh.business.${escape(tenant)}.${escape(node.action)}"/>`
    }
  })
  const edges = draft.nodes.flatMap((node, index) => {
    const id = activityId(index)
    if (node.kind === 'end') return []
    if (node.kind === 'condition') return [
      `<sequenceFlow id="${id}_evaluate" sourceRef="${id}" targetRef="${id}_gate"/>`,
      `<sequenceFlow id="${id}_true" sourceRef="${id}_gate" targetRef="${activityId(indexOf(node.next))}">`
        + `<conditionExpression xsi:type="tFormalExpression"><![CDATA[\${dh_gate_${index} == true}]]></conditionExpression></sequenceFlow>`,
      `<sequenceFlow id="${id}_false" sourceRef="${id}_gate" targetRef="${activityId(indexOf(node.otherwise))}"/>`,
    ]
    return [`<sequenceFlow id="${id}_next" sourceRef="${id}" targetRef="${activityId(indexOf(node.next))}"/>`]
  })
  return '<?xml version="1.0" encoding="UTF-8"?>\n'
    + '<definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" '
    + 'xmlns:flowable="http://flowable.org/bpmn" targetNamespace="urn:dh:business-workflow">'
    + `<process id="${key}" name="${escape(draft.name)}" isExecutable="true">${tasks.join('')}${edges.join('')}</process></definitions>`
}
