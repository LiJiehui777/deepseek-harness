/**
 * Table and status constants shared by every MES pipeline plugin.
 *
 * The pipeline hands work from one plugin to the next through one SQLite
 * database rather than through cross-plugin method calls: the pull plugin
 * writes `review_item`, the review gate reads and decides it, and the push
 * plugin reads `push_record`. Those three packages therefore have to agree on
 * the same file, the same tables, and the same status strings, and this package
 * is that single agreement.
 *
 * @module @deepseek-ai/dsh-mes-pipeline-workdb/schema
 */

/** On-disk layout version. Adding a column stays compatible; changing a meaning does not. */
export const SCHEMA_VERSION = 1

/** Directory under the Harness home that holds the shared database. */
export const DATA_DIRNAME = 'mes-pipeline'

/** File name of the shared database inside {@link DATA_DIRNAME}. */
export const DB_FILENAME = 'work.db'

/** Review pool states; a record is always in exactly one. */
export const STATUS = {
  /** Rules passed (or were never configured) and a human has not decided yet. */
  PENDING: 'pending',
  /** Rules rejected it; a human may still force it through. */
  BLOCKED: 'blocked',
  /** A human approved it and it now waits in `push_record`. */
  APPROVED: 'approved',
  /** A human rejected it; it is never pushed unless returned to review. */
  REJECTED: 'rejected',
} as const

/** One review-pool state. */
export type ReviewStatus = typeof STATUS[keyof typeof STATUS]

/** Delivery states recorded on `push_record` only. */
export const PUSH_STATUS = {
  /** Approved and not yet delivered by any target. */
  APPROVED: 'approved',
  /** Delivered successfully. */
  PUSHED: 'pushed',
  /** Delivery failed; the record stays retryable. */
  FAILED: 'failed',
} as const

/** One delivery state. */
export type PushStatus = typeof PUSH_STATUS[keyof typeof PUSH_STATUS]

/** Actions recorded on `review_decision`, one row per human operation. */
export const ACTION = {
  APPROVE: 'approve',
  REJECT: 'reject',
  EDIT: 'edit',
  RESET: 'reset',
  INGEST: 'ingest',
  EVALUATE: 'evaluate',
} as const

/** One recorded review action. */
export type ReviewAction = typeof ACTION[keyof typeof ACTION]

/**
 * Create every pipeline table and index. Each statement is idempotent, so any
 * plugin may open the database first; callers run this on every open.
 */
export const DDL = `
CREATE TABLE IF NOT EXISTS review_item (
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
  warnings        TEXT    NOT NULL DEFAULT '[]',
  created_at      TEXT    NOT NULL,
  updated_at      TEXT    NOT NULL,
  UNIQUE(module, biz_key)
);
CREATE INDEX IF NOT EXISTS idx_item_status ON review_item(module, status);
CREATE INDEX IF NOT EXISTS idx_item_batch  ON review_item(batch_id);

CREATE TABLE IF NOT EXISTS review_decision (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  item_id     INTEGER NOT NULL,
  action      TEXT    NOT NULL,
  actor       TEXT    NOT NULL DEFAULT '',
  comment     TEXT    NOT NULL DEFAULT '',
  diff        TEXT    NOT NULL DEFAULT '',
  created_at  TEXT    NOT NULL,
  FOREIGN KEY(item_id) REFERENCES review_item(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_decision_item ON review_decision(item_id, created_at);

CREATE TABLE IF NOT EXISTS push_record (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  module      TEXT    NOT NULL,
  biz_key     TEXT    NOT NULL,
  payload     TEXT    NOT NULL DEFAULT '{}',
  status      TEXT    NOT NULL DEFAULT 'approved',
  target      TEXT    NOT NULL DEFAULT '',
  pushed_at   TEXT,
  attempts    INTEGER NOT NULL DEFAULT 0,
  last_error  TEXT    NOT NULL DEFAULT '',
  approved_at TEXT    NOT NULL,
  UNIQUE(module, biz_key, target)
);
CREATE INDEX IF NOT EXISTS idx_push_status ON push_record(status, target);
CREATE INDEX IF NOT EXISTS idx_push_module ON push_record(module, status);

CREATE TABLE IF NOT EXISTS pull_batch (
  id          TEXT PRIMARY KEY,
  key_value   TEXT NOT NULL,
  key_type    TEXT NOT NULL DEFAULT '',
  queries     TEXT NOT NULL DEFAULT '[]',
  item_count  INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL
);
`
