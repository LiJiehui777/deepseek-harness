import { describe, expect, it } from 'vitest'
import {
  MAX_STATEMENT_CHARS, acceptReadOnlyStatement, effectiveLimit, limitStatement,
} from '../src/statement.ts'

/** Text of a statement the guard must refuse. */
function refusal(sql: string): string {
  try {
    acceptReadOnlyStatement(sql)
  } catch (error) {
    return error instanceof Error ? error.message : String(error)
  }
  throw new Error(`expected a refusal for: ${sql}`)
}

describe('acceptReadOnlyStatement acceptance', () => {
  it('accepts a plain SELECT and strips the terminator', () => {
    expect(acceptReadOnlyStatement('  SELECT 1;  ').sql).toBe('SELECT 1')
  })

  it('accepts SELECT without a terminator', () => {
    expect(acceptReadOnlyStatement('SELECT 1').sql).toBe('SELECT 1')
  })

  it('accepts WITH ... SELECT', () => {
    const sql = 'WITH x AS (SELECT 1 AS n) SELECT * FROM x'
    expect(acceptReadOnlyStatement(sql).sql).toBe(sql)
  })

  it('accepts a lower-case select', () => {
    expect(acceptReadOnlyStatement('select 1').sql).toBe('select 1')
  })

  it('accepts a statement opening with a comment', () => {
    const sql = '-- leading note\nSELECT 1'
    expect(acceptReadOnlyStatement(sql).sql).toBe(sql)
  })

  it('accepts a statement opening with a block comment', () => {
    const sql = '/* leading note */ SELECT 1'
    expect(acceptReadOnlyStatement(sql).sql).toBe(sql)
  })

  it('accepts a semicolon inside a string literal', () => {
    const sql = "SELECT * FROM t WHERE note = 'a;b'"
    expect(acceptReadOnlyStatement(sql).sql).toBe(sql)
  })

  it('accepts two statements worth of text when the second is inside a literal', () => {
    const sql = "SELECT * FROM t WHERE note = 'drop table t; delete from t'"
    expect(acceptReadOnlyStatement(sql).sql).toBe(sql)
  })

  it('accepts a denied keyword inside a string literal', () => {
    const sql = "SELECT * FROM t WHERE note = 'DROP TABLE users'"
    expect(acceptReadOnlyStatement(sql).sql).toBe(sql)
  })

  it('accepts a denied keyword inside a line comment', () => {
    const sql = 'SELECT 1 -- DROP TABLE x'
    expect(acceptReadOnlyStatement(sql).sql).toBe(sql)
  })

  it('accepts a denied keyword inside a block comment', () => {
    const sql = 'SELECT /* DELETE FROM t; COMMIT */ 1'
    expect(acceptReadOnlyStatement(sql).sql).toBe(sql)
  })

  it('accepts a quoted identifier that resembles a keyword', () => {
    expect(acceptReadOnlyStatement('SELECT "delete" FROM t').sql).toBe('SELECT "delete" FROM t')
    expect(acceptReadOnlyStatement('SELECT * FROM "update"').sql).toBe('SELECT * FROM "update"')
  })

  it('accepts an escaped quote inside a string literal', () => {
    const sql = "SELECT * FROM t WHERE note = 'it''s fine'"
    expect(acceptReadOnlyStatement(sql).sql).toBe(sql)
  })

  it('accepts a doubled quote inside a quoted identifier', () => {
    const sql = 'SELECT "we""ird" FROM t'
    expect(acceptReadOnlyStatement(sql).sql).toBe(sql)
  })

  it('accepts a cast whose type name resembles a denied keyword', () => {
    const sql = 'SELECT now()::date, amount::numeric, 1::int'
    expect(acceptReadOnlyStatement(sql).sql).toBe(sql)
  })

  it('accepts a keyword used as a column or table name suffix', () => {
    // The verb scan matches whole identifiers, so a column named `created` or a
    // table named `insertlog` is not the `create` / `insert` verb.
    const sql = 'SELECT created, deleted_count, setter FROM insert_log WHERE updated_by = 1'
    expect(acceptReadOnlyStatement(sql).sql).toBe(sql)
  })

  it('accepts an ORDER BY that mentions a column called set or lock', () => {
    const sql = 'SELECT a, b FROM t ORDER BY set_value, locked'
    expect(acceptReadOnlyStatement(sql).sql).toBe(sql)
  })

  it('accepts a column named after a denied function without a call', () => {
    const sql = 'SELECT pg_sleep, dblink FROM t'
    expect(acceptReadOnlyStatement(sql).sql).toBe(sql)
  })

  it('accepts a statement at exactly the length cap', () => {
    const head = 'SELECT '
    const sql = `${head}${'a'.repeat(MAX_STATEMENT_CHARS - head.length)}`
    expect(sql.length).toBe(MAX_STATEMENT_CHARS)
    expect(acceptReadOnlyStatement(sql).sql).toBe(sql)
  })
})

