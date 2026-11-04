/** Flowable-owned execution and authenticated DH business workflow API. */
import { createHash, randomUUID } from 'node:crypto'
import { setTimeout as delay } from 'node:timers/promises'
import { Context, Service } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { brandString } from '@deepseek-ai/dsh-brand'
import { credentialRef } from '@deepseek-ai/dsh-credentials'
import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import type {} from '@deepseek-ai/dsh-agent'
import type {} from '@deepseek-ai/dsh-agent-default-model'
import type {} from '@deepseek-ai/dsh-session'
import type {} from '@deepseek-ai/dsh-tools'
import type { SessionId } from '@deepseek-ai/dsh-session'
import type {} from '@deepseek-ai/dsh-system-prompt'
import { requireLocalConversation } from './host/access.ts'
import { installSelectionPolicy } from './host/selection.ts'
import type { Domain } from '@deepseek-ai/dsh-storage-domain'
import { catalogSpec, validateInputs } from './host/catalog.ts'
import { registerWorkflowTools } from './host/tools.ts'
import { parseDraft, serializeDraft } from './shared/draft.ts'
import type { WorkflowDraft } from './shared/types.ts'
import type { EngineHealth, EngineWorkItem, ProcessDetail, ProcessId, ProcessSummary, StartProcessRequest, WorkItemId, WorkflowTemplate, SaveTemplateRequest, StartPublishedRequest, WorkflowChoice, ConversationWorkflowState, SelectConversationWorkflowRequest } from './shared/runtime.ts'
import { activityId, compileBpmn, processKey, resultKey } from './host/compiler.ts'
import { FlowableClient, FlowableError, object, string } from './host/flowable.ts'
import { runAnalysis } from './host/agent.ts'
import { readWecomTodos } from './host/wecom.ts'
import { createDemoTodos } from './host/demo-todos.ts'
import type { ConversationReviews, ConversationReviewDetail } from './shared/runtime.ts'
import { ConversationRuns, conversationRunSpec } from './host/conversation-run.ts'

export type * from './shared/runtime.ts'
declare module '@deepseek-ai/cordis' {
  interface Context {
    /** Engine-owned business execution and local-operator tasks. */
    businessWorkflows: BusinessWorkflows
  }
}

/** Engine connection, tenant isolation, and worker deadlines. */
export interface Config {
  /** Flowable REST root, including servlet context. */
  baseUrl: string
  /** Host-only REST account. */
  username: string
  /** Credential reference resolved per call. */
  passwordEnv: string
  /** Tenant dedicated to this DH deployment. */
  tenantId: string
  /** Deadline of one REST call. */
  requestTimeoutMs: number
  /** Idle worker interval. */
  pollIntervalMs: number
  /** Maximum analysis duration. */
  analysisTimeoutMs: number
  /** Job lease, exceeding analysis and completion deadlines. */
  lockDurationMs: number
  /** Maximum server-owned templates in this deployment. */
  maxTemplates: number
}
const variable = (name: string, value: string | boolean) => ({ name, type: typeof value === 'boolean' ? 'boolean' : 'string', value })
const encode = encodeURIComponent
const topics = ['core.echo', 'demo.wecom.todos', 'wecom.todos.list', 'condition', 'agent']
const optionalString = (value: unknown): string => value === null || value === undefined ? '' : string(value)

/** Flowable owns state; the Host only handles work the engine has made current. */
export class BusinessWorkflows extends TypertRemoteService {
  static inject = ['credentials', 'typert', 'agents', 'agentDefaultModel', 'sessions', 'tools', 'storageDomain', 'systemPrompt']
  static Config: z<Config> = z.object({
    baseUrl: z.string().required(), username: z.string().required(), passwordEnv: z.string().required(), tenantId: z.string().required(),
    requestTimeoutMs: z.natural().min(100).max(60000).required(), pollIntervalMs: z.natural().min(100).max(60000).required(),
    analysisTimeoutMs: z.natural().min(1000).max(3600000).required(), lockDurationMs: z.natural().min(1000).max(7200000).required(),
    maxTemplates: z.natural().min(1).max(1000).required(),
  })
  private readonly lifetime = new AbortController()
  private readonly api: FlowableClient
  private readonly workerId = `dh-${randomUUID()}`
  private domain: Domain<typeof catalogSpec> | undefined
  private catalogTail: Promise<unknown> = Promise.resolve()
  private worker: Promise<void> | undefined
  private readonly starts = new Map<string, Promise<ProcessDetail>>()
  private readonly reviews = new Set<ProcessId>()
  private conversationRuns: ConversationRuns | undefined
  private readonly active = new Map<string, { controller: AbortController; done: Promise<void> }>()

