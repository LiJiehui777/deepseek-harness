import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { openWorkDatabase, type WorkDatabase } from '@deepseek-ai/dsh-mes-pipeline-workdb'
import { DirectoryQuerySource, type QueryDefinition } from '../src/queries.ts'
import { pullByKey, type ReadRunner } from '../src/service.ts'
import type { SourceRow } from '../src/push-schema.ts'

let root: string
let queriesDirectory: string
const handles: WorkDatabase[] = []

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'dsh-mes-pull-service-'))
  queriesDirectory = join(root, 'queries')
  handles.length = 0
})

afterEach(async () => {
  for (const handle of handles.splice(0)) handle.close()
  await rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 })
})

/** Write one `.sql` definition per entry and return the directory source over them. */
async function source(files: Record<string, string>): Promise<DirectoryQuerySource> {
  await mkdir(queriesDirectory, { recursive: true })
  for (const [name, body] of Object.entries(files)) {
    await writeFile(join(queriesDirectory, name), body, 'utf8')
  }
  return new DirectoryQuerySource(queriesDirectory)
}

/** The open pool for this test, registered for teardown. */
function db() {
  const handle = openWorkDatabase({ dbPath: join(root, 'work.db') })
  handles.push(handle)
  return handle.db
}

/** Every business key currently pooled, oldest first. */
function readKeys(): Array<string> {
  return (db().prepare('SELECT biz_key FROM review_item ORDER BY id').all() as Array<{ biz_key: string }>)
    .map(row => row.biz_key)
}

/**
 * A read-only runner over a fixed statement-to-rows map. Records every
 * statement it was asked to run, so a test can prove what reached the connector.
 */
function runner(rows: Record<string, SourceRow[]> = {}, options: { fail?: string; truncated?: boolean } = {}) {
  const asked: Array<{ sql: string; limit: number | undefined }> = []
  const run: ReadRunner = {
    query(sql, limit) {
      asked.push({ sql, limit })
      if (options.fail !== undefined && sql.includes(options.fail)) {
        return Promise.reject(new Error(`relation "${options.fail}" does not exist`))
      }
      const match = Object.entries(rows).find(([marker]) => sql.includes(marker))
      return Promise.resolve({ rows: match === undefined ? [] : match[1], truncated: options.truncated === true })
    },
  }
  return { asked, run }
}

/** Options for one pull, with persistence on by default. */
function pullOptions(overrides: { persist?: boolean; queries?: string[]; rowLimit?: number; keyType?: string; keyValue?: string } = {}) {
  return {
    keyValue: 'HT-1',
    persist: true,
    ...overrides,
  }
}

describe('pullByKey, isolation between modules', () => {
  it('still returns the readable modules when one module fails', async () => {
    const queries = await source({
      '10_ok.sql': '-- @name: 工单\n-- @module: workOrder\nSELECT * FROM t WHERE c = :key',
      '20_broken.sql': '-- @name: 坏模块\n-- @module: workReport\nSELECT * FROM broken_table WHERE c = :key',
    })
    const { run } = runner({ 'FROM t': [{ optaskNo: 'OPT-1' }] }, { fail: 'broken_table' })
    const result = await pullByKey({ db: db(), runner: run, source: queries }, pullOptions())
    expect(result.ok).toBe(false)
    const broken = result.modules.find(module => module.queryId === '20_broken')
    expect(broken?.error).toContain('broken_table')
    expect(broken?.rowCount).toBe(0)
    const ok = result.modules.find(module => module.queryId === '10_ok')
    expect(ok?.error).toBeUndefined()
    expect(ok?.rowCount).toBe(1)
  })

  it('reports the error per module without aborting the sweep', async () => {
    const queries = await source({
      '10_a.sql': '-- @module: workOrder\nSELECT 1 FROM a',
      '20_b.sql': '-- @module: workOrder\nSELECT 1 FROM bad',
      '30_c.sql': '-- @module: workOrder\nSELECT 1 FROM c',
    })
    const { run, asked } = runner({ 'FROM a': [{ optaskNo: 'A' }], 'FROM c': [{ optaskNo: 'C' }] }, { fail: 'FROM bad' })
    const result = await pullByKey({ db: db(), runner: run, source: queries }, pullOptions())
    // Every module was attempted, including the one after the failure.
    expect(asked).toHaveLength(3)
    expect(result.modules.map(module => module.error === undefined)).toEqual([true, false, true])
  })

  it('reports a missing placeholder value as that module failing', async () => {
    const queries = await source({ '10_a.sql': '-- @module: workOrder\nSELECT 1 WHERE a = :mystery' })
    const { run } = runner()
    const result = await pullByKey({ db: db(), runner: run, source: queries }, pullOptions())
    expect(result.ok).toBe(false)
    expect(result.modules[0]?.error).toContain('missing a value for: mystery')
  })
})