describe('acceptReadOnlyStatement refusal of non-reads', () => {
  it.each([
    ['INSERT', 'INSERT INTO t VALUES (1)'],
    ['UPDATE', 'UPDATE t SET a = 1'],
    ['DELETE', 'DELETE FROM t'],
    ['MERGE', 'MERGE INTO t USING s ON t.id = s.id'],
    ['TRUNCATE', 'TRUNCATE t'],
    ['DROP', 'DROP TABLE t'],
    ['CREATE', 'CREATE TABLE t (a int)'],
    ['ALTER', 'ALTER TABLE t ADD COLUMN b int'],
    ['GRANT', 'GRANT ALL ON t TO public'],
    ['REVOKE', 'REVOKE ALL ON t FROM public'],
    ['COPY', 'COPY t FROM STDIN'],
    ['VACUUM', 'VACUUM t'],
    ['ANALYZE', 'ANALYZE t'],
    ['REINDEX', 'REINDEX TABLE t'],
    ['COMMENT', 'COMMENT ON TABLE t IS x'],
    ['SET', 'SET search_path = public'],
    ['RESET', 'RESET ALL'],
    ['BEGIN', 'BEGIN'],
    ['COMMIT', 'COMMIT'],
    ['ROLLBACK', 'ROLLBACK'],
    ['SAVEPOINT', 'SAVEPOINT s'],
    ['LOCK', 'LOCK TABLE t'],
    ['DO', 'DO $$ BEGIN END $$'],
    ['CALL', 'CALL proc()'],
    ['EXECUTE', 'EXECUTE stmt'],
    ['PREPARE', 'PREPARE s AS SELECT 1'],
    ['DECLARE', 'DECLARE c CURSOR FOR SELECT 1'],
    ['DISCARD', 'DISCARD ALL'],
    ['LISTEN', 'LISTEN channel'],
    ['NOTIFY', 'NOTIFY channel'],
    ['REFRESH', 'REFRESH MATERIALIZED VIEW v'],
  ])('rejects %s as the statement verb', (_label, sql) => {
    expect(() => acceptReadOnlyStatement(sql)).toThrow(/Only read-only SELECT/)
  })

  it('rejects a write appended after a SELECT', () => {
    expect(() => acceptReadOnlyStatement('SELECT 1; INSERT INTO t VALUES (1)')).toThrow(/one SELECT statement/)
  })

  it('rejects two statements separated by a semicolon', () => {
    expect(() => acceptReadOnlyStatement('SELECT 1; SELECT 2')).toThrow(/one SELECT statement/)
  })

  it('rejects a second statement after a trailing semicolon and whitespace', () => {
    expect(() => acceptReadOnlyStatement('SELECT 1 ;; SELECT 2')).toThrow(/one SELECT statement/)
  })

  it('rejects an empty statement', () => {
    expect(() => acceptReadOnlyStatement('   ')).toThrow(/empty/)
  })

  it('rejects a bare terminator', () => {
    expect(() => acceptReadOnlyStatement(';')).toThrow(/empty/)
  })

  it('rejects a statement above the length cap', () => {
    const sql = `SELECT '${'a'.repeat(MAX_STATEMENT_CHARS)}'`
    expect(sql.length).toBeGreaterThan(MAX_STATEMENT_CHARS)
    expect(() => acceptReadOnlyStatement(sql)).toThrow(/exceeds/)
  })

  it('rejects a non-string statement', () => {
    const number: unknown = 42
    const nothing: unknown = null
    expect(() => acceptReadOnlyStatement(number as string)).toThrow(/must be a string/)
    expect(() => acceptReadOnlyStatement(nothing as string)).toThrow(/must be a string/)
  })
})