  constructor(ctx: Context, private readonly config: Config) {
    super(ctx, 'businessWorkflows', { namespace: 'businessWorkflows' })
    if (!/^[a-z][a-z0-9-]{0,63}$/.test(config.tenantId)) throw new Error('Flowable tenantId requires a lowercase deployment identifier')
    if (config.lockDurationMs <= config.analysisTimeoutMs + config.requestTimeoutMs * 3) {
      throw new Error('Flowable lease must exceed analysisTimeoutMs plus three request deadlines')
    }
    const ref = credentialRef(config.passwordEnv)
    this.api = new FlowableClient(config, async () => {
      const secret = await ctx.credentials.resolve(ref)
      if (!secret) throw new FlowableError('FLOWABLE_CREDENTIAL_MISSING')
      return secret.value
    }, this.lifetime.signal)
    ctx.effect(() => async () => {
      this.lifetime.abort()
      for (const run of this.active.values()) run.controller.abort()
      await this.worker
      await this.conversationRuns?.dispose()
      await this.catalogTail
      await this.domain?.close()
    }, 'business-workflow: worker lifetime')
  }

  async [Service.init](): Promise<void> {
    this.domain = await this.ctx.storageDomain.open(catalogSpec)
    const follows = await this.ctx.storageDomain.open(conversationRunSpec)
    this.conversationRuns = new ConversationRuns(this.ctx, follows, this.config.tenantId, this.config.pollIntervalMs,
      this.lifetime.signal, id => this.detail(id))
    registerWorkflowTools(this.ctx, {
      templates: () => this.templates(), selection: owner => this.selection(owner),
      start: async (request, owner, signal) => {
        const run = await this.serialCatalog(() => this.startPublication(request, owner, signal))
        await this.following.attach(owner, run, signal)
        return run
      },
      detail: id => this.detail(id), cancel: id => this.cancel(id),
    })
    installSelectionPolicy(this.ctx, owner => this.selection(owner))
    this.following.resumeExisting()
    this.worker = this.work()
  }

  private serialCatalog<T>(operation: () => Promise<T>): Promise<T> {
    const pending = this.catalogTail.then(() => { this.lifetime.signal.throwIfAborted(); return operation() })
    this.catalogTail = pending.catch(() => {})
    return pending
  }

  private get catalog() {
    if (!this.domain) throw new Error('WORKFLOW_CATALOG_UNAVAILABLE')
    return this.domain.table('templates')
  }

  private selection(owner: string): WorkflowChoice | null {
    const record = this.domain?.table('bindings').get(owner)
    return record?.tenantId === this.config.tenantId ? record.selection : null
  }

  private get following(): ConversationRuns {
    if (!this.conversationRuns) throw new Error('WORKFLOW_FOLLOW_UNAVAILABLE')
    return this.conversationRuns
  }

  /** Read a local conversation's workflow binding and current published choices.
   * @param sessionId - trusted authenticated UI's target Session.
   * @returns committed binding, available versions, and current Agent activity.
   */
  @Remote
  async conversationWorkflow(sessionId: SessionId): Promise<ConversationWorkflowState> {
    const agent = this.ctx.agents.get(sessionId)
    await requireLocalConversation(this.ctx, agent, this.lifetime.signal)
    const record = this.domain?.table('bindings').get(sessionId)
    const selection = this.selection(sessionId)
    const choices = (await this.templates()).flatMap(value => value.published
      ? [{ id: value.id, version: value.published.version, name: parseDraft(value.published.draftJson).name }] : [])
    return { sessionId, revision: record?.revision ?? 0, selection, choices,
      selectedAvailable: !selection || choices.some(choice => choice.id === selection.id && choice.version === selection.version),
      busy: agent?.status !== 'idle' }
  }

  /** Bind one exact published workflow, or return to ordinary chat without canceling accepted runs.
   * @param sessionId - local conversation to configure.
   * @param request - expected binding revision and explicit user selection.
   * @returns state after durable commit; active turns reject changes.
   * @throws when called from an Agent initiator rather than the authenticated UI.
   */
  @Remote
  async selectConversationWorkflow(sessionId: SessionId, request: SelectConversationWorkflowRequest): Promise<ConversationWorkflowState> {
    if (this.ctx.agents.currentInitiator()) throw new Error('WORKFLOW_UI_ACTION_REQUIRED')
    const agent = this.ctx.agents.get(sessionId)
    await requireLocalConversation(this.ctx, agent, this.lifetime.signal)
    if (!agent) throw new Error('WORKFLOW_LOCAL_CONVERSATION_REQUIRED')
    await agent.runMaintenance(signal => this.serialCatalog(async () => {
      const table = this.domain?.table('bindings')
      if (!table) throw new Error('WORKFLOW_CATALOG_UNAVAILABLE')
      const current = table.get(sessionId)
      if (current && current.tenantId !== this.config.tenantId) throw new Error('WORKFLOW_BINDING_NOT_OWNED')
      if (request.expectedRevision !== (current?.revision ?? 0)) throw new Error('WORKFLOW_BINDING_REVISION_CONFLICT')
      let selection: WorkflowChoice | null = null
      if (request.selection) {
        const template = this.template(request.selection.id), published = template.published
        if (!published || published.version !== request.selection.version) throw new Error('WORKFLOW_PUBLICATION_NOT_CURRENT')
        // PTC-only agents cannot call the native-only bound tool set; keep their current mode intact.
        const visible = (await this.ctx.systemPrompt.assemble({ scope: agent })).tools
        if (!visible.some(tool => tool.name === 'business_workflow_list')) throw new Error('WORKFLOW_NATIVE_TOOLS_REQUIRED')
        selection = { id: template.id, version: published.version, name: parseDraft(published.draftJson).name }
      }
      signal.throwIfAborted()
      await table.put(sessionId, { sessionId, tenantId: this.config.tenantId, revision: request.expectedRevision + 1, selection })
    }))
    return this.conversationWorkflow(sessionId)
  }