describe('pullByKey, persistence', () => {
  it('deduplicates on (module, biz_key) so a second pull inserts nothing', async () => {
    const queries = await source({ '10_a.sql': '-- @module: workOrder\nSELECT 1 WHERE c = :key' })
    const { run } = runner({ SELECT: [{ optaskNo: 'OPT-1' }] })
    const handle = db()
    const first = await pullByKey({ db: handle, runner: run, source: queries }, pullOptions())
    expect(first.inserted).toBe(1)
    expect(first.skipped).toBe(0)
    const second = await pullByKey({ db: handle, runner: run, source: queries }, pullOptions())
    expect(second.inserted).toBe(0)
    expect(second.skipped).toBe(1)
    const total = handle.prepare('SELECT COUNT(*) AS n FROM review_item').get() as { n: number }
    expect(Number(total.n)).toBe(1)
  })

  it('writes the pulled payload, source row and warnings the review pool reads', async () => {
    const queries = await source({ '10_a.sql': '-- @module: workOrder\nSELECT 1 WHERE c = :key' })
    const { run } = runner({ SELECT: [{ optaskNo: 'OPT-1', state: '99unknown' }] })
    const handle = db()
    const result = await pullByKey({ db: handle, runner: run, source: queries }, pullOptions())
    const row = handle.prepare('SELECT * FROM review_item').get() as Record<string, unknown>
    expect(row['module']).toBe('工单')
    expect(row['biz_key']).toBe('OPT-1')
    expect(row['status']).toBe('pending')
    expect(row['batch_id']).toBe(result.batchId)
    expect(JSON.parse(String(row['source_payload']))).toEqual({ optaskNo: 'OPT-1', state: '99unknown' })
    expect(JSON.parse(String(row['mapped_payload']))).toMatchObject({ woNo: 'OPT-1' })
    expect(JSON.parse(String(row['warnings']))).toHaveLength(1)
  })

  it('writes one pull_batch row naming the modules that ran', async () => {
    const queries = await source({
      '10_a.sql': '-- @module: workOrder\nSELECT 1 FROM a',
      '20_b.sql': '-- @module: 工单\nSELECT 1 FROM b',
    })
    const { run } = runner({ 'FROM a': [{ optaskNo: 'A' }], 'FROM b': [{ optaskNo: 'B' }] })
    const handle = db()
    const result = await pullByKey({ db: handle, runner: run, source: queries }, pullOptions())
    const batch = handle.prepare('SELECT * FROM pull_batch').get() as Record<string, unknown>
    expect(batch['id']).toBe(result.batchId)
    expect(batch['key_value']).toBe('HT-1')
    expect(batch['key_type']).toBe('contract_no')
    expect(JSON.parse(String(batch['queries']))).toEqual(['10_a', '20_b'])
    expect(Number(batch['item_count'])).toBe(result.inserted)
  })

  it('writes nothing in a preview run', async () => {
    const queries = await source({ '10_a.sql': '-- @module: workOrder\nSELECT 1 WHERE c = :key' })
    const { run } = runner({ SELECT: [{ optaskNo: 'OPT-1' }] })
    const handle = db()
    const result = await pullByKey({ db: handle, runner: run, source: queries }, pullOptions({ persist: false }))
    expect(result.batchId).toBe('preview')
    expect(result.inserted).toBe(0)
    expect(result.skipped).toBe(0)
    // The counts are still reported, because a preview is what an operator checks.
    expect(result.totalRows).toBe(1)
    expect(result.modules[0]?.rowCount).toBe(1)
    const items = handle.prepare('SELECT COUNT(*) AS n FROM review_item').get() as { n: number }
    const batches = handle.prepare('SELECT COUNT(*) AS n FROM pull_batch').get() as { n: number }
    expect(Number(items.n)).toBe(0)
    expect(Number(batches.n)).toBe(0)
  })

  it('leaves a human-edited row untouched on a re-pull', async () => {
    const queries = await source({ '10_a.sql': '-- @module: workOrder\nSELECT 1 WHERE c = :key' })
    const { run } = runner({ SELECT: [{ optaskNo: 'OPT-1' }] })
    const handle = db()
    await pullByKey({ db: handle, runner: run, source: queries }, pullOptions())
    handle.prepare("UPDATE review_item SET mapped_payload = '{\"edited\":true}'").run()
    await pullByKey({ db: handle, runner: run, source: queries }, pullOptions())
    const row = handle.prepare('SELECT mapped_payload FROM review_item').get() as { mapped_payload: string }
    expect(JSON.parse(row.mapped_payload)).toEqual({ edited: true })
  })

  it('commits every module in one transaction, so a failed write leaves nothing behind', async () => {
    const queries = await source({
      '10_a.sql': '-- @module: workOrder\nSELECT 1 FROM a',
      '20_b.sql': '-- @module: workOrder\nSELECT 1 FROM b',
    })
    const { run } = runner({ 'FROM a': [{ optaskNo: 'A' }], 'FROM b': [{ optaskNo: 'B' }] })
    const handle = db()
    // A view that fails on the second insert makes the write itself fail.
    handle.exec(`
      CREATE TRIGGER reject_b BEFORE INSERT ON review_item
      WHEN NEW.biz_key = 'B'
      BEGIN SELECT RAISE(ABORT, 'rejected by trigger'); END;
    `)
    await expect(pullByKey({ db: handle, runner: run, source: queries }, pullOptions()))
      .rejects.toThrow(/rejected by trigger/)
    const items = handle.prepare('SELECT COUNT(*) AS n FROM review_item').get() as { n: number }
    expect(Number(items.n)).toBe(0)
  })
})

