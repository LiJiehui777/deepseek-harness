/** Optional bundle discovery for this enhanced distribution. */
import type { PluginLocalizedMeta } from '@deepseek-ai/dsh-package-manifest'
/** Packages supplied by this distribution without being required for profile management. */
export const OPTIONAL_BUNDLES: readonly string[] = [
  '@deepseek-ai/dsh-tool-ragflow-connector', '@deepseek-ai/dsh-enterprise-connectors',
]
/** Source-backed metadata offered independently from profile activation. */
export interface OfficialBundleCatalogEntry {
  readonly packageName: string
  readonly meta: PluginLocalizedMeta
}
/** Bundles already shipped by this distribution are discovered from its installation manifest. */
export const OFFICIAL_ON_DEMAND_CATALOG: readonly OfficialBundleCatalogEntry[] = []