  /** Read current local-operator reviews started by this conversation, including earlier bindings.
   * @param sessionId - authenticated UI's local initiating Session.
   * @returns oldest 30 tasks, total count, and deployment polling interval; engine outages retain retry facts.
   */
  @Remote
  async conversationReviews(sessionId: SessionId): Promise<ConversationReviews> {
    await requireLocalConversation(this.ctx, this.ctx.agents.get(sessionId), this.lifetime.signal)
    const refreshIntervalMs = this.config.pollIntervalMs
    try {
      const response = object(await this.api.request('service/query/tasks?size=30&sort=createTime&order=asc', 'POST', {
        tenantId: this.config.tenantId, assignee: 'dh-local-operator',
        processInstanceVariables: [{ name: 'dh_owner_session', value: sessionId, operation: 'equals', type: 'string' }],
      }))
      if (!Array.isArray(response.data) || !Number.isSafeInteger(response.total) || Number(response.total) < 0) {
        throw new FlowableError('FLOWABLE_INVALID_RESPONSE')
      }
      const following = await this.following.state(sessionId)
      return { refreshIntervalMs, following, total: Number(response.total), error: '', items: response.data.map((value) => {
        const task = object(value)
        return { processId: brandString<ProcessId>(string(task.processInstanceId)),
          taskId: brandString<WorkItemId>(string(task.id)), name: string(task.name) }
      }) }
    } catch (error) {
      if (!(error instanceof FlowableError)) throw error
      return { refreshIntervalMs, following: [], total: 0, items: [], error: error.message }
    }
  }

  private async conversationProcess(sessionId: SessionId, id: ProcessId): Promise<ProcessDetail> {
    await requireLocalConversation(this.ctx, this.ctx.agents.get(sessionId), this.lifetime.signal)
    const process = await this.detail(id)
    if (process.ownerSessionId !== sessionId) throw new Error('WORKFLOW_PROCESS_NOT_OWNED_BY_CONVERSATION')
    return process
  }

  /** Keep following an existing conversation-owned run without starting another workflow.
   * @param sessionId - authenticated local initiating Session.
   * @param id - owned process to follow, including a run started before automatic waiting was available.
   * @returns after follow ownership is durable and an idle Agent has been awakened.
   */
  @Remote
  async followFromConversation(sessionId: SessionId, id: ProcessId): Promise<void> {
    const process = await this.conversationProcess(sessionId, id)
    const agent = this.ctx.agents.get(sessionId)
    if (!agent) throw new Error('WORKFLOW_LOCAL_CONVERSATION_REQUIRED')
    await this.following.attach(sessionId, process, this.lifetime.signal)
    this.following.resume(agent)
  }

  /** Open a conversation-owned review using its pinned draft and exact node input.
   * @param sessionId - local initiating Session.
   * @param id - process opened from that Session's review card.
   * @param taskId - exact task selected; completed tasks never select their successor implicitly.
   * @returns process evidence and current input, or null input after the selected task ends.
   */
  @Remote
  async conversationReviewDetail(sessionId: SessionId, id: ProcessId, taskId: WorkItemId): Promise<ConversationReviewDetail> {
    const process = await this.conversationProcess(sessionId, id)
    const item = process.items.find(value => value.id === taskId && value.kind === 'human')
    if (!item) return { process, inputJson: null }
    const draft = parseDraft(process.draftJson), node = draft.nodes.find(value => value.id === item.nodeId)
    if (!node) throw new Error('WORKFLOW_ACTIVITY_UNKNOWN')
    const input = this.input(draft, node.source, node.field, await this.variables(id))
    return { process, inputJson: JSON.stringify(input ?? null) }
  }

