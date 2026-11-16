/**
 * The pull stage: read one order's data from MES by its key and pool it for
 * review.
 *
 * The stage reuses the read-only connector the PostgreSQL plugin provides, runs
 * the `queries/*.sql` definitions, and writes the results into the shared
 * review pool. Business screening, human review, and delivery belong to the
 * stages on either side, and this plugin deliberately performs none of them.
 *
 * @module @deepseek-ai/dsh-tool-mes-pull
 */

import type { Context } from '@deepseek-ai/cordis'
import Schema from '@deepseek-ai/schemastery'
import { defineTool } from '@deepseek-ai/dsh-tools'
import { resolveDatabasePath } from '@deepseek-ai/dsh-mes-pipeline-workdb'
import type {} from '@deepseek-ai/dsh-tool-postgres-connector'
import { MODULES } from './push-schema.ts'
import { MesPullService, packageRoot } from './service.ts'

export { MesPullService, packageRoot, pullByKey } from './service.ts'
export { DirectoryQuerySource, bindPlaceholders, buildParams, loadQueryDefinitions, parseQueryFile } from './queries.ts'
export { MODULES, PART_NAME_CODES, buildItems, businessKeyOf, codesByPartName, sgTime, workOrderStatus } from './push-schema.ts'
export type { PullOptions, PullResult, PullHealth, PooledItem } from './service.ts'
export type { QueryDefinition, QuerySource } from './queries.ts'
export type { BuiltPayload, MappingWarning, PulledItem, SourceRow } from './push-schema.ts'

/**
 * Deployment settings for the pull stage.
 *
 * Every field is changeable from `cordis.yml`; the directory of `.sql`
 * definitions and the shared pool path are the deployment-varying ones.
 */
export interface Config {
  /** Whether pulls are allowed. Off by default so a profile can show the form first. */
  enabled: boolean
  /** Directory holding the `.sql` definitions; omitted uses the bundled `queries/`. */
  queriesPath: string
  /** Shared pool path; omitted resolves `$DSH_HOME/mes-pipeline/work.db`. */
  dbPath: string
  /** Default rows per module. */
  rowLimit: number
  /** Whether to register the pull tools on this composition. */
  exposeTools: boolean
}

/** Defaults keep the stage installed but idle until it is enabled. */
export const Config: Schema<Config> = Schema.object({
  enabled: Schema.boolean().default(false),
  queriesPath: Schema.string().default(''),
  dbPath: Schema.string().default(''),
  rowLimit: Schema.natural().min(1).max(5000).default(500),
  exposeTools: Schema.boolean().default(true),
})

/** Loader identity. */
export const name = 'tool-mes-pull'

/**
 * Only the tool registry is required. The PostgreSQL connection is optional:
 * without it a pull reports an actionable error instead of failing to load, so
 * a profile can mount this stage before its connector is configured.
 */
export const inject = ['tools']

declare module '@deepseek-ai/cordis' {
  interface Context {
    /** Shared pull stage the tools and any future page use. */
    mesPull: MesPullService
  }
}

/** Tool output is one text block so the model cannot misread field semantics. */
const output = {
  schema: { type: 'string' as const },
  render: (_args: unknown, value: string) => [{ type: 'text' as const, text: value }],
}

/**
 * Install the pull stage and, by default, its tools.
 * @param ctx - composition owning the stage and its registrations.
 * @param config - deployment settings.
 */
export function apply(ctx: Context, config: Config): void {
  const log = ctx.logger(name)
  const service = new MesPullService({
    enabled: config.enabled,
    queriesPath: config.queriesPath.trim() === '' ? `${packageRoot()}/queries` : config.queriesPath.trim(),
    dbPath: resolveDatabasePath(config.dbPath),
    rowLimit: config.rowLimit,
    log: (message) => { log.info('%s', message) },
    // Read the service lazily: the connector may mount after this stage, and
    // resolving it per call keeps that ordering irrelevant.
    runner: () => ctx.get('postgres'),
  })
  ctx.effect(() => () => { service.dispose() }, 'mes pull: close the pool')
  ctx.effect(() => {
    ctx.provide('mesPull', service)
    return () => { ctx.provide('mesPull', undefined) }
  }, 'mes pull: provide the service')
  if (config.exposeTools) registerTools(ctx, service)
}

