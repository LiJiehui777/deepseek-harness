/** Independent office settings and deployment bounds for the official WeCom CLI. */
import Schema from '@deepseek-ai/schemastery'

/** Saved office permissions; the message robot keeps its own settings. */
export interface WecomOfficeSettings {
  /** Enable the office account and its local-conversation tools. */
  enabled: boolean
  /** Permit document discovery and text reads. */
  documents: boolean
  /** Permit file metadata discovery, without downloading file contents. */
  files: boolean
  /** Permit calendar list and detail reads. */
  calendar: boolean
  /** Permit existing todo list and detail reads. */
  todos: boolean
}
/** Defaults require an explicit opt-in for each office capability. */
export const WecomOfficeSettings: Schema<WecomOfficeSettings> = Schema.object({
  enabled: Schema.boolean().default(false),
  documents: Schema.boolean().default(false),
  files: Schema.boolean().default(false),
  calendar: Schema.boolean().default(false),
  todos: Schema.boolean().default(false),
})

/** Host-owned execution configuration, separate from browser account settings. */
export interface WecomOfficeRuntimeConfig {
  /** Absolute private storage root; empty uses the current DH home's office directory. */
  directory: string
  /** Explicit CLI executable and prefix arguments; empty uses the pinned dependency. */
  command: string[]
  /** Complete stdout byte bound, including authentication and discovery output. */
  maxOutputBytes: number
  /** Maximum document text bytes projected into a tool result. */
  maxTextBytes: number
  /** Process-tree termination grace in milliseconds. */
  graceMs: number
  /** Browser polling delay while a QR attempt is pending. */
  pollIntervalMs: number
}
/** Deployment bounds are validated before any process starts. */
export const WecomOfficeRuntimeConfig: Schema<WecomOfficeRuntimeConfig> = Schema.object({
  directory: Schema.string().default(''),
  command: Schema.array(Schema.string()).default([]),
  maxOutputBytes: Schema.natural().min(1024).max(16777216).default(1048576),
  maxTextBytes: Schema.natural().min(128).max(1048576).default(65536),
  graceMs: Schema.natural().min(100).max(10000).default(1000),
  pollIntervalMs: Schema.natural().min(250).max(10000).default(1000),
})
