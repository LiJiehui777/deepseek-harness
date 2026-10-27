/** Fixed read-only WeCom operation mappings and bounded reference-data projections. */
import { z } from 'zod'
import type { WecomOfficeCapability } from '../types.ts'
import { OfficeError, readOfficeFile } from './runtime.ts'

/** Adapter-owned operations; no caller can choose an arbitrary CLI command. */
export type OfficeOperation = 'search_documents' | 'read_document' | 'search_files' | 'get_file_info'
  | 'list_calendar' | 'get_calendar_item' | 'list_todos' | 'get_todo'
/** Fixed category ownership for both settings checks and tool execution. */
export const OFFICE_CAPABILITIES = ['documents', 'files', 'calendar', 'todos'] as const
/** Each fixed method inspected by the settings connection check. */
export const OFFICE_METHODS: Record<WecomOfficeCapability, readonly string[]> = {
  documents: ['doc.search', 'doc.contents.get', 'smartpage.pages.get'],
  files: ['disk.files.search', 'disk.files.get'],
  calendar: ['calendar.schedules.list', 'calendar.schedules.get'],
  todos: ['todo.list', 'todo.get'],
}
/** Ownership of every exposed read operation. */
export const OFFICE_OPERATIONS: Record<OfficeOperation, WecomOfficeCapability> = {
  search_documents: 'documents', read_document: 'documents', search_files: 'files', get_file_info: 'files',
  list_calendar: 'calendar', get_calendar_item: 'calendar', list_todos: 'todos', get_todo: 'todos',
}
const id = z.string().regex(/^[a-zA-Z0-9_@.:-]{1,256}$/)
const cursor = z.string().max(4096).optional()
const keywords = z.array(z.string().trim().min(1).max(256)).min(1).max(10)
const date = z.string().regex(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/)

/**
 * Validate a document/file link without accepting credential URLs or external origins.
 * @param value - untrusted resource reference.
 * @returns the official HTTPS URL.
 */
export function officeURL(value: string): string {
  let url: URL
  try { url = new URL(value) } catch { throw new OfficeError('invalid-result') }
  if (url.protocol !== 'https:' || url.username || url.password
    || !['doc.weixin.qq.com', 'page.weixin.qq.com', 'drive.weixin.qq.com'].includes(url.hostname)) throw new OfficeError('invalid-result')
  return url.href
}

/**
 * Validate model arguments and resolve their one allowed CLI operation.
 * @param operation - fixed native tool operation.
 * @param input - model-provided JSON arguments.
 * @param maximum - deployment page bound, capped by the provider's twenty-item methods.
 * @returns an adapter-owned command and validated JSON payload.
 */
export function officeRequest(operation: OfficeOperation, input: unknown, maximum: number):
{ command: string[]; payload: Record<string, unknown> } {
  const page_size = z.number().int().min(1).max(Math.min(20, maximum)).default(Math.min(10, maximum))
  const pagination = { page_size, cursor }
  if (operation === 'search_documents' || operation === 'search_files') {
    const args = z.object({ keywords, ...pagination }).strict().parse(input)
    return { command: operation === 'search_documents' ? ['doc', 'search'] : ['disk', 'files', 'search'],
      payload: { keywords: args.keywords, limit: args.page_size, ...(args.cursor === undefined ? {} : { cursor: args.cursor }) } }
  }
  if (operation === 'read_document') {
    const args = z.object({ resource: z.string().min(1).max(2048), document_type: z.enum(['doc', 'smartpage']), page_id: id.optional() }).strict().parse(input)
    const payload: Record<string, unknown> = { content_type: 'markdown' }
    if (args.resource.startsWith('https://')) {
      const url = new URL(officeURL(args.resource))
      if (args.document_type === 'smartpage') {
        if (!url.pathname.startsWith('/smartpage/')) throw new OfficeError('invalid-result')
        payload.url = url.href
      } else {
        if (url.hostname !== 'doc.weixin.qq.com' || !url.pathname.startsWith('/doc/')) throw new OfficeError('invalid-result')
        payload.docid = id.parse(url.pathname.split('/')[2])
      }
    } else payload.docid = id.parse(args.resource)
    if (args.page_id) {
      if (args.document_type !== 'smartpage') throw new OfficeError('invalid-result')
      payload.page_id = args.page_id
    }
    return { command: args.document_type === 'doc' ? ['doc', 'contents', 'get'] : ['smartpage', 'pages', 'get'], payload }
  }
  if (operation === 'get_file_info') {
    const args = z.object({ resource: z.string().min(1).max(2048) }).strict().parse(input)
    return { command: ['disk', 'files', 'get'], payload: args.resource.startsWith('https://')
      ? { url: officeURL(args.resource) } : { file_id: id.parse(args.resource) } }
  }
  if (operation === 'list_calendar') {
    const args = z.object({ begin_time: date, end_time: date }).strict().parse(input)
    if (args.begin_time >= args.end_time) throw new OfficeError('invalid-result')
    return { command: ['calendar', 'schedules', 'list'], payload: args }
  }
  if (operation === 'get_calendar_item') {
    const args = z.object({ schedule_id: id }).strict().parse(input)
    return { command: ['calendar', 'schedules', 'get'], payload: { schedule_ids: [args.schedule_id] } }
  }
  if (operation === 'list_todos') {
    const status_filter = z.array(z.enum(['proceed', 'finished'])).min(1).max(2).optional()
    const args = z.object({ ...pagination, keywords: keywords.optional(), status_filter,
      create_begin_time: date.optional(), create_end_time: date.optional(),
      deadline_begin_time: date.optional(), deadline_end_time: date.optional() }).strict().parse(input)
    for (const [begin, end] of [[args.create_begin_time, args.create_end_time], [args.deadline_begin_time, args.deadline_end_time]]) {
      if ((begin === undefined) !== (end === undefined) || (begin && end && begin >= end)) throw new OfficeError('invalid-result')
    }
    const { page_size, ...payload } = args
    return { command: ['todo', 'list'], payload: { ...payload, limit: page_size } }
  }
  const args = z.object({ todo_id: id }).strict().parse(input)
  return { command: ['todo', 'get'], payload: { items: [{ todo_id: args.todo_id }] } }
}

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new OfficeError('invalid-result')
  return value as Record<string, unknown>
}
function rows(value: unknown): Record<string, unknown>[] {
  if (!Array.isArray(value)) throw new OfficeError('invalid-result')
  return value.map(record)
}
function pick(value: Record<string, unknown>, fields: readonly string[]): Record<string, unknown> {
  return Object.fromEntries(fields.filter(field => typeof value[field] === 'string' || typeof value[field] === 'number' || typeof value[field] === 'boolean')
    .map(field => [field, value[field]]))
}
function link(value: unknown): string | undefined { return typeof value === 'string' && value ? officeURL(value) : undefined }

