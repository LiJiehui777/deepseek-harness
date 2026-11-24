---
description: "The pull stage of the MES pipeline: reads one order's data by key through the queries/*.sql definitions, builds the exact downstream message at pull time, and writes it into the shared review pool. Read-only; never pushes."
kind: "package-bundle"
---

# @deepseek-ai/dsh-tool-mes-pull

English | [中文](README.zh.md)

## Summary

`@deepseek-ai/dsh-tool-mes-pull` pulls one business key's MES data — usually a contract or order number — across configured modules and writes the result into the shared review pool. It builds the exact message the downstream system would receive while pulling, so a reviewer inspects and edits the message that is actually sent, not a source row that a later template would re-render. Mapping risks become recorded warnings instead of silent substitutions. It reads through `ctx.postgres`, writes to the pool, and pushes nothing.

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

Mount this plugin beside the [PostgreSQL connector](../tool-postgres-connector/README.md) it reads through. The common path is one call with a key: `mes_pull_by_key` runs every configured module, builds each message, and pools the rows.

### When to choose it

Choose it when an operator task starts from one MES business key and the result must pass a human before it leaves. A pull needs a mounted connector; without one the plugin still loads and a pull fails with a message naming what to install. It never judges data: rule screening belongs to the review gate.

### Minimal configuration

```yaml
- id: tool-mes-pull
  name: '@deepseek-ai/dsh-tool-mes-pull'
  config:
    enabled: true
    dbPath: /var/lib/dsh/mes-pipeline/work.db
```

`enabled` defaults to `false`. `dbPath` must name the same file every pipeline stage opens.

| Field | Default | Meaning |
|---|---|---|
| `enabled` | `false` | Whether pulls are allowed |
| `queriesPath` | the packaged `queries/` | Directory of `.sql` definitions, re-read on every call |
| `dbPath` | `$DSH_HOME/mes-pipeline/work.db` | Shared pool path; every stage must agree |
| `rowLimit` | `500` | Rows per module, 1 to 5000 |
| `exposeTools` | `true` | Register the four pull tools |

### Query definitions

One `.sql` file per module, maintained by whoever knows the schema, so changing what a pull returns needs no rebuild. The header declares the module name, a description, the push module it maps to, and the key type; `:key` and its aliases are replaced with an escaped literal. A file without a `-- @module` directive still pulls, and its payload becomes a copy of the source row with a warning that says so.

### What reaches the pool

Each row becomes one review item carrying the MES source row, the message that would be delivered, and the mapping warnings. `biz_key` is row-level unique, so several rows of one contract stay several review items. Re-pulling one key inserts nothing twice and never overwrites a message a person already edited.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

The stage converts every module before it writes once, so a partially failed pull cannot commit half its rows. One module failing does not stop the others: its error is reported in that module's entry and the overall result reports `ok: false`, while the readable modules still reach the pool.

Building the message here rather than in the delivery stage is what makes review meaningful. Chengxi field names mix cases and carry hardcoded constants and derived values — a plan period in days, a progress percentage, a procedure number assembled from operation and workshop — that a configuration template cannot express legibly. Every place the mapping cannot reproduce MES behaviour adds a warning rather than guessing: an unrecognized category, a missing required date, a cancelled work order, or a payload that will carry `null`.

### Source map

| File | Role |
|---|---|
| [`src/index.ts`](src/index.ts) | Plugin entry, `Config`, and the four pull tools |
| [`src/service.ts`](src/service.ts) | Opening the pool, `pullByKey`, batch reads, and per-module failure isolation |
| [`src/queries.ts`](src/queries.ts) | Reading `.sql` definitions, header directives, and placeholder binding |
| [`src/push-schema.ts`](src/push-schema.ts) | One payload builder per module, the row-level business key, and mapping warnings |

</details>

-----

<a id="further-exploration"></a>
## Further Exploration

- [Detailed pull contract](docs/DETAIL.md) — the module table, query directives, and failure semantics.
- [PostgreSQL connector](../tool-postgres-connector/README.md) — the read-only source `ctx.postgres` resolves to.
- [Interaction group map](../README.md) — the neighbouring pipeline and human-interaction packages.

-----

<a id="model-experience"></a>
## Model Experience

### Pull tools

#### What the model sees

Four tools are registered: `mes_list_queries` lists the module ids, display names, downstream interfaces, key types, and placeholders; `mes_pull_by_key` takes a key value, an optional key type, a module subset, a `persist` flag, and a row limit; `mes_read_batch` takes a batch id; `mes_list_batches` takes a limit. Every result is one text block carrying JSON.

#### Token effect

Four fixed definitions cost the same tokens on every request where the plugin is mounted with a tool registry. A pull result then adds one entry per module plus the collected warnings — not the pooled rows themselves, which stay in the database until a tool reads them back.

#### KV Cache effect

Prefix-stable while the shipped definitions and the `exposeTools` setting are unchanged; results append after the reusable prefix. Registering the tools under a different `exposeTools` value changes the prefix and makes earlier cached entries unreusable.

### Tool-call history and result

#### What the model sees

`mes_pull_by_key` returns the batch id, the key, the per-module row counts with each module's truncation flag and error, the inserted and skipped counts, the mapping warnings, and `ok`. With `persist: false` it previews the counts and writes nothing, and the batch id is `preview`. `mes_read_batch` returns the stored keys, statuses, source rows, and built messages.

#### Token effect

Arguments are retained for the rest of the session. `mes_read_batch` grows with the rows it returns and defaults to 200; a pull summary stays small regardless of how many rows were written.

#### KV Cache effect

Append-only: newly visible content follows the reusable request prefix and does not invalidate earlier entries.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

These limits decide when a pull is the wrong operation. They are current package constraints, not a backlog.

- **One key per pull** — there is no batch mode across several orders, and no scheduling: a pull runs when a caller or an operator asks for it.
- **No incremental fetch** — every pull re-reads the key's full result set from each `.sql` file; a module that needs only changed rows must express that in its own SQL.
- **One module is not scoped by the key** — the raw-material-stock query filters on material attribute alone, so pulling by contract returns that module's whole set. Pull it by material dimension instead.
- **Warnings block nothing** — a missing required date or an unrecognized category reaches the review pool as a warning, and the record is pooled like any other; the reviewer must read it.
- **`null` values reach the payload** — where MES itself sends `null`, the built message carries `null` and a warning, rather than a substituted value.
- **`biz_key` uniqueness depends on the row** — a module whose rows carry no recognizable identifier falls back to an index-based key, so a changed row order produces a different key and a duplicate review item.
- **Shared pool on one host** — the handover file is single-machine SQLite, as the [work database](../mes-pipeline-workdb/README.md) states.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

Placeholder escaping prevents an accidental quote from breaking a statement; it is not the read-only guarantee, which comes from the connector's statement guard. Adding a module means adding both the `.sql` definition and a builder in `src/push-schema.ts`; a module name in `-- @module` that no builder declares is reported rather than silently treated as a raw row.

</details>
