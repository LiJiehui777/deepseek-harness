/** Stable demo facts, routing evidence, and model instructions. */
import { expect, it } from 'vitest'
import { createDemoTodos } from '../src/host/demo-todos.ts'

it('derives review evidence from the fixed simulated reference date and rejects unknown scenarios', () => {
  const risk = createDemoTodos('risk').result
  expect(risk).toMatchObject({ simulation: true, total: 4, reference_date: '2026-11-03', requires_review: true,
    overdue_ids: ['DEMO-Q01'], missing_evidence_ids: ['DEMO-Q01'] })
  expect(createDemoTodos('routine').result).toMatchObject({ simulation: true, total: 2, requires_review: false,
    overdue_ids: [], missing_evidence_ids: [] })
  expect(() => createDemoTodos('production')).toThrow('DEMO_TODO_SCENARIO_INVALID')
  expect(() => createDemoTodos({ scenario: 'risk' })).toThrow('DEMO_TODO_SCENARIO_INVALID')
})
