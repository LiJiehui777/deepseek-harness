/**
 * The pull stage: read one order's data across MES modules and pool it for
 * review.
 *
 * The stage reads through the read-only connector service and writes rows into
 * the shared review pool, which is where the review gate finds them. It
 * screens nothing, judges nothing, and sends nothing: those belong to the
 * stages on either side.
 *
 * @module @deepseek-ai/dsh-tool-mes-pull/service
 */

import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  STATUS, inTransaction, messageOf, now, openWorkDatabase, parseJson,
  type WorkDatabase,
} from '@deepseek-ai/dsh-mes-pipeline-workdb'
import { DirectoryQuerySource, bindPlaceholders, buildParams, type QueryDefinition, type QuerySource } from './queries.ts'
import { MODULES, buildItems, type MappingWarning, type PulledItem, type SourceRow } from './push-schema.ts'

/** Package root, used to locate the bundled `queries/`. */
export function packageRoot(): string {
  return join(dirname(fileURLToPath(import.meta.url)), '..')
}

/** A read-only statement runner, as the connector service provides it. */
export interface ReadRunner {
  /**
   * Run one read-only statement.
   * @param sql - a single SELECT statement.
   * @param limit - maximum rows to return.
   * @returns the rows and whether the connector truncated them.
   */
  query(sql: string, limit?: number): Promise<{ rows: SourceRow[]; truncated: boolean }>
}

/** One module's contribution to a pull. */
export interface PulledModule {
  /** Query module id. */
  queryId: string
  /** Query display name. */
  queryName: string
  /** Push module this query maps to, empty when it maps to none. */
  pushModule: string
  /** Rows converted into review items. */
  rowCount: number
  /** Whether the connector truncated the result. */
  truncated: boolean
  /** How many mapping warnings this module produced. */
  warnings: number
  /** Why this module failed, when it did. */
  error?: string
}

/** Result of one pull. */
export interface PullResult {
  /** Batch id written to the pool; `preview` when nothing was written. */
  batchId: string
  /** Key value this pull used. */
  keyValue: string
  /** Key type this pull used. */
  keyType: string
  /** Per-module outcome. */
  modules: PulledModule[]
  /** Total source rows returned by the queries. */
  totalRows: number
  /** Items newly written to the pool. */
  inserted: number
  /** Items skipped because the pool already had them. */
  skipped: number
  /** Mapping warnings across every module. */
  warnings: MappingWarning[]
  /** Whether every module succeeded. */
  ok: boolean
}

/** Options for one pull. */
export interface PullOptions {
  /** Key value, usually a contract or order number. */
  keyValue: string
  /** Key type; omitted uses the first definition's declared type. */
  keyType?: string
  /** Only run these module ids; omitted runs all of them. */
  queries?: string[]
  /** Whether to write to the pool; false previews only. */
  persist: boolean
  /** Rows per module. */
  rowLimit?: number
}

/** Options consumed by {@link MesPullService}. */
export interface MesPullOptions {
  /** Whether pulls are allowed at all. */
  enabled: boolean
  /** Directory holding the `.sql` definitions. */
  queriesPath: string
  /** Shared pool path. */
  dbPath: string
  /** Default rows per module. */
  rowLimit: number
  /** Receives one diagnostic line. */
  log?: (message: string) => void
  /** Resolves the read-only runner, or undefined when the connector is absent. */
  runner: () => ReadRunner | undefined
  /** Query source; defaults to the configured directory. */
  source?: QuerySource
}

/** One pooled item as the read tools return it. */
export interface PooledItem extends PulledItem {
  /** Pool row id. */
  id: number
  /** Current pool state. */
  status: string
  /** Pull batch that produced it. */
  batchId: string
  /** When it entered the pool. */
  createdAt: string
}

/** Readiness of the pull stage. */
export interface PullHealth {
  /** Whether a pull could run now. */
  ok: boolean
  /** Whether the pool has been opened successfully. */
  ready: boolean
  /** Why the pool is unusable, empty on success. */
  error: string
  /** Resolved pool path. */
  dbPath: string
  /** Whether the read-only connector is mounted. */
  connector: boolean
  /** Whether pulls are enabled by configuration. */
  enabled: boolean
  /** Items already in the pool. */
  items: number
}

/**
 * The pull stage, shared through the Cordis context as `ctx.mesPull`.
 */
export class MesPullService {
  private readonly source: QuerySource
  private connection: WorkDatabase | undefined
  private connectionError = ''

  /**
   * @param options - configuration, the runner accessor, and diagnostics.
   */
  constructor(private readonly options: MesPullOptions) {
    this.source = options.source ?? new DirectoryQuerySource(options.queriesPath)
  }

  /** Directory the `.sql` definitions are read from. */
  get queriesDirectory(): string {
    return this.source.directory
  }

