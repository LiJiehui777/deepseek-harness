---
description: "The shared SQLite handover tables the MES pipeline stages write and read, so the pull, review, and push stages agree on one file, one set of statuses, and one migration rule."
kind: "package-library"
---

# @deepseek-ai/dsh-mes-pipeline-workdb

English | [中文](README.zh.md)

## Summary

`@deepseek-ai/dsh-mes-pipeline-workdb` owns the handover agreement of the MES review pipeline: where the shared SQLite file lives, which tables and indexes it contains, what each status string means, and how a transaction and an additive migration run. The stages hand work to each other through that file instead of through cross-plugin calls, so the pull stage, the review gate, and the delivery stage stay independently installable, startable, and testable. The package holds the agreement only: no stage logic, and no model-facing contribution of its own.

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

Import it as an ordinary workspace dependency from a pipeline stage. It exports a plain module API: no Cordis service, no tool, and no `cordis.yml` row.

### When to use it

Use it in every package that touches the shared database — the pull stage, the review gate, and the delivery stage — so one table definition, one status vocabulary, and one path resolver serve all of them. A stage that only formats a message has no reason to open the database and no reason to import this package.

### Opening the shared database

`resolveDatabasePath(override)` turns each plugin's optional path setting into the one path every stage must agree on: an explicit `*.db` path is used as given, any other value is treated as the containing directory, and an omitted value resolves to `$DSH_HOME/mes-pipeline/work.db`. `openWorkDatabase({ dbPath, busyTimeoutMs, log })` creates that directory owner-only, opens the file in WAL mode, applies the busy timeout and foreign keys, runs the table definitions, and then applies the additive migration. Open once per plugin and keep the returned `close()` for plugin teardown.

### Writing and reading

`inTransaction(db, work)` takes the write lock with `BEGIN IMMEDIATE` before running `work`, so a stage that reads and then writes cannot deadlock against another stage upgrading a read lock; it rolls back and rethrows on failure. `now()` produces the local-zone ISO-8601 timestamps every `*_at` column stores, and `parseJson(text, fallback)` reads a JSON payload column without throwing on a hand-edited row.

`STATUS` holds the review pool's four states, `PUSH_STATUS` the three delivery states on `push_record`, and `ACTION` the recorded review actions. `PENDING` and `BLOCKED` both mean "not decided yet": a stage must not read `BLOCKED` as a final rejection, because a person may still force the record through.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

Opening is synchronous because each stage opens the file while the plugin mounts, where only synchronous registration is allowed; an asynchronous form would push tool registration behind a promise and leave services undefined for the first caller.

`review_item` carries `UNIQUE(module, biz_key)`, so re-pulling one order cannot overwrite what a person already edited, and `push_record` carries `UNIQUE(module, biz_key, target)`, which is the physical duplicate-delivery guard. `biz_key` must be row-level unique: a contract number alone collapses several rows of one contract into one review item.

### Source map

| File | Role |
|---|---|
| [`src/schema.ts`](src/schema.ts) | Data directory, table and index definitions, and the status and action vocabularies |
| [`src/index.ts`](src/index.ts) | Path resolution, open and migrate, transactions, timestamps, JSON reads |

</details>

-----

<a id="further-exploration"></a>
## Further Exploration

- [Pipeline contract](../tool-review-gate/CONTRACT.md) — the cross-package agreement these tables implement.
- [Interaction group map](../README.md) — the stage packages that consume this agreement.
- [Storage subsystem](../../../docs/subsystems/storage.md) — the Harness storage backends, which this pipeline deliberately does not use.

-----

<a id="model-experience"></a>
## Model Experience

### No model-facing contribution of its own

#### What the model sees

Nothing is contributed by this package. It registers no tool definition, no system-prompt section, and no session event, so no request grows or changes because it is mounted. What a model eventually sees of these tables is owned by the stage packages: `tool-mes-pull` renders a pull summary, `tool-review-gate` renders its four review tools, and `tool-downstream-push` renders its four delivery tools. The strings this package defines — `STATUS`, `PUSH_STATUS`, and `ACTION` — reach a model only if a stage chooses to print them.

#### Token effect

Zero direct tokens. The package adds no schema, no prompt text, and no result content of its own; every token attributed to the pipeline comes from the stage tools that a deployment mounts.

#### KV Cache effect

Independent. This package cannot invalidate a reusable prefix, because it contributes nothing to a request. Whether the pipeline's tool definitions keep a stable prefix is decided by the three stage packages that own them.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

These constraints define what the handover file can and cannot promise. They are current package limits, not a backlog.

- **One database per installation** — the path is deployment configuration with no per-account or per-tenant isolation, so two deployments sharing one `$DSH_HOME` share one queue.
- **`node:sqlite` is required** — the agreement targets the Node built-in driver and carries no fallback to a third-party driver.
- **Migrations are additive only** — `migrate` adds missing columns and never rewrites a meaning, so a release that changes what a column means needs a new column instead.
- **One writer at a time** — WAL mode lets readers proceed, but every write serializes behind the busy timeout, so a slow batch insert delays the other stages.
- **No cleanup of old rows** — the pool and the delivery queue grow without bound; nothing here prunes decided records, so retention is the deployment's problem.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

Each stage used to ship its own copy of this module, which made one agreement into four files that had to be edited together. They now depend on this package, so a change to a table, a status, or a migration rule happens in one place.

</details>
