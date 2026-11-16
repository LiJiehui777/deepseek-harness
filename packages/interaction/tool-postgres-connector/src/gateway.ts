/**
 * Read-only PostgreSQL gateway: one pooled connection owned by the connector,
 * with every statement bounded and every failure translated into a sanitized
 * message.
 *
 * The gateway receives a resolved password per call. A changed password replaces
 * the pool before the next statement can borrow a connection.
 *
 * @module connector-postgres/gateway
 */
import type { Pool, PoolClient, PostgresDriver } from './pg-shim.ts'
import type { PostgresColumn, PostgresQueryResult, PostgresSchema, PostgresTable, PostgresTableDetail } from './types.ts'
import { acceptReadOnlyStatement, effectiveLimit, limitStatement } from './statement.ts'

/** Connection settings resolved from connector configuration. */
export interface GatewayOptions {
  /** Host name or address of the PostgreSQL server. */
  host: string
  /** TCP port of the PostgreSQL server. */
  port: number
  /** Database name to connect to. */
  database: string
  /** Role used for the connection. */
  user: string
  /** Maximum number of pooled connections. */
  maxConnections: number
  /** Statement deadline in milliseconds, enforced by the server. */
  statementTimeoutMs: number
  /** Whether the connection requires TLS. */
  ssl: boolean
  /** Maximum rows any single statement may return. */
  maxRows: number
}

/** One page of relations. */
export interface TablePage {
  /** Relations in this page. */
  tables: PostgresTable[]
  /** One-based page number. */
  page: number
  /** Whether another page may exist. */
  hasMore: boolean
}

/** Relation kinds the connector reports and queries. */
const RELATION_KINDS = '(\'r\',\'v\',\'m\',\'p\',\'f\')'

/**
 * Load the PostgreSQL driver on first use.
 *
 * The driver is an optional runtime dependency of the composition rather than a
 * load-time requirement: a profile that never reads data should still activate
 * this connector and show its settings. A missing driver therefore surfaces as
 * an actionable error on the first read instead of breaking plugin load.
 * @returns the driver module.
 * @throws Error when the driver is not installed.
 */
async function loadDriver(): Promise<PostgresDriver> {
  // A computed specifier keeps TypeScript from resolving the optional driver at
  // build time, so a repository without it still type-checks and loads.
  const specifier = 'pg'
  try {
    return await import(specifier) as PostgresDriver
  } catch {
    throw new Error('PostgreSQL driver "pg" is not installed. Run: pnpm add pg --filter @deepseek-ai/dsh-tool-postgres-connector')
  }
}

/**
 * Low-level PostgreSQL access used by the connector tools.
 *
 * Each public method opens a pooled connection, applies the statement deadline,
 * runs one bounded statement, and releases the connection. A failure closes the
 * connection before surfacing a sanitized error so no statement text or
 * credential reaches the caller.
 */
export class PostgresGateway {
  private pool: { handle: Pool; password: string } | undefined
  private readonly retiring = new Set<Promise<void>>()
  private closed = false

  /**
   * @param options - resolved connection settings; the password arrives per call.
   */
  constructor(private readonly options: GatewayOptions) {}

  /**
   * Whether a pool currently exists.
   * @returns true once a statement has opened the pool.
   */
  get connected(): boolean {
    return this.pool !== undefined
  }

  /**
   * Open the pool on first use or after credential rotation.
   * @param password - credential resolved for this call.
   * @returns the shared pool.
   */
  private async connection(password: string): Promise<Pool> {
    this.assertOpen()
    if (this.pool?.password === password) return this.pool.handle
    const { Pool: PoolCtor } = await loadDriver()
    this.assertOpen()
    if (this.pool?.password === password) return this.pool.handle
    const previous = this.pool
    const handle = new PoolCtor({
      host: this.options.host,
      port: this.options.port,
      database: this.options.database,
      user: this.options.user,
      password,
      max: this.options.maxConnections,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: Math.min(this.options.statementTimeoutMs, 15_000),
      ...(this.options.ssl ? { ssl: { rejectUnauthorized: true } } : {}),
      application_name: 'dsh-tool-postgres-connector',
      // Defence in depth: the statement guard already refuses writes.
      options: `-c statement_timeout=${this.options.statementTimeoutMs} -c default_transaction_read_only=on`,
    })
    this.pool = { handle, password }
    if (previous) this.retire(previous.handle)
    return handle
  }

