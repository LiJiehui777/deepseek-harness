/**
 * Payload definitions: how one MES source row becomes the message sent to the
 * State Grid Chengxi platform.
 *
 * The pull stage builds the payload here rather than leaving it to the delivery
 * stage, for three reasons. An operator must review the exact message that will
 * be sent; Chengxi's field names mix cases and carry hardcoded constants and
 * derived values, which a configuration template cannot express legibly; and
 * one mapping table keeps the three stages consistent.
 *
 * Every place where this mapping cannot reproduce the MES behaviour reports a
 * warning instead of silently substituting a value: a warning is the only way
 * an operator learns a record may be wrong.
 *
 * @module @deepseek-ai/dsh-tool-mes-pull/push-schema
 */

/** One source row, as the query returned it. */
export type SourceRow = Record<string, unknown>

/** One built payload together with the risks found while building it. */
export interface BuiltPayload {
  /** The message to send. */
  payload: Record<string, unknown>
  /** Risks an operator must see; these block nothing. */
  warnings: string[]
}

/** One module's mapping definition. */
interface ModuleDefinition {
  /** Business module name written to the review pool. */
  id: string
  /** Chengxi endpoint key this payload belongs to. */
  pushPath: string | string[]
  /** Field that carries the row-level business key. */
  keyField: string
  /** Whether MES only ever inserts, never updates, records of this module. */
  insertOnly?: boolean
  /**
   * Build one payload.
   * @param row - the source row.
   * @returns the payload and any risks.
   */
  build(row: SourceRow): BuiltPayload
}

/** One part-number entry from the MES category table. */
interface PartNameCode {
  /** Sales part name fragment to match. */
  partName: string
  /** Category code written downstream. */
  categoryCode: string
  /** Sub-class code written downstream. */
  subClassCode: string
}

/**
 * Part name to category codes, matching the MES `PartName2Code` enumeration
 * entry for entry.
 *
 * Matching uses `includes`, as the MES side does, and the four entries have no
 * substring collision. A miss returns null rather than a guess, and the caller
 * turns that into a warning.
 */
export const PART_NAME_CODES: readonly PartNameCode[] = [
  { partName: '500kV及以下电力电缆', categoryCode: '30', subClassCode: '300103' },
  { partName: '35kV及以下电力电缆', categoryCode: '30', subClassCode: '300102' },
  { partName: '3kV及以下电力电缆', categoryCode: '31', subClassCode: '3101' },
  { partName: '架空绝缘电缆', categoryCode: '31', subClassCode: '3102' },
]

/**
 * Infer category codes from a sales part name.
 * @param partName - the part name.
 * @returns the matched codes, or null when no entry matches.
 */
export function codesByPartName(partName: unknown): { categoryCode: string; subClassCode: string } | null {
  const text = typeof partName === 'string' ? partName : ''
  if (text === '') return null
  for (const entry of PART_NAME_CODES) {
    if (text.includes(entry.partName)) {
      return { categoryCode: entry.categoryCode, subClassCode: entry.subClassCode }
    }
  }
  return null
}

/**
 * Work-order state codes, mirroring the MES `convertStatus`.
 *
 * MES recognises only these two and maps everything else to 1. The upstream
 * dictionary drifts, so this copies it rather than completing it: completing it
 * would change what the payload means.
 */
export const WORK_ORDER_STATUS: Readonly<Record<string, number>> = {
  '02inProgress': 3,
  '04completed': 5,
}

/**
 * Translate one MES work-order state into its downstream code.
 * @param state - the MES state string.
 * @returns the code and whether the state was recognized.
 */
export function workOrderStatus(state: unknown): { value: number; known: boolean } {
  const key = typeof state === 'string' ? state : ''
  const code = WORK_ORDER_STATUS[key]
  return code === undefined ? { value: 1, known: false } : { value: code, known: true }
}

/**
 * Format a timestamp the way MES does: `yyyy-MM-dd'T'HH:mm:ss'Z'`.
 *
 * MES formats a local date-time and appends a literal `Z` without converting to
 * UTC; this keeps that literal behaviour instead of silently shifting the time.
 * @param value - a `Date`, epoch value, or parseable string.
 * @returns the formatted text, or null when the value is absent or unusable.
 */