/**
 * Register the pull tools.
 * @param ctx - composition owning the tool registrations.
 * @param service - the pull stage the tools drive.
 */
function registerTools(ctx: Context, service: MesPullService): void {
  ctx.tools.register(defineTool({
    name: 'mes_list_queries',
    description: 'List the MES query modules this pull stage is configured with. Each module is one .sql file and reports its id, display name, the downstream push interface it maps to, the key types it accepts, and the placeholders it uses. Call this before pulling.',
    parameters: {},
    output,
    async execute() {
      const queries = await service.listQueries()
      const definitions = queries.map((query) => {
        const mapping = MODULES[query.module]
        return {
          id: query.id,
          name: query.name,
          description: query.description,
          pushModule: query.module,
          pushInterface: mapping === undefined ? '' : mapping.pushPath,
          keyType: query.keyType,
          placeholders: query.placeholders,
          file: query.file,
        }
      })
      return JSON.stringify({ directory: service.queriesDirectory, count: queries.length, queries: definitions })
    },
  }))

  ctx.tools.register(defineTool({
    name: 'mes_pull_by_key',
    description: 'Pull one key\'s MES data (usually a contract or order number) across the configured modules and build the exact message that would be delivered downstream, then write it into the shared review pool. Pass queries to run only some modules. One module failing does not stop the others; its error is reported in that module\'s entry. Returned warnings are mapping risks such as an unrecognized category or a missing required date; they also appear in the review pool and must not be ignored. This tool only reads the database and sends nothing.',
    parameters: {
      key_value: { type: 'string', required: true, description: 'The key value, such as "ZTHL20260518039".' },
      key_type: { type: 'string', description: 'Key type; omitted uses the type the query definition declares.' },
      queries: { type: 'array', items: { type: 'string' }, description: 'Only run these module ids. Use mes_list_queries to see them.' },
      persist: { type: 'boolean', description: 'Whether to write to the review pool. Defaults to true; false previews counts and stores nothing.' },
      row_limit: { type: 'number', description: 'Rows per module; omitted uses the configured limit.' },
    },
    output,
    async execute(args) {
      const result = await service.pull({
        keyValue: args.key_value,
        ...args.key_type === undefined ? {} : { keyType: args.key_type },
        ...args.queries === undefined ? {} : { queries: args.queries },
        persist: args.persist !== false,
        ...args.row_limit === undefined ? {} : { rowLimit: args.row_limit },
      })
      return JSON.stringify(result)
    },
  }))

  ctx.tools.register(defineTool({
    name: 'mes_read_batch',
    description: 'Read what one pull wrote into the review pool. The mapped field is the message that would be delivered; source is the MES row it came from. Use the batch id that mes_pull_by_key returned.',
    parameters: {
      batch_id: { type: 'string', required: true, description: 'The batch id mes_pull_by_key returned.' },
      query_id: { type: 'string', description: 'Read only one module by name; omit to read all of them.' },
      limit: { type: 'number', description: 'Maximum rows; defaults to 200.' },
    },
    output,
    async execute(args) {
      const items = await service.readBatch(args.batch_id, args.query_id, args.limit ?? 200)
      return JSON.stringify({ count: items.length, items })
    },
  }))

  ctx.tools.register(defineTool({
    name: 'mes_list_batches',
    description: 'List recent pulls with their key, time, and how many items each wrote. Use this to look back at which orders were already pulled.',
    parameters: {
      limit: { type: 'number', description: 'Maximum rows; defaults to 20.' },
    },
    output,
    async execute(args) {
      const batches = await service.listBatches(args.limit ?? 20)
      return JSON.stringify({ count: batches.length, batches })
    },
  }))
}