describe('acceptReadOnlyStatement refusal of write-capable reads', () => {
  it('rejects a writable CTE rather than treating WITH as safe', () => {
    expect(() => acceptReadOnlyStatement('WITH x AS (DELETE FROM t RETURNING *) SELECT * FROM x'))
      .toThrow(/refuses the "delete" keyword/)
    expect(() => acceptReadOnlyStatement('WITH x AS (INSERT INTO t VALUES (1) RETURNING *) SELECT * FROM x'))
      .toThrow(/refuses the "insert" keyword/)
    expect(() => acceptReadOnlyStatement('WITH x AS (UPDATE t SET a = 1 RETURNING *) SELECT * FROM x'))
      .toThrow(/refuses the "update" keyword/)
  })

  it.each([
    ['FOR UPDATE', 'SELECT * FROM t FOR UPDATE'],
    ['FOR SHARE', 'SELECT * FROM t FOR SHARE'],
    ['FOR NO KEY UPDATE', 'SELECT * FROM t FOR NO KEY UPDATE'],
    ['FOR KEY SHARE', 'SELECT * FROM t FOR KEY SHARE'],
  ])('rejects the row-locking clause %s', (_label, sql) => {
    expect(() => acceptReadOnlyStatement(sql)).toThrow(/row-locking/)
  })

  it('reports the lock clause rather than the keyword inside it', () => {
    // `FOR UPDATE` would otherwise be reported as the `update` verb, which
    // misleads an operator about what they wrote.
    expect(refusal('SELECT * FROM t FOR UPDATE')).toMatch(/row-locking/)
  })

  it('rejects a lock clause on a joined relation', () => {
    expect(() => acceptReadOnlyStatement('SELECT * FROM a JOIN b ON a.id = b.id FOR UPDATE OF a'))
      .toThrow(/row-locking/)
  })

  it('rejects a lock clause written with extra whitespace and mixed case', () => {
    expect(() => acceptReadOnlyStatement('SELECT * FROM t For   No  Key   Update')).toThrow(/row-locking/)
  })

  it('rejects a denied function call', () => {
    expect(() => acceptReadOnlyStatement("SELECT pg_read_file('/etc/passwd')"))
      .toThrow(/refuses the "pg_read_file" function/)
  })

  it.each([
    'pg_sleep',
    'pg_terminate_backend',
    'pg_cancel_backend',
    'pg_read_binary_file',
    'pg_ls_dir',
    'pg_stat_file',
    'lo_import',
    'lo_export',
    'lo_unlink',
    'dblink',
    'dblink_exec',
    'pg_reload_conf',
    'pg_rotate_logfile',
    'pg_switch_wal',
    'pg_create_restore_point',
    'pg_drop_replication_slot',
    'pg_create_physical_replication_slot',
    'set_config',
    'query_to_xml',
    'xpath_table',
  ])('rejects the side-effecting function %s', (name) => {
    expect(refusal(`SELECT ${name}('x')`)).toContain(`refuses the "${name}" function`)
  })

  it('rejects a denied function called with a schema qualification', () => {
    expect(() => acceptReadOnlyStatement('SELECT pg_catalog.pg_sleep(1)')).toThrow(/refuses the "pg_sleep" function/)
  })

  it('rejects a denied function called with whitespace before the parenthesis', () => {
    expect(() => acceptReadOnlyStatement('SELECT pg_sleep   (1)')).toThrow(/refuses the "pg_sleep" function/)
  })

  it('rejects a denied function inside a CTE body', () => {
    expect(() => acceptReadOnlyStatement('WITH x AS (SELECT pg_sleep(5)) SELECT * FROM x'))
      .toThrow(/refuses the "pg_sleep" function/)
  })

  it('rejects a denied function in mixed case', () => {
    expect(() => acceptReadOnlyStatement('SELECT PG_Sleep(1)')).toThrow(/refuses the "pg_sleep" function/)
  })
})

