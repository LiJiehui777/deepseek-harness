// @vitest-environment jsdom
import { Context } from '@deepseek-ai/cordis'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import type { IndexInjection } from '@deepseek-ai/dsh-host-webserver'
import type { GlobalStandardProps } from '@deepseek-ai/dsh-client-ui-slots'
import { SlotRegistry } from '@deepseek-ai/dsh-client-ui-renderer/client'
import { apply as applyLocale, inject as localeInject } from '@deepseek-ai/dsh-client-locale/client'
import { stubSettingsScope } from '@deepseek-ai/dsh-client-test-runtime'
import {
  HostAgentHero,
  HostAgentMark,
  HostAgentName,
} from '../src/client/HostAgentBranding.tsx'
import { HostReturnAction } from '../src/client/HostReturnAction.tsx'
import { apply, inject } from '../src/client/index.ts'
import { en, NS, zh } from '../src/client/locales.ts'
import {
  HOST_RETURN_BOOTSTRAP_GLOBAL,
  normalizeHostReturnUrl,
} from '../src/config.ts'
import { apply as hostApply } from '../src/index.ts'

interface HostReturnGlobal {
  __DSH_HOST_RETURN__?: unknown
}

const hostReturnGlobal = globalThis as typeof globalThis & HostReturnGlobal

afterEach(() => {
  cleanup()
  delete hostReturnGlobal.__DSH_HOST_RETURN__
})

const Empty = () => null
const unusedHook = (() => { throw new Error('branding fixture must not read collection hooks') }) as never
const useResource = (() => ({
  status: 'none' as const,
  value: undefined,
  failure: undefined,
  reload: () => {},
})) as GlobalStandardProps['useResource']
const usePanelInfo: GlobalStandardProps['usePanelInfo'] = selector => selector({ activePanelId: null })
type AttentionSnapshot = Parameters<Parameters<GlobalStandardProps['useSessionPendingInteraction']>[0]>[0]
const noAttention: AttentionSnapshot = new Map()
const useSessionPendingInteraction: GlobalStandardProps['useSessionPendingInteraction'] =
  selector => selector(noAttention)
const standardProps = {
  useSessions: unusedHook,
  useSessionPendingInteraction,
  usePanelInfo,
  useResource,
  useWorkspaces: unusedHook,
} satisfies GlobalStandardProps

async function baseContext(): Promise<Context> {
  const ctx = new Context()
  await ctx.plugin(SlotRegistry).await()
  ctx.provide('connection', { api: { settings: {} }, isLoopback: false } as never)
  ctx.provide('remote', { $on: () => () => {} } as never)
  ctx.provide('settingsScope', { bind: () => stubSettingsScope().scope } as never)
  await ctx.plugin({ inject: localeInject, apply: applyLocale }).await()
  return ctx
}

function declareFooter(ctx: Context): () => void {
  return ctx.slots.register({
    name: 'root',
    children: {
      'sidebar.brand.mark': { kind: 'single', scope: 'root' },
      'sidebar.brand.name': { kind: 'single', scope: 'root' },
      'sidebar.brand.action': { kind: 'single', scope: 'root' },
      'sidebar.footer.action': { kind: 'list', scope: 'root' },
      'conversation.hero.brand.mark': { kind: 'single', scope: 'root' },
      'conversation.hero.identity': { kind: 'single', scope: 'root' },
      'shell.document-title': { kind: 'single', scope: 'root' },
    },
  } as never, Empty)
}

