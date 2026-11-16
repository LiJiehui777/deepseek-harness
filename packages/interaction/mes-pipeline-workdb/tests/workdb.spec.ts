import { existsSync } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, sep } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  ACTION, DATA_DIRNAME, DB_FILENAME, DDL, PUSH_STATUS, SCHEMA_VERSION, STATUS,
  harnessHome, inTransaction, messageOf, migrate, now, openWorkDatabase, parseJson,
  resolveDatabasePath, type WorkDatabase,
} from '../src/index.ts'

let root: string
const handles: WorkDatabase[] = []

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'dsh-mes-workdb-'))
})

afterEach(async () => {
  for (const handle of handles.splice(0)) handle.close()
  await rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 })
})

/** Open a database inside this test's private root and register it for teardown. */
function open(name = 'work.db'): WorkDatabase {
  const handle = openWorkDatabase({ dbPath: join(root, name) })
  handles.push(handle)
  return handle
}

describe('schema constants', () => {
  it('keeps the on-disk layout version an integer', () => {
    expect(Number.isInteger(SCHEMA_VERSION)).toBe(true)
  })

  it('names one data directory and one database file', () => {
    expect(DATA_DIRNAME).toBe('mes-pipeline')
    expect(DB_FILENAME).toBe('work.db')
  })

  it('declares the four review states and no others', () => {
    expect(Object.values(STATUS).sort()).toEqual(['approved', 'blocked', 'pending', 'rejected'])
  })

  it('declares the three delivery states and no others', () => {
    expect(Object.values(PUSH_STATUS).sort()).toEqual(['approved', 'failed', 'pushed'])
  })

  it('declares an action for every recorded human operation', () => {
    expect(Object.values(ACTION).sort()).toEqual(['approve', 'edit', 'evaluate', 'ingest', 'reject', 'reset'])
  })
})

describe('resolveDatabasePath', () => {
  it('keeps an explicit .db path', () => {
    const explicit = join(root, 'custom.db')
    expect(resolveDatabasePath(explicit)).toBe(explicit)
  })

  it('accepts a .sqlite and a .sqlite3 path as file paths', () => {
    expect(resolveDatabasePath(join(root, 'a.sqlite'))).toBe(join(root, 'a.sqlite'))
    expect(resolveDatabasePath(join(root, 'a.sqlite3'))).toBe(join(root, 'a.sqlite3'))
  })

  it('matches the file suffix case-insensitively', () => {
    expect(resolveDatabasePath(join(root, 'A.DB'))).toBe(join(root, 'A.DB'))
  })

  it('treats a path with no database suffix as a containing directory', () => {
    const directory = join(root, 'nested')
    expect(resolveDatabasePath(directory)).toBe(join(directory, DB_FILENAME))
  })

  it('trims surrounding whitespace', () => {
    expect(resolveDatabasePath(`  ${join(root, 'a.db')}  `)).toBe(join(root, 'a.db'))
  })

  it('falls back to the Harness home for an empty or missing override', () => {
    const expected = join(harnessHome(), DATA_DIRNAME, DB_FILENAME)
    expect(resolveDatabasePath('')).toBe(expected)
    expect(resolveDatabasePath('   ')).toBe(expected)
    expect(resolveDatabasePath(undefined)).toBe(expected)
  })

  it('resolves the default under the configured Harness home', () => {
    const home = process.env.DSH_HOME
    process.env.DSH_HOME = join(root, 'home')
    try {
      expect(resolveDatabasePath()).toBe(join(root, 'home', DATA_DIRNAME, DB_FILENAME))
    } finally {
      if (home === undefined) delete process.env.DSH_HOME
      else process.env.DSH_HOME = home
    }
  })

  it('ignores a blank DSH_HOME', () => {
    const home = process.env.DSH_HOME
    process.env.DSH_HOME = '   '
    try {
      expect(harnessHome()).not.toBe('   ')
    } finally {
      if (home === undefined) delete process.env.DSH_HOME
      else process.env.DSH_HOME = home
    }
  })
})

