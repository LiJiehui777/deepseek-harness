// @vitest-environment jsdom
import { Context } from '@deepseek-ai/cordis'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
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
  resolveHostReturnBootstrap,
} from '../src/config.ts'
import { apply as hostApply } from '../src/index.ts'

interface HostReturnGlobal {
  __DSH_HOST_RETURN__?: unknown
}

const hostReturnGlobal = globalThis as typeof globalThis & HostReturnGlobal

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
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
      'settings.plugins.tab': { kind: 'list', scope: 'root' },
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
  it('validates the optional host-owned conversation destination without widening its origin', () => {
    const branding = { returnUrl: 'https://ragflow.test/workbench', agentName: '任务' }
    expect(resolveHostReturnBootstrap({ ...branding, newConversationUrl: 'https://ragflow.test/workbench?new=1' }))
      .toMatchObject({ newConversationUrl: 'https://ragflow.test/workbench?new=1' })
    for (const newConversationUrl of ['/workbench', 'https://other.test/workbench', 'javascript:alert(1)']) {
      expect(resolveHostReturnBootstrap({ ...branding, newConversationUrl })).toBeUndefined()
    }
  })

  it('validates account management on the host origin and removes its native tab on disposal', async () => {
    const base = { returnUrl: 'https://ragflow.test/workbench', agentName: 'Task' }
    for (const channelManagementUrl of ['/settings', 'https://other.test/settings', 'javascript:alert(1)']) {
      expect(resolveHostReturnBootstrap({ ...base, channelManagementUrl })).toBeUndefined()
    }
    const config = { ...base, channelManagementUrl: 'https://ragflow.test/user-setting/chat-channel' }
    expect(resolveHostReturnBootstrap(config)).toMatchObject(config)
    const host = new Context()
    const hostFiber = host.plugin({ apply: hostApply }, config)
    await hostFiber.await()
    const rows: IndexInjection[] = []
    host.emit('webserver/index-inject', rows)
    expect(rows[0]).toMatchObject({ value: config })
    await host.fiber.dispose()
    const ctx = await baseContext()
    hostReturnGlobal.__DSH_HOST_RETURN__ = config
    const fiber = ctx.plugin({ inject: [...inject], apply })
    await fiber.await()
    declareFooter(ctx)
    await Promise.resolve()
    const entry = ctx.slots.entries('settings.plugins.tab')[0]!
    expect(entry.options.id).toBe('chat-services')
    expect(entry.options.order).toBe(5)
    expect((entry.options.label as () => string)()).toBe(en.channelsTab)
    expect(entry.inject!()).toEqual({ managementUrl: config.channelManagementUrl, hostOrigin: 'https://ragflow.test' })
    await fiber.dispose()
    expect(ctx.slots.entries('settings.plugins.tab')).toHaveLength(0)
    await ctx.fiber.dispose()
  })

  it.each([true, false])('claims New Session for the host and releases the listener on disposal (embedded=%s)', async (embedded) => {
    const ctx = await baseContext()
    const postMessage = vi.fn()
    const assign = vi.fn()
    const hostWindow = { parent: {} as unknown, location: { assign } }
    hostWindow.parent = embedded ? { postMessage } : hostWindow
    vi.stubGlobal('window', hostWindow)
    hostReturnGlobal.__DSH_HOST_RETURN__ = {
      returnUrl: 'http://localhost:9222/workbench', agentName: '任务',
      newConversationUrl: 'http://localhost:9222/workbench?new=1',
    }
    const fiber = ctx.plugin({ inject: [...inject], apply })
    await fiber.await()
    expect(ctx.bail(ctx, 'ui-workspace/before-start-session', undefined)).toBe(true)
    if (embedded) {
      expect(postMessage).toHaveBeenCalledWith({ type: 'ragflow.workbench.new-conversation' }, 'http://localhost:9222')
      expect(assign).not.toHaveBeenCalled()
    } else {
      expect(assign).toHaveBeenCalledWith('http://localhost:9222/workbench?new=1')
      expect(postMessage).not.toHaveBeenCalled()
    }
    await fiber.dispose()
    expect(ctx.bail(ctx, 'ui-workspace/before-start-session', undefined)).toBeUndefined()
    await ctx.fiber.dispose()
  })

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

  it('rejects malformed branding and knowledge-source projections', () => {
    for (const value of [null, undefined, [], 'text', 1]) expect(resolveHostReturnBootstrap(value)).toBeUndefined()
    const base = { returnUrl: 'https://rf.test/workbench', agentName: '任务' }
    expect(resolveHostReturnBootstrap({ ...base, workspaceName: 1 })).toMatchObject({ workspaceName: 'Agent Workspace' })
    for (const override of [{ agentName: '' }, { agentName: 1 }, { agentName: 'a'.repeat(256) }, { workspaceName: 'a'.repeat(81) },
      { datasetNames: 'a' }, { datasetNames: Array.from({ length: 101 }, () => 'a') }, { datasetNames: [1] },
      { datasetNames: [' '] }, { datasetNames: ['a'.repeat(129)] }]) {
      expect(resolveHostReturnBootstrap({ ...base, ...override })).toBeUndefined()
    }
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
    expect(ctx.slots.entries('sidebar.brand.action')[0]!.inject!()).toEqual({ returnUrl: 'http://localhost:9222/agents', hostName: 'RAGFlow' })
    expect(ctx.slots.entries('sidebar.brand.name')[0]!.inject!()).toEqual({ agentName: '产品知识助手', workspaceName: '智能体工作台', hostName: 'RAGFlow', datasetNames: ['产品手册'] })
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
    const t = (key: keyof typeof zh, values: Record<string, string> = {}) => {
      let text: string = zh[key]
      for (const [name, value] of Object.entries(values)) text = text.replace(`{${name}}`, value)
      return text
    }
    const name = render(<HostAgentName {...branding} t={t as never} />)
    expect(name.getByText('产品知识助手')).toBeTruthy()
    expect(name.getByText('智能体工作台')).toBeTruthy()
    const trigger = name.getByRole('button', { name: '查看已绑定知识库' })
    expect(name.queryByRole('dialog')).toBeNull()
    fireEvent.click(trigger)
    const dialog = name.getByRole('dialog', { name: '已绑定知识库' })
    expect(name.getByText('当前对话可参考以下知识库')).toBeTruthy()
    expect(name.getByText('产品手册')).toBeTruthy()
    expect(name.getByText('常见问题')).toBeTruthy()
    fireEvent.pointerDown(dialog)
    expect(name.queryByRole('dialog')).not.toBeNull()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(name.queryByRole('dialog')).toBeNull()
    fireEvent.click(trigger)
    fireEvent.pointerDown(document.body)
    expect(name.queryByRole('dialog')).toBeNull()
    name.unmount()

    const emptyName = render(<HostAgentName {...branding} datasetNames={[]} t={t as never} />)
    fireEvent.click(emptyName.getByRole('button', { name: '查看已绑定知识库' }))
    expect(emptyName.getByText('未绑定知识库')).toBeTruthy()
    emptyName.unmount()

    const mark = render(<HostAgentMark {...branding} size={24} />)
    expect(mark.getByText('产')).toBeTruthy()
    mark.unmount()

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