  /**
   * Open the shared pool on first use.
   *
   * A disk problem must not stop the plugin from loading, so the failure is
   * recorded and reported through {@link health} instead.
   * @returns the open database.
   * @throws Error when the pool cannot be opened.
   */
  private async db(): Promise<WorkDatabase> {
    if (this.connection !== undefined) return this.connection
    try {
      this.connection = openWorkDatabase({
        dbPath: this.options.dbPath,
        ...this.options.log === undefined ? {} : { log: this.options.log },
      })
      this.connectionError = ''
      return this.connection
    } catch (error) {
      this.connectionError = messageOf(error)
      throw new Error(`Review pool is unavailable: ${this.connectionError}`)
    }
  }

  /**
   * Report whether a pull could run now.
   * @returns readiness and the reason when it is not ready.
   */
  async health(): Promise<PullHealth> {
    const connector = this.options.runner() !== undefined
    try {
      const connection = await this.db()
      const row = connection.db.prepare('SELECT COUNT(*) AS n FROM review_item').get() as { n: number } | undefined
      return {
        ok: true,
        ready: true,
        error: '',
        dbPath: connection.path,
        connector,
        enabled: this.options.enabled,
        items: Number(row?.n ?? 0),
      }
    } catch (error) {
      return {
        ok: false,
        ready: false,
        error: messageOf(error),
        dbPath: this.connection?.path ?? '',
        connector,
        enabled: this.options.enabled,
        items: 0,
      }
    }
  }

  /**
   * List the configured query modules.
   * @returns the definitions, freshly read from disk.
   */
  async listQueries(): Promise<QueryDefinition[]> {
    return this.source.list()
  }

  /**
   * Pull one key's data across modules and pool it for review.
   * @param options - key, module selection, and whether to persist.
   * @returns the per-module summary and pool counts.
   * @throws Error when pulls are disabled, the connector is absent, or the key is empty.
   */
  async pull(options: PullOptions): Promise<PullResult> {
    if (!this.options.enabled) throw new Error('MES pulls are disabled. Enable them in Settings > Plugins.')
    const runner = this.options.runner()
    if (runner === undefined) {
      throw new Error('The read-only database connection is unavailable. Install and enable the PostgreSQL connector, then fill in its connection settings.')
    }
    const keyValue = options.keyValue.trim()
    if (keyValue === '') throw new Error('A pull needs a key value, such as an order number.')
    const connection = await this.db()
    return pullByKey(
      { db: connection.db, runner, source: this.source },
      { ...options, keyValue, rowLimit: options.rowLimit ?? this.options.rowLimit },
    )
  }

  /**
   * Read the items one batch wrote.
   * @param batchId - batch id returned by {@link pull}.
   * @param module - restrict to one module.
   * @param limit - maximum rows.
   * @returns the pooled items.
   */
  async readBatch(batchId: string, module?: string, limit: number = 200): Promise<PooledItem[]> {
    const connection = await this.db()
    const where = ['batch_id = ?']
    const args: Array<string | number> = [batchId]
    if (module !== undefined && module !== '') {
      where.push('module = ?')
      args.push(module)
    }
    const rows = connection.db.prepare(
      `SELECT * FROM review_item WHERE ${where.join(' AND ')} ORDER BY id ASC LIMIT ?`,
    ).all(...args, Math.min(Math.max(1, Math.trunc(limit)), 1000)) as unknown as Array<{
      id: number
      module: string
      biz_key: string
      status: string
      source_payload: string
      mapped_payload: string
      warnings: string
      batch_id: string
      created_at: string
    }>
    return rows.map(row => ({
      id: Number(row.id),
      module: row.module,
      bizKey: row.biz_key,
      status: row.status,
      source: parseJson<SourceRow>(row.source_payload, {}),
      mapped: parseJson<Record<string, unknown>>(row.mapped_payload, {}),
      warnings: parseJson<string[]>(row.warnings, []),
      batchId: row.batch_id,
      createdAt: row.created_at,
    }))
  }

  /**
   * List recent batches, newest first.
   * @param limit - maximum rows.
   * @returns the batch rows.
   */
  async listBatches(limit: number = 20): Promise<Array<Record<string, unknown>>> {
    const connection = await this.db()
    return connection.db.prepare('SELECT * FROM pull_batch ORDER BY created_at DESC LIMIT ?')
      .all(Math.min(Math.max(1, Math.trunc(limit)), 200)) as Array<Record<string, unknown>>
  }

  /** Release the pool handle. */
  dispose(): void {
    this.connection?.close()
    this.connection = undefined
  }
}

/**
 * Pull one key's data and write it into the review pool.
 *
 * One module failing does not stop the others: each module's outcome is
 * independent so an operator still gets the data that was readable.
 * @param deps - the open pool, the read-only runner, and the query source.
 * @param options - key, module selection, persistence, and row limit.
 * @returns the per-module summary and pool counts.
 */