  /** Submit an explicit human decision from the initiating conversation; Agent tools cannot call it.
   * @param sessionId - authenticated UI's local initiating Session.
   * @param id - owned process.
   * @param taskId - exact current task; stale submissions reject.
   * @param approved - true continues, false terminates the process.
   * @returns refreshed process state after the existing operator review operation.
   */
  @Remote
  async reviewFromConversation(sessionId: SessionId, id: ProcessId, taskId: WorkItemId, approved: boolean): Promise<ProcessDetail> {
    await this.conversationProcess(sessionId, id)
    return this.review(id, taskId, approved)
  }

  /** List this deployment's saved drafts and active publications.
   * @returns durable templates.
   */
  @Remote
  templates(): Promise<WorkflowTemplate[]> {
    return Promise.resolve([...this.catalog.entries()].map(([, value]) => value).filter(value => value.tenantId === this.config.tenantId))
  }

  /** Save an editable draft without changing its active publication.
   * @param request - draft and expected server revision; zero creates.
   * @returns committed template.
   */
  @Remote
  async saveTemplate(request: SaveTemplateRequest): Promise<WorkflowTemplate> {
    return this.serialCatalog(async () => {
      if (!/^[A-Za-z0-9_-]{1,128}$/.test(request.id)) throw new Error('INVALID_WORKFLOW_ID')
      const draft = parseDraft(request.draftJson)
      if (draft.id !== request.id) throw new Error('WORKFLOW_ID_MISMATCH')
      const table = this.catalog, previous = table.get(request.id)
      if (previous && previous.tenantId !== this.config.tenantId) throw new Error('WORKFLOW_TEMPLATE_NOT_OWNED')
      if (request.expectedRevision !== (previous?.revision ?? 0)) throw new Error('WORKFLOW_REVISION_CONFLICT')
      if (!previous && (await this.templates()).length >= this.config.maxTemplates) throw new Error('WORKFLOW_TEMPLATE_LIMIT')
      const record: WorkflowTemplate = { id: draft.id, tenantId: this.config.tenantId, revision: request.expectedRevision + 1,
        lastVersion: previous?.lastVersion ?? 0, draftJson: serializeDraft(draft), updatedAt: new Date().toISOString(),
        published: previous?.published ?? null }
      await table.put(record.id, record)
      return record
    })
  }

  /** Publish a saved revision after graph validation and engine deployment.
   * @param id - saved template identity.
   * @param expectedRevision - revision the operator reviewed.
   * @returns committed publication and pinned engine definition.
   */
  @Remote
  async publishTemplate(id: string, expectedRevision: number): Promise<WorkflowTemplate> {
    return this.serialCatalog(async () => {
      const previous = this.template(id)
      if (previous.revision !== expectedRevision) throw new Error('WORKFLOW_REVISION_CONFLICT')
      const draft = parseDraft(previous.draftJson)
      if (!draft.description.trim()) throw new Error('WORKFLOW_DESCRIPTION_REQUIRED')
      const definitionId = await this.deploy(previous.draftJson)
      const record = { ...previous, revision: previous.revision + 1, lastVersion: previous.lastVersion + 1,
        published: { version: previous.lastVersion + 1, definitionId, draftJson: previous.draftJson,
          publishedAt: new Date().toISOString() } }
      await this.catalog.put(id, record)
      return record
    })
  }

  /** Withdraw future starts; accepted runs retain their pinned publication.
   * @param id - saved template identity.
   * @param expectedRevision - revision the operator reviewed.
   * @returns committed unpublished template.
   */
  @Remote
  async unpublishTemplate(id: string, expectedRevision: number): Promise<WorkflowTemplate> {
    return this.serialCatalog(async () => {
      const previous = this.template(id)
      if (previous.revision !== expectedRevision) throw new Error('WORKFLOW_REVISION_CONFLICT')
      const record = { ...previous, revision: previous.revision + 1, published: null }
      await this.catalog.put(id, record)
      return record
    })
  }

  private template(id: string): WorkflowTemplate {
    const value = this.catalog.get(id)
    if (!value || value.tenantId !== this.config.tenantId) throw new Error('WORKFLOW_TEMPLATE_NOT_OWNED')
    return value
  }

  /** Start the current published version from the authenticated workbench.
   * @param request - exact version, validated inputs, and delivery key.
   * @returns accepted engine run.
   * @throws when an Agent calls this operator entry instead of the selected-workflow tool.
   */
  @Remote
  async startPublished(request: StartPublishedRequest): Promise<ProcessDetail> {
    if (this.ctx.agents.currentInitiator()) throw new Error('WORKFLOW_USE_SELECTED_START_TOOL')
    return this.serialCatalog(() => this.startPublication(request, '', this.lifetime.signal))
  }

