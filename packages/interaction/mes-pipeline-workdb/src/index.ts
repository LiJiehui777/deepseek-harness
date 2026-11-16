/**
 * Handover database for the MES review pipeline: one SQLite file and the
 * tables on either side of the review decision.
 *
 * Each pipeline plugin opens the same file and touches only the tables its
 * stage owns, so the plugins stay independently installable, independently
 * startable, and independently testable. Opening is synchronous and migration
 * is additive, because a plugin opens the file during load and a stage that
 * cannot reach the disk must still report an actionable error rather than fail
 * the whole profile.
 *
 * @module @deepseek-ai/dsh-mes-pipeline-workdb
 */

import { mkdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { DATA_DIRNAME, DB_FILENAME, DDL } from './schema.ts'

export * from './schema.ts'

/** One opened handover database plus its resolved path. */
export interface WorkDatabase {
  /** The open handle; callers prepare their own statements against it. */
  readonly db: DatabaseSync
  /** Absolute path of the file backing {@link db}. */
  readonly path: string
  /** Close the handle; safe to call more than once. */
  close(): void
}

/** Options for {@link openWorkDatabase}. */
export interface OpenOptions {
  /** Explicit file path; omitted resolves {@link resolveDatabasePath}. */
  dbPath?: string
  /** Lock wait for a concurrent writer, in milliseconds. */
  busyTimeoutMs?: number
  /** Receives one line when the schema is migrated; omitted disables the report. */
  log?: (message: string) => void
}

/**
 * The Harness home that pipeline data lives under.
 * @returns `$DSH_HOME`, falling back to `~/.dsh`.
 */
export function harnessHome(): string {
  const configured = process.env.DSH_HOME
  if (typeof configured === 'string' && configured.trim() !== '') return configured.trim()
  return join(homedir(), '.dsh')
}

/**
 * Resolve the shared database path.
 *
 * Every pipeline plugin must land on the same file, so the default lives here
 * instead of in each plugin. A path with no database suffix is treated as the
 * containing directory.
 * @param override - explicit path from plugin configuration, if any.
 * @returns an absolute path to the shared database file.
 */
export function resolveDatabasePath(override?: string): string {
  const text = typeof override === 'string' ? override.trim() : ''
  if (text === '') return join(harnessHome(), DATA_DIRNAME, DB_FILENAME)
  return /\.(?:db|sqlite3?)$/i.test(text) ? text : join(text, DB_FILENAME)
}

/**
 * Add the columns an earlier layout is missing.
 *
 * `CREATE TABLE IF NOT EXISTS` never alters an existing table, so a database
 * written by a release without `review_item.warnings` keeps lacking it. Only
 * additions happen here, which keeps an older file readable by this build.
 * @param db - the open handle.
 * @returns the columns this call added, in execution order.
 */
export function migrate(db: DatabaseSync): string[] {
  const columns = new Set(
    (db.prepare('PRAGMA table_info(review_item)').all() as Array<{ name: string }>).map(row => row.name),
  )
  const applied: string[] = []
  if (columns.size > 0 && !columns.has('warnings')) {
    db.exec("ALTER TABLE review_item ADD COLUMN warnings TEXT NOT NULL DEFAULT '[]'")
    applied.push('review_item.warnings')
  }
  return applied
}

/**
 * Open the shared database and bring its schema up to this build.
 *
 * The file is opened in WAL mode so the pull plugin can write while the review
 * gate reads, and a busy timeout turns a concurrent writer into a short wait
 * instead of `SQLITE_BUSY`. The containing directory is created owner-only,
 * because the payloads it holds describe production orders.
 * @param options - path, lock budget, and migration reporting.
 * @returns the open handle and its resolved path.
 * @throws Error when the file cannot be created or opened.
 */
export function openWorkDatabase(options: OpenOptions = {}): WorkDatabase {
  const path = resolveDatabasePath(options.dbPath)
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 })
  const db = new DatabaseSync(path)
  try {
    db.exec('PRAGMA journal_mode = WAL')
    db.exec('PRAGMA synchronous = NORMAL')
    db.exec(`PRAGMA busy_timeout = ${String(Math.max(0, Math.trunc(options.busyTimeoutMs ?? 5000)))}`)
    db.exec('PRAGMA foreign_keys = ON')
    db.exec(DDL)
    const migrated = migrate(db)
    if (migrated.length > 0) options.log?.(`shared database migrated: ${migrated.join(', ')}`)
  } catch (error) {
    db.close()
    throw error
  }
  return {
    db,
    path,
    close() {
      try {
        db.close()
      } catch {
        // A close during unload cannot be retried, and the handle is being
        // discarded either way.
      }
    },
  }
}

/**
 * Run one write transaction under a lock taken immediately.
 *
 * `BEGIN IMMEDIATE` acquires the write lock up front, so a read-then-write
 * sequence cannot deadlock against another plugin upgrading a read lock.
 * @param db - the open handle.
 * @param work - statements to run inside the transaction.
 * @returns whatever `work` returned.
 * @throws the original error after rolling back.
 */
export function inTransaction<T>(db: DatabaseSync, work: (db: DatabaseSync) => T): T {
  db.exec('BEGIN IMMEDIATE')
  try {
    const result = work(db)
    db.exec('COMMIT')
    return result
  } catch (error) {
    try {
      db.exec('ROLLBACK')
    } catch {
      // The transaction is already unusable; the original failure is what the
      // caller needs to see.
    }
    throw error
  }
}

/**
 * The current time as an ISO-8601 string with the local zone offset.
 * @returns a sortable timestamp such as `2026-11-14T08:30:00+08:00`.
 */
export function now(): string {
  const date = new Date()
  const pad = (value: number): string => String(Math.floor(Math.abs(value))).padStart(2, '0')
  const offset = -date.getTimezoneOffset()
  const sign = offset >= 0 ? '+' : '-'
  return `${String(date.getFullYear())}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
    + `T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
    + `${sign}${pad(offset / 60)}:${pad(offset % 60)}`
}

/**
 * Parse one stored JSON column, returning `fallback` instead of throwing.
 * @param text - the stored text.
 * @param fallback - value used when the column is empty or unparseable.
 * @returns the parsed value or `fallback`.
 */
export function parseJson<T>(text: unknown, fallback: T): T {
  if (typeof text !== 'string' || text === '') return fallback
  try {
    return JSON.parse(text) as T
  } catch {
    return fallback
  }
}

/**
 * Reduce a thrown value to one displayable line.
 * @param error - the thrown value.
 * @returns the message text.
 */
export function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
