/** Native configuration-page handles over the shared settings mirror. */
import { Context, Service } from '@deepseek-ai/cordis'
import type { SettingsScope, SettingsScopeSnapshot } from './settings-contract.ts'
import type { SettingsDescribeFace } from './settings-mirror.ts'
import type { SettingsScopeBinder } from './settings-scope.ts'
/** One configuration namespace's staged-write handle. */
export type ConfigForm<T> = SettingsScope<T>
/** Accepted namespace values and their revision. */
export type ConfigFormSnapshot<T> = SettingsScopeSnapshot<T>
declare module '@deepseek-ai/cordis' {
  interface Context { configForms: ConfigForms }
}
/** Shared native forms for plugin pages; all reads use the existing settings mirror. */
export class ConfigForms extends Service {
  private readonly forms = new Map<string, SettingsScope<Record<string, unknown>>>()
  /**
   * @param ctx - settings provider scope owning all form lifetimes.
   * @param binder - provider-owned settings scope factory.
   */
  constructor(ctx: Context, private readonly binder: SettingsScopeBinder) { super(ctx, 'configForms') }
  /**
   * Return a stable configuration form for one namespace.
   * @param namespace - registered Host settings namespace.
   * @returns a shared form retained until the settings provider unloads.
   */
  get<T extends Record<string, unknown> = Record<string, unknown>>(namespace: string): ConfigForm<T> {
    let form = this.forms.get(namespace)
    if (!form) {
      form = this.binder.bind<Record<string, unknown>>({ namespace })
      this.forms.set(namespace, form)
    }
    return form as ConfigForm<T>
  }
  /**
   * Read the shared settings namespace directory.
   * @returns the shared settings namespace directory.
   */
  describe(): SettingsDescribeFace { return this.binder.describe() }
}
