// @vitest-environment jsdom
import { Context } from '@deepseek-ai/cordis'
import { SlotRegistry } from '@deepseek-ai/dsh-client-ui-renderer/client'
import { LocaleRuntime } from '@deepseek-ai/dsh-client-locale/client'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, expect, it } from 'vitest'
import * as Browser from '../src/client/index.ts'
import * as Host from '../src/index.ts'
import { ZttHero, ZttName } from '../src/client/Brand.tsx'
import { en, NS, zh } from '../src/client/locales.ts'

const holes = ['sidebar.brand.mark', 'sidebar.brand.name', 'conversation.hero.brand.mark', 'conversation.hero.identity', 'shell.document-title'] as const

afterEach(cleanup)

it('follows declaration teardown and redeclaration, then removes its localized identity on unload', async () => {
  const ctx = new Context()
  try {
    Host.apply()
    await ctx.plugin(SlotRegistry).await()
    const locale = new LocaleRuntime(ctx)
    ctx.provide('locale', locale)
    ctx.slots.installLocale(locale)
    const declare = () => ctx.slots.register({ name: 'root', children: Object.fromEntries(holes.map(name => [name, { kind: 'single', scope: 'root' }])) } as never, () => null)
    const fiber = ctx.plugin(Browser)
    await fiber.await()
    for (const hole of holes) expect(ctx.slots.entries(hole)).toHaveLength(0)
    const dispose = declare()
    await Promise.resolve()
    for (const hole of holes) expect(ctx.slots.entries(hole)).toHaveLength(1)
    const t = locale.bind(NS)
    locale.setLocale('zh')
    expect(t('name')).toBe(zh.name)
    locale.setLocale('en')
    expect(t('name')).toBe(en.name)
    dispose()
    for (const hole of holes) expect(ctx.slots.entries(hole)).toHaveLength(0)
    declare()
    await Promise.resolve()
    for (const hole of holes) expect(ctx.slots.entries(hole)).toHaveLength(1)
    await fiber.dispose()
    for (const hole of holes) expect(ctx.slots.entries(hole)).toHaveLength(0)
    expect(t('name')).not.toBe(en.name)
  } finally { await ctx.fiber.dispose() }
})

it('presents the quality workspace and tasks in both locales', () => {
  for (const dict of [zh, en]) {
    const t = ((key: keyof typeof zh) => dict[key]) as never
    const identity = render(<><ZttName t={t} /><ZttHero t={t} /></>)
    expect(screen.getAllByText(dict.name)).toHaveLength(2)
    expect(screen.getByText(dict.company)).toBeTruthy()
    expect(screen.getByText(dict.tagline)).toBeTruthy()
    expect(screen.getByText(dict.tasks)).toBeTruthy()
    identity.unmount()
  }
})
