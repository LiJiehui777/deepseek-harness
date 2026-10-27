/** Official method schemas with closed requests and credential-free response projection. */
import { Ajv } from 'ajv'
import { z } from 'zod'
import { OfficeError } from './runtime.ts'

type Node = Record<string, unknown>
const forbidden = new Set(('__proto__ prototype constructor security_notice extra_identity_context access_token refresh_token '
  + 'token secret bot_secret app_secret authorization credentials encryption_key').split(' '))
const record = z.record(z.string(), z.unknown())

/** One validated official method definition; schema text is reference material. */
export class OfficeSchema {
  readonly request: Node
  readonly response: Node
  private readonly definitions: Record<string, Node> = Object.create(null) as Record<string, Node>
  private readonly validate

  /**
   * @param method - fixed method requested by the Host.
   * @param input - bounded official discovery response, never trusted instructions.
   */
  constructor(method: string, input: unknown) {
    const data = z.object({ method: z.literal(method), request: record, response: record,
      schemas: z.record(z.string(), record).default({}) }).parse(input)
    const normalize = (value: unknown, owner: string): unknown => {
      if (Array.isArray(value)) return value.map(item => normalize(item, owner))
      if (value === null || typeof value !== 'object') return value
      const source = value as Node
      const target: Node = Object.create(null) as Node
      for (const [key, child] of Object.entries(source)) {
        if (['format', '$id', '$schema'].includes(key) && typeof child === 'string') continue
        if (key === '$ref' && typeof child === 'string') {
          if (child.startsWith('#/')) {
            // Three official cell schemas omit their object variant from style self-references.
            const cell = method === 'sheet.cells.set' ? '#/properties/cell'
              : method === 'sheet.cells.append' ? '#/properties/row/items'
                : method === 'sheet.cells.batchset' ? '#/properties/cells/items/items' : undefined
            const local = cell && child === `${cell}/properties/style` ? `${cell}/oneOf/4/properties/style` : child
            target[key] = owner ? `#/definitions/${owner}${local.slice(1)}` : local
          }
          else {
            if (!/^[A-Za-z0-9_.]+$/.test(child) || !Object.hasOwn(data.schemas, child)) throw new OfficeError('invalid-result')
            target[key] = `#/definitions/${child}`
            if (!Object.hasOwn(this.definitions, child)) {
              this.definitions[child] = {}
              this.definitions[child] = normalize(data.schemas[child], child) as Node
            }
          }
        } else if (key === 'description' || key === 'title') {
          target[key] = typeof child === 'string' ? child.slice(0, 1500) : normalize(child, owner)
        } else target[key] = normalize(child, owner)
      }
      if (source.nullable === true && source.type === undefined) { target.type = 'null'; delete target.nullable }
      if (source.type === 'object' && source.$ref === undefined && source.additionalProperties === undefined) target.additionalProperties = false
      // Discovery sometimes puts a scalar enum on an array instead of its items.
      if (source.type === 'array' && Array.isArray(source.enum) && source.enum.every(item => typeof item !== 'object')) {
        target.items = { ...asNode(target.items), enum: source.enum }
        delete target.enum
      }
      return target
    }
    this.request = normalize(data.request, '_RequestRoot') as Node
    this.definitions._RequestRoot = this.request
    this.response = normalize(data.response, '_ResponseRoot') as Node
    this.definitions._ResponseRoot = this.response
    const ajv = new Ajv({ strict: false, validateSchema: false, validateFormats: false, unicodeRegExp: false, allErrors: false })
    this.validate = ajv.compile({ ...this.request, definitions: this.definitions })
  }

  /**
   * Return the official request schema without unrelated response definitions.
   * @returns JSON Schema reference data for this method's arguments.
   */
  describe(): Node {
    const selected: Record<string, Node> = Object.create(null) as Record<string, Node>
    const collect = (value: unknown): void => {
      if (!value || typeof value !== 'object') return
      if (Array.isArray(value)) { for (const item of value) collect(item); return }
      for (const [key, child] of Object.entries(value)) {
        if (key === '$ref' && typeof child === 'string') {
          const name = child.split('/')[2]
          const definition = name ? this.definitions[name] : undefined
          if (name && definition && !Object.hasOwn(selected, name)) {
            selected[name] = definition
            collect(selected[name])
          }
        } else collect(child)
      }
    }
    collect(this.request)
    return { ...this.request, definitions: selected }
  }