  private async startPublication(request: StartPublishedRequest, owner: string, signal: AbortSignal): Promise<ProcessDetail> {
    const selected = owner ? this.selection(owner) : null
    if (owner && !selected) throw new Error('WORKFLOW_SELECTION_REQUIRED')
    if (selected && (selected.id !== request.id || selected.version !== request.version)) throw new Error('WORKFLOW_SELECTION_MISMATCH')
    const publication = this.template(request.id).published
    if (!publication || publication.version !== request.version) throw new Error('WORKFLOW_PUBLICATION_NOT_CURRENT')
    if (request.inputJson.length > 131072) throw new Error('WORKFLOW_INPUT_TOO_LARGE')
    const draft = parseDraft(publication.draftJson)
    const inputJson = JSON.stringify(validateInputs(draft.inputs, JSON.parse(request.inputJson) as unknown))
    // The executor derives the delivery key and owner; model arguments cannot supply either.
    const delivery = owner ? createHash('sha256').update(owner + ':' + request.requestId).digest('hex') : request.requestId
    return this.launch({ requestId: delivery, draftJson: publication.draftJson, inputJson }, publication.definitionId,
      { owner, workflowId: request.id, version: publication.version }, signal)
  }

  /**
   * Read engine version; credentials stay on the Host.
   * @returns connection facts.
   */
  @Remote
  async health(): Promise<EngineHealth> {
    try {
      const engine = await this.api.read('service/management/engine')
      return { connected: true, version: string(engine.version), error: '', refreshIntervalMs: this.config.pollIntervalMs }
    } catch (error) {
      if (!(error instanceof FlowableError)) throw error
      return { connected: false, version: '', error: error.message, refreshIntervalMs: this.config.pollIntervalMs }
    }
  }

  /**
   * List this deployment's newest durable runs.
   * @returns process summaries.
   */
  @Remote
  async list(): Promise<ProcessSummary[]> {
    return (await this.api.list(`service/history/historic-process-instances?tenantId=${encode(this.config.tenantId)}&size=30&sort=startTime&order=desc`))
      .filter(row => typeof row.businessKey === 'string' && row.businessKey.startsWith('dh-business:')).map(row => this.summary(row))
  }

  /**
   * Start a pinned revision in Flowable; concurrent same-key requests on this Host share creation.
   * @param request - draft JSON, JSON inputs, and delivery identity.
   * @returns engine-owned run.
   * @throws when an Agent calls this operator entry instead of the selected-workflow tool.
   */
  @Remote
  async start(request: StartProcessRequest): Promise<ProcessDetail> {
    if (this.ctx.agents.currentInitiator()) throw new Error('WORKFLOW_USE_SELECTED_START_TOOL')
    if (!/^[A-Za-z0-9-]{1,80}$/.test(request.requestId)) throw new Error('INVALID_START_REQUEST')
    const pending = this.starts.get(request.requestId)
    if (pending) return pending
    const operation = this.startProcess(request)
    this.starts.set(request.requestId, operation)
    try { return await operation } finally { this.starts.delete(request.requestId) }
  }

  private async startProcess(request: StartProcessRequest): Promise<ProcessDetail> {
    if (request.inputJson.length > 131072) throw new Error('WORKFLOW_INPUT_TOO_LARGE')
    object(JSON.parse(request.inputJson) as unknown)
    const draftJson = serializeDraft(parseDraft(request.draftJson))
    const existing = await this.api.list(`service/history/historic-process-instances?businessKey=${encode(`dh-business:${request.requestId}`)}&tenantId=${encode(this.config.tenantId)}`)
    if (existing[0]) {
      const detail = await this.detail(brandString<ProcessId>(string(existing[0].id)))
      if (detail.draftJson !== draftJson || detail.inputJson !== request.inputJson || detail.ownerSessionId) throw new Error('WORKFLOW_DELIVERY_CONFLICT')
      return detail
    }
    const definitionId = await this.deploy(draftJson)
    return this.launch({ ...request, draftJson }, definitionId, { owner: '', workflowId: '', version: 0 }, this.lifetime.signal)
  }

  private async deploy(draftJson: string): Promise<string> {
    const draft = parseDraft(draftJson), key = processKey(draftJson)
    const xml = compileBpmn(draft, key, this.config.tenantId)
    const form = new FormData()
    form.set('file', new Blob([xml], { type: 'application/xml' }), `${key}.bpmn20.xml`)
    form.set('tenantId', this.config.tenantId)
    const deployment = object(await this.api.request('service/repository/deployments', 'POST', form))
    const definitions = await this.api.list(`service/repository/process-definitions?deploymentId=${encode(string(deployment.id))}`)
    const definition = definitions[0]
    if (!definition) throw new FlowableError('FLOWABLE_DEFINITION_MISSING')
    return string(definition.id)
  }

