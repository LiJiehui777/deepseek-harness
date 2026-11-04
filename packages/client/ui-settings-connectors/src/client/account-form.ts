/** Project one account over its shared profile entry without a second persisted settings source. */
import type { JsonValue } from '@deepseek-ai/dsh-util-values'
import type { ConfigForm, ConfigFormSnapshot } from '@deepseek-ai/dsh-client-ui-settings/client'
import type { EnterpriseSettings } from './enterprise-card-controller.ts'
import type { OfficeSettings } from './wecom-office-controller.ts'

/** Editable account sections in the enterprise-connectors profile entry. */
export interface EnterpriseAccountForms {
  feishu: EnterpriseSettings
  wecom: EnterpriseSettings
  wecomOffice: OfficeSettings
}

/** Project revision-fenced writes into one declared account section.
 * @param form - shared parent entry maintained by the configuration-form service.
 * @param key - account section within that entry.
 * @returns stable child snapshots and writes against the parent's same revision.
 */
export function accountForm<K extends keyof EnterpriseAccountForms>(
  form: ConfigForm<EnterpriseAccountForms>, key: K,
): ConfigForm<EnterpriseAccountForms[K]> {
  let previous: ConfigFormSnapshot<EnterpriseAccountForms> | undefined
  let projected: ConfigFormSnapshot<EnterpriseAccountForms[K]> | undefined
  const part = (value: unknown): unknown => value && typeof value === 'object' && Object.hasOwn(value, key)
    ? (value as Record<string, unknown>)[key] : undefined
  return {
    getSnapshot: () => {
      const snapshot = form.getSnapshot()
      if (snapshot !== previous || projected === undefined) {
        previous = snapshot
        projected = { ...snapshot, value: snapshot.value?.[key], base: part(snapshot.base), user: part(snapshot.user) }
      }
      return projected
    },
    subscribe: listener => form.subscribe(listener),
    mutate: (ops, revision) => form.mutate(ops.map(op => ({ ...op, path: [key, ...op.path] })), revision),
    set: (field, value) => form.mutate([{ op: 'set', path: [key, field], value: value as JsonValue }]),
    unset: field => form.mutate([{ op: 'unset', path: [key, field] }]),
  }
}