export async function pullByKey(
  deps: { db: WorkDatabase['db']; runner: ReadRunner; source: QuerySource },
  options: PullOptions,
): Promise<PullResult> {
  const { db, runner, source } = deps
  const keyValue = options.keyValue.trim()
  if (keyValue === '') throw new Error('A pull needs a key value, such as an order number.')
  const wanted = options.queries !== undefined && options.queries.length > 0 ? new Set(options.queries) : undefined
  const definitions = (await source.list()).filter(definition => wanted === undefined || wanted.has(definition.id))
  if (definitions.length === 0) {
    throw new Error(wanted === undefined
      ? 'No .sql definition exists in the queries directory.'
      : `No query definition matches: ${[...(wanted)].join(', ')}. Check the file names in the queries directory.`)
  }
  const keyType = options.keyType ?? definitions[0]?.keyType ?? 'contract_no'
  const rowLimit = options.rowLimit ?? 500
  const batchId = options.persist ? `pull-${String(Date.now())}-${Math.random().toString(36).slice(2, 8)}` : 'preview'
  const stamp = now()
  const modules: PulledModule[] = []
  let totalRows = 0
  let inserted = 0
  let skipped = 0
  const allWarnings: MappingWarning[] = []
  // Convert every module before writing once, so the pool is touched once and
  // a partially failed pull cannot commit half its rows.
  const collected: Array<{ definition: QueryDefinition; items: PulledItem[] }> = []

  for (const definition of definitions) {
    try {
      const sql = bindPlaceholders(definition.sql, buildParams(definition, keyValue, keyType))
      const result = await runner.query(sql, rowLimit)
      totalRows += result.rows.length
      const built = definition.module !== '' && MODULES[definition.module] !== undefined
        ? buildItems(definition.module, result.rows, rowLimit)
        : rawItems(definition, result.rows, keyValue, rowLimit)
      collected.push({ definition, items: built.items })
      allWarnings.push(...built.warnings.map(warning => ({ ...warning })))
      modules.push({
        queryId: definition.id,
        queryName: definition.name,
        pushModule: definition.module,
        rowCount: built.items.length,
        truncated: result.truncated,
        warnings: built.warnings.length,
      })
    } catch (error) {
      modules.push({
        queryId: definition.id,
        queryName: definition.name,
        pushModule: definition.module,
        rowCount: 0,
        truncated: false,
        warnings: 0,
        error: messageOf(error),
      })
    }
  }

  if (options.persist && collected.length > 0) {
    inTransaction(db, (tx) => {
      const insert = tx.prepare(`
        INSERT INTO review_item
          (module, biz_key, source_payload, mapped_payload, status, batch_id, warnings, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(module, biz_key) DO NOTHING
      `)
      for (const { items } of collected) {
        for (const item of items) {
          const changes = insert.run(
            item.module,
            item.bizKey,
            JSON.stringify(item.source),
            JSON.stringify(item.mapped),
            STATUS.PENDING,
            batchId,
            JSON.stringify(item.warnings),
            stamp,
            stamp,
          )
          if (Number(changes.changes) > 0) inserted += 1
          else skipped += 1
        }
      }
      tx.prepare(`
        INSERT INTO pull_batch (id, key_value, key_type, queries, item_count, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO NOTHING
      `).run(batchId, keyValue, keyType, JSON.stringify(definitions.map(definition => definition.id)), inserted, stamp)
    })
  }

  return {
    batchId,
    keyValue,
    keyType,
    modules,
    totalRows,
    inserted,
    skipped,
    warnings: allWarnings,
    ok: modules.every(module => module.error === undefined),
  }
}

/**
 * Convert rows from a query that declares no push module.
 *
 * The payload is a copy of the source row, because nothing maps it, and every
 * item carries a warning saying so.
 * @param definition - the query definition.
 * @param rows - the source rows.
 * @param keyValue - the pull's key, used for the fallback business key.
 * @param limit - maximum rows.
 * @returns the items and their warnings.
 */
function rawItems(
  definition: QueryDefinition,
  rows: readonly SourceRow[],
  keyValue: string,
  limit: number,
): { items: PulledItem[]; warnings: MappingWarning[] } {
  const reason = definition.module === ''
    ? 'This query declares no -- @module, so the payload is only a copy of the source row.'
    : `This query declares unknown module ${definition.module}, so no payload mapping was applied.`
  const items = rows.slice(0, limit).map((row, index) => ({
    module: definition.name,
    bizKey: rawBusinessKey(row, keyValue, index),
    source: row,
    mapped: { ...row },
    warnings: [reason],
  }))
  return {
    items,
    warnings: items.length === 0 ? [] : [{ index: 0, bizKey: items[0]?.bizKey ?? '', message: reason }],
  }
}

/**
 * Compute a business key for a row from a query with no push module.
 * @param row - the source row.
 * @param keyValue - the pull's key.
 * @param index - zero-based row index.
 * @returns the key, indexed when the row holds no unique field.
 */
function rawBusinessKey(row: SourceRow, keyValue: string, index: number): string {
  const candidates = [
    'inspectionNo', 'inspection_no', 'orderNo', 'order_no', 'workOrderNo', 'work_order_no',
    'reportNo', 'report_no', 'detailNo', 'detail_no', 'planNo', 'plan_no', 'id', 'ID',
  ]
  for (const field of candidates) {
    const value = row[field]
    if (value !== undefined && value !== null && String(value).trim() !== '') return String(value).trim()
  }
  const base = String(row.contractNo ?? row.contract_no ?? keyValue).trim()
  return `${base}#${String(index + 1)}`
}
