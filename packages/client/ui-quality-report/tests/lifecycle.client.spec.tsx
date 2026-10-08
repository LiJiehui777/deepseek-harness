// @vitest-environment jsdom
import { Context } from '@deepseek-ai/cordis'
import { SlotRegistry } from '@deepseek-ai/dsh-client-ui-renderer/client'
import { LocaleRuntime } from '@deepseek-ai/dsh-client-locale/client'
import { expect, it } from 'vitest'
import * as Browser from '../src/client/index.ts'
import * as Host from '../src/index.ts'
import { en, zh } from '../src/client/locales.ts'
it('unloads and remounts the browser slot and dictionaries without duplicates', async () => {
  const ctx = new Context()
  try {
    Host.apply()
    await ctx.plugin(SlotRegistry).await()
    const locale = new LocaleRuntime(ctx)
    ctx.provide('locale', locale)
    ctx.slots.installLocale(locale)
    const empty = () => null
    ctx.slots.register({ name: 'root', children: { 'tool.call.toolview': { kind: 'keyed', scope: 'session' } } } as never, empty)
    const t = locale.bind('qualityReport')
    for (let index = 0; index < 2; index++) {
      const fiber = ctx.plugin(Browser)
      await fiber.await()
      expect(ctx.slots.entries('tool.call.toolview')).toHaveLength(1)
      locale.setLocale('zh'); expect(t('title')).toBe(zh.title)
      locale.setLocale('en'); expect(t('title')).toBe(en.title)
      await fiber.dispose()
      expect(ctx.slots.entries('tool.call.toolview')).toHaveLength(0)
      expect(t('title')).not.toBe(en.title)
    }
  } finally { await ctx.fiber.dispose() }
})
