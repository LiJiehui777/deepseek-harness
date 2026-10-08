/** Structural checks for quality-analysis drafts; source claims remain unverified.
 * @module @deepseek-ai/dsh-tool-quality-report
 */
import type { Context } from '@deepseek-ai/cordis'
import Schema from '@deepseek-ai/schemastery'
import { defineTool } from '@deepseek-ai/dsh-tools'

/** Deployment bounds on the complete result and all report collections. */
export interface Config {
  /** Maximum UTF-8 bytes in the complete canonical review result. */
  maxReportBytes: number
  /** Maximum combined report items, including hypothesis evidence references. */
  maxItems: number
}
/** Required deployment limits; no plugin-defined deployment defaults. */
export const Config = Schema.object({
  maxReportBytes: Schema.natural().min(1).required(),
  maxItems: Schema.natural().min(1).required(),
})
/** Loader identity. */
export const name = 'tool-quality-report'
/** Agent-scoped tool registry. */
export const inject = ['tools']

/**
 * Register a draft review without accessing files, networks, or credentials.
 * @param ctx - agent composition context.
 * @param config - complete-result and collection limits.
 */
export function apply(ctx: Context, config: Config): void {
  ctx.tools.register(defineTool({
    name: 'quality_report_review',
    description: 'Check a quality-analysis draft for missing facts, evidence references, hypothesis verification plans and action owners. This checks structure only: it does not verify sources, establish a root cause, approve a report or close a case. Supply source identifiers actually returned by retrieval; keep causes as hypotheses until verified.',
    parameters: {
      report: {
        type: 'object', required: true, additionalProperties: false,
        properties: {
          title: { type: 'string', required: true },
          facts: { type: 'array', required: true, items: { type: 'string' } },
          evidence: { type: 'array', required: true, items: {
            type: 'object', additionalProperties: false, properties: {
              id: { type: 'string', required: true },
              document_name: { type: 'string', required: true },
              chunk_id: { type: 'string', required: true },
              summary: { type: 'string', required: true },
            },
          } },
          hypotheses: { type: 'array', required: true, items: {
            type: 'object', additionalProperties: false, properties: {
              statement: { type: 'string', required: true },
              evidence_ids: { type: 'array', required: true, items: { type: 'string' } },
              verification: { type: 'string', required: true },
            },
          } },
          actions: { type: 'array', required: true, items: {
            type: 'object', additionalProperties: false, properties: {
              action: { type: 'string', required: true },
              owner: { type: 'string', required: true },
              acceptance_criteria: { type: 'string', required: true },
            },
          } },
          questions: { type: 'array', required: true, items: { type: 'string' } },
        },
      },
    },
    output: {
      schema: { type: 'object', additionalProperties: false, properties: {
        schema_version: { type: 'number', required: true },
        structure_valid: { type: 'boolean', required: true },
        review_status: { type: 'string', required: true },
        report_json: { type: 'string', required: true },
        issues: { type: 'array', required: true, items: { type: 'string' } },
      } },
      render: (_args, value) => [{ type: 'text', text: JSON.stringify(value) }],
      presentationMeta: (_args, value) => value,
    },
    async execute({ report }) {
      const count = report.facts.length + report.evidence.length + report.hypotheses.length
        + report.actions.length + report.questions.length
        + report.hypotheses.reduce((sum, hypothesis) => sum + hypothesis.evidence_ids.length, 0)
      if (count > config.maxItems) throw new Error('Report exceeds the configured item limit.')
      const reportJson = JSON.stringify(report)
      if (Buffer.byteLength(reportJson) > config.maxReportBytes) throw new Error('Report exceeds the configured byte limit.')
      const issues: string[] = []
      if (!report.title.trim()) issues.push('missing_title')
      if (!report.facts.length || report.facts.some(fact => !fact.trim())) issues.push('missing_facts')
      if (!report.evidence.length) issues.push('missing_evidence')
      const ids = new Set<string>()
      for (const evidence of report.evidence) {
        if (!evidence.id.trim() || ids.has(evidence.id)) issues.push('invalid_evidence_id')
        ids.add(evidence.id)
        if (![evidence.document_name, evidence.chunk_id, evidence.summary].every(value => value.trim())) issues.push('incomplete_evidence')
      }
      if (!report.hypotheses.length) issues.push('missing_hypotheses')
      for (const hypothesis of report.hypotheses) {
        if (!hypothesis.statement.trim() || !hypothesis.verification.trim()) issues.push('incomplete_hypothesis')
        if (!hypothesis.evidence_ids.length || hypothesis.evidence_ids.some(id => !ids.has(id))) issues.push('unresolved_evidence_reference')
      }
      if (!report.actions.length || report.actions.some(action => ![action.action, action.owner, action.acceptance_criteria].every(value => value.trim()))) issues.push('incomplete_actions')
      const result = {
        schema_version: 1, structure_valid: issues.length === 0,
        review_status: 'draft', report_json: reportJson, issues: [...new Set(issues)],
      }
      if (Buffer.byteLength(JSON.stringify(result)) > config.maxReportBytes) throw new Error('Complete review result exceeds the configured byte limit.')
      return result
    },
  }))
}
