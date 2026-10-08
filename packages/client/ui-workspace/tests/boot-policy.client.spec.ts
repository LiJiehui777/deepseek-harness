// @vitest-environment jsdom
import { Context } from '@deepseek-ai/cordis'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { IndexInjection } from '@deepseek-ai/dsh-host-webserver'
import { WORKSPACE_BOOTSTRAP_GLOBAL, readResumeRecentSession, type WorkspaceConfig } from '../src/config.ts'
import { apply } from '../src/index.ts'

afterEach(() => { vi.unstubAllGlobals() })

describe('Workspace initial navigation policy', () => {
  it('projects only an explicit opt-in and releases the injection on disposal', async () => {
    const ctx = new Context()
    apply(ctx)
    apply(ctx, { resumeRecentSession: false })
    const absent: IndexInjection[] = []
    ctx.emit('webserver/index-inject', absent)
    expect(absent).toEqual([])
    const fiber = ctx.plugin({ apply }, { resumeRecentSession: true })
    await fiber.await()
    const rows: IndexInjection[] = []
    ctx.emit('webserver/index-inject', rows)
    expect(rows).toEqual([{ kind: 'global', name: WORKSPACE_BOOTSTRAP_GLOBAL,
      value: { resumeRecentSession: true } }])
    await fiber.dispose()
    const disposed: IndexInjection[] = []
    ctx.emit('webserver/index-inject', disposed)
    expect(disposed).toEqual([])
    await ctx.fiber.dispose()
  })

  it('rejects non-boolean Loader configuration', () => {
    const ctx = new Context()
    for (const resumeRecentSession of ['true', null, 1]) {
      // The Loader parses untyped YAML; this deliberately exercises its validation.
      const config = { resumeRecentSession } as unknown as WorkspaceConfig
      expect(() => { apply(ctx, config) }).toThrow('ui-workspace.resumeRecentSession must be a boolean')
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
