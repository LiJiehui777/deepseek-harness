import { beforeEach, describe, expect, it, vi } from 'vitest'
import { credentialRef } from '@deepseek-ai/dsh-credentials'
import { Context, type Volatile } from '@deepseek-ai/cordis'
import { MemoryCredentials } from '../../../credentials/credentials/tests/memory.ts'
import { PostgresConnector, Config, apply } from '../src/index.ts'
import type { PoolOptions } from '../src/pg-shim.ts'

const { opened, drained } = vi.hoisted(() => ({ opened: vi.fn<(options: PoolOptions) => void>(), drained: vi.fn() }))

vi.mock('pg', () => ({
  Pool: class {
    constructor(private readonly options: PoolOptions) { opened(options) }
    async connect() {
      if (this.options.port === 1) throw new Error('driver failure with ' + this.options.password)
      return { query: async () => ({ rows: [], fields: [] }), release() {} }
    }
    async end() { await drained() }
  },
}))

beforeEach(() => { opened.mockClear(); drained.mockReset() })

/** Build a connector context with a seeded credential and no registered tools. */
async function setup(config: Partial<Config> = {}, password: string | null = 'secret') {
  const ctx = new Context()
  // The credentials provider must finish loading before any read resolves the
  // reference, otherwise the lookup silently misses a seeded value.
  await ctx.plugin(MemoryCredentials, password === null ? {} : { MES_PG_PASSWORD: password })
  let settings: Config = {
    enabled: true, host: '127.0.0.1', port: 5432, database: 'mes', user: 'reader',
    passwordEnv: 'MES_PG_PASSWORD', ssl: false, maxConnections: 2, maxRows: 100,
    timeoutMs: 5_000, exposeTools: false, ...config,
  }
  const connector = new PostgresConnector(ctx, { get: () => settings })
  const update = (change: Partial<Config>): void => { settings = Object.assign({}, settings, change) }
  return { ctx, connector, update }
}

/** A settings reference over one fixed snapshot, as the Loader provides. */
function volatileOf(config: Config): Volatile<Config> {
  return { get: () => config }
}
describe('PostgresConnector', () => {
  it('uses the saved target and credential together on the first read and renews the pool when the password changes', async () => {
    const { ctx, connector, update } = await setup({ host: 'old.example.invalid' })
    const nextRef = credentialRef('MES_NEXT_PASSWORD')
    await ctx.credentials.set(nextRef, 'new-fixture-password')
    try {
      await connector.query('SELECT 1')
      update({ host: 'new.example.invalid', database: 'new_db', user: 'new_reader', passwordEnv: nextRef })
      await connector.query('SELECT 1')
      await connector.listSchemas()
      expect(opened).toHaveBeenCalledTimes(2)
      expect(opened).toHaveBeenNthCalledWith(2, expect.objectContaining({
        host: 'new.example.invalid', database: 'new_db', user: 'new_reader', password: 'new-fixture-password',
      }))
      await ctx.credentials.set(nextRef, 'rotated-fixture-password')
      await connector.query('SELECT 1')
      expect(opened).toHaveBeenCalledTimes(3)
      expect(opened).toHaveBeenNthCalledWith(3, expect.objectContaining({
        host: 'new.example.invalid', password: 'rotated-fixture-password',
      }))
      expect(drained).toHaveBeenCalledTimes(2)
    } finally {
      await ctx.fiber.dispose()
    }
    expect(drained).toHaveBeenCalledTimes(3)
  })

  it('does not open a connection if the saved settings change during credential lookup', async () => {
    const { ctx, connector, update } = await setup({ host: 'old.example.invalid' })
    const lookup = Promise.withResolvers<Awaited<ReturnType<typeof ctx.credentials.resolve>>>()
    const resolve = vi.spyOn(ctx.credentials, 'resolve').mockReturnValueOnce(lookup.promise)
    try {
      const pending = expect(connector.listSchemas()).rejects.toThrow(/settings changed/)
      expect(resolve).toHaveBeenCalledWith('MES_PG_PASSWORD')
      update({ host: 'new.example.invalid' })
      lookup.resolve({ value: 'old-fixture-password', source: 'memory' })
      await pending
      expect(opened).not.toHaveBeenCalled()
      await connector.listSchemas()
      expect(opened).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ host: 'new.example.invalid' }))
    } finally {
      resolve.mockRestore()
      lookup.resolve(undefined)
      await ctx.fiber.dispose()
    }
  })

  it('exposes the settings without the password', async () => {
    const { ctx, connector } = await setup()
    expect(connector.settings.database).toBe('mes')
    expect(connector.passwordReference).toBe('MES_PG_PASSWORD')
    expect(JSON.stringify(connector.settings)).not.toContain('secret')
    await ctx.fiber.dispose()
  })

  it('refuses every read while disabled', async () => {
    const { ctx, connector } = await setup({ enabled: false })
    await expect(connector.listSchemas()).rejects.toThrow(/disabled/)
    await expect(connector.query('SELECT 1')).rejects.toThrow(/disabled/)
    await ctx.fiber.dispose()
  })

  it('refuses reads when the credential is absent', async () => {
    const { ctx, connector } = await setup({}, null)
    // Reported before any driver load, so a missing credential never masks
    // itself as a missing dependency.
    await expect(connector.listSchemas()).rejects.toThrow(/password is missing/)
    await ctx.fiber.dispose()
  })

  it('reports a sanitized failure from testConnection instead of throwing', async () => {
    const { ctx, connector } = await setup({ host: '127.0.0.1', port: 1 })
    const result = await connector.testConnection()
    expect(result.ok).toBe(false)
    expect(result.message).not.toContain('secret')
    await ctx.fiber.dispose()
  })

  it('rejects an invalid schema identifier before reaching the driver', async () => {
    const { ctx, connector } = await setup()
    await expect(connector.listTables('public; DROP TABLE t', 1, 10)).rejects.toThrow(/plain PostgreSQL identifier/)
    await expect(connector.describeTable('public', 'a b')).rejects.toThrow(/plain PostgreSQL identifier/)
    await ctx.fiber.dispose()
  })

  it('stops issuing reads after disposal', async () => {
    const { ctx, connector } = await setup()
    await ctx.fiber.dispose()
    await expect(connector.query('SELECT 1')).rejects.toThrow()
  })
})

