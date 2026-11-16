/**
 * Minimal structural types for the parts of `node-postgres` this connector uses.
 *
 * The driver is an optional runtime dependency that the deployment installs
 * separately, so the repository must type-check and load before it is present.
 * These declarations describe only the surface this package calls. They are
 * resolved through a runtime specifier rather than a static import so a missing
 * driver cannot fail module resolution.
 *
 * @module connector-postgres/pg-shim
 */

/** One result column descriptor. */
export interface FieldDef {
  /** Column name as reported by PostgreSQL. */
  name: string
}

/** One statement result. */
export interface QueryResult<T> {
  /** Rows keyed by column name. */
  rows: T[]
  /** Column descriptors in result order. */
  fields: FieldDef[]
}

/** Options accepted by the driver's pool constructor. */
export interface PoolOptions {
  /** Server host name or address. */
  host: string
  /** Server TCP port. */
  port: number
  /** Database name. */
  database: string
  /** Role used for the connection. */
  user: string
  /** Password resolved for this call. */
  password: string
  /** Maximum pooled connections. */
  max: number
  /** Idle connection lifetime in milliseconds. */
  idleTimeoutMillis: number
  /** Connection establishment deadline in milliseconds. */
  connectionTimeoutMillis: number
  /** TLS settings, when the server requires TLS. */
  ssl?: { rejectUnauthorized: boolean }
  /** Application name reported to the server. */
  application_name: string
  /** Server-side session settings applied on connect. */
  options: string
}

/** Pooled connection handle. */
export interface PoolClient {
  /**
   * Run one statement.
   * @param text - statement text.
   * @param values - optional positional parameters.
   * @returns rows typed by the caller and the result field descriptors.
   */
  query<T = Record<string, unknown>>(text: string, values?: unknown[]): Promise<QueryResult<T>>
  /** Return the connection to the pool. */
  release(): void
}

/** Connection pool. */
export interface Pool {
  /**
   * Borrow one connection.
   * @returns the borrowed client.
   */
  connect(): Promise<PoolClient>
  /**
   * Close every connection.
   * @returns a promise settling when the pool drained.
   */
  end(): Promise<void>
}

/** Pool constructor as exported by the driver. */
export interface PoolConstructor {
  /**
   * @param options - connection settings for every pooled connection.
   */
  new (options: PoolOptions): Pool
}

/** The driver module surface this package depends on. */
export interface PostgresDriver {
  /** Pool constructor. */
  Pool: PoolConstructor
}
