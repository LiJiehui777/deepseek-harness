/**
 * Read-only statement acceptance for the PostgreSQL connector.
 *
 * The connector is a data source, not an SQL console: it accepts a single
 * `SELECT` (optionally with leading `WITH`) and refuses everything else. The
 * guard runs on the parsed statement text before it reaches the driver, so a
 * caller cannot reach `INSERT`, `UPDATE`, `DELETE`, DDL, `COPY`, transaction
 * control, or a second statement by appending it.
 *
 * @module connector-postgres/statement
 */

/** Maximum statement length accepted from a caller, in characters. */
export const MAX_STATEMENT_CHARS = 20_000

/** Keywords that may open an accepted statement. */
const ALLOWED_OPENERS = ['select', 'with'] as const

/** Keywords that must never appear as a top-level statement verb. */
const DENIED_VERBS = [
  'insert', 'update', 'delete', 'merge', 'truncate', 'drop', 'create', 'alter',
  'grant', 'revoke', 'copy', 'vacuum', 'analyze', 'cluster', 'reindex',
  'comment', 'security', 'refresh', 'listen', 'notify', 'set', 'reset',
  'begin', 'commit', 'rollback', 'savepoint', 'lock', 'do', 'call', 'execute',
  'prepare', 'deallocate', 'declare', 'discard', 'load', 'import',
] as const

/** Functions with side effects or server-wide reach that a read must not call. */
const DENIED_FUNCTIONS = [
  'pg_sleep', 'pg_terminate_backend', 'pg_cancel_backend',
  'pg_read_file', 'pg_read_binary_file', 'pg_ls_dir', 'pg_stat_file',
  'lo_import', 'lo_export', 'lo_unlink', 'dblink', 'dblink_exec',
  'pg_reload_conf', 'pg_rotate_logfile', 'pg_switch_wal', 'pg_create_restore_point',
  'pg_drop_replication_slot', 'pg_create_physical_replication_slot',
  'set_config', 'query_to_xml', 'xpath_table',
] as const

/** A statement accepted for execution. */
export interface AcceptedStatement {
  /** Statement text with surrounding whitespace and a trailing semicolon removed. */
  sql: string
}

/**
 * Remove a single trailing semicolon and surrounding whitespace; reject anything
 * that still contains `;` outside a string or comment.
 * @param sql - raw caller statement.
 * @returns the trimmed statement text.
 * @throws Error when the text holds more than one statement.
 */
function stripTerminator(sql: string): string {
  const trimmed = sql.trim().replace(/;\s*$/, '').trim()
  if (trimmed === '') throw new Error('SQL statement is empty.')
  if (hasUnquotedSemicolon(trimmed)) {
    throw new Error('Only one SELECT statement may be executed per call; remove the extra statements.')
  }
  return trimmed
}

/**
 * Detect a semicolon that is not inside a string literal, quoted identifier, or
 * comment.
 * @param sql - statement text without the trailing terminator.
 * @returns whether a statement-separating semicolon remains.
 */
function hasUnquotedSemicolon(sql: string): boolean {
  let inSingle = false
  let inDouble = false
  let inLineComment = false
  let inBlockComment = false
  for (let index = 0; index < sql.length; index += 1) {
    const char = sql[index]
    const next = sql[index + 1]
    if (inLineComment) {
      if (char === '\n') inLineComment = false
      continue
    }
    if (inBlockComment) {
      if (char === '*' && next === '/') {
        inBlockComment = false
        index += 1
      }
      continue
    }
    if (inSingle) {
      if (char === "'" && next === "'") {
        index += 1
      } else if (char === "'") {
        inSingle = false
      }
      continue
    }
    if (inDouble) {
      if (char === '"' && next === '"') {
        index += 1
      } else if (char === '"') {
        inDouble = false
      }
      continue
    }
    if (char === '-' && next === '-') {
      inLineComment = true
      index += 1
      continue
    }
    if (char === '/' && next === '*') {
      inBlockComment = true
      index += 1
      continue
    }
    if (char === "'") {
      inSingle = true
      continue
    }
    if (char === '"') {
      inDouble = true
      continue
    }
    if (char === ';') return true
  }
  return false
}

/**
 * Replace string literals, quoted identifiers and comments with spaces so keyword
 * and function scans cannot match user data.
 * @param sql - statement text.
 * @returns the statement with those regions blanked, preserving length.
 */