describe('pullByKey, statement construction', () => {
  it('binds the key and passes the row limit to the runner', async () => {
    const queries = await source({ '10_a.sql': '-- @module: workOrder\nSELECT 1 WHERE c = :key' })
    const { run, asked } = runner()
    await pullByKey({ db: db(), runner: run, source: queries }, pullOptions({ rowLimit: 25 }))
    expect(asked[0]?.sql).toContain("c = 'HT-1'")
    expect(asked[0]?.limit).toBe(25)
  })

  it('defaults the row limit when the caller gives none', async () => {
    const queries = await source({ '10_a.sql': '-- @module: workOrder\nSELECT 1 WHERE c = :key' })
    const { run, asked } = runner()
    await pullByKey({ db: db(), runner: run, source: queries }, pullOptions())
    expect(asked[0]?.limit).toBe(500)
  })

  it('uses the declared key type unless the caller overrides it', async () => {
    const queries = await source({ '10_a.sql': '-- @module: workOrder\n-- @key: order_no\nSELECT 1 WHERE c = :keyType' })
    const { run, asked } = runner()
    const handle = db()
    expect((await pullByKey({ db: handle, runner: run, source: queries }, pullOptions())).keyType).toBe('order_no')
    expect(asked[0]?.sql).toContain("c = 'order_no'")
    const overridden = await pullByKey({ db: handle, runner: run, source: queries }, pullOptions({ keyType: 'order_no', keyValue: 'X' }))
    expect(overridden.keyType).toBe('order_no')
    expect(asked[1]?.sql).toContain("c = 'X'")
  })

  it('rejects an empty key', async () => {
    const queries = await source({ '10_a.sql': '-- @module: workOrder\nSELECT 1' })
    const { run } = runner()
    await expect(pullByKey({ db: db(), runner: run, source: queries }, { keyValue: '   ', persist: true }))
      .rejects.toThrow(/needs a key value/)
  })

  it('rejects a query selection that matches no definition', async () => {
    const queries = await source({ '10_a.sql': '-- @module: workOrder\nSELECT 1' })
    const { run } = runner()
    await expect(pullByKey({ db: db(), runner: run, source: queries }, pullOptions({ queries: ['missing'] })))
      .rejects.toThrow(/No query definition matches: missing/)
  })

  it('rejects an empty queries directory', async () => {
    const queries = await source({})
    const { run } = runner()
    await expect(pullByKey({ db: db(), runner: run, source: queries }, pullOptions()))
      .rejects.toThrow(/No \.sql definition exists/)
  })

  it('runs only the selected modules', async () => {
    const queries = await source({
      '10_a.sql': '-- @module: workOrder\nSELECT 1 FROM a',
      '20_b.sql': '-- @module: workOrder\nSELECT 1 FROM b',
    })
    const { run, asked } = runner({ 'FROM a': [{ optaskNo: 'A' }], 'FROM b': [{ optaskNo: 'B' }] })
    const result = await pullByKey({ db: db(), runner: run, source: queries }, pullOptions({ queries: ['20_b'] }))
    expect(asked).toHaveLength(1)
    expect(result.modules.map(module => module.queryId)).toEqual(['20_b'])
  })

  it('reports a truncated module result', async () => {
    const queries = await source({ '10_a.sql': '-- @module: workOrder\nSELECT 1' })
    const { run } = runner({ SELECT: [{ optaskNo: 'A' }] }, { truncated: true })
    const result = await pullByKey({ db: db(), runner: run, source: queries }, pullOptions())
    expect(result.modules[0]?.truncated).toBe(true)
  })
})

