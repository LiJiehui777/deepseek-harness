/** A review card derived exclusively from persisted tool-result metadata. */
import type { ToolCallViewProps } from '@deepseek-ai/dsh-client-ui-tool/client'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import css from './QualityReportCard.module.css'

const issueLabels = new Set([
  'missing_title',
  'missing_facts',
  'missing_evidence',
  'invalid_evidence_id',
  'incomplete_evidence',
  'missing_hypotheses',
  'incomplete_hypothesis',
  'unresolved_evidence_reference',
  'incomplete_actions',
])

type Props = ToolCallViewProps & PropsLocale<'qualityReport'>
interface Review {
  title: string
  valid: boolean
  issues: string[]
  evidence: { id: string; document_name: string; chunk_id: string; summary: string }[]
  hypotheses: { statement: string; verification: string }[]
}
function object(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : undefined
}
function reviewModel(meta: unknown): Review | undefined {
  const value = object(meta)
  if (!value || value.schema_version !== 1 || value.review_status !== 'draft' || typeof value.structure_valid !== 'boolean'
    || typeof value.report_json !== 'string' || value.report_json.length > 262144
    || !Array.isArray(value.issues) || !value.issues.every(issue => typeof issue === 'string')) return undefined
  try {
    const report = object(JSON.parse(value.report_json))
    if (!report || typeof report.title !== 'string' || !Array.isArray(report.evidence) || !Array.isArray(report.hypotheses)) return undefined
    const evidence = report.evidence.map(object)
    const hypotheses = report.hypotheses.map(object)
    if (!evidence.every(item => item && ['id', 'document_name', 'chunk_id', 'summary'].every(key => typeof item[key] === 'string'))
      || !hypotheses.every(item => item && ['statement', 'verification'].every(key => typeof item[key] === 'string'))) return undefined
    return { title: report.title, valid: value.structure_valid, issues: value.issues,
      evidence: evidence as Review['evidence'], hypotheses: hypotheses as Review['hypotheses'] }
  } catch {
    // Partial or unsupported durable metadata retains the inspection fallback.
    return undefined
  }
}
/**
 * Present declared sources and outstanding gaps without consulting live data.
 * @param props - durable tool slice and localized copy.
 * @returns a review card with inspection fallback for unsupported metadata.
 */
export function QualityReportCard({ block, t, inspect }: Props) {
  const settled = 'kind' in block
  const review = settled && !block.isError ? reviewModel(block.meta) : undefined
  return <section className={css.card} aria-label={t('title')}>
    <strong>{t('title')}</strong>
    <p>{review ? t(review.valid ? 'passed' : 'gaps') : t(settled ? 'fallback' : 'pending')}</p>
    {review && <>
      <h4>{review.title}</h4>
      <p className={css.note}>{t('scope')}</p>
      {review.issues.length > 0 && <details open><summary>{t('issues')}</summary><ul>{review.issues.map(issue => <li key={issue}>{t(issueLabels.has(issue) ? issue as Parameters<typeof t>[0] : 'unknownIssue')}</li>)}</ul></details>}
      <details><summary>{t('evidence')} ({review.evidence.length})</summary>{review.evidence.map((item, index) => <article key={index}>
        <strong>{item.id} · {item.document_name}</strong><p>{t('source')}: {item.chunk_id}</p><p>{item.summary}</p>
      </article>)}</details>
      <details><summary>{t('hypotheses')} ({review.hypotheses.length})</summary>{review.hypotheses.map((item, index) => <article key={index}>
        <strong>{item.statement}</strong><p>{item.verification}</p>
      </article>)}</details>
    </>}
    {inspect && <button type="button" onClick={inspect}>{t('inspect')}</button>}
  </section>
}
