// @vitest-environment jsdom
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { QualityReportCard } from '../src/client/QualityReportCard.tsx'
import { zh } from '../src/client/locales.ts'
import type { ToolCallViewProps } from '@deepseek-ai/dsh-client-ui-tool/client'
afterEach(cleanup)
const report = { title: 'Scratch investigation', evidence: [{ id: 'E1', document_name: 'Procedure', chunk_id: 'c1', summary: 'Inspect packaging' }], hypotheses: [{ statement: 'Packaging may contribute', verification: 'Controlled comparison' }] }
function props(meta: unknown, isError = false) {
  return { block: { kind: 'result', callId: 'r1', content: [], meta, isError }, t: (key: string) => zh[key as keyof typeof zh] ?? key, inspect: vi.fn() } as unknown as ToolCallViewProps & { t: (key: string) => string }
}
it('replays evidence claims and hypotheses without claiming source verification', () => {
  render(<QualityReportCard {...props({ schema_version: 1, review_status: 'draft', structure_valid: true, issues: [], report_json: JSON.stringify(report) })} />)
  expect(screen.getByText(zh.passed)).toBeTruthy()
  expect(screen.getByText(zh.scope)).toBeTruthy()
  expect(screen.getByText('E1 \xb7 Procedure')).toBeTruthy()
  expect(screen.getByText('Controlled comparison')).toBeTruthy()
})
it.each([undefined, { schema_version: 99 }, { schema_version: 1, review_status: 'draft', structure_valid: true, issues: [], report_json: '{broken' }])('keeps inspection for malformed or unsupported persisted metadata', (meta) => {
  const data = props(meta)
  render(<QualityReportCard {...data} />)
  expect(screen.getByText(zh.fallback)).toBeTruthy()
  fireEvent.click(screen.getByText(zh.inspect))
  expect(data.inspect).toHaveBeenCalledOnce()
})

it('renders the recorded native review result from Session history', () => {
  const events = readFileSync(resolve('snapshots/session/quality-report-review/session.v3.jsonl'), 'utf8').trim().split('\n').map(line => JSON.parse(line))
  const event = events.find(item => item.type === 'tool/result')
  const meta = event.data.meta
  render(<QualityReportCard {...props(meta)} />)
  expect(screen.getByText('Synthetic quality draft')).toBeTruthy()
  expect(screen.getByText(zh.passed)).toBeTruthy()
})

it('shows pending, failure and outstanding gaps with optional inspection', () => {
  const input = props(undefined)
  render(<QualityReportCard {...input} block={{} as never} inspect={undefined} />)
  expect(screen.getByText(zh.pending)).toBeTruthy()
  expect(screen.queryByRole('button')).toBeNull()
  cleanup()
  render(<QualityReportCard {...props(undefined, true)} />)
  expect(screen.getByText(zh.fallback)).toBeTruthy()
  cleanup()
  render(<QualityReportCard {...props({ schema_version: 1, review_status: 'draft', structure_valid: false, issues: ['missing_title', 'future_issue'], report_json: JSON.stringify(report) })} />)
  expect(screen.getByText(zh.gaps)).toBeTruthy()
  expect(screen.getByText(zh.unknownIssue)).toBeTruthy()
  expect(screen.getByText(zh.missing_title)).toBeTruthy()
})
it.each([
  [], { schema_version: 1, review_status: 'approved' },
  { schema_version: 1, review_status: 'draft', structure_valid: 'yes' },
  { schema_version: 1, review_status: 'draft', structure_valid: true, report_json: 1 },
  { schema_version: 1, review_status: 'draft', structure_valid: true, report_json: 'x'.repeat(262145) },
  { schema_version: 1, review_status: 'draft', structure_valid: true, report_json: '{}', issues: 1 },
  { schema_version: 1, review_status: 'draft', structure_valid: true, report_json: '{}', issues: [1] },
  ...[null, { title: 1 }, { title: 'x', evidence: [] }, { ...report, evidence: [null] }, { ...report, evidence: [{ ...report.evidence[0], id: 1 }] }, { ...report, hypotheses: [null] }, { ...report, hypotheses: [{ statement: 'x', verification: 1 }] }].map(value => ({ schema_version: 1, review_status: 'draft', structure_valid: true, issues: [], report_json: JSON.stringify(value) })),
])('keeps unsupported wire shapes inspectable', (meta) => {
  render(<QualityReportCard {...props(meta)} />)
  expect(screen.getByText(zh.fallback)).toBeTruthy()
})