  private assertOpen(): void {
    if (this.closed) throw new Error('PostgreSQL connection is closing. Retry the request.')
  }

  /**
   * Run one callback against a dedicated client and always release it.
   * @param password - credential resolved for this call.
   * @param work - statements to run on the borrowed client.
   * @returns the callback result.
   */
  private async withClient<T>(password: string, work: (client: PoolClient) => Promise<T>): Promise<T> {
    // Validate the password before touching the driver so a missing credential
    // reports as a configuration problem, not as a missing dependency.
    if (!password) throw new Error('PostgreSQL password is empty. Configure the credential reference.')
    const pool = await this.connection(password)
    let client: PoolClient
    try {
      client = await pool.connect()
    } catch {
      throw new Error('Cannot reach the PostgreSQL server. Check the host, port, database and network access.')
    }
    try {
      await client.query('BEGIN READ ONLY')
      const result = await work(client)
      await client.query('COMMIT')
      return result
    } catch (error) {
      try {
        await client.query('ROLLBACK')
      } catch {
        // The session is already unusable; the release below discards it.
      }
      throw error
    } finally {
      client.release()
    }
  }

  /**
   * List schemas visible to the connected role.
   * @param password - credential resolved for this call.
   * @returns schemas excluding PostgreSQL's internal catalogs.
   */
  async listSchemas(password: string): Promise<PostgresSchema[]> {
    return this.withClient(password, async (client) => {
      const { rows } = await client.query<{ nspname: string; owner: string | null }>(
        `SELECT n.nspname AS nspname, pg_catalog.pg_get_userbyid(n.nspowner) AS owner
           FROM pg_catalog.pg_namespace n
          WHERE n.nspname NOT IN ('pg_catalog','information_schema','pg_toast')
            AND n.nspname NOT LIKE 'pg_temp_%'
            AND n.nspname NOT LIKE 'pg_toast_temp_%'
          ORDER BY n.nspname`,
      )
      return rows.map(row => ({ name: row.nspname, owner: row.owner }))
    })
  }

  /**
   * List relations in one schema.
   * @param password - credential resolved for this call.
   * @param schema - schema name; validated by the caller.
   * @param page - one-based page number.
   * @param pageSize - relations per page.
   * @returns one page of relations with comments and estimated row counts.
   */
  async listTables(password: string, schema: string, page: number, pageSize: number): Promise<TablePage> {
    return this.withClient(password, async (client) => {
      const { rows } = await client.query<{
        relname: string
        relkind: string
        comment: string | null
        estimate: string | null
      }>(
        `SELECT c.relname, c.relkind,
                COALESCE(pg_catalog.obj_description(c.oid, 'pg_class'), '') AS comment,
                CASE WHEN c.reltuples < 0 THEN NULL ELSE c.reltuples::bigint::text END AS estimate
           FROM pg_catalog.pg_class c
           JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
          WHERE n.nspname = $1 AND c.relkind IN ${RELATION_KINDS}
          ORDER BY c.relname
          LIMIT $2 OFFSET $3`,
        [schema, pageSize + 1, (page - 1) * pageSize],
      )
      const hasMore = rows.length > pageSize
      const tables = rows.slice(0, pageSize).map(row => ({
        schema,
        name: row.relname,
        kind: relationKind(row.relkind),
        comment: row.comment ?? '',
        estimatedRows: row.estimate === null ? null : Number(row.estimate),
      }))
      return { tables, page, hasMore }
    })
  }