function blankLiteralsAndComments(sql: string): string {
  let output = ''
  let inSingle = false
  let inDouble = false
  let inLineComment = false
  let inBlockComment = false
  for (let index = 0; index < sql.length; index += 1) {
    // The loop bound is the string length, so this index always addresses a character.
    const char = sql.charAt(index)
    const next = sql[index + 1]
    if (inLineComment) {
      output += char === '\n' ? '\n' : ' '
      if (char === '\n') inLineComment = false
      continue
    }
    if (inBlockComment) {
      if (char === '*' && next === '/') {
        output += '  '
        inBlockComment = false
        index += 1
      } else {
        output += char === '\n' ? '\n' : ' '
      }
      continue
    }
    if (inSingle) {
      if (char === "'" && next === "'") {
        output += '  '
        index += 1
      } else {
        output += ' '
        if (char === "'") inSingle = false
      }
      continue
    }
    if (inDouble) {
      if (char === '"' && next === '"') {
        output += '  '
        index += 1
      } else {
        output += ' '
        if (char === '"') inDouble = false
      }
      continue
    }
    if (char === '-' && next === '-') {
      output += '  '
      inLineComment = true
      index += 1
      continue
    }
    if (char === '/' && next === '*') {
      output += '  '
      inBlockComment = true
      index += 1
      continue
    }
    if (char === "'") {
      output += ' '
      inSingle = true
      continue
    }
    if (char === '"') {
      output += ' '
      inDouble = true
      continue
    }
    output += char
  }
  return output
}

/**
 * Accept exactly one read-only statement.
 *
 * A statement qualifies when it starts with `SELECT` or `WITH` and the blanked
 * body contains none of the denied verbs or functions. `WITH ... SELECT` is
 * accepted; a writable CTE (`WITH x AS (INSERT ...)`) is refused because the
 * denied verb scan sees the `INSERT`.
 *
 * @param sql - statement text supplied by the caller.
 * @returns the statement prepared for execution.
 * @throws Error when the text is empty, too long, multi-statement, not a read, or
 * calls a denied function.
 */
export function acceptReadOnlyStatement(sql: string): AcceptedStatement {
  if (typeof sql !== 'string') throw new Error('SQL statement must be a string.')
  if (sql.length > MAX_STATEMENT_CHARS) {
    throw new Error(`SQL statement exceeds ${MAX_STATEMENT_CHARS} characters.`)
  }
  const statement = stripTerminator(sql)
  const blanked = blankLiteralsAndComments(statement).toLowerCase()

  const opener = /^\s*([a-z]+)/.exec(blanked)?.[1]
  if (!opener || !(ALLOWED_OPENERS as readonly string[]).includes(opener)) {
    throw new Error('Only read-only SELECT statements are allowed.')
  }

  // Checked before the verb scan so `FOR UPDATE` reports the lock clause it is
  // actually rejected for, rather than the `update` keyword inside it.
  if (/\bfor\s+(update|share|no\s+key\s+update|key\s+share)\b/.test(blanked)) {
    throw new Error('Read-only connector refuses row-locking clauses.')
  }

  for (const verb of DENIED_VERBS) {
    if (new RegExp(`(^|[^a-z0-9_])${verb}([^a-z0-9_]|$)`).test(blanked)) {
      throw new Error(`Read-only connector refuses the "${verb}" keyword.`)
    }
  }

  for (const name of DENIED_FUNCTIONS) {
    if (new RegExp(`(^|[^a-z0-9_])${name}\\s*\\(`).test(blanked)) {
      throw new Error(`Read-only connector refuses the "${name}" function.`)
    }
  }

  return { sql: statement }
}

/**
 * Apply the caller's requested limit, capped by the configured maximum.
 * @param requested - caller limit, or undefined to use the configured cap.
 * @param maxRows - configured hard upper bound.
 * @returns the effective positive integer limit.
 * @throws Error when the requested limit is not a positive integer.
 */
export function effectiveLimit(requested: number | undefined, maxRows: number): number {
  if (requested === undefined) return maxRows
  if (!Number.isSafeInteger(requested) || requested < 1) {
    throw new Error('limit must be a positive integer.')
  }
  return Math.min(requested, maxRows)
}

/**
 * Fetch one row more than the limit so truncation is observable, using a dialect
 * that cannot be broken out of: the statement is wrapped, not concatenated.
 * @param sql - accepted single SELECT statement.
 * @param limit - effective row limit.
 * @returns the wrapped statement returning at most `limit + 1` rows.
 */
export function limitStatement(sql: string, limit: number): string {
  return `SELECT * FROM (${sql}) AS connector_bounded_result LIMIT ${limit + 1}`
}
