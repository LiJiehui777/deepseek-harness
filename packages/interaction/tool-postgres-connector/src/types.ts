/** Stable projections of PostgreSQL metadata and query results for connector consumers. */

/** One database schema the configured account can see. */
export interface PostgresSchema {
  /** Schema name, for example `public` or `mes`. */
  name: string
  /** Owner role reported by PostgreSQL, when readable. */
  owner: string | null
}

/** One relation (table or view) inside a schema. */
export interface PostgresTable {
  /** Schema the relation belongs to. */
  schema: string
  /** Relation name. */
  name: string
  /** `table`, `view`, `materialized view`, `partitioned table` or `foreign table`. */
  kind: string
  /** Relation comment, empty string when PostgreSQL has none. */
  comment: string
  /** Approximate live row count; null when statistics are unavailable. */
  estimatedRows: number | null
}

/** One column of a relation. */
export interface PostgresColumn {
  /** Column name. */
  name: string
  /** Formatted data type, such as `character varying(64)` or `numeric(12,3)`. */
  type: string
  /** Whether PostgreSQL reports the column as nullable. */
  nullable: boolean
  /** Column default expression, null when the column has none. */
  defaultValue: string | null
  /** Column comment, empty string when PostgreSQL has none. */
  comment: string
}

/** Full description of one relation, used before writing a query. */
export interface PostgresTableDetail {
  /** Schema the relation belongs to. */
  schema: string
  /** Relation name. */
  name: string
  /** Relation kind, matching {@link PostgresTable.kind}. */
  kind: string
  /** Relation comment, empty string when absent. */
  comment: string
  /** Columns in declaration order. */
  columns: PostgresColumn[]
  /** Primary-key column names; empty when the relation has no primary key. */
  primaryKey: string[]
}

/** Outcome of one read-only statement. */
export interface PostgresQueryResult {
  /** Result rows as plain JSON objects keyed by column name. */
  rows: Array<Record<string, unknown>>
  /** Column names in result order. */
  columns: string[]
  /** Number of rows returned after the connector's row cap. */
  rowCount: number
  /** True when the statement returned more rows than the configured cap. */
  truncated: boolean
  /** Effective row limit applied to the statement. */
  limit: number
  /** Statement execution time reported by the driver, in milliseconds. */
  elapsedMs: number
}