  /**
   * Describe one relation: columns, types, defaults, comments and primary key.
   * @param password - credential resolved for this call.
   * @param schema - schema name; validated by the caller.
   * @param table - relation name; validated by the caller.
   * @returns the relation description.
   * @throws Error when the relation does not exist or is not readable.
   */
  async describeTable(password: string, schema: string, table: string): Promise<PostgresTableDetail> {
    return this.withClient(password, async (client) => {
      const meta = await client.query<{ relkind: string; comment: string | null }>(
        `SELECT c.relkind, COALESCE(pg_catalog.obj_description(c.oid,'pg_class'),'') AS comment
           FROM pg_catalog.pg_class c
           JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
          WHERE n.nspname = $1 AND c.relname = $2 AND c.relkind IN ${RELATION_KINDS}`,
        [schema, table],
      )
      const first = meta.rows[0]
      if (!first) throw new Error('The requested relation does not exist or is not readable.')

      const { rows } = await client.query<{
        column_name: string
        data_type: string
        is_nullable: string
        column_default: string | null
        comment: string | null
      }>(
        `SELECT a.attname AS column_name,
                pg_catalog.format_type(a.atttypid, a.atttypmod) AS data_type,
                CASE WHEN a.attnotnull THEN 'NO' ELSE 'YES' END AS is_nullable,
                pg_catalog.pg_get_expr(d.adbin, d.adrelid) AS column_default,
                COALESCE(pg_catalog.col_description(a.attrelid, a.attnum), '') AS comment
           FROM pg_catalog.pg_attribute a
           JOIN pg_catalog.pg_class c ON c.oid = a.attrelid
           JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
           LEFT JOIN pg_catalog.pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
          WHERE n.nspname = $1 AND c.relname = $2
            AND a.attnum > 0 AND NOT a.attisdropped
          ORDER BY a.attnum`,
        [schema, table],
      )

      const keyQuery = await client.query<{ attname: string }>(
        `SELECT a.attname
           FROM pg_catalog.pg_constraint con
           JOIN pg_catalog.pg_class c ON c.oid = con.conrelid
           JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
           JOIN pg_catalog.pg_attribute a ON a.attrelid = c.oid AND a.attnum = ANY (con.conkey)
          WHERE con.contype = 'p' AND n.nspname = $1 AND c.relname = $2
          ORDER BY a.attnum`,
        [schema, table],
      )

      const columns: PostgresColumn[] = rows.map(row => ({
        name: row.column_name,
        type: row.data_type,
        nullable: row.is_nullable === 'YES',
        defaultValue: row.column_default,
        comment: row.comment ?? '',
      }))

      return {
        schema,
        name: table,
        kind: relationKind(first.relkind),
        comment: first.comment ?? '',
        columns,
        primaryKey: keyQuery.rows.map(row => row.attname),
      }
    })
  }

  /**
   * Run one read-only statement and return at most the effective limit.
   * @param password - credential resolved for this call.
   * @param sql - caller statement, validated here.
   * @param requestedLimit - caller limit, capped by the configured maximum.
   * @returns the bounded result with truncation reported explicitly.
   * @throws Error when the statement is rejected or fails server-side.
   */
  async query(password: string, sql: string, requestedLimit: number | undefined): Promise<PostgresQueryResult> {
    const accepted = acceptReadOnlyStatement(sql)
    const limit = effectiveLimit(requestedLimit, this.options.maxRows)
    const started = Date.now()
    return this.withClient(password, async (client) => {
      const result = await client.query(limitStatement(accepted.sql, limit))
      const elapsedMs = Date.now() - started
      const rows = result.rows
      const truncated = rows.length > limit
      const bounded = truncated ? rows.slice(0, limit) : rows
      return {
        rows: bounded,
        columns: result.fields.map(field => field.name),
        rowCount: bounded.length,
        truncated,
        limit,
        elapsedMs,
      }
    })
  }

  /**
   * Close the pool and discard every idle connection.
   * @returns a promise that settles when the pool has drained.
   */
  async close(): Promise<void> {
    this.closed = true
    const pool = this.pool
    this.pool = undefined
    if (pool) this.retire(pool.handle)
    await Promise.all(this.retiring)
  }

  private retire(pool: Pool): void {
    const drained = pool.end().catch(() => undefined)
    this.retiring.add(drained)
    void drained.then(() => { this.retiring.delete(drained) })
  }
}

/**
 * Translate a PostgreSQL relation kind code into a stable label.
 * @param kind - single-character `relkind` value.
 * @returns the reported relation kind.
 */
function relationKind(kind: string): string {
  switch (kind) {
    case 'r': return 'table'
    case 'v': return 'view'
    case 'm': return 'materialized view'
    case 'p': return 'partitioned table'
    case 'f': return 'foreign table'
    default: return 'unknown'
  }
}
