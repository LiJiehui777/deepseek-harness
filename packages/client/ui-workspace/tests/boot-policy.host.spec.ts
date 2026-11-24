import type { PeerScope } from '@deepseek-ai/dsh-typert-protocol'
import { Context } from '@deepseek-ai/cordis'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { IndexInjection } from '@deepseek-ai/dsh-host-webserver'
import { WORKSPACE_BOOTSTRAP_GLOBAL, readResumeRecentSession } from '../src/config.ts'
import { apply, Config } from '../src/index.ts'

afterEach(() => { vi.unstubAllGlobals() })

describe('Workspace initial navigation policy', () => {
  it('projects only an explicit opt-in and releases the injection on disposal', async () => {
    const ctx = new Context()
    apply(ctx, Config({}))
    apply(ctx, Config({ resumeRecentSession: false }))
    const absent: IndexInjection[] = []
    ctx.emit('webserver/index-inject', absent, { principal: { kind: 'owner' } } as PeerScope)
    expect(absent).toEqual([])
    const fiber = ctx.plugin({ apply, Config }, { resumeRecentSession: true })
    await fiber.await()
    const rows: IndexInjection[] = []
    ctx.emit('webserver/index-inject', rows, { principal: { kind: 'owner' } } as PeerScope)
    expect(rows).toEqual([{ kind: 'global', name: WORKSPACE_BOOTSTRAP_GLOBAL,
      value: { resumeRecentSession: true } }])
    await fiber.dispose()
    const disposed: IndexInjection[] = []
    ctx.emit('webserver/index-inject', disposed, { principal: { kind: 'owner' } } as PeerScope)
    expect(disposed).toEqual([])
    await ctx.fiber.dispose()
  })

  it('rejects non-boolean Loader configuration', () => {
    for (const resumeRecentSession of ['true', 1]) {
      expect(() => Reflect.apply(Config, undefined, [{ resumeRecentSession }])).toThrow()
    }
  })

  it('reads only the explicit boolean from the authenticated boot projection', () => {
    for (const value of [undefined, null, [], 'true', {}, { resumeRecentSession: false },
      { resumeRecentSession: 'true' }]) {
      vi.stubGlobal(WORKSPACE_BOOTSTRAP_GLOBAL, value)
      expect(readResumeRecentSession(globalThis)).toBe(false)
    }
    vi.stubGlobal(WORKSPACE_BOOTSTRAP_GLOBAL, { resumeRecentSession: true })
    expect(readResumeRecentSession(globalThis)).toBe(true)
  })
})
