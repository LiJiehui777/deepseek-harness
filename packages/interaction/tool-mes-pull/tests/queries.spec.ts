import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  DirectoryQuerySource, bindPlaceholders, buildParams, loadQueryDefinitions, parseQueryFile,
  type QueryDefinition,
} from '../src/queries.ts'

let root: string

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'dsh-mes-pull-queries-'))
})

afterEach(async () => {
  await rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 })
})

/** Parse one file body as if it came from `13_production_order.sql`. */
function parse(text: string, id = '13_production_order'): QueryDefinition {
  return parseQueryFile(id, join(root, `${id}.sql`), text)
}

describe('parseQueryFile directives', () => {
  it('reads the four header directives', () => {
    const definition = parse([
      '-- @name: 生产订单',
      '-- @module: productionOrder',
      '-- @desc: 生产订单（plan_master_production_schedule）',
      '-- @key: contract_no',
      '',
      'SELECT 1',
    ].join('\n'))
    expect(definition.name).toBe('生产订单')
    expect(definition.module).toBe('productionOrder')
    expect(definition.description).toBe('生产订单（plan_master_production_schedule）')
    expect(definition.keyType).toBe('contract_no')
  })

  it('takes the module id from the file name', () => {
    expect(parse('SELECT 1').id).toBe('13_production_order')
    expect(parse('SELECT 1').file).toBe(join(root, '13_production_order.sql'))
  })

  it('defaults the display name to the id and the key type to contract_no', () => {
    const definition = parse('SELECT 1')
    expect(definition.name).toBe('13_production_order')
    expect(definition.keyType).toBe('contract_no')
    expect(definition.module).toBe('')
    expect(definition.description).toBe('')
  })

  it('tolerates spacing variants and any order', () => {
    const definition = parse(['--@key: order_no', '--   @name:   工单  ', '-- @module: workOrder'].join('\n'))
    expect(definition.keyType).toBe('order_no')
    expect(definition.name).toBe('工单')
    expect(definition.module).toBe('workOrder')
  })

  it('stops reading directives at the first statement line', () => {
    const definition = parse([
      '-- @name: 报工信息',
      'SELECT 1',
      '-- @name: not a directive any more',
    ].join('\n'))
    expect(definition.name).toBe('报工信息')
  })

  it('keeps reading directives past blank and non-directive comment lines', () => {
    const definition = parse([
      '-- @name: 工单',
      '',
      '-- a note that is not a directive',
      '-- @module: workOrder',
      'SELECT 1',
    ].join('\n'))
    expect(definition.name).toBe('工单')
    expect(definition.module).toBe('workOrder')
  })

  it('ignores an unknown directive key', () => {
    const definition = parse(['-- @owner: someone', '-- @name: 工单', 'SELECT 1'].join('\n'))
    expect(definition.name).toBe('工单')
  })

  it('keeps the complete file text as the sql', () => {
    const text = '-- @module: workOrder\nSELECT 1\n'
    expect(parse(text).sql).toBe(text)
  })

  it('handles CRLF line endings', () => {
    const definition = parse(['-- @name: 工单', '-- @module: workOrder', '', 'SELECT 1'].join('\r\n'))
    expect(definition.name).toBe('工单')
    expect(definition.module).toBe('workOrder')
  })
})

describe('parseQueryFile placeholder discovery', () => {
  it('finds a single :name placeholder', () => {
    expect(parse('SELECT * FROM t WHERE a = :key').placeholders).toEqual(['key'])
  })

  it('sorts and deduplicates the names', () => {
    expect(parse('SELECT * FROM t WHERE a = :key AND b = :key AND c = :other')
      .placeholders).toEqual(['key', 'other'])
  })

  it('does not treat a ::type cast as a placeholder', () => {
    expect(parse('SELECT now()::date, amount::numeric FROM t WHERE a = :key').placeholders)
      .toEqual(['key'])
  })

  it('does not treat a cast in the middle of an expression as a placeholder', () => {
    expect(parse('SELECT (a)::text::int FROM t').placeholders).toEqual([])
  })

  it('finds the placeholder in a query that also uses casts', () => {
    expect(parse('SELECT a::date FROM t WHERE no = :contract_no').placeholders).toEqual(['contract_no'])
  })

  it('accepts underscores and digits after the first character', () => {
    expect(parse('SELECT 1 WHERE a = :_x1').placeholders).toEqual(['_x1'])
  })

  it('finds placeholders inside the header comments too, because it scans the file', () => {
    expect(parse('-- @key: contract_no\n-- uses :key\nSELECT 1').placeholders).toEqual(['key'])
  })
})

