---
description: "The read-only PostgreSQL data source other plugins and the built-in postgres_* tools read through, with credential-reference passwords, single-statement safety, and bounded results."
kind: "package-bundle"
---

# @deepseek-ai/dsh-tool-postgres-connector

English | [中文](README.zh.md)

## Summary

`@deepseek-ai/dsh-tool-postgres-connector` gives other plugins read-only PostgreSQL access: it owns the connection pool, resolves the password from a credential reference, refuses every statement that is not a single read-only `SELECT`, and bounds each result by row count and server-side deadline. A deployment that needs production data mounts it and either calls `ctx.postgres` directly or lets the four built-in `postgres_*` tools read schemas, describe relations, and run one bounded query. It never writes, never returns a password, and makes no business decision.

## Table of Contents

- [Use this package](#use-this-package)
- [Understand the implementation](#understand-the-implementation)
- [Further Exploration](#further-exploration)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="use-this-package"></a>
## Use this package

Mount this plugin when a plugin or an operator task must read a PostgreSQL database the deployment owns. The mount provides the `ctx.postgres` service and, with `exposeTools` at its default, registers four read tools for the model.

### When to choose it

Choose it when a composition needs database reads and nothing else: it offers no write, DDL, or administrative operation, so changing data needs a different action with its own confirmation path. The [MES pull stage](../tool-mes-pull/README.md) is the shipped consumer; any other plugin that owns its SQL can call `ctx.postgres` directly.

### Minimal configuration

```yaml
- id: tool-postgres-connector
  name: '@deepseek-ai/dsh-tool-postgres-connector'
  config:
    enabled: true
    host: mes-db.example.invalid
    port: 5432
    database: mes
    user: mes_reader
    passwordEnv: MES_PG_PASSWORD
```

The settings page is available before the connection is configured. Set `enabled: false` to refuse reads. `passwordEnv` names a credential reference; it does not store a password.

| Field | Default | Meaning |
|---|---|---|
| `enabled` | `true` | Whether this connection may issue statements |
| `host` | empty | PostgreSQL host name or address |
| `port` | empty | PostgreSQL TCP port |
| `database` | empty | Database name to connect to |
| `user` | empty | Role the connection authenticates as |
| `passwordEnv` | `MES_PG_PASSWORD` | Credential reference resolved on every call |
| `ssl` | `false` | Require TLS with certificate verification |
| `maxConnections` | `4` | Pooled connection ceiling, 1 to 16 |
| `maxRows` | `500` | Rows one statement may return, 1 to 10000 |
| `timeoutMs` | `30000` | Server-enforced statement deadline, in milliseconds |
| `exposeTools` | `true` | Register the four built-in read tools |

Before each read the plugin checks the host, port, database, role, and credential reference together. Saved connection changes apply without a restart. If settings change during credential lookup, retry the rejected read.

### The service other plugins call

`ctx.postgres` offers `settings`, `testConnection()`, `listSchemas()`, `listTables(schema, page, pageSize)`, `describeTable(schema, table)`, and `query(sql, limit)`. `query` returns `rows`, `columns`, `rowCount`, `truncated`, `limit`, and `elapsedMs`; `truncated` is the only signal that the connector dropped rows. A disabled account, a missing credential, or an unreachable server rejects the call with a message naming what to fix.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

The connector is a data source, not an SQL console. Three layers decide what a read may do, and each layer holds on its own: the statement guard rejects anything that is not one read-only `SELECT`, the gateway wraps every statement in a read-only transaction on a connection that sets `default_transaction_read_only=on`, and PostgreSQL enforces the statement deadline the pool was built with.

The guard blanks string literals, quoted identifiers, and comments before it scans for denied keywords, so `WHERE note = 'DROP TABLE users'` passes and a writable CTE is refused for the `INSERT` it really contains. The row cap is applied by wrapping the accepted statement in an outer `SELECT ... LIMIT n+1`, so a trailing comment or clause cannot escape it and one extra row makes truncation observable.

The connector resolves the password for the same settings snapshot that owns the gateway. If that password changes, the gateway opens a new pool and drains the previous one. The `pg` driver loads on the first read rather than at mount, which keeps a deployment without the driver loadable and turns a missing dependency into one actionable error instead of a failed plugin.

### Source map

| File | Role |
|---|---|
| [`src/index.ts`](src/index.ts) | Plugin entry, `Config`, the `ctx.postgres` service, and the four read tools |
| [`src/statement.ts`](src/statement.ts) | Statement acceptance, the effective row limit, and the wrapping `LIMIT` |
| [`src/gateway.ts`](src/gateway.ts) | Pool, read-only transactions, metadata queries, and the lazy driver import |
| [`src/types.ts`](src/types.ts) | The metadata and result values consumers receive |
| [`src/pg-shim.ts`](src/pg-shim.ts) | The minimal driver surface this package types against |

</details>

-----

<a id="further-exploration"></a>
## Further Exploration

- [Detailed connector contract](docs/DETAIL.md) — the statement guard order, pool settings, and service method by method.
- [MES pull stage](../tool-mes-pull/README.md) — the shipped consumer of `ctx.postgres`.
- [Credentials subsystem](../../../docs/subsystems/credentials.md) — where `passwordEnv` resolves and how a reference is stored.
- [Interaction group map](../README.md) — the neighbouring human-interaction and pipeline packages.

-----

<a id="model-experience"></a>
## Model Experience

### Tool definitions

#### What the model sees

With `exposeTools` at its default, four tools are registered: `postgres_list_schemas`, `postgres_list_tables`, `postgres_describe_table`, and `postgres_query`. Their arguments are schema and relation names, a page number and page size for relation pages, and for `postgres_query` one `SELECT` text plus an optional row limit. Each result is a single text block carrying the JSON the service returned.

#### Token effect

Four fixed definitions cost the same tokens on every request where the connector is mounted with `exposeTools` and a tool registry. Each call then adds its arguments and its result, and `maxRows` caps how many rows that result carries.

#### KV Cache effect

Prefix-stable while the shipped definitions and the `exposeTools` setting are unchanged; results append after the reusable prefix. Setting `exposeTools: false` or unloading the connector row removes the definitions and makes earlier cached entries unreusable from that point.

### Tool-call history and result

#### What the model sees

The assistant call keeps the arguments, including the complete statement text. The result is the JSON of `query` — `rows`, `columns`, `rowCount`, `truncated`, `limit`, and `elapsedMs` — or the metadata objects of the three listing tools. A refusal or a server failure arrives as one error message, and no message carries the password.

#### Token effect

Arguments are retained for the rest of the session, and result size grows with the rows returned until `maxRows` stops it. Nothing is streamed, so one call adds its whole result at once.

#### KV Cache effect

Append-only: newly visible content follows the reusable request prefix and does not invalidate earlier entries.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

These limits decide when the connector is the wrong tool. They are current package constraints, not a backlog.

- **One connection per installation** — every composition in the process shares one host, database, role, and pool; there is no per-session or per-tenant account switch.
- **`pg` loads on first read** — the driver is not a declared dependency, so a deployment without it still mounts and shows settings, and the first read fails with an install message rather than a connection.
- **One statement per call** — a call cannot return several result sets, and a text holding two statements is refused instead of split.
- **A statement failure returns the driver's message** — the text can quote statement fragments, because the guard lives before the driver and nothing rewrites the reply afterwards; the password never appears, since it reaches only the pool.
- **Row bounds, not byte bounds** — `maxRows` and `truncated` bound the row count, and one very wide row can still be large.
- **Driver default type conversion** — `bytea` and high-precision `numeric` values reach the consumer in the driver's own representation, with no normalization added here.
- **PostgreSQL only** — the statement guard, the catalog queries, and the pool options are PostgreSQL-specific.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

The driver is imported through a computed specifier so the package type-checks and loads where `pg` is absent; making it a static import would turn a missing optional driver into a failed plugin mount. In the statement guard, the row-lock clause is checked before the denied-verb scan: checking it afterwards reports the `update` inside `FOR UPDATE` and hides the real reason for the refusal.

</details>
