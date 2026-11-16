/**
 * Query definitions read from a directory of `.sql` files.
 *
 * One `.sql` file per business module, maintained by whoever knows the schema.
 * The plugin only substitutes escaped literals for `:key` placeholders and hands
 * the statement to the read-only connector.
 *
 * Keeping the SQL in files rather than in code matters: a join across a dozen
 * tables is unmaintainable as a JavaScript string, changing what a pull returns
 * needs no rebuild, and the business rules stay separable from this code.
 *
 * @module @deepseek-ai/dsh-tool-mes-pull/queries
 */

import { readFile, readdir } from 'node:fs/promises'
import { basename, extname, join } from 'node:path'

/**
 * A `:name` placeholder.
 *
 * The negative lookbehind excludes PostgreSQL casts, so the `:date` inside
 * `now()::date` is not mistaken for a placeholder.
 */
const PLACEHOLDER = /(?<!:):([a-zA-Z_][a-zA-Z0-9_]*)(?!:)/g

/** A header directive line: `-- @name: 报工信息`, `-- @module: workReport`. */
const DIRECTIVE = /^\s*--\s*@(name|desc|key|module)\s*:\s*(.*)$/

/** One query module parsed from a `.sql` file. */
export interface QueryDefinition {
  /** Module id, taken from the file name. */
  id: string
  /** Display name from `-- @name`, defaulting to the id. */
  name: string
  /** Free-text description from `-- @desc`. */
  description: string
  /** Key type this query expects, from `-- @key`. */
  keyType: string
  /** Push module this query maps to, from `-- @module`; empty means raw rows only. */
  module: string
  /** Placeholder names the file uses, sorted and deduplicated. */
  placeholders: string[]
  /** The complete file text. */
  sql: string
  /** Absolute path of the file. */
  file: string
}

/** Directory that holds one `.sql` file per module. */
export interface QuerySource {
  /** Absolute path of the directory. */
  readonly directory: string
  /**
   * Read every definition, re-reading the disk so an edit applies to the next pull.
   * @returns definitions ordered by file name.
   */
  list(): Promise<QueryDefinition[]>
}

/**
 * Parse one `.sql` file's header directives and placeholders.
 * @param id - module id, taken from the file name.
 * @param file - absolute path of the file.
 * @param text - the file contents.
 * @returns the parsed definition.
 */
export function parseQueryFile(id: string, file: string, text: string): QueryDefinition {
  let queryName = id
  let description = ''
  let keyType = 'contract_no'
  let module = ''
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim().startsWith('--')) {
      if (line.trim() !== '') break
      continue
    }
    const match = DIRECTIVE.exec(line)
    if (match === null) continue
    const key = match[1]
    const value = (match[2] ?? '').trim()
    if (key === 'name') queryName = value
    else if (key === 'desc') description = value
    else if (key === 'key') keyType = value
    else if (key === 'module') module = value
  }
  const placeholders = [...new Set([...text.matchAll(PLACEHOLDER)].flatMap(match => match[1] ?? []))].sort()
  return { id, name: queryName, description, keyType, module, placeholders, sql: text, file }
}

/**
 * Read every `.sql` definition in a directory.
 * @param directory - the directory to read.
 * @returns definitions ordered by file name.
 * @throws Error when the directory cannot be read.
 */
export async function loadQueryDefinitions(directory: string): Promise<QueryDefinition[]> {
  const names = await readdir(directory)
  const files = names.filter(name => extname(name).toLowerCase() === '.sql').sort()
  const definitions: QueryDefinition[] = []
  for (const fileName of files) {
    const file = join(directory, fileName)
    definitions.push(parseQueryFile(basename(fileName, extname(fileName)), file, await readFile(file, 'utf8')))
  }
  return definitions
}

/** Query definitions read from a directory on every call, so edits apply immediately. */
export class DirectoryQuerySource implements QuerySource {
  /**
   * @param directory - absolute path of the directory holding the `.sql` files.
   */
  constructor(readonly directory: string) {}

  /**
   * List every definition.
   * @returns the definitions, freshly read.
   */
  async list(): Promise<QueryDefinition[]> {
    return loadQueryDefinitions(this.directory)
  }
}

/**
 * Build placeholder values for one definition.
 *
 * `:key` is the generic trigger, and the well-known key names are aliases for
 * it so a query need not care which field name the caller used.
 * @param definition - the definition being run.
 * @param keyValue - the value to substitute.
 * @param keyType - the key's type.
 * @returns placeholder name to value.
 */
export function buildParams(
  definition: QueryDefinition,
  keyValue: string,
  keyType: string,
): Record<string, string> {
  const aliases: Record<string, string> = {
    key: keyValue,
    keyValue,
    contractNo: keyValue,
    contract_no: keyValue,
    orderNo: keyValue,
    order_no: keyValue,
    keyType,
    key_type: keyType,
  }
  const used: Record<string, string> = {}
  for (const placeholder of definition.placeholders) {
    const value = aliases[placeholder]
    if (value !== undefined) used[placeholder] = value
  }
  return used
}

/**
 * Substitute `:name` placeholders with escaped SQL literals.
 *
 * This guards against accidental mistyping only; the read-only guarantee comes
 * from the connector, which rejects any statement that is not a single SELECT.
 * @param sql - the statement containing placeholders.
 * @param params - placeholder values.
 * @returns the statement with literals substituted.
 * @throws Error when a placeholder has no value.
 */
export function bindPlaceholders(sql: string, params: Record<string, string>): string {
  const missing: string[] = []
  const bound = sql.replace(PLACEHOLDER, (whole, name: string) => {
    const value = params[name]
    if (value === undefined || value === '') {
      missing.push(name)
      return whole
    }
    return `'${value.replaceAll("'", "''")}'`
  })
  if (missing.length > 0) {
    throw new Error(`Query is missing a value for: ${[...new Set(missing)].join(', ')}`)
  }
  return bound
}