describe('buildParams', () => {
  const definition = parse('SELECT 1 WHERE a = :key AND b = :contractNo AND c = :order_no AND d = :keyType')

  it('maps the generic trigger and the well-known aliases to the key value', () => {
    expect(buildParams(definition, 'C-1', 'contract_no')).toEqual({
      key: 'C-1',
      contractNo: 'C-1',
      order_no: 'C-1',
      keyType: 'contract_no',
    })
  })

  it('provides only the placeholders the definition uses', () => {
    const narrow = parse('SELECT 1 WHERE a = :key')
    expect(buildParams(narrow, 'C-1', 'contract_no')).toEqual({ key: 'C-1' })
  })

  it('leaves an unknown placeholder for the binder to report', () => {
    const unknown = parse('SELECT 1 WHERE a = :mystery')
    expect(buildParams(unknown, 'C-1', 'contract_no')).toEqual({})
  })
})

describe('bindPlaceholders', () => {
  it('substitutes a value as a quoted literal', () => {
    expect(bindPlaceholders('SELECT 1 WHERE a = :key', { key: 'C-1' }))
      .toBe("SELECT 1 WHERE a = 'C-1'")
  })

  it('escapes a single quote by doubling it', () => {
    expect(bindPlaceholders('SELECT 1 WHERE a = :key', { key: "O'Brien" }))
      .toBe("SELECT 1 WHERE a = 'O''Brien'")
  })

  it('substitutes every occurrence', () => {
    expect(bindPlaceholders('SELECT :key, :key', { key: 'x' })).toBe("SELECT 'x', 'x'")
  })

  it('leaves a ::type cast untouched', () => {
    expect(bindPlaceholders('SELECT now()::date WHERE a = :key', { key: 'x' }))
      .toBe("SELECT now()::date WHERE a = 'x'")
  })

  it('throws when a placeholder has no value', () => {
    expect(() => bindPlaceholders('SELECT 1 WHERE a = :key', {})).toThrow(/missing a value for: key/)
  })

  it('throws when a placeholder value is the empty string', () => {
    expect(() => bindPlaceholders('SELECT 1 WHERE a = :key', { key: '' })).toThrow(/missing a value for: key/)
  })

  it('names every missing placeholder once', () => {
    expect(() => bindPlaceholders('SELECT :a, :b, :a', {}))
      .toThrow(/missing a value for: a, b/)
  })

  it('returns the statement unchanged when it has no placeholder', () => {
    expect(bindPlaceholders('SELECT 1', {})).toBe('SELECT 1')
  })

  it('substitutes a value that itself looks like a placeholder or SQL', () => {
    expect(bindPlaceholders('SELECT 1 WHERE a = :key', { key: "x'; DROP TABLE t; --" }))
      .toBe("SELECT 1 WHERE a = 'x''; DROP TABLE t; --'")
  })
})

describe('loadQueryDefinitions', () => {
  it('reads every .sql file in file-name order', async () => {
    await writeFile(join(root, '20_second.sql'), '-- @module: b\nSELECT 2', 'utf8')
    await writeFile(join(root, '10_first.sql'), '-- @module: a\nSELECT 1', 'utf8')
    const definitions = await loadQueryDefinitions(root)
    expect(definitions.map(definition => definition.id)).toEqual(['10_first', '20_second'])
  })

  it('ignores files that are not .sql', async () => {
    await writeFile(join(root, '10_first.sql'), 'SELECT 1', 'utf8')
    await writeFile(join(root, 'README.md'), '# notes', 'utf8')
    await writeFile(join(root, 'notes.txt'), 'notes', 'utf8')
    expect(await loadQueryDefinitions(root)).toHaveLength(1)
  })

  it('rejects a directory that cannot be read', async () => {
    await expect(loadQueryDefinitions(join(root, 'absent'))).rejects.toThrow()
  })

  it('returns nothing for an empty directory', async () => {
    expect(await loadQueryDefinitions(root)).toEqual([])
  })
})

describe('DirectoryQuerySource', () => {
  it('reports its directory', () => {
    expect(new DirectoryQuerySource(root).directory).toBe(root)
  })

  it('re-reads the disk on every call, so an edit applies to the next pull', async () => {
    const source = new DirectoryQuerySource(root)
    await writeFile(join(root, '10_first.sql'), '-- @name: before\nSELECT 1', 'utf8')
    expect((await source.list())[0]?.name).toBe('before')
    await writeFile(join(root, '10_first.sql'), '-- @name: after\nSELECT 1', 'utf8')
    expect((await source.list())[0]?.name).toBe('after')
  })

  it('reports a new file added after the first read', async () => {
    const source = new DirectoryQuerySource(root)
    expect(await source.list()).toEqual([])
    await writeFile(join(root, '10_first.sql'), 'SELECT 1', 'utf8')
    expect(await source.list()).toHaveLength(1)
  })
})