describe('pullByKey, queries with no push module', () => {
  it('copies the source row and says why in a warning', async () => {
    const queries = await source({ '10_raw.sql': '-- @name: 原始\nSELECT 1' })
    const { run } = runner({ SELECT: [{ orderNo: 'ORD-1', note: 'x' }] })
    const handle = db()
    const result = await pullByKey({ db: handle, runner: run, source: queries }, pullOptions())
    expect(result.modules[0]?.pushModule).toBe('')
    const row = handle.prepare('SELECT * FROM review_item').get() as Record<string, unknown>
    expect(row['module']).toBe('原始')
    expect(JSON.parse(String(row['mapped_payload']))).toEqual({ orderNo: 'ORD-1', note: 'x' })
    expect(String(row['warnings'])).toContain('declares no -- @module')
  })

  it('warns about an unknown module instead of applying a mapping', async () => {
    const queries = await source({ '10_raw.sql': '-- @name: 未知\n-- @module: noSuchModule\nSELECT 1' })
    const { run } = runner({ SELECT: [{ orderNo: 'ORD-1' }] })
    const handle = db()
    await pullByKey({ db: handle, runner: run, source: queries }, pullOptions())
    const row = handle.prepare('SELECT * FROM review_item').get() as Record<string, unknown>
    expect(String(row['warnings'])).toContain('unknown module noSuchModule')
  })

  it('derives a row-level key from a conventional field and indexes the fallback', async () => {
    const queries = await source({ '10_raw.sql': '-- @name: 原始\nSELECT 1' })
    const { run } = runner({ SELECT: [{ orderNo: 'ORD-1' }, { nothing: true }, { orderNo: 'ORD-2' }] })
    await pullByKey({ db: db(), runner: run, source: queries }, pullOptions())
    expect(await readKeys()).toEqual(['ORD-1', 'HT-1#2', 'ORD-2'])
  })

  it('keeps two keyless rows of one pull distinct by index', async () => {
    const queries = await source({ '10_raw.sql': '-- @name: 原始\nSELECT 1' })
    const { run } = runner({ SELECT: [{ nothing: true }, { nothing: true }] })
    const handle = db()
    const result = await pullByKey({ db: handle, runner: run, source: queries }, pullOptions())
    expect(result.inserted).toBe(2)
    const keys = (handle.prepare('SELECT biz_key FROM review_item ORDER BY id').all() as Array<{ biz_key: string }>)
      .map(row => row.biz_key)
    expect(keys).toEqual(['HT-1#1', 'HT-1#2'])
  })
})

