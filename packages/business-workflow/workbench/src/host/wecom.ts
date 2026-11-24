/** Normalize the official WeCom CLI page into the saved workflow action's result. */
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-wecom'
import { object } from './flowable.ts'

const query = { page_size: 10, status_filter: ['proceed'] } as const
const maximumResultBytes = 64 * 1024
const fields = ['todo_id', 'title', 'description', 'status', 'user_status', 'success'] as const

function pick(row: Record<string, unknown>, keys: readonly string[]) {
  return Object.fromEntries(keys.flatMap((key) => {
    const value = row[key]
    return typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean' ? [[key, value]] : []
  }))
}

/**
 * Run the official connector's one-page pending-todo read.
 * @param ctx - workflow Host with the optional official WeCom plugin.
 * @param signal - current job lifetime.
 * @returns the existing action's bounded reference data and pagination fields.
 */
export async function readWecomTodos(ctx: Context, signal: AbortSignal) {
  const read = ctx.get('wecomPendingTodos')
  if (!read) throw new Error('WECOM_TODOS_UNAVAILABLE')
  const output = await read(query.page_size, signal)
  signal.throwIfAborted()
  try {
    const decoded: unknown = JSON.parse(output)
    const page = object(decoded)
    if ((page.errcode !== undefined && page.errcode !== 0) || page.error || !Array.isArray(page.items)) {
      throw new Error('WECOM_TODOS_INVALID_RESULT')
    }
    const rows = page.items as unknown[]
    const items = rows.slice(0, query.page_size).map((value) => {
      const row = object(value)
      if (typeof row.todo_id !== 'string' || row.todo_id === '') throw new Error('WECOM_TODOS_INVALID_RESULT')
      const deadline = row.deadline
      return { ...pick(row, fields), ...(deadline ? { deadline: pick(object(deadline), ['type', 'value']) } : {}) }
    })
    const result = { items, has_more: page.has_more === true, next_cursor: typeof page.next_cursor === 'string' ? page.next_cursor.slice(0, 1024) : '',
      truncated: rows.length > query.page_size, reference_only: true }
    while (Buffer.byteLength(JSON.stringify(result)) > maximumResultBytes) {
      result.items.pop()
      result.truncated = true
    }
    return { query, result }
  } catch {
    throw new Error('WECOM_TODOS_INVALID_RESULT')
  }
}