describe('host-return browser half', () => {
  it('projects validated Host config into Web boot until disposal', async () => {
    const ctx = new Context()
    const fiber = ctx.plugin({ apply: hostApply }, {
      returnUrl: 'http://localhost:9222/agents',
      hostName: ' RAGFlow ',
      agentName: ' 产品知识助手 ',
      workspaceName: '智能体工作台',
      datasetNames: ['产品手册', '常见问题'],
    })
    await fiber.await()
    const rows: IndexInjection[] = []
    ctx.emit('webserver/index-inject', rows)
    expect(rows).toEqual([{
      kind: 'global',
      name: HOST_RETURN_BOOTSTRAP_GLOBAL,
      value: {
        returnUrl: 'http://localhost:9222/agents',
        hostName: 'RAGFlow',
        agentName: '产品知识助手',
        workspaceName: '智能体工作台',
        datasetNames: ['产品手册', '常见问题'],
      },
    }])
    expect(inject).toEqual(['slots', 'locale'])
    await fiber.dispose()
    const after: IndexInjection[] = []
    ctx.emit('webserver/index-inject', after)
    expect(after).toEqual([])
  })

  it('rejects absent, oversized, credentialed, relative, and non-http URLs', () => {
    expect(normalizeHostReturnUrl(undefined)).toBeUndefined()
    expect(normalizeHostReturnUrl('x'.repeat(2049))).toBeUndefined()
    expect(normalizeHostReturnUrl('http://user:secret@example.test/agents')).toBeUndefined()
    expect(normalizeHostReturnUrl('/agents')).toBeUndefined()
    expect(normalizeHostReturnUrl('javascript:alert(1)')).toBeUndefined()
    expect(normalizeHostReturnUrl('https://ragflow.test/agents')).toBe('https://ragflow.test/agents')
  })

  it('stays absent without a valid payload and registers Agent branding after slot declaration', async () => {
    const invalid = await baseContext()
    declareFooter(invalid)
    hostReturnGlobal.__DSH_HOST_RETURN__ = {
      returnUrl: 'file:///tmp/ragflow',
      hostName: 'RAGFlow',
      agentName: '产品知识助手',
    }
    await invalid.plugin({ inject: [...inject], apply }).await()
    expect(invalid.slots.entries('sidebar.brand.action')).toHaveLength(0)
    await invalid.fiber.dispose()

    const ctx = await baseContext()
    hostReturnGlobal.__DSH_HOST_RETURN__ = {
      returnUrl: 'http://localhost:9222/agents',
      hostName: 'RAGFlow',
      agentName: '产品知识助手',
      workspaceName: '智能体工作台',
      datasetNames: ['产品手册'],
    }
    const fiber = ctx.plugin({ inject: [...inject], apply })
    await fiber.await()
    expect(ctx.slots.entries('sidebar.brand.action')).toHaveLength(0)
    expect(ctx.slots.entries('sidebar.brand.name')).toHaveLength(0)
    declareFooter(ctx)
    await Promise.resolve()
    expect(ctx.slots.entries('sidebar.brand.action')).toHaveLength(1)
    expect(ctx.locale.bind(NS)('greeting', { agent: '产品知识助手' })).toBe(
      en.greeting.replace('{agent}', '产品知识助手'),
    )
    ctx.locale.setLocale('zh')
    expect(ctx.locale.bind(NS)('greeting', { agent: '产品知识助手' })).toBe(
      zh.greeting.replace('{agent}', '产品知识助手'),
    )
    expect(Object.keys(en)).toEqual(Object.keys(zh))
    expect(ctx.slots.entries('sidebar.brand.mark')).toHaveLength(1)
    expect(ctx.slots.entries('sidebar.brand.name')).toHaveLength(1)
    expect(ctx.slots.entries('conversation.hero.brand.mark')).toHaveLength(1)
    expect(ctx.slots.entries('conversation.hero.identity')).toHaveLength(1)
    expect(ctx.slots.entries('shell.document-title')).toHaveLength(1)

    await fiber.dispose()
    expect(ctx.slots.entries('sidebar.brand.action')).toHaveLength(0)
    expect(ctx.slots.entries('sidebar.brand.name')).toHaveLength(0)
    await ctx.fiber.dispose()
  })

  it('renders the Agent as the primary identity with scoped knowledge sources', () => {
    const branding = {
      agentName: '产品知识助手',
      workspaceName: '智能体工作台',
      hostName: 'RAGFlow',
      datasetNames: ['产品手册', '常见问题'],
    }
    const name = render(<HostAgentName {...branding} />)
    expect(name.getByText('产品知识助手')).toBeTruthy()
    expect(name.getByText('智能体工作台')).toBeTruthy()
    name.unmount()

    const mark = render(<HostAgentMark {...branding} size={24} />)
    expect(mark.getByText('产')).toBeTruthy()
    mark.unmount()

    const t = (key: keyof typeof zh, values: Record<string, string> = {}) => {
      let text: string = zh[key]
      for (const [name, value] of Object.entries(values)) text = text.replace(`{${name}}`, value)
      return text
    }
    render(<HostAgentHero {...standardProps} {...branding} t={t as never} />)
    expect(screen.getByText('你好，我是「产品知识助手」')).toBeTruthy()
    expect(screen.getByText('有什么可以帮你？')).toBeTruthy()
    expect(screen.getByText('产品手册')).toBeTruthy()
    expect(screen.getByText('常见问题')).toBeTruthy()

    const action = render(<HostReturnAction
      {...standardProps}
      returnUrl="http://localhost:9222/agents"
      hostName="RAGFlow"
      t={t as never}
    />)
    const link = action.getByRole('link', { name: '返回 RAGFlow' })
    expect(link.getAttribute('href')).toBe('http://localhost:9222/agents')
    expect(link.getAttribute('target')).toBe('_top')
    expect(link.getAttribute('title')).toBe('返回 RAGFlow')
  })
})