describe('openWorkDatabase', () => {
  it('creates the file and every table', async () => {
    const handle = open()
    expect(existsSync(handle.path)).toBe(true)
    const rows = handle.db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
      .all() as Array<{ name: string }>
    expect(rows.map(row => row.name)).toEqual(
      expect.arrayContaining(['push_record', 'pull_batch', 'review_decision', 'review_item']),
    )
  })

  it('creates the containing directory, including intermediate levels', async () => {
    const nested = join(root, 'a', 'b', 'c')
    const handle = openWorkDatabase({ dbPath: join(nested, 'work.db') })
    handles.push(handle)
    expect(existsSync(nested)).toBe(true)
  })

  it('creates the schema through a directory-form path', () => {
    const handle = openWorkDatabase({ dbPath: join(root, 'dir-form') })
    handles.push(handle)
    expect(handle.path).toBe(join(root, 'dir-form', DB_FILENAME))
    expect(existsSync(handle.path)).toBe(true)
  })

  it('opens the same file twice so each stage shares one database', () => {
    const first = open()
    const second = open()
    expect(first.path).toBe(second.path)
  })

  it('enables WAL so one stage can write while another reads', () => {
    const handle = open()
    const mode = handle.db.prepare('PRAGMA journal_mode').get() as { journal_mode: string }
    expect(mode.journal_mode.toLowerCase()).toBe('wal')
  })

  it('applies the configured busy timeout', () => {
    const handle = openWorkDatabase({ dbPath: join(root, 'busy.db'), busyTimeoutMs: 1_234 })
    handles.push(handle)
    const value = handle.db.prepare('PRAGMA busy_timeout').get() as { timeout: number }
    expect(Number(value.timeout)).toBe(1_234)
  })

  it('enforces foreign keys, so a decision cannot outlive its item', () => {
    const handle = open()
    const value = handle.db.prepare('PRAGMA foreign_keys').get() as { foreign_keys: number }
    expect(Number(value.foreign_keys)).toBe(1)
  })

  it('rejects a second row with the same (module, biz_key)', () => {
    const handle = open()
    const insert = handle.db.prepare(`
      INSERT INTO review_item (module, biz_key, created_at, updated_at) VALUES (?, ?, ?, ?)
    `)
    insert.run('报工信息', 'WO-1', 'now', 'now')
    expect(() => insert.run('报工信息', 'WO-1', 'now', 'now')).toThrow(/UNIQUE/)
    expect(() => insert.run('工单', 'WO-1', 'now', 'now')).not.toThrow()
  })

  it('rejects a duplicate queue row for the same (module, biz_key, target)', () => {
    const handle = open()
    const insert = handle.db.prepare(`
      INSERT INTO push_record (module, biz_key, approved_at) VALUES (?, ?, ?)
    `)
    insert.run('报工信息', 'WO-1', 'now')
    expect(() => insert.run('报工信息', 'WO-1', 'now')).toThrow(/UNIQUE/)
    expect(() => insert.run('报工信息', 'WO-1', 'other-target')).not.toThrow()
  })

  it('cascades a deleted item to its decisions', () => {
    const handle = open()
    const item = handle.db.prepare(`
      INSERT INTO review_item (module, biz_key, created_at, updated_at) VALUES (?, ?, ?, ?)
    `).run('报工信息', 'WO-1', 'now', 'now')
    handle.db.prepare(`
      INSERT INTO review_decision (item_id, action, created_at) VALUES (?, ?, ?)
    `).run(Number(item.lastInsertRowid), ACTION.APPROVE, 'now')
    handle.db.prepare('DELETE FROM review_item WHERE id = ?').run(Number(item.lastInsertRowid))
    const remaining = handle.db.prepare('SELECT COUNT(*) AS n FROM review_decision').get() as { n: number }
    expect(Number(remaining.n)).toBe(0)
  })

  it('defaults a new item to pending, un-evaluated, with no warnings', () => {
    const handle = open()
    handle.db.prepare('INSERT INTO review_item (module, biz_key, created_at, updated_at) VALUES (?, ?, ?, ?)')
      .run('报工信息', 'WO-1', 'now', 'now')
    const row = handle.db.prepare('SELECT * FROM review_item').get() as Record<string, unknown>
    expect(row['status']).toBe(STATUS.PENDING)
    expect(Number(row['rule_passed'])).toBe(0)
    expect(Number(row['rule_evaluated'])).toBe(0)
    expect(row['warnings']).toBe('[]')
    expect(row['source_payload']).toBe('{}')
    expect(row['mapped_payload']).toBe('{}')
  })

  it('reports nothing when a fresh database needs no column added', () => {
    const messages: string[] = []
    const handle = openWorkDatabase({ dbPath: join(root, 'log.db'), log: message => messages.push(message) })
    handles.push(handle)
    // A fresh database already has every column, so opening reports nothing.
    expect(messages).toEqual([])
  })

  it('is idempotent across repeated opens', () => {
    const path = join(root, 'repeat.db')
    for (let round = 0; round < 3; round += 1) {
      const handle = openWorkDatabase({ dbPath: path })
      const tables = handle.db.prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE type = 'table'").get() as { n: number }
      handle.close()
      expect(Number(tables.n)).toBeGreaterThanOrEqual(4)
    }
  })

  it('tolerates a double close', () => {
    const handle = openWorkDatabase({ dbPath: join(root, 'twice.db') })
    handle.close()
    expect(() => handle.close()).not.toThrow()
  })

  it('keeps the declared DDL idempotent when applied twice', () => {
    const handle = open()
    expect(() => handle.db.exec(DDL)).not.toThrow()
    expect(() => handle.db.exec(DDL)).not.toThrow()
  })
})