describe('apply', () => {
  const base: Config = {
    enabled: false, host: 'h', port: 5432, database: 'd', user: 'u',
    passwordEnv: 'MES_PG_PASSWORD', ssl: false, maxConnections: 1, maxRows: 10,
    timeoutMs: 1_000, exposeTools: false,
  }

  it('still loads when the database name is not filled in yet', async () => {
    const ctx = new Context()
    apply(ctx, volatileOf(Object.assign({}, base, { database: '' })))
    await ctx.fiber.await()
    // The settings page must stay reachable for a profile that has not filled
    // the connection in, so activation cannot reject these settings.
    expect(ctx.postgres.settings.database).toBe('')
    await ctx.fiber.dispose()
  })

  it('rejects a password reference that is not an environment variable name when a read runs', async () => {
    const ctx = new Context()
    await ctx.plugin(MemoryCredentials, { MES_PG_PASSWORD: 'secret' })
    apply(ctx, volatileOf(Object.assign({}, base, { passwordEnv: 'not a name' })))
    await ctx.fiber.await()
    await expect(ctx.postgres.listSchemas()).rejects.toThrow(/environment variable name/)
    await ctx.fiber.dispose()
  })

  it('rejects a blank role when a read runs', async () => {
    const ctx = new Context()
    await ctx.plugin(MemoryCredentials, { MES_PG_PASSWORD: 'secret' })
    apply(ctx, volatileOf(Object.assign({}, base, { enabled: true, user: '  ' })))
    await ctx.fiber.await()
    await expect(ctx.postgres.listSchemas()).rejects.toThrow(/user is required/)
    await ctx.fiber.dispose()
  })

  it('registers the connector service once the plugin settles', async () => {
    const ctx = new Context()
    apply(ctx, volatileOf(base))
    await ctx.fiber.await()
    expect(ctx.postgres).toBeDefined()
    expect(ctx.postgres.settings.database).toBe('d')
    await ctx.fiber.dispose()
  })
})
