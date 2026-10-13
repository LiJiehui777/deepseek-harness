# 扩展

[English](extensions.md) | 中文

extensions 子系统允许 agent（智能体）定义带版本的 Cordis 包、运行其 host 与浏览器两半，并在编写代码前查询获准公开的运行时元数据。包生命周期与沙箱行为由 [`packages/extensions`](../../packages/extensions/README.zh.md) 包组说明。

<!-- BEGIN GENERATED cordis-surface (gen-cordis-catalog.ts) — do not edit between markers -->

<a id="cordis-surface"></a>

## Cordis API

Generated from source by `scripts/gen-cordis-catalog.ts` (verified fresh by `pnpm run verify-cordis-catalog` in doc-sync; regenerate with `pnpm run gen-cordis-catalog`) — the language sides differ only in locale-specific paired document paths. Signature blocks use a `ts cordis-catalog` fence and keep the original source JSDoc; dispatch modes are defined in the [primer](../cordis-primer.zh.md#dispatch-modes), and the framework-inherited `ctx` API lives in [cordis-api/inherited.md](../cordis-api/inherited.md).

<a id="ctxcordisinspect--cordisinspectregistryservice"></a>

### `ctx.cordisInspect` — `CordisInspectRegistryService`

Registry and cross-page router behind the two model-facing inspect tools.

```ts cordis-catalog
/**
 * Register one Host provider.
 * @param registration - manifest and local query handler.
 * @returns idempotent disposer.
 */
register(registration: HostCordisInspectProviderRegistration): () => void

/**
 * Replace the mirrored Client provider directory.
 * @param providers - complete Client manifest snapshot.
 */
syncClientManifest(providers: readonly CordisInspectProviderManifest[]): void

/**
 * Return the complete known Host and Client provider directory.
 * @returns Host providers followed by the Client providers.
 */
list(): CordisInspectProviderView[]

/**
 * Execute one provider query on its owning platform.
 * @param platform - Host or Client runtime.
 * @param providerId - provider selected from {@link list}.
 * @param methodName - declared method name.
 * @param input - optional lossless JSON input.
 * @param agent - requesting Agent and scope.
 * @param signal - tool-call cancellation.
 * @returns provider JSON data.
 */
async query( platform: CordisInspectPlatform, providerId: string, methodName: string, input: JsonValue | undefined, agent: Agent, signal: AbortSignal, ): Promise<JsonValue>

/**
 * Accept the first valid Client response for a pending query.
 * @param agent - Agent whose Session owns the query.
 * @param requestId - Pending Client query identity.
 * @param resolution - Client provider result or failure.
 * @returns whether this response settled the still-pending query.
 */
resolveClientQuery( agent: Agent, requestId: CordisInspectRequestId, resolution: CordisInspectQueryResolution, ): CordisInspectResolveAck
```

Types: [Agent](core.zh.md)

Source: [`packages/extensions/cordis-host-runner/src/inspect-registry.ts`](../../packages/extensions/cordis-host-runner/src/inspect-registry.ts)

<a id="ctxdynamiccordisrunner--dynamiccordisrunnerservice"></a>

### `ctx.dynamicCordisRunner` — `DynamicCordisRunnerService`

Dynamic Plugin registry and Host-half lifecycle.

```ts cordis-catalog
/**
 * Define a new Plugin's first Package or append a Package to an existing Plugin.
 * @param request - Session ownership, Plugin selection, metadata, and source code.
 * @returns Host-minted Plugin and Package identities with declared-half metadata.
 */
define(request: DynamicCordisDefineRequest): DynamicCordisDefineReceipt

/**
 * Remove a Plugin, its active run, and all immutable Packages.
 * @param agent - Agent whose Session must own the Plugin.
 * @param pluginId - Stable Plugin identity to remove.
 * @returns Whether removal succeeded and whether it stopped an active run.
 */
async undefine(agent: Agent, pluginId: CordisDynamicPluginId): Promise<DynamicCordisUndefineReceipt>

/**
 * Remove a Plugin from the user panel and queue the resulting state change for the model's next step.
 * @param agent - Agent whose Session owns the Plugin and receives the context.
 * @param pluginId - Stable Plugin identity to remove.
 * @returns Whether removal succeeded and whether it stopped an active run.
 */
@Remote('undefineFromPanel') async undefineFromPanel(agent: Agent, pluginId: CordisDynamicPluginId): Promise<DynamicCordisUndefineReceipt>

/**
 * Start or update one Package for a model tool call. An unauthorized Client
 * Package waits for approval; Plugin-wide authorization covers later versions.
 * @param agent - Agent whose Session must own the Plugin.
 * @param pluginId - Stable Plugin identity to activate.
 * @param packageId - Immutable Package version to activate.
 * @param mode - Whether to run the current version or switch versions.
 * @param signal - Tool-call cancellation signal while the activation request is being created.
 * @returns The successful activation identity or an actionable refusal.
 */
async run( agent: Agent, pluginId: CordisDynamicPluginId, packageId: CordisDynamicPackageId, mode: CordisDynamicRunMode, signal?: AbortSignal, ): Promise<DynamicCordisRunResponse>

/**
 * Start Host code for an approved request or a direct panel gesture.
 * @param agent - Agent whose Session must own the Plugin.
 * @param pluginId - Stable Plugin identity to activate.
 * @param packageId - Immutable Package version to activate.
 * @param mode - Whether to run the current version or switch versions.
 * @param requestId - Model-driven request identity, or null for a direct user gesture.
 * @param approveFutureVersions - Whether this approval covers later Packages of the same Plugin.
 * @returns The exact Host activation or a failure message.
 */
@Remote('runHostHalf') async runHostHalf( agent: Agent, pluginId: CordisDynamicPluginId, packageId: CordisDynamicPackageId, mode: CordisDynamicRunMode, requestId: ApprovalRequestId | null, approveFutureVersions: boolean, ): Promise<DynamicCordisHostHalfResult>

/**
 * Fetch Client code for the exact active run.
 * @param agent - Agent whose Session must own the Plugin.
 * @param pluginId - Stable Plugin identity to read.
 * @param pluginRunId - Exact active run authorized to receive source.
 * @returns Client source and its Plugin, Package, and run identities.
 */
@Remote('getClientCode') getClientCode( agent: Agent, pluginId: CordisDynamicPluginId, pluginRunId: CordisDynamicPluginRunId, ): DynamicCordisClientSource

/**
 * Resolve one model-driven Client activation request.
 * @param requestId - Request identity to settle once.
 * @param resolution - Browser refusal or exact Client activation result.
 * @returns Whether the still-pending request accepted this resolution.
 */
@Remote('resolveRequestRun') async resolveRequestRun( requestId: ApprovalRequestId, resolution: DynamicCordisRunResolution, ): Promise<DynamicCordisResolveAck>

/**
 * Settle a direct panel run after this page loaded or failed its Client half.
 * @param agent - Agent whose Session must own the Plugin.
 * @param pluginId - Stable Plugin identity being settled.
 * @param resolution - Exact Client activation result from the acting page.
 * @returns The committed activation or its failure.
 */
@Remote('settleUserRun') async settleUserRun( agent: Agent, pluginId: CordisDynamicPluginId, resolution: DynamicCordisRunResolution, ): Promise<DynamicCordisRunResponse>

/**
 * Stop the active run while retaining every Package version.
 * @param agent - Agent whose Session must own the Plugin.
 * @param pluginId - Stable Plugin identity to stop.
 * @returns Success or the reason no run was stopped.
 */
async stop(agent: Agent, pluginId: CordisDynamicPluginId): Promise<DynamicCordisStopResponse>

/**
 * Stop a Plugin from the user panel and queue the resulting state change for the model's next step.
 * @param agent - Agent whose Session owns the Plugin and receives the context.
 * @param pluginId - Stable Plugin identity to stop.
 * @returns Success or the reason no run was stopped.
 */
@Remote('stopFromPanel') async stopFromPanel(agent: Agent, pluginId: CordisDynamicPluginId): Promise<DynamicCordisStopResponse>

/**
 * Replace the Host mirror of the Client inspect provider directory.
 * @param providers - complete Client provider manifest.
 * @returns null after accepting the manifest.
 */
@Remote('syncInspectManifest') syncInspectManifest(providers: readonly CordisInspectProviderManifest[]): null

/**
 * Claim one pending Client inspect query with its live result.
 * @param agent - Session that owns the query.
 * @param requestId - exact pending query identity.
 * @param resolution - provider result or structured refusal.
 * @returns whether this answer won the query.
 */
@Remote('resolveInspectQuery') resolveInspectQuery( agent: Agent, requestId: CordisInspectRequestId, resolution: CordisInspectQueryResolution, ): CordisInspectResolveAck

/**
 * Frame-wide inventory, grouped as one row per stable Plugin.
 * @returns Source-free metadata for every process-local Plugin.
 */
@Remote('inventory') inventory(): DynamicCordisInventoryRow[]

/**
 * Read one Session's Host-rich state for inspection and result rendering.
 * @param agent - Agent whose Session selects visible Plugins.
 * @returns Plugin versions, active runs, Host fibers, and render failures.
 */
snapshot(agent: Agent): DynamicCordisSnapshotRow[]

/**
 * Read source-free context for an explicit `@pluginId` user gesture.
 * @param agent - Agent whose Session must own the Plugin.
 * @param pluginId - Stable Plugin identity referenced by the user.
 * @returns The preferred modification base, or undefined when unavailable.
 */
reference(agent: Agent, pluginId: CordisDynamicPluginId): DynamicCordisReference | undefined

/**
 * List source-free Plugin summaries owned by one Session.
 * @param agent - Agent whose Session selects visible Plugins.
 * @returns one summary per Plugin in creation order.
 */
listPlugins(agent: Agent): DynamicCordisPluginInspection[]

/**
 * Inspect one Plugin without returning Package source.
 * @param agent - Agent whose Session must own the Plugin.
 * @param pluginId - stable Plugin identity.
 * @returns version pointers, latest run, and all Package summaries.
 */
inspectPlugin(agent: Agent, pluginId: CordisDynamicPluginId): DynamicCordisPluginInspection

/**
 * Read one exact immutable Package and its Host and Client source.
 * @param agent - Agent whose Session must own the Plugin.
 * @param pluginId - Stable Plugin identity that owns the Package.
 * @param packageId - Exact immutable Package identity to inspect.
 * @returns Package metadata, source, and the Plugin's lifecycle pointers.
 */
inspectPackage( agent: Agent, pluginId: CordisDynamicPluginId, packageId: CordisDynamicPackageId, ): DynamicCordisPackageInspection

/**
 * Record a post-load render failure for the exact active run.
 * @param agent - Agent whose Session must own the Plugin.
 * @param pluginId - Stable Plugin identity that rendered.
 * @param pluginRunId - Exact active run that produced the failure.
 * @param failure - Slot, message, and entry-retirement result.
 * @returns Null after recording or ignoring a stale report.
 */
@Remote('reportRenderFailure') async reportRenderFailure( agent: Agent, pluginId: CordisDynamicPluginId, pluginRunId: CordisDynamicPluginRunId, failure: DynamicCordisRenderFailure, ): Promise<null>

/**
 * Report a Client guard rejection that happened after the Package completed activation.
 * @param agent - Agent whose Session must own the Plugin.
 * @param pluginId - Stable Plugin identity whose Client code was rejected.
 * @param pluginRunId - Exact active run that produced the rejection.
 * @param failure - Original guard message and stack.
 * @returns Null after reporting or ignoring a stale/startup failure.
 */
@Remote('reportClientGuardFailure') async reportClientGuardFailure( agent: Agent, pluginId: CordisDynamicPluginId, pluginRunId: CordisDynamicPluginRunId, failure: CordisErrorDetails, ): Promise<null>

/**
 * Invoke an active Host method while rejecting stale Client runs.
 * @param pluginId - Stable Plugin identity that owns the method.
 * @param pluginRunId - Exact active run authorizing the call.
 * @param method - Registered Host handler name.
 * @param args - JSON argument delivered to the handler.
 * @returns The JSON result or a typed invocation failure.
 */
@Remote('invoke') async invoke( pluginId: CordisDynamicPluginId, pluginRunId: CordisDynamicPluginRunId, method: string, args: JsonValue, ): Promise<DynamicCordisInvokeResult>
```

Types: [Agent](core.zh.md)

Source: [`packages/extensions/cordis-host-runner/src/index.ts`](../../packages/extensions/cordis-host-runner/src/index.ts)

<a id="ctxinspector--inspectorservice"></a>

### `ctx.inspector` — `InspectorService`

Shared Host/Client service façade over the realm's source publisher.

```ts cordis-catalog
/**
 * Publish one JSON observation without waiting for Worker delivery.
 * @param topic - Domain-owned topic name.
 * @param payload - JSON value validated before it reaches the carrier.
 * @param monotonicMs - Source-clock timestamp; defaults to `performance.now()`.
 */
publish(topic: string, payload: InspectorJsonValue, monotonicMs?: number): void
```

Source: [`packages/experimental/inspector/src/index.ts`](../../packages/experimental/inspector/src/index.ts)

<a id="ctxpluginmanager--pluginmanager"></a>

### `ctx.pluginManager` — `PluginManager`

Manage profile files and apply their declared reload lifecycle.

```ts cordis-catalog
/** Read exact plugin-version exemptions saved in this profile.
 * @returns Accepted package-name@version keys with the runtime versions they may run on, and any
 * record or file problem the reader rejected, which the caller reports instead of failing.
 */
@Remote listVersionExemptions(): { exemptions: Record<string, string[]>; warnings: string[] }

/** Grant or revoke one exact plugin/runtime exemption and reevaluate live plugins.
 * @param packageVersion Exact manifest package name followed by @ and its version; never an installation spec or alias.
 * @param runtimeVersion Exact current DSH version for grants; revocation may name a previous runtime.
 * @param enabled Whether to grant rather than revoke the exemption.
 * @param acceptRisk Required true for grants after the user accepts possible crashes and data loss.
 * @returns Saved and runtime outcomes. Startup-only profiles require restart.
 */
@Remote setVersionExemption(packageVersion: string, runtimeVersion: string, enabled: boolean, acceptRisk?: boolean): Promise<ChangeResult>

/** Read current plugins, including why a row cannot be changed through the profile patch.
 * @returns Current runtime entries with persistent patch targets.
 */
@Remote async listPlugins(): Promise<PluginInfo[]>

/** Read installed, installation-provided, and offline Official catalog bundles, plus selected non-bundle names.
 * A dependency without a bundle patch is listed, as a `not-bundle` problem, only while it is selected.
 * @returns Package versions, manifest descriptions, the installable spec of profile dependencies, rows, optional
 * display metadata, activation selections, whether the installation offers the bundle, and removal availability.
 */
@Remote listBundles(): Promise<BundleInfo[]>

/** Read the registries this manager asks: the configured first one, its fallbacks in order, and what pnpm's own configuration names.
 * @returns The registries in pnpm's comparison form; null is the one pnpm's own configuration names, `resolved` as pnpm reads it now.
 */
@Remote async registries(): Promise<PluginRegistries>

/** Read what a spec names before installing it.
 * @param spec One package spec: a registry name, an absolute path, a git address, or a tarball.
 * @param options The registry asked first.
 * @param signal Ends a registry lookup early.
 * @returns The package the spec names, or why it is refused.
 */
@Remote async inspect(spec: string, options?: InspectOptions, signal?: AbortSignal): Promise<PluginSpecInspection>

/** Persist a plugin entry's desired enablement and apply it on live profiles.
 * @param id Loader entry identity returned by listPlugins.
 * @param enabled Whether the plugin should run.
 * @returns Saved and runtime outcomes, including higher-priority overrides.
 */
@Remote setPluginEnabled(id: PluginEntryId, enabled: boolean): Promise<ChangeResult>

/** Select or remove a bundle layer while retaining installed dependencies.
 * @param name Bundle package name.
 * @param enabled Whether the bundle contributes its patch layer.
 * @returns Persisted and runtime outcomes.
 */
@Remote setBundleEnabled(name: string, enabled: boolean): Promise<ChangeResult>

/**
 * Install a package using the same pnpm implementation as dsh plugin. GitHub
 * repositories get a connection check bounded by githubConnectionTimeoutMs before pnpm starts;
 * only network failures or timeouts stop installation, while pnpm owns authentication and transport fallback. A run
 * that fails, is cancelled, or adds a package without a bundle patch restores
 * `package.json` and `pnpm-lock.yaml` as they were; downloaded files can stay.
 * @param spec One package spec, including local paths relative to the invocation directory.
 * @param options Whether to activate the installed bundle (defaults to true), the request id a cancellation names,
 * the pending build scripts to allow, whether to save an exact dependency, and the registry asked first.
 * @returns Package-manager diagnostics, the registries asked, and the observed activation outcome.
 */
@Remote installBundle(spec: string, options?: InstallBundleOptions): Promise<ChangeResult>

/** Recover the result of an active installation without cancelling it.
 * @param requestId The id supplied when installation started.
 * @returns The installation's outcome after it settles, or null if no active request has that id.
 * Completed results are not retained; null establishes neither success nor cancellation.
 */
@Remote async waitForInstall(requestId: PluginInstallRequestId): Promise<ChangeResult | null>

/** Stop an installation this manager owns and wait until its files are back.
 * @param requestId The id the installation was started with.
 * @returns `cancelled` once the Git check or pnpm exited and the files are restored, `too-late` once the bundle is being
 * applied, `not-running` for any other id.
 */
@Remote async cancelInstall(requestId: PluginInstallRequestId): Promise<PluginInstallCancellation>

/** Unload and remove a profile-owned bundle dependency through dsh plugin's pnpm path; a selected name no
 * dependency holds is only deselected.
 * @param name Installed dependency or selected bundle name.
 * @returns Removal diagnostics and the remaining profile state.
 */
@Remote removeBundle(name: string): Promise<ChangeResult>
```

Source: [`packages/boot/plugin-manager/src/index.ts`](../../packages/boot/plugin-manager/src/index.ts)

<a id="ctxpluginregistryprobe--pluginregistryprobe"></a>

### `ctx.pluginRegistryProbe` — `PluginRegistryProbe`

Compares public registry responses on the Host; the Client owns the initial selection.

```ts cordis-catalog
/**
 * Race npm and npmmirror HTTPS ping responses through the Host's fetch proxy.
 * Concurrent readers share a probe; a winner cancels and awaits the other request.
 * @returns the first registry with a successful response, or null when disabled or neither responds successfully; results are cached.
 * @throws rejects when the service has been unloaded.
 */
@Remote async fastest(): Promise<string | null>
```

Source: [`packages/client/ui-plugin-manager/src/index.ts`](../../packages/client/ui-plugin-manager/src/index.ts)

<a id="ctxprofilecontext--profilecontext"></a>

### `ctx.profileContext` — `ProfileContext`

Current profile facts; scheduling and mutation belong to their callers.

Source: [`packages/boot/app-boot/src/profile-context.ts`](../../packages/boot/app-boot/src/profile-context.ts)

<a id="cordis-events"></a>

### `cordis/*` events

<a id="cordisdynamic-package--emit"></a>

#### `cordis/dynamic-package` — emit

One exact Plugin/Package activation is now live in the Host.

```ts cordis-catalog
/**
 * One exact Plugin/Package activation is now live in the Host.
 * @param pkg - stable plugin, immutable package, run identity, and label.
 * @mode emit
 */
'cordis/dynamic-package'(pkg: DynamicCordisPackage): void
```

Source: [`packages/extensions/cordis-host-runner/src/types.ts`](../../packages/extensions/cordis-host-runner/src/types.ts)

<a id="cordisdynamic-retract--emit"></a>

#### `cordis/dynamic-retract` — emit

One exact activation was withdrawn.

```ts cordis-catalog
/**
 * One exact activation was withdrawn.
 * @param retracted - plugin, package, and run identity.
 * @mode emit
 */
'cordis/dynamic-retract'(retracted: DynamicCordisRetracted): void
```

Source: [`packages/extensions/cordis-host-runner/src/types.ts`](../../packages/extensions/cordis-host-runner/src/types.ts)

<a id="cordisinspect-query--emit"></a>

#### `cordis/inspect-query` — emit

Request a live read-only query from the Client inspect registry.

```ts cordis-catalog
/**
 * Request a live read-only query from the Client inspect registry.
 * @param request - correlation, Session, provider, method, and JSON input.
 * @mode emit
 */
'cordis/inspect-query'(request: CordisInspectQueryRequest): void
```

Source: [`packages/extensions/cordis-host-runner/src/types.ts`](../../packages/extensions/cordis-host-runner/src/types.ts)

<a id="cordisinspect-query-resolved--emit"></a>

#### `cordis/inspect-query-resolved` — emit

Notify every Client that an inspect query has settled or been cancelled.

```ts cordis-catalog
/**
 * Notify every Client that an inspect query has settled or been cancelled.
 * @param resolved - exact query identity that is no longer answerable.
 * @mode emit
 */
'cordis/inspect-query-resolved'(resolved: CordisInspectQueryResolved): void
```

Source: [`packages/extensions/cordis-host-runner/src/types.ts`](../../packages/extensions/cordis-host-runner/src/types.ts)

<a id="cordisrequest-run--emit"></a>

#### `cordis/request-run` — emit

A Client-bearing activation needs a browser page, and may require a user decision.

```ts cordis-catalog
/**
 * A Client-bearing activation needs a browser page, and may require a user decision.
 * @param request - correlation identity, owner, target version, mode, and approval requirement.
 * @mode emit
 */
'cordis/request-run'(request: DynamicCordisRunRequest): void
```

Source: [`packages/extensions/cordis-host-runner/src/types.ts`](../../packages/extensions/cordis-host-runner/src/types.ts)

<a id="cordisrequest-run-resolved--emit"></a>

#### `cordis/request-run-resolved` — emit

A pending Client activation request left the answerable state.

```ts cordis-catalog
/**
 * A pending Client activation request left the answerable state.
 * @param resolved - request identity and outcome.
 * @mode emit
 */
'cordis/request-run-resolved'(resolved: DynamicCordisRequestResolved): void
```

Source: [`packages/extensions/cordis-host-runner/src/types.ts`](../../packages/extensions/cordis-host-runner/src/types.ts)

<a id="plugin-manager-events"></a>

### `plugin-manager/*` events

<a id="plugin-managerchanged--emit"></a>

#### `plugin-manager/changed` — emit

The profile's plugins, bundles, or composition changed: a manager operation completed. A patch generation applied outside the manager, by HMR's watcher after a CLI or hand edit, announces nothing here.

```ts cordis-catalog
/**
 * The profile's plugins, bundles, or composition changed: a manager
 * operation completed. A patch generation applied outside the manager,
 * by HMR's watcher after a CLI or hand edit, announces nothing here.
 * @mode emit
 * @param change - what changed.
 */
'plugin-manager/changed'(change: PluginChange): void
```

Source: [`packages/boot/plugin-manager/src/types.ts`](../../packages/boot/plugin-manager/src/types.ts)

<a id="plugin-managerinstall-log--emit"></a>

#### `plugin-manager/install-log` — emit

One chunk of a pnpm run's output, streamed as the run produces it.

```ts cordis-catalog
/**
 * One chunk of a pnpm run's output, streamed as the run produces it.
 * @mode emit
 * @param chunk - the chunk and the run it belongs to.
 */
'plugin-manager/install-log'(chunk: PluginInstallLogChunk): void
```

Source: [`packages/boot/plugin-manager/src/types.ts`](../../packages/boot/plugin-manager/src/types.ts)

<a id="plugin-managerinstall-state--emit"></a>

#### `plugin-manager/install-state` — emit

An installation moved between its Host phases. `installing` is announced once per registry the installation asks, with the attempt's registry and position; `cancelling` and `applying` once.

```ts cordis-catalog
/**
 * An installation moved between its Host phases. `installing` is announced once per registry the
 * installation asks, with the attempt's registry and position; `cancelling` and `applying` once.
 * @mode emit
 * @param progress - the installation's request id and phase, with the attempt while installing.
 */
'plugin-manager/install-state'(progress: PluginInstallProgress): void
```

Source: [`packages/boot/plugin-manager/src/types.ts`](../../packages/boot/plugin-manager/src/types.ts)
<!-- END GENERATED cordis-surface -->