  private async launch(
    request: StartProcessRequest, definitionId: string,
    source: { owner: string; workflowId: string; version: number }, signal: AbortSignal,
  ): Promise<ProcessDetail> {
    if (!/^[A-Za-z0-9-]{1,80}$/.test(request.requestId)) throw new Error('INVALID_START_REQUEST')
    const businessKey = `dh-business:${request.requestId}`, draftJson = request.draftJson, draft = parseDraft(draftJson)
    const existing = await this.api.list(`service/history/historic-process-instances?businessKey=${encode(businessKey)}&tenantId=${encode(this.config.tenantId)}`)
    if (existing[0]) {
      const detail = await this.detail(brandString<ProcessId>(string(existing[0].id)))
      if (detail.ownerSessionId !== source.owner || detail.workflowId !== source.workflowId || detail.workflowVersion !== source.version
        || detail.inputJson !== request.inputJson || detail.draftJson !== draftJson) throw new Error('WORKFLOW_DELIVERY_CONFLICT')
      return detail
    }
    signal.throwIfAborted()
    const process = object(await this.api.request('service/runtime/process-instances', 'POST', {
      processDefinitionId: definitionId, businessKey, name: draft.name,
      variables: [variable('dh_draft', draftJson), variable('dh_inputs', request.inputJson),
        variable('dh_owner_session', source.owner), variable('dh_workflow_id', source.workflowId), variable('dh_workflow_version', String(source.version)),
        ...draft.nodes.flatMap((node, index) => node.kind === 'start' ? [variable(resultKey(index), JSON.stringify({ result: JSON.parse(request.inputJson) as unknown }))] : [])],
    }))
    return this.detail(brandString<ProcessId>(string(process.id)))
  }

  /**
   * Read current work and history from the engine.
   * @param id - process belonging to this deployment.
   * @returns pinned draft, current work, and persisted outputs.
   */
  @Remote
  async detail(id: ProcessId): Promise<ProcessDetail> {
    const row = await this.owned(id), vars = await this.variables(id)
    const draftJson = string(vars.get('dh_draft')), inputJson = string(vars.get('dh_inputs')), draft = parseDraft(draftJson)
    const activities = await this.api.list(`service/history/historic-activity-instances?processInstanceId=${encode(id)}&size=512&sort=startTime&order=asc`)
    const items: EngineWorkItem[] = []
    const nodeIndex = (key: unknown): number => draft.nodes.findIndex((_node, index) => activityId(index) === key)
    if (!row.endTime) {
      const [tasks, executions, jobs, failedJobs] = await Promise.all([
        this.api.list(`service/runtime/tasks?processInstanceId=${encode(id)}&size=64`),
        this.api.list(`service/runtime/executions?processInstanceId=${encode(id)}&size=128`),
        this.api.list(`external-job-api/jobs?processInstanceId=${encode(id)}&size=64`),
        this.api.list(`service/management/deadletter-jobs?processInstanceId=${encode(id)}&size=64`),
      ])
      for (const task of tasks) {
        const node = draft.nodes[nodeIndex(task.taskDefinitionKey)]
        if (node?.kind === 'human') items.push({ id: brandString<WorkItemId>(string(task.id)), nodeId: node.id,
          name: node.name, kind: 'human', status: 'waiting', error: '' })
      }
      for (const execution of executions) {
        const node = draft.nodes[nodeIndex(execution.activityId)]
        if (node?.kind === 'wait') items.push({ id: brandString<WorkItemId>(string(execution.id)), nodeId: node.id,
          name: node.name, kind: 'wait', status: 'waiting', error: '' })
      }
      for (const job of [...jobs, ...failedJobs]) {
        const execution = executions.find(item => item.id === job.executionId)
        const index = nodeIndex(job.elementId ?? execution?.activityId), node = draft.nodes[index]
        if (!node || !['action', 'agent', 'condition'].includes(node.kind)) continue
        const unavailable = node.kind === 'action' && !['core.echo', 'demo.wecom.todos', 'wecom.todos.list'].includes(node.action)
        const error = optionalString(vars.get(`dh_error_${index}`)) || optionalString(job.exceptionMessage)
        items.push({ id: brandString<WorkItemId>(string(job.id)), nodeId: node.id, name: node.name,
          kind: node.kind as 'action' | 'agent' | 'condition',
          status: error ? 'failed' : unavailable ? 'unavailable' : job.lockOwner ? 'executing' : 'waiting',
          error: error || (unavailable ? 'CONNECTOR_NOT_CONFIGURED' : '') })
      }
    }
    return { ...this.summary(row), draftJson, inputJson, items,
      ownerSessionId: optionalString(vars.get('dh_owner_session')), workflowId: optionalString(vars.get('dh_workflow_id')), workflowVersion: Number(vars.get('dh_workflow_version') ?? 0),
      completed: [...new Set(activities.filter(item => item.endTime && nodeIndex(item.activityId) >= 0)
        .flatMap((item) => { const node = draft.nodes[nodeIndex(item.activityId)]; return node ? [node.id] : [] }))],
      results: draft.nodes.flatMap((node, index) => {
        const value = vars.get(resultKey(index))
        return typeof value === 'string' ? [{ nodeId: node.id, json: value }] : []
      }),
    }
  }