/**
 * Project provider data without credentials, local file paths, or unknown fields.
 * @param operation - fixed native read operation.
 * @param data - decoded official CLI result.
 * @param directory - output directory owned by this one invocation.
 * @param maximumText - per-document text bound.
 * @param maximumItems - deployment record bound.
 * @returns JSON-compatible reference data with explicit pagination/truncation facts.
 */
export async function officeProjection(operation: OfficeOperation, data: Record<string, unknown>, directory: string,
  maximumText: number, maximumItems: number): Promise<Record<string, unknown>> {
  if (operation === 'read_document') {
    const text = async (row: Record<string, unknown>, inline: string) => {
      if (typeof row.file_path === 'string') return readOfficeFile(row.file_path, directory, maximumText)
      const content = typeof row[inline] === 'string' ? row[inline] : ''
      const bytes = Buffer.from(content)
      return { text: new TextDecoder().decode(bytes.subarray(0, maximumText), { stream: bytes.length > maximumText }),
        truncated: bytes.length > maximumText }
    }
    if (Array.isArray(data.pages)) {
      const pages = rows(data.pages)
      return { ...pick(data, ['doc_title']), pages: await Promise.all(pages.slice(0, maximumItems).map(async row => ({
        ...pick(row, ['page_title', 'page_id', 'parent_id']), ...await text(row, 'content_file_inner'),
      }))), truncated: pages.length > maximumItems, reference_only: true }
    }
    if (typeof data.content !== 'string' && typeof data.file_path !== 'string') throw new OfficeError('invalid-result')
    return { ...pick(data, ['name', 'version']), source_url: link(data.url), ...await text(data, 'content'), reference_only: true }
  }
  const field = operation === 'search_documents' ? 'docs' : operation === 'search_files' ? 'files'
    : operation === 'get_file_info' ? 'file' : operation === 'list_calendar' || operation === 'get_calendar_item' ? 'schedule_list' : 'items'
  const input = field === 'file' ? [record(data.file)] : rows(data[field])
  const items = input.slice(0, maximumItems).map((row) => {
    if (operation === 'search_documents') return { ...pick(row, ['docid', 'doc_name', 'doc_type', 'modify_time']), source_url: link(row.url) }
    if (operation === 'search_files' || operation === 'get_file_info') return {
      ...pick(row, ['id', 'file_name', 'type', 'file_size', 'docid', 'space_name', 'folder_name', 'path', 'update_time']), source_url: link(row.doc_url),
    }
    if (operation === 'list_calendar' || operation === 'get_calendar_item') return {
      ...pick(row, ['schedule_id', 'subject', 'begin_time', 'end_time', 'location', 'description', 'creator_name', 'is_all_day']),
      attendees: row.attendees === undefined ? [] : rows(row.attendees).map(person => pick(person, ['name'])),
    }
    return { ...pick(row, ['todo_id', 'title', 'description', 'status', 'user_status', 'success']),
      ...(row.deadline && typeof row.deadline === 'object' ? { deadline: pick(record(row.deadline), ['type', 'value']) } : {}) }
  })
  return { items, has_more: data.has_more === true, next_cursor: typeof data.next_cursor === 'string' ? data.next_cursor : '',
    truncated: input.length > maximumItems, reference_only: true }
}