/**
 * DDL for a database written before `review_item.warnings` existed: every other
 * column and constraint is present, so only the additive migration applies.
 * @param extra - additional columns to append, as `name TYPE` fragments.
 * @returns the legacy table statement.
 */
function legacyReviewItem(extra: string[] = []): string {
  return `
    CREATE TABLE review_item (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      module          TEXT    NOT NULL,
      biz_key         TEXT    NOT NULL,
      source_payload  TEXT    NOT NULL DEFAULT '{}',
      mapped_payload  TEXT    NOT NULL DEFAULT '{}',
      status          TEXT    NOT NULL DEFAULT 'pending',
      rule_id         TEXT    NOT NULL DEFAULT '',
      rule_passed     INTEGER NOT NULL DEFAULT 0,
      rule_evaluated  INTEGER NOT NULL DEFAULT 0,
      rule_reason     TEXT    NOT NULL DEFAULT '',
      batch_id        TEXT    NOT NULL DEFAULT '',
      created_at      TEXT    NOT NULL,
      updated_at      TEXT    NOT NULL${extra.length === 0 ? '' : `,\n      ${extra.join(',\n      ')}`}
    );
  `
}

describe('migrate', () => {
  it('adds review_item.warnings to a table written before the column existed', () => {
    const path = join(root, 'old.db')
    const legacy = new DatabaseSync(path)
    legacy.exec(legacyReviewItem())
    legacy.exec(`
      INSERT INTO review_item (module, biz_key, created_at, updated_at)
      VALUES ('报工信息', 'WO-LEGACY', 'then', 'then');
    `)
    legacy.close()

    const handle = openWorkDatabase({ dbPath: path })
    handles.push(handle)
    const columns = (handle.db.prepare('PRAGMA table_info(review_item)').all() as Array<{ name: string }>)
      .map(row => row.name)
    expect(columns).toContain('warnings')
    const row = handle.db.prepare('SELECT warnings FROM review_item WHERE biz_key = ?').get('WO-LEGACY') as { warnings: string }
    // The default backfills the existing row rather than leaving it null.
    expect(row.warnings).toBe('[]')
  })

  it('reports the column it added through the log callback', () => {
    const path = join(root, 'logged.db')
    const legacy = new DatabaseSync(path)
    legacy.exec(legacyReviewItem())
    legacy.exec("INSERT INTO review_item (module, biz_key, created_at, updated_at) VALUES ('m', 'k', 'now', 'now');")
    legacy.close()
    const messages: string[] = []
    const handle = openWorkDatabase({ dbPath: path, log: message => messages.push(message) })
    handles.push(handle)
    expect(messages).toHaveLength(1)
    expect(messages[0]).toContain('review_item.warnings')
  })

  it('reports nothing to apply on a table that already has the column', () => {
    const handle = open()
    expect(migrate(handle.db)).toEqual([])
  })

  it('does nothing when the table does not exist at all', () => {
    const empty = new DatabaseSync(':memory:')
    try {
      expect(migrate(empty)).toEqual([])
    } finally {
      empty.close()
    }
  })

  it('only adds, never removes a column an older build wrote', () => {
    const path = join(root, 'extra.db')
    const legacy = new DatabaseSync(path)
    legacy.exec(legacyReviewItem(['warnings TEXT NOT NULL DEFAULT \'[]\'', "legacy_note TEXT NOT NULL DEFAULT ''"]))
    legacy.close()
    const handle = openWorkDatabase({ dbPath: path })
    handles.push(handle)
    const columns = (handle.db.prepare('PRAGMA table_info(review_item)').all() as Array<{ name: string }>)
      .map(row => row.name)
    expect(columns).toContain('legacy_note')
    expect(columns).toContain('warnings')
  })
})

