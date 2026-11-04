/** Durable draft catalog; publications pin exact engine definitions. */
import { z } from 'zod'
import type { DomainSpec } from '@deepseek-ai/dsh-storage-domain'
import { parseDraft } from '../shared/draft.ts'
import type { WorkflowInputField } from '../shared/types.ts'

const draftJson = z.string().max(131072).refine((value) => { try { parseDraft(value); return true } catch { return false } }, 'Invalid workflow draft')
const publication = z.object({ version: z.number().int().positive(), definitionId: z.string().min(1),
  draftJson, publishedAt: z.string() }).strict()
const template = z.object({ id: z.string().min(1).max(128), tenantId: z.string(), revision: z.number().int().positive(),
  lastVersion: z.number().int().nonnegative(),
  draftJson, updatedAt: z.string(), published: publication.nullable() }).strict().refine(value =>
  parseDraft(value.draftJson).id === value.id
  && (!value.published || (parseDraft(value.published.draftJson).id === value.id
    && value.published.version <= value.lastVersion)),
'Invalid workflow identity or publication version')
const choice = z.object({ id: z.string().min(1).max(128), version: z.number().int().positive(), name: z.string().max(256) }).strict()
const binding = z.object({ sessionId: z.string().min(1).max(256), tenantId: z.string(), revision: z.number().int().positive(),
  selection: choice.nullable() }).strict()
/** Durable schemas reject corrupted authoritative records on open. */
export const catalogSpec = { name: 'business_workflows', version: 1,
  tables: { templates: { valueSchema: template }, bindings: { valueSchema: binding } },
} satisfies DomainSpec

/** Validate a closed set of configured scalar inputs at the acceptance operation.
 * @param fields - fields from the pinned publication.
 * @param value - untrusted model or UI arguments.
 * @returns the same accepted JSON object.
 */
export function validateInputs(fields: WorkflowInputField[], value: unknown): Record<string, unknown> {
  const properties = Object.fromEntries(fields.map((field) => {
    const scalar = field.type === 'string' ? z.string().max(4096) : field.type === 'number' ? z.number() : z.boolean()
    return [field.name, field.required ? scalar : scalar.optional()]
  }))
  return z.object(properties).strict().parse(value)
}