describe('acceptReadOnlyStatement freedom from bypasses', () => {
  it('does not let an unterminated string literal hide a following statement', () => {
    // An unbalanced quote cannot be used to reach the driver with a second
    // statement: the guard's literal state machine sees the `;` as quoted and
    // the server would reject the resulting text, so nothing is executed as a
    // second statement. The accepted text must still be exactly one statement.
    const accepted = acceptReadOnlyStatement("SELECT 'abc")
    expect(accepted.sql).toBe("SELECT 'abc")
  })

  it('does not treat a newline-terminated line comment as swallowing a semicolon', () => {
    expect(() => acceptReadOnlyStatement('SELECT 1 -- comment\n; DELETE FROM t'))
      .toThrow(/one SELECT statement/)
  })

  it('does not treat an unterminated block comment as swallowing a semicolon', () => {
    // The block comment never closes, so the trailing text is comment body and
    // nothing follows the accepted statement.
    expect(acceptReadOnlyStatement('SELECT 1 /* never closed').sql).toBe('SELECT 1 /* never closed')
  })

  it('does not let a quoted identifier hide the remainder of a real statement verb', () => {
    expect(() => acceptReadOnlyStatement('SELECT "a" FROM t; DROP TABLE t')).toThrow(/one SELECT statement/)
  })

  it('refuses a semicolon outside a literal even when the literal is closed', () => {
    expect(() => acceptReadOnlyStatement("SELECT 'x'; SELECT 1")).toThrow(/one SELECT statement/)
  })

  it('keeps the accepted text byte-identical apart from outer whitespace and one terminator', () => {
    const sql = "SELECT * FROM t WHERE a = 'DROP' -- note"
    expect(acceptReadOnlyStatement(`  ${sql}  ;  `).sql).toBe(sql)
  })
})

describe('effectiveLimit', () => {
  it('uses the configured cap when the caller omits a limit', () => {
    expect(effectiveLimit(undefined, 500)).toBe(500)
  })

  it('caps a larger caller limit at the configured maximum', () => {
    expect(effectiveLimit(9999, 500)).toBe(500)
  })

  it('keeps a smaller caller limit', () => {
    expect(effectiveLimit(10, 500)).toBe(10)
  })

  it('keeps a caller limit equal to the maximum', () => {
    expect(effectiveLimit(500, 500)).toBe(500)
  })

  it('accepts a limit of one', () => {
    expect(effectiveLimit(1, 500)).toBe(1)
  })

  it.each([0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY])('rejects the invalid limit %s', (limit) => {
    expect(() => effectiveLimit(limit, 500)).toThrow(/positive integer/)
  })
})

describe('limitStatement', () => {
  it('wraps the statement instead of concatenating the limit', () => {
    expect(limitStatement('SELECT 1', 10))
      .toBe('SELECT * FROM (SELECT 1) AS connector_bounded_result LIMIT 11')
  })

  it('asks for one row more than the limit so truncation is observable', () => {
    expect(limitStatement('SELECT 1', 1)).toBe('SELECT * FROM (SELECT 1) AS connector_bounded_result LIMIT 2')
  })

  it('keeps a trailing clause inside the wrapped body', () => {
    expect(limitStatement('SELECT * FROM t ORDER BY a', 5))
      .toBe('SELECT * FROM (SELECT * FROM t ORDER BY a) AS connector_bounded_result LIMIT 6')
  })

  it('cannot be escaped by a comment at the end of the body', () => {
    // Concatenating would let `-- ` swallow the LIMIT; wrapping keeps the
    // injected clause outside the caller's text.
    const wrapped = limitStatement('SELECT 1 -- trailing', 5)
    expect(wrapped).toBe('SELECT * FROM (SELECT 1 -- trailing) AS connector_bounded_result LIMIT 6')
  })

  it('closes the subquery before the limit for a body with a semicolon-free multi-line statement', () => {
    const wrapped = limitStatement('WITH x AS (SELECT 1 AS n)\nSELECT * FROM x', 2)
    expect(wrapped.startsWith('SELECT * FROM (')).toBe(true)
    expect(wrapped.endsWith(') AS connector_bounded_result LIMIT 3')).toBe(true)
  })
})