  /**
   * Handle only a current engine human task; overlapping or stale reviews reject, and rejection cancels the process.
   * @param id - owning process.
   * @param taskId - open task identity.
   * @param approved - explicit local-operator decision.
   * @returns refreshed state.
   */
  @Remote
  async review(id: ProcessId, taskId: WorkItemId, approved: boolean): Promise<ProcessDetail> {
    if (this.reviews.has(id)) throw new Error('WORKFLOW_REVIEW_BUSY')
    this.reviews.add(id)
    try { return await this.reviewCurrent(id, taskId, approved) } finally { this.reviews.delete(id) }
  }

  private async reviewCurrent(id: ProcessId, taskId: WorkItemId, approved: boolean): Promise<ProcessDetail> {
    const run = await this.detail(id)
    if (!run.items.some(item => item.id === taskId && item.kind === 'human')) throw new Error('CURRENT_HUMAN_TASK_REQUIRED')
    if (!approved) return this.cancel(id)
    const draft = parseDraft(run.draftJson), item = run.items.find(value => value.id === taskId)
    const index = draft.nodes.findIndex(node => node.id === item?.nodeId), node = draft.nodes[index]
    if (!node) throw new Error('WORKFLOW_ACTIVITY_UNKNOWN')
    const input = this.input(draft, node.source, node.field, await this.variables(id))
    await this.api.request(`service/runtime/tasks/${encode(taskId)}`, 'POST', { action: 'complete',
      variables: [variable(`dh_review_${taskId}`, 'approved by authenticated DH local operator'),
        variable(resultKey(index), JSON.stringify({ result: input ?? null, approved: true }))] })
    return this.detail(id)
  }

  /**
   * Deliver an operator-confirmed event to a current receive task.
   * @param id - owning process.
   * @param executionId - current receive execution.
   * @returns refreshed state.
   */
  @Remote
  async arrive(id: ProcessId, executionId: WorkItemId): Promise<ProcessDetail> {
    const run = await this.detail(id)
    if (!run.items.some(item => item.id === executionId && item.kind === 'wait')) throw new Error('CURRENT_WAIT_REQUIRED')
    const draft = parseDraft(run.draftJson), item = run.items.find(value => value.id === executionId)
    const index = draft.nodes.findIndex(node => node.id === item?.nodeId), node = draft.nodes[index]
    if (!node) throw new Error('WORKFLOW_ACTIVITY_UNKNOWN')
    const input = this.input(draft, node.source, node.field, await this.variables(id))
    await this.api.request(`service/runtime/executions/${encode(executionId)}`, 'PUT', { action: 'trigger',
      variables: [variable(`dh_arrival_${executionId}`, 'confirmed by authenticated DH local operator'),
        variable(resultKey(index), JSON.stringify({ result: input ?? null, arrived: true }))] })
    return this.detail(id)
  }

  /**
   * Cancel an owned run and drain its current analysis.
   * @param id - process identity.
   * @returns final engine history.
   */
  @Remote
  async cancel(id: ProcessId): Promise<ProcessDetail> {
    const row = await this.owned(id)
    if (!row.endTime) {
      const active = this.active.get(id)
      active?.controller.abort()
      await active?.done
      await this.api.request(`service/runtime/process-instances/${encode(id)}?deleteReason=DH_LOCAL_OPERATOR_CANCELED`, 'DELETE')
    }
    return this.detail(id)
  }

  private async owned(id: string): Promise<Record<string, unknown>> {
    const row = await this.api.read(`service/history/historic-process-instances/${encode(id)}`)
    if (row.tenantId !== this.config.tenantId || typeof row.businessKey !== 'string' || !row.businessKey.startsWith('dh-business:')) {
      throw new Error('WORKFLOW_PROCESS_NOT_OWNED')
    }
    return row
  }
  private summary(row: Record<string, unknown>): ProcessSummary {
    return { id: brandString<ProcessId>(string(row.id)), name: optionalString(row.name),
      status: row.endTime ? row.deleteReason ? 'canceled' : 'completed' : 'running',
      startedAt: string(row.startTime), endedAt: optionalString(row.endTime) }
  }
  private async variables(id: string): Promise<Map<string, unknown>> {
    const rows = await this.api.list(`service/history/historic-variable-instances?processInstanceId=${encode(id)}&size=1024`)
    return new Map(rows.map((row) => { const v = object(row.variable); return [string(v.name), v.value] }))
  }