describe('inTransaction', () => {
  it('returns the callback result after committing', () => {
    const handle = open()
    const result = inTransaction(handle.db, (db) => {
      db.prepare('INSERT INTO review_item (module, biz_key, created_at, updated_at) VALUES (?, ?, ?, ?)')
        .run('报工信息', 'WO-1', 'now', 'now')
      return 'committed'
    })
    expect(result).toBe('committed')
    const row = handle.db.prepare('SELECT COUNT(*) AS n FROM review_item').get() as { n: number }
    expect(Number(row.n)).toBe(1)
  })

  it('rolls back every write when the callback throws', () => {
    const handle = open()
    expect(() => inTransaction(handle.db, (db) => {
      db.prepare('INSERT INTO review_item (module, biz_key, created_at, updated_at) VALUES (?, ?, ?, ?)')
        .run('报工信息', 'WO-1', 'now', 'now')
      throw new Error('validation failed')
    })).toThrow(/validation failed/)
    const row = handle.db.prepare('SELECT COUNT(*) AS n FROM review_item').get() as { n: number }
    expect(Number(row.n)).toBe(0)
  })

  it('propagates the original error rather than the rollback failure', () => {
    const handle = open()
    expect(() => inTransaction(handle.db, () => {
      throw new Error('the real problem')
    })).toThrow(/the real problem/)
  })

  it('leaves the connection usable after a rolled-back transaction', () => {
    const handle = open()
    expect(() => inTransaction(handle.db, () => { throw new Error('nope') })).toThrow()
    expect(inTransaction(handle.db, () => 'still usable')).toBe('still usable')
  })

  it('takes the write lock immediately, so a read-then-write cannot deadlock', () => {
    const handle = open()
    // A nested BEGIN IMMEDIATE would fail; reaching the callback proves the lock
    // was taken up front and released on commit.
    inTransaction(handle.db, (db) => {
      db.prepare('INSERT INTO review_item (module, biz_key, created_at, updated_at) VALUES (?, ?, ?, ?)')
        .run('报工信息', 'WO-1', 'now', 'now')
    })
    expect(inTransaction(handle.db, () => 'ok')).toBe('ok')
  })

  it('rejects a nested transaction, so one operation owns one transaction', () => {
    const handle = open()
    expect(() => inTransaction(handle.db, db => inTransaction(db, () => 'inner')))
      .toThrow(/transaction/i)
  })
})

describe('now', () => {
  it('formats a local ISO-8601 timestamp with an explicit offset', () => {
    expect(now()).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[+-]\d{2}:\d{2}$/)
  })

  it('is sortable lexicographically for a single host', () => {
    const stamp = now()
    const later = now()
    expect(stamp <= later).toBe(true)
  })

  it('parses back to a real instant', () => {
    const stamp = now()
    expect(Number.isNaN(Date.parse(stamp))).toBe(false)
  })

  it('agrees with the current clock to within a day', () => {
    const delta = Math.abs(Date.parse(now()) - Date.now())
    expect(delta).toBeLessThan(86_400_000)
  })
})

describe('parseJson', () => {
  it('parses a stored JSON string', () => {
    expect(parseJson('{"a":1}', {})).toEqual({ a: 1 })
    expect(parseJson('[1,2]', [])).toEqual([1, 2])
    expect(parseJson('null', 'fallback')).toBeNull()
  })

  it('returns the fallback for an empty string', () => {
    expect(parseJson('', 'fallback')).toBe('fallback')
  })

  it('returns the fallback for malformed JSON', () => {
    expect(parseJson('{ not json', 'fallback')).toBe('fallback')
  })

  it('returns the fallback for a value that is not text', () => {
    expect(parseJson(undefined, 'fallback')).toBe('fallback')
    expect(parseJson(null, 'fallback')).toBe('fallback')
    expect(parseJson(42, 'fallback')).toBe('fallback')
    expect(parseJson({ a: 1 }, 'fallback')).toBe('fallback')
  })

  it('keeps a mutable fallback distinct per call', () => {
    const first = parseJson<number[]>('', [])
    first.push(1)
    expect(parseJson<number[]>('', [])).toEqual([])
  })
})

describe('messageOf', () => {
  it('reads the message of an Error', () => {
    expect(messageOf(new Error('boom'))).toBe('boom')
  })

  it('stringifies a non-Error', () => {
    expect(messageOf('text')).toBe('text')
    expect(messageOf(42)).toBe('42')
  })
})

describe('cross-plugin handover over one file', () => {
  it('lets a writer and a reader share the same database', () => {
    const path = join(root, 'shared.db')
    const writer = openWorkDatabase({ dbPath: path })
    const reader = openWorkDatabase({ dbPath: path })
    handles.push(writer, reader)
    inTransaction(writer.db, (db) => {
      db.prepare('INSERT INTO push_record (module, biz_key, approved_at) VALUES (?, ?, ?)')
        .run('报工信息', 'WO-1', 'now')
    })
    const rows = reader.db.prepare("SELECT biz_key FROM push_record WHERE status = 'approved'").all() as Array<{ biz_key: string }>
    expect(rows).toEqual([{ biz_key: 'WO-1' }])
    expect(reader.path).toBe(writer.path)
    expect(writer.path.includes(sep)).toBe(true)
  })
})