describe('pullByKey, result summary', () => {
  it('reports per-module and total counts', async () => {
    const queries = await source({
      '10_a.sql': '-- @name: a\n-- @module: workOrder\nSELECT 1 FROM a',
      '20_b.sql': '-- @name: b\n-- @module: workOrder\nSELECT 1 FROM b',
    })
    const { run } = runner({
      'FROM a': [{ optaskNo: 'A1' }, { optaskNo: 'A2' }],
      'FROM b': [{ optaskNo: 'B1' }],
    })
    const result = await pullByKey({ db: db(), runner: run, source: queries }, pullOptions())
    expect(result.ok).toBe(true)
    expect(result.totalRows).toBe(3)
    expect(result.inserted).toBe(3)
    expect(result.modules.map(module => module.rowCount)).toEqual([2, 1])
    expect(result.modules.map(module => module.queryName)).toEqual(['a', 'b'])
  })

  it('reports the business key and the key type it used', async () => {
    const queries = await source({ '10_a.sql': '-- @module: workOrder\nSELECT 1' })
    const { run } = runner({ SELECT: [{ optaskNo: 'A' }] })
    const result = await pullByKey({ db: db(), runner: run, source: queries }, pullOptions({ keyValue: '  HT-9  ' }))
    expect(result.keyValue).toBe('HT-9')
    expect(result.keyType).toBe('contract_no')
  })

  it('counts mapping warnings across modules', async () => {
    const queries = await source({
      '10_a.sql': '-- @module: workOrder\nSELECT 1 FROM a',
      '20_b.sql': '-- @module: workOrder\nSELECT 1 FROM b',
    })
    const { run } = runner({
      'FROM a': [{ optaskNo: 'A', state: '99unknown' }],
      'FROM b': [{ optaskNo: 'B', state: '05canceled' }],
    })
    const result = await pullByKey({ db: db(), runner: run, source: queries }, pullOptions())
    expect(result.modules.map(module => module.warnings)).toEqual([1, 2])
    expect(result.warnings).toHaveLength(2)
  })
})

describe('pullByKey with a hand-built query source', () => {
  /** A source that answers from memory, so no disk is involved. */
  function memory(definitions: QueryDefinition[]) {
    return {
      directory: '/virtual',
      list: () => Promise.resolve(definitions),
    }
  }

  /** One in-memory definition. */
  function definition(id: string, body: string): QueryDefinition {
    return {
      id,
      name: id,
      description: '',
      keyType: 'contract_no',
      module: 'workOrder',
      placeholders: body.includes(':key') ? ['key'] : [],
      sql: body,
      file: `/virtual/${id}.sql`,
    }
  }

  it('runs without a directory on disk', async () => {
    const { run } = runner({ SELECT: [{ optaskNo: 'A' }] })
    const result = await pullByKey(
      { db: db(), runner: run, source: memory([definition('10_a', 'SELECT 1 WHERE c = :key')]) },
      pullOptions(),
    )
    expect(result.inserted).toBe(1)
  })

  it('accepts rows typed as a plain source record', async () => {
    const rows: SourceRow[] = [{ optaskNo: 'A' }]
    const { run } = runner({ SELECT: rows })
    const result = await pullByKey(
      { db: db(), runner: run, source: memory([definition('10_a', 'SELECT 1')]) },
      pullOptions(),
    )
    expect(result.totalRows).toBe(1)
  })
})