  private async work(): Promise<void> {
    while (!this.stopping()) {
      try {
        for (const topic of topics) {
          const acquired: unknown = await this.api.request('external-job-api/acquire/jobs', 'POST', {
            topic: `dh.business.${this.config.tenantId}.${topic}`, workerId: this.workerId, numberOfTasks: 1, scopeType: 'bpmn',
            lockDuration: `PT${this.config.lockDurationMs / 1000}S`,
          })
          if (!Array.isArray(acquired)) throw new FlowableError('FLOWABLE_INVALID_RESPONSE')
          for (const value of acquired) {
            const job = object(value), id = string(job.processInstanceId), controller = new AbortController()
            const done = this.executeJob(job, controller.signal)
            this.active.set(id, { controller, done })
            try { await done } finally { this.active.delete(id) }
          }
        }
      } catch (error) {
        if (this.stopping()) return
        if (!(error instanceof FlowableError)) this.ctx.logger.warn('Business workflow worker: %s', error instanceof Error ? error.message : 'job failed')
      }
      try { await delay(this.config.pollIntervalMs, undefined, { signal: this.lifetime.signal }) } catch { return }
    }
  }

  private stopping(): boolean { return this.lifetime.signal.aborted }

  private async executeJob(job: Record<string, unknown>, cancel: AbortSignal): Promise<void> {
    const processId = string(job.processInstanceId), jobId = string(job.id)
    let index = -1
    try {
      await this.owned(processId)
      const vars = await this.variables(processId), draft = parseDraft(string(vars.get('dh_draft')))
      const execution = await this.api.read(`service/runtime/executions/${encode(string(job.executionId))}`)
      index = draft.nodes.findIndex((_node, i) => activityId(i) === execution.activityId)
      const node = draft.nodes[index]
      if (!node) throw new Error('WORKFLOW_ACTIVITY_UNKNOWN')
      if (vars.has(`dh_attempt_${index}`)) throw new Error('PREVIOUS_ATTEMPT_UNCERTAIN_REQUIRES_OPERATOR')
      const input = this.input(draft, node.source, node.field, vars)
      if (input === undefined && (node.kind !== 'condition' || node.operator !== 'exists')) throw new Error('WORKFLOW_INPUT_NOT_AVAILABLE')
      const signal = AbortSignal.any([cancel, this.lifetime.signal, AbortSignal.timeout(this.config.analysisTimeoutMs)])
      const variables: ReturnType<typeof variable>[] = []
      let output: unknown
      if (node.kind === 'agent' || (node.kind === 'action' && node.action === 'wecom.todos.list')) {
        const sessionId = randomUUID()
        await this.api.request(`service/runtime/process-instances/${encode(processId)}/variables`, 'PUT', [variable(`dh_attempt_${index}`, sessionId)])
        output = node.kind === 'agent' ? await runAnalysis(this.ctx, sessionId, node.instruction, input, signal)
          : await readWecomTodos(this.ctx, sessionId, signal)
      } else if (node.kind === 'action' && node.action === 'demo.wecom.todos') output = createDemoTodos(input)
      else if (node.kind === 'condition') {
        const matches = node.operator === 'exists' ? input !== undefined
          : node.operator === 'eq' ? input === JSON.parse(node.expected) : input !== JSON.parse(node.expected)
        variables.push(variable(`dh_gate_${index}`, matches))
        output = { result: matches }
      } else if (node.kind === 'action' && node.action === 'core.echo') output = { result: input ?? null }
      else throw new Error('CONNECTOR_NOT_CONFIGURED')
      signal.throwIfAborted()
      variables.push(variable(resultKey(index), JSON.stringify(output)))
      await this.api.request(`external-job-api/acquire/jobs/${encode(jobId)}/complete`, 'POST', { workerId: this.workerId, variables })
    } catch (error) {
      if (this.lifetime.signal.aborted) return
      const message = error instanceof FlowableError ? error.message
        : error instanceof Error && error.name === 'TimeoutError' ? 'WORKFLOW_STEP_TIMED_OUT'
          : error instanceof Error && /^[A-Z_]+$/.test(error.message) ? error.message : 'WORKFLOW_STEP_FAILED'
      if (index >= 0) await this.api.request(`service/runtime/process-instances/${encode(processId)}/variables`, 'PUT', [variable(`dh_error_${index}`, message)])
      await this.api.request(`external-job-api/acquire/jobs/${encode(jobId)}/fail`, 'POST', { workerId: this.workerId, retries: 0, errorMessage: message })
    }
  }

  private input(draft: WorkflowDraft, source: string, field: string, vars: Map<string, unknown>): unknown {
    const index = draft.nodes.findIndex(node => node.id === source)
    const raw = source ? vars.get(resultKey(index)) : vars.get('dh_inputs')
    if (typeof raw !== 'string') throw new Error('WORKFLOW_INPUT_NOT_AVAILABLE')
    let value: unknown = JSON.parse(raw)
    if (!field) return value
    for (const segment of field.split('.')) {
      if (['__proto__', 'prototype', 'constructor'].includes(segment)) throw new Error('WORKFLOW_INPUT_FIELD_INVALID')
      if (value === null || typeof value !== 'object' || !Object.hasOwn(value, segment)) return undefined
      value = (value as Record<string, unknown>)[segment]
    }
    return value
  }
}
export default BusinessWorkflows