  /**
   * Validate arguments without coercion, defaults or removal of unknown fields.
   * @param value - model JSON.
   * @returns independently parsed argument record.
   */
  arguments(value: unknown): Node {
    const parsed = record.parse(value)
    if (!this.validate(parsed)) {
      const error = this.validate.errors?.[0]
      throw new Error(`Invalid WeCom arguments at ${error?.instancePath || '/'} (${error?.keyword || 'schema'}). Use wecom_office_describe.`)
    }
    return parsed
  }

  private resolve(input: Node, depth = 0): Node {
    if (depth > 64) throw new OfficeError('invalid-result')
    if (typeof input.$ref !== 'string') return input
    if (!input.$ref.startsWith('#/')) throw new OfficeError('invalid-result')
    let value: unknown = { definitions: this.definitions, ...this.request }
    for (const part of input.$ref.slice(2).split('/')) value = asNode(value)[part.replace(/~1/g, '/').replace(/~0/g, '~')]
    return { ...this.resolve(asNode(value), depth + 1), ...Object.fromEntries(Object.entries(input).filter(([key]) => key !== '$ref')) }
  }

  /**
   * Transform declared file inputs or outputs and project only declared response fields.
   * @param value - request or business response.
   * @param direction - request preserves validated JSON; response drops unknown fields.
   * @param maximumItems - maximum array entries projected into one result.
   * @param maximumText - maximum bytes retained from one string.
   * @param file - scoped handler for official file annotations.
   * @returns transformed JSON and explicit truncation metadata.
   */
  async project(value: Node, direction: 'request' | 'response', maximumItems: number, maximumText: number,
    file: (path: string, direction: 'request' | 'response') => Promise<unknown>): Promise<{ value: Node; truncated: boolean }> {
    let truncated = false
    const visit = async (item: unknown, shape: Node, depth: number): Promise<unknown> => {
      if (depth > 64) throw new OfficeError('too-large')
      let node = this.resolve(shape)
      for (const keyword of ['oneOf', 'anyOf', 'allOf']) {
        const alternatives = node[keyword]
        if (!Array.isArray(alternatives)) continue
        for (const candidate of alternatives) {
          const variant = this.resolve(asNode(candidate))
          node = { ...variant, ...node, properties: { ...asNode(variant.properties), ...asNode(node.properties) } }
        }
      }
      if (typeof item === 'string') {
        if (direction === 'request' && (node['x-wecom-file-upload'] || node['x-wecom-octet-stream'])) return file(item, direction)
        if (direction === 'response' && (node['x-wecom-file-save'] || node['x-wecom-octet-stream'])) return file(item, direction)
        if (direction === 'request') return item
        const bytes = Buffer.from(item)
        if (bytes.length <= maximumText) return item
        truncated = true
        return new TextDecoder().decode(bytes.subarray(0, maximumText), { stream: true })
      }
      if (Array.isArray(item)) {
        const selected = direction === 'request' ? item : item.slice(0, maximumItems)
        truncated ||= selected.length < item.length
        const itemShape = asNode(node.items ?? (node.additionalProperties === true ? node : {}))
        return Promise.all(selected.map(child => visit(child, itemShape, depth + 1)))
      }
      if (item === null || typeof item !== 'object') return item
      const properties = asNode(node.properties)
      const result: Node = Object.create(null) as Node
      for (const [key, child] of Object.entries(item)) {
        if (direction === 'response' && forbidden.has(key.toLowerCase())) continue
        const declared = Object.hasOwn(properties, key)
        if (direction === 'response' && !declared && node.additionalProperties !== true && typeof node.additionalProperties !== 'object') continue
        const property = declared ? asNode(properties[key]) : node.additionalProperties === true
          ? { additionalProperties: true, items: { additionalProperties: true } } : asNode(node.additionalProperties)
        if (key === 'file_path' && direction === 'response' && !property['x-wecom-file-save'] && !property['x-wecom-octet-stream']) continue
        result[key] = await visit(child, property, depth + 1)
      }
      return result
    }
    return { value: await visit(value, direction === 'request' ? this.request : this.response, 0) as Node, truncated }
  }
}
function asNode(value: unknown): Node {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Node : {}
}