export function sgTime(value: unknown): string | null {
  if (value === null || value === undefined || value === '') return null
  const date = value instanceof Date ? value : new Date(String(value))
  if (Number.isNaN(date.getTime())) return null
  const pad = (part: number): string => String(part).padStart(2, '0')
  return `${String(date.getFullYear())}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
    + `T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}Z`
}

/**
 * Take the first value that is present; zero and `false` count as present.
 * @param values - candidates in priority order.
 * @returns the first present value, or null.
 */
function first(...values: unknown[]): unknown {
  for (const value of values) {
    if (value !== null && value !== undefined && value !== '') return value
  }
  return null
}

/**
 * Convert a value to a number.
 * @param value - the candidate value.
 * @returns the number, or null when absent or unparseable.
 */
function num(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

/**
 * Derive the operation number a payload carries.
 *
 * The three branches reproduce the MES operation and product implementations,
 * which agree with each other: insulation in the high-voltage shop appends
 * `jyxxqq` to the existing number, insulation in the low-voltage or overhead
 * shop is `jy`, cabling in the low-voltage shop is `cl`, and everything else
 * keeps the existing number.
 * @param input - operation name, workshop, and the existing number.
 * @returns the operation number, or null when there is none.
 */
export function procedureNo(input: { operationName: unknown; workshop: unknown; sgNo: unknown }): string | null {
  const name = typeof input.operationName === 'string' ? input.operationName : ''
  const shop = typeof input.workshop === 'string' ? input.workshop : ''
  const base = input.sgNo === null || input.sgNo === undefined || input.sgNo === ''
    ? null
    : String(input.sgNo)
  if (name.includes('绝缘') && shop === '高压车间') {
    return base === null ? 'jyxxqq' : `${base},jyxxqq`
  }
  if (name.includes('绝缘') && (shop === '低压车间' || shop === '架空线车间')) return 'jy'
  if (name.includes('成缆') && shop === '低压车间') return 'cl'
  return base
}

/**
 * Progress of a scheduled plan, mirroring the MES `workoutSchedule`.
 * @param start - plan start.
 * @param end - plan end.
 * @returns a percentage string from `0` to `100`.
 */
export function scheduleProgress(start: unknown, end: unknown): string {
  const from = start ? new Date(String(start)) : null
  const to = end ? new Date(String(end)) : null
  if (from === null || to === null || Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) return '0'
  const current = Date.now()
  if (current < from.getTime()) return '0'
  if (current >= to.getTime()) return '100'
  const total = to.getTime() - from.getTime()
  if (total <= 0) return '100'
  return String((((current - from.getTime()) / total) * 100).toFixed(2)).replace(/\.00$/, '')
}

/**
 * Whole days between two timestamps, mirroring Java's `Duration.toDays`.
 * @param start - earlier value.
 * @param end - later value.
 * @returns the day count, or null when either value is unusable.
 */
function daysBetween(start: unknown, end: unknown): number | null {
  if (!start || !end) return null
  const from = new Date(String(start))
  const to = new Date(String(end))
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) return null
  return Math.trunc((to.getTime() - from.getTime()) / 86_400_000)
}

/**
 * Shift a date by whole days.
 * @param value - the base value.
 * @param days - days to add, which may be negative.
 * @returns the shifted date, or null when the base is unusable.
 */
function addDays(value: unknown, days: number): Date | null {
  if (!value) return null
  const date = new Date(String(value))
  if (Number.isNaN(date.getTime())) return null
  date.setDate(date.getDate() + days)
  return date
}

/**
 * Every module's payload builder.
 *
 * Each entry names the review-pool module, the Chengxi endpoint it belongs to,
 * the source field holding the row-level key, and the builder. Builders that
 * cannot reproduce MES behaviour add a warning rather than inventing a value.
 */
export const MODULES: Readonly<Record<string, ModuleDefinition>> = {
  /** Sales order header. */
  salesOrder: {
    id: '销售订单',
    pushPath: 'orderUrl',
    keyField: 'contractNo',
    build(row) {
      const warnings: string[] = []
      const codes = codesByPartName(row.salesPartName)
      // MES defaults to `30` and lets each sub-order override it. Pulling a
      // header usually runs before its sub-orders exist, so this reports the
      // fallback instead of pretending the override happened.
      let categoryCode = '30'
      if (codes !== null) categoryCode = codes.categoryCode
      else if (!row.categoryCode) {
        warnings.push('Category not inferred from the part name; sent with the MES default 30. MES overrides it per sub-order, which a single-row pull cannot reproduce.')
      }
      return {
        payload: {
          No: first(row.contractNo),
          CategoryCode: categoryCode,
          CustomerOrderNo: first(row.customerContractNo),
          CustomerName: first(row.customerName),
          ProjectName: first(row.projectName, row.entityName),
          // MES hardcodes 2 here.
          Status: 2,
          OrderDate: sgTime(first(row.placeOrderDate)),
          // MES hardcodes 1 here.
          shipmentStatus: 1,
        },
        warnings,
      }
    },
  },

  /** Sales order line. */
  salesOrderLine: {
    id: '销售订单明细',
    pushPath: 'orderDetailUrl',
    keyField: 'otcLineNo',
    build(row) {
      const warnings: string[] = []
      const codes = codesByPartName(first(row.salesPartName, row.partName))
      if (codes === null) warnings.push('Category and subclass codes were not inferred; they will be null.')
      return {
        payload: {
          soItemNo: first(row.otcLineNo),
          productCode: first(row.salesPartNo, row.partNo),
          productName: first(row.salesPartName, row.partName),
          productUnit: first(row.otcUnit, row.unit),
          productAmount: num(first(row.otcQuantity, row.quantity)),
          salesOrderNo: first(row.customerOrderNo),
          categoryCode: codes?.categoryCode ?? null,
          subclassCode: codes?.subClassCode ?? null,
          PoItemId: first(row.customerPoLineNo),
          // MES passes the subclass code as the lowest material class; copied as-is.
          lowestMaterialClassCode: codes?.subClassCode ?? null,
        },
        warnings,
      }
    },
  },

  /** Production schedule. */
  productionPlan: {
    id: '排产计划',
    pushPath: 'productionPlanUrl',
    keyField: 'mpsNo',
    build(row) {
      const warnings: string[] = []
      const placeDate = first(row.factoryPlaceOrderDate)
      const wanted = first(row.wantedDeliveryDate)
      if (!wanted) warnings.push('Requested delivery date is missing; MES refuses to send this record, so it should not be approved.')
      if (!placeDate) warnings.push('Factory order date is missing, so planStartDate, planPeriod and schedule cannot be computed.')
      return {
        payload: {
          scheduleCode: first(row.mpsNo),
          scheduleAmount: num(first(row.qtyRequired, row.scheduleAmount)),
          planStartDate: sgTime(placeDate),
          planPeriod: daysBetween(placeDate, wanted),
          // MES adds seven days.
          planFinishDate: sgTime(addDays(wanted, 7)),
          // MES uses the requested date minus seven days as the progress end.
          schedule: scheduleProgress(placeDate, addDays(wanted, -7)),
          dueDate: sgTime(wanted),
          soItemNo: first(row.otcLineNo),
          salesOrderNo: first(row.customerOrderNo),
        },
        warnings,
      }
    },
  },

  /** Production order. */
  productionOrder: {
    id: '生产订单',
    pushPath: 'productionOrderUrl',
    keyField: 'mpsNo',
    build(row) {
      const warnings: string[] = []
      const codes = codesByPartName(first(row.salesPartName, row.partName))
      if (codes === null) warnings.push('Category and subclass codes were not inferred.')
      return {
        payload: {
          no: first(row.mpsNo),
          materialNo: first(row.salesPartNo, row.partNo),
          salesOrderNo: first(row.customerOrderNo),
          specificationType: first(row.specificationModel, row.specs),
          salesOrderRowNo: first(row.otcLineNo),
          makt: first(row.salesPartName, row.partName),
          unit: first(row.otcUnit, row.unit),
          demandQuantity: num(first(row.qtyRequired, row.demandQuantity)),
          plannedStartUpTime: sgTime(first(row.factoryPlaceOrderDate)),
          plannedEndTime: sgTime(first(row.wantedDeliveryDate)),
          materialsName: first(row.salesPartName, row.partName),
          materialsUnit: first(row.otcUnit, row.unit),
          categoryCode: codes?.categoryCode ?? null,
          lowestMaterialClassCode: codes?.subClassCode ?? null,
        },
        warnings,
      }
    },
  },

  /** Work order. */
  workOrder: {
    id: '工单',
    pushPath: 'workOrderUrl',
    keyField: 'optaskNo',
    build(row) {
      const warnings: string[] = []
      const status = workOrderStatus(row.state)
      if (!status.known && row.state) {
        warnings.push(`Work-order state ${String(row.state)} is not in the MES mapping table; sent as 1. MES does the same, but the upstream dictionary drifts.`)
      }
      if (String(row.state ?? '') === '05canceled') {
        warnings.push('Work order is cancelled; MES skips it, so it should not be approved.')
      }
      const start = first(row.plannedStartDate, row.actualStartDate)
      const finish = first(row.plannedFinishDate) ?? (start === null ? null : addDays(start, 3))
      return {
        payload: {
          ipoNo: first(row.mpsNo),
          woNo: first(row.optaskNo),
          materialsCode: first(row.salesPartNo, row.partNo),
          amount: num(first(row.plannedQuantity)),
          unit: 'km',
          planStartDate: sgTime(start),
          planFinishDate: sgTime(finish),
          woStatus: status.value,
          ProcedureNo: procedureNo({ operationName: row.operationName, workshop: row.workshop, sgNo: row.sgNo }),
        },
        warnings,
      }
    },
  },

  /** Work report. */
  workReport: {
    id: '报工信息',
    pushPath: 'productionTimeScheduledUrl',
    keyField: 'productNo',
    build(row) {
      const warnings: string[] = []
      const start = first(row.actualStartDate)
      const finish = first(row.actualFinishDate)
      if (!finish) warnings.push('Work-report end time is missing; MES skips this record, so it should not be approved.')
      return {
        payload: {
          productionOrderNo: first(row.mpsNo),
          productionBatchNo: first(row.productNo),
          procedureNo: procedureNo({ operationName: row.operationName, workshop: row.workshop, sgNo: row.sgNo }),
          procedureName: first(row.operationName),
          deviceNo: first(row.deviceNo, row.sgNo),
          startTime: sgTime(start),
          endTime: sgTime(finish),
          woNo: first(row.optaskNo),
          // MES hardcodes the province here. The degassing path writes the
          // short form instead; that inconsistency is copied, not corrected.
          BuyerProvince: '江苏省',
        },
        warnings,
      }
    },
  },

  /** Finished goods. */
  finishedProduct: {
    id: '成品信息',
    pushPath: 'finishedProductUrl',
    keyField: 'cable',
    insertOnly: true,
    build(row) {
      const warnings = [
        'MES only ever inserts finished goods, never updates them: Chengxi cannot match a cable number exactly, '
        + 'so an update can hit the wrong row. Approving the same cable number twice creates a duplicate downstream.',
      ]
      const deliveryTime = first(row.deliveryTime)
      return {
        payload: {
          no: first(row.cable),
          // MES hardcodes 1.
          unit: 1,
          number: num(first(row.stockQuantity)),
          productionOrderNo: first(row.mpsNo),
          SpecificationType: first(row.specificationModel, row.specs),
          // With a delivery time it is 2, without one it is 1.
          DeliveryStatus: deliveryTime ? 2 : 1,
          StockInDate: sgTime(first(row.stockInDate, row.createTime)),
          DeliveryTime: sgTime(deliveryTime),
          // MES hardcodes 1.
          ProductStatus: 1,
        },
        warnings,
      }
    },
  },

  /** Raw material stock. */
  rawMaterialStock: {
    id: '原材料库存',
    pushPath: 'rawMaterialStockUrl',
    keyField: 'partNo',
    build(row) {
      const warnings: string[] = []
      // MES matches on the part's voltage rather than its name, and no source
      // is available to confirm the rule, so a miss is reported instead of
      // guessed at.
      const codes = codesByPartName(first(row.partName, row.voltage))
      if (codes === null) warnings.push('Raw-material category did not match; category and subclass codes will be null. MES matches on voltage, so the rule needs business confirmation.')
      return {
        payload: {
          matType: first(row.type),
          matName: first(row.partName),
          categoryCode: codes?.categoryCode ?? null,
          subclassCode: codes?.subClassCode ?? null,
          matUnit: first(row.unit),
          matNum: num(first(row.stock)) ?? 0,
          stockInDate: sgTime(first(row.receiptDate)),
          specificationType: first(row.specs),
          voltageLevel: first(row.voltage),
          // MES hardcodes both of these.
          storeCity: '江苏南通',
          matProdAddr: '中国',
        },
        warnings,
      }
    },
  },

  /** Finished goods stock, by customer order. */
  productionStore: {
    id: '产成品库存',
    pushPath: 'productionStoreUrl',
    keyField: 'customerOrderNo',
    build(row) {
      const warnings: string[] = []
      const partName = first(row.salesPartName, row.partName)
      const codes = codesByPartName(partName)
      if (codes === null) warnings.push('Category and subclass codes were not inferred.')
      const poItemId = first(row.sgId)
      if (!poItemId) {
        warnings.push('This order line has not been sent yet, so its ticket id is empty and MES would build an update with a null key. A first send can proceed; an update would be refused downstream.')
      }
      return {
        payload: {
          categoryCode: codes?.categoryCode ?? null,
          subclassCode: codes?.subClassCode ?? null,
          amount: num(first(row.unshipQty)),
          MaterialsDes: partName,
          materialsCode: first(row.salesPartNo, row.partNo),
          // MES hardcodes this.
          storeCity: '江苏南通',
          customerOrderNo: first(row.customerContractNo),
          putStorageTime: sgTime(first(row.storageTime)),
          PoItemId: poItemId,
        },
        warnings,
      }
    },
  },

  /** Raw materials selected by a production order. */
  productionOrderRawMaterial: {
    id: '生产订单选用原材料',
    pushPath: 'productionOrderRawMaterialUrl',
    keyField: 'rawMaterialNo',
    insertOnly: true,
    build(row) {
      const productionOrderNo = first(row.mpsNo)
      // MES joins the two parts with an underscore.
      const rawMaterialNo = [first(row.partNo), first(row.partBatchNo)]
        .filter(value => value !== null && value !== undefined && value !== '')
        .map(value => String(value))
        .join('_')
      return {
        payload: { ProductionOrderNo: productionOrderNo, RawMaterialNo: rawMaterialNo },
        warnings: rawMaterialNo.includes('_') ? [] : ['Part number or batch number is missing, so RawMaterialNo is incomplete.'],
      }
    },
  },

  /**
   * Drying-room degassing: one record, two endpoints.
   *
   * This is the only module whose payload carries two sections, so its
   * `pushPath` is a pair and the delivery stage sends each section to its own
   * endpoint.
   */
  dryingRoom: {
    id: '烘房除气',
    pushPath: ['productionTimeScheduledUrl', 'procedureDataUrl'],
    keyField: 'batchNo',
    build(row) {
      const warnings: string[] = []
      const inTime = first(row.warehouseIn)
      const outTime = first(row.warehouseOut)
      if (!outTime) warnings.push('Warehouse exit time is missing; MES skips this record, so it should not be approved.')
      // MES builds the batch number from the serial number and the row id.
      const batchNo = [first(row.snNo), first(row.id)]
        .filter(value => value !== null && value !== undefined && value !== '')
        .map(value => String(value))
        .join('-')
      const common = {
        productionOrderNo: first(row.mpsNo),
        productionBatchNo: batchNo,
        deviceNo: first(row.deviceNo),
        woNo: first(row.optaskNo),
      }
      return {
        payload: {
          workReport: {
            ...common,
            // MES hardcodes these three values.
            procedureNo: 'jyxxqq',
            procedureName: '除气',
            startTime: sgTime(inTime),
            endTime: sgTime(outTime),
            BuyerProvince: '江苏',
          },
          procedureData: {
            no: batchNo,
            productionOrderNo: common.productionOrderNo,
            // MES writes the uppercase form here and the lowercase one above;
            // both are copied as they are.
            ProcedureDataType: 'JYXXQQ',
            testData: { kssj: sgTime(inTime), jssj: sgTime(outTime) },
          },
        },
        warnings,
      }
    },
  },
}

/**
 * Compute a row's business key.
 *
 * The review pool is unique on `(module, biz_key)`, so this must be row-level
 * unique: falling back to the contract number would collapse several rows of
 * one contract into one review item. A query with no usable field returns an
 * empty string and the caller appends the row index.
 * @param moduleId - module id.
 * @param row - the source row.
 * @returns the key, or an empty string when no candidate field is populated.
 */
export function businessKeyOf(moduleId: string, row: SourceRow): string {
  const definition = MODULES[moduleId]
  const candidates = [definition?.keyField, 'id', 'ID', 'contractNo', 'customerOrderNo']
  for (const field of candidates) {
    if (field === undefined) continue
    const value = row[field]
    if (value !== undefined && value !== null && String(value).trim() !== '') return String(value).trim()
  }
  return ''
}

/** One row ready to enter the review pool. */
export interface PulledItem {
  /** Business module name. */
  module: string
  /** Row-level business key, unique within the module. */
  bizKey: string
  /** The source row, kept for comparison. */
  source: SourceRow
  /** The payload that would be delivered. */
  mapped: Record<string, unknown>
  /** Risks found while building the payload. */
  warnings: string[]
}

/** One mapping risk, located by row. */
export interface MappingWarning {
  /** Zero-based row index within the module's result. */
  index: number
  /** Business key of the row, when one could be computed. */
  bizKey: string
  /** What went wrong. */
  message: string
}

/**
 * Build review-pool items from one module's rows.
 *
 * The mapped payload is the message that will be delivered, not a copy of the
 * source row, and a row whose mapping throws becomes a warning rather than
 * failing the whole module.
 * @param moduleId - module id.
 * @param rows - source rows.
 * @param limit - maximum rows to convert; omitted converts all of them.
 * @returns the items and the warnings across the module.
 * @throws Error when the module has no mapping definition.
 */
export function buildItems(
  moduleId: string,
  rows: readonly SourceRow[],
  limit?: number,
): { items: PulledItem[]; warnings: MappingWarning[] } {
  const definition = MODULES[moduleId]
  if (definition === undefined) {
    throw new Error(`Unknown push module: ${moduleId}. Known modules: ${Object.keys(MODULES).join(', ')}.`)
  }
  const take = limit === undefined ? rows.length : Math.max(0, Math.trunc(limit))
  const items: PulledItem[] = []
  const warnings: MappingWarning[] = []
  rows.slice(0, take).forEach((row, index) => {
    let built: BuiltPayload
    try {
      built = definition.build(row)
    } catch (error) {
      warnings.push({ index, bizKey: '', message: messageOf(error) })
      return
    }
    // A fallback key must carry the index, or several rows of one contract
    // would overwrite each other.
    const bizKey = businessKeyOf(moduleId, row)
    const key = bizKey === '' ? `${moduleId}#${String(index + 1)}` : bizKey
    items.push({ module: definition.id, bizKey: key, source: row, mapped: built.payload, warnings: built.warnings })
    if (built.warnings.length > 0) warnings.push({ index, bizKey: key, message: built.warnings.join('; ') })
  })
  return { items, warnings }
}

/**
 * Reduce a thrown value to one displayable line.
 * @param error - the thrown value.
 * @returns the message text.
 */
function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
