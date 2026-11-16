import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  MODULES, PART_NAME_CODES, buildItems, businessKeyOf, codesByPartName, procedureNo,
  scheduleProgress, sgTime, workOrderStatus,
} from '../src/push-schema.ts'

/** A local-time Date, so `sgTime` renders the same wall clock on every host. */
function local(year: number, month: number, day: number, hour = 0, minute = 0, second = 0): Date {
  return new Date(year, month - 1, day, hour, minute, second)
}

afterEach(() => {
  vi.useRealTimers()
})

describe('codesByPartName', () => {
  it('matches each documented part name', () => {
    for (const entry of PART_NAME_CODES) {
      expect(codesByPartName(`架空绝缘电缆-${entry.partName}`)).toEqual({
        categoryCode: entry.categoryCode,
        subClassCode: entry.subClassCode,
      })
    }
  })

  it('maps the high-voltage cable name to category 30 / subclass 300103', () => {
    expect(codesByPartName('500kV及以下电力电缆')).toEqual({ categoryCode: '30', subClassCode: '300103' })
  })

  it('maps the 35kV name to category 30 / subclass 300102', () => {
    expect(codesByPartName('35kV及以下电力电缆')).toEqual({ categoryCode: '30', subClassCode: '300102' })
  })

  it('matches a part name embedded in a longer string, as MES does', () => {
    expect(codesByPartName('铜芯 35kV及以下电力电缆 3x240')).toEqual({ categoryCode: '30', subClassCode: '300102' })
  })

  it('returns null rather than guessing on a miss', () => {
    expect(codesByPartName('未知型号')).toBeNull()
    expect(codesByPartName('')).toBeNull()
    expect(codesByPartName(null)).toBeNull()
    expect(codesByPartName(42)).toBeNull()
  })

  it('declares no entry whose name is a substring of another', () => {
    for (const left of PART_NAME_CODES) {
      for (const right of PART_NAME_CODES) {
        if (left === right) continue
        expect(right.partName.includes(left.partName)).toBe(false)
      }
    }
  })
})

describe('workOrderStatus', () => {
  it('translates the two recognized states', () => {
    expect(workOrderStatus('02inProgress')).toEqual({ value: 3, known: true })
    expect(workOrderStatus('04completed')).toEqual({ value: 5, known: true })
  })

  it('falls back to 1 and reports the state as unrecognized', () => {
    expect(workOrderStatus('99unknown')).toEqual({ value: 1, known: false })
    expect(workOrderStatus('05canceled')).toEqual({ value: 1, known: false })
  })

  it('treats an absent or non-string state as unrecognized', () => {
    expect(workOrderStatus(null)).toEqual({ value: 1, known: false })
    expect(workOrderStatus(undefined)).toEqual({ value: 1, known: false })
    expect(workOrderStatus(3)).toEqual({ value: 1, known: false })
  })
})

describe('sgTime', () => {
  it('formats a local date-time with a literal Z, as MES does', () => {
    expect(sgTime(local(2026, 11, 14, 8, 5, 9))).toBe('2026-11-14T08:05:09Z')
  })

  it('zero-pads every component', () => {
    expect(sgTime(local(2026, 1, 2, 3, 4, 5))).toBe('2026-01-02T03:04:05Z')
  })

  it('accepts a Date, a number and a parseable string', () => {
    const date = local(2026, 6, 1, 12, 0, 0)
    expect(sgTime(date)).toBe('2026-06-01T12:00:00Z')
    expect(sgTime(date.getTime())).toBe('2026-06-01T12:00:00Z')
    expect(sgTime(date.toISOString())).toBe(sgTime(date))
  })

  it('does not shift the wall clock into UTC', () => {
    // The literal Z is MES's own formatting behaviour, not a UTC conversion.
    const formatted = sgTime(local(2026, 11, 14, 8, 30, 0))
    expect(formatted).toBe('2026-11-14T08:30:00Z')
  })

  it('returns null for an absent or unusable value', () => {
    expect(sgTime(null)).toBeNull()
    expect(sgTime(undefined)).toBeNull()
    expect(sgTime('')).toBeNull()
    expect(sgTime('not a date')).toBeNull()
  })
})

describe('procedureNo', () => {
  it('appends the high-voltage insulation suffix to an existing number', () => {
    expect(procedureNo({ operationName: '绝缘工序', workshop: '高压车间', sgNo: 'JY-1' })).toBe('JY-1,jyxxqq')
  })

  it('uses the bare suffix when the high-voltage operation has no existing number', () => {
    expect(procedureNo({ operationName: '绝缘', workshop: '高压车间', sgNo: null })).toBe('jyxxqq')
    expect(procedureNo({ operationName: '绝缘', workshop: '高压车间', sgNo: '' })).toBe('jyxxqq')
  })

  it.each(['低压车间', '架空线车间'])('maps insulation in %s to jy', (workshop) => {
    expect(procedureNo({ operationName: '绝缘', workshop, sgNo: 'JY-1' })).toBe('jy')
  })

  it('maps cabling in the low-voltage shop to cl', () => {
    expect(procedureNo({ operationName: '成缆', workshop: '低压车间', sgNo: 'CL-1' })).toBe('cl')
  })

  it('keeps the existing number for every other combination', () => {
    expect(procedureNo({ operationName: '成缆', workshop: '高压车间', sgNo: 'CL-1' })).toBe('CL-1')
    expect(procedureNo({ operationName: '绞线', workshop: '低压车间', sgNo: 'JX-1' })).toBe('JX-1')
    expect(procedureNo({ operationName: '成缆', workshop: '架空线车间', sgNo: 'CL-9' })).toBe('CL-9')
  })

  it('returns null when nothing produces a number', () => {
    expect(procedureNo({ operationName: '绞线', workshop: '高压车间', sgNo: null })).toBeNull()
  })

  it('ignores non-string inputs', () => {
    expect(procedureNo({ operationName: null, workshop: null, sgNo: 7 })).toBe('7')
  })
})

describe('scheduleProgress', () => {
  it('is 0 before the plan starts', () => {
    expect(scheduleProgress(local(2999, 1, 1), local(2999, 2, 1))).toBe('0')
  })

  it('is 100 at or after the plan end', () => {
    expect(scheduleProgress(local(2000, 1, 1), local(2000, 2, 1))).toBe('100')
    expect(scheduleProgress(local(2000, 1, 1), local(2000, 1, 1))).toBe('100')
  })

  it('reports a percentage between the two ends', () => {
    vi.useFakeTimers()
    vi.setSystemTime(local(2026, 1, 11))
    expect(scheduleProgress(local(2026, 1, 1), local(2026, 1, 21))).toBe('50')
  })

  it('reports a whole percentage without a decimal tail', () => {
    vi.useFakeTimers()
    vi.setSystemTime(local(2026, 1, 21))
    expect(scheduleProgress(local(2026, 1, 1), local(2026, 1, 41))).toBe('50')
  })

  it('rounds a long fraction to two decimals', () => {
    vi.useFakeTimers()
    // One day and one hour into a three-day window is 34.7222…%.
    vi.setSystemTime(local(2026, 1, 2, 1))
    expect(scheduleProgress(local(2026, 1, 1), local(2026, 1, 4))).toBe('34.72')
  })

  it('is 0 when either end is unusable', () => {
    expect(scheduleProgress(null, local(2026, 1, 1))).toBe('0')
    expect(scheduleProgress(local(2026, 1, 1), null)).toBe('0')
    expect(scheduleProgress('not a date', local(2026, 1, 1))).toBe('0')
  })
})

describe('MODULES definitions', () => {
  it('declares every documented module with a unique business id', () => {
    const ids = Object.values(MODULES).map(definition => definition.id)
    expect(new Set(ids).size).toBe(ids.length)
    expect(Object.keys(MODULES).sort()).toEqual([
      'dryingRoom', 'finishedProduct', 'productionOrder', 'productionOrderRawMaterial',
      'productionPlan', 'productionStore', 'rawMaterialStock', 'salesOrder', 'salesOrderLine',
      'workOrder', 'workReport',
    ])
  })

  it('marks exactly the two insert-only modules', () => {
    const insertOnly = Object.entries(MODULES)
      .filter(([, definition]) => definition.insertOnly === true)
      .map(([key]) => key)
      .sort()
    expect(insertOnly).toEqual(['finishedProduct', 'productionOrderRawMaterial'])
  })

  it('sends the degassing record to two endpoints', () => {
    expect(MODULES['dryingRoom']?.pushPath).toEqual(['productionTimeScheduledUrl', 'procedureDataUrl'])
  })
})

describe('salesOrder payload', () => {
  it('maps the header fields with the constants MES hardcodes', () => {
    const { payload } = MODULES['salesOrder']!.build({
      contractNo: 'HT-1',
      customerContractNo: 'CU-1',
      customerName: '国网江苏',
      projectName: '某工程',
      placeOrderDate: local(2026, 11, 14, 8, 30, 0),
      salesPartName: '35kV及以下电力电缆',
    })
    expect(payload).toEqual({
      No: 'HT-1',
      CategoryCode: '30',
      CustomerOrderNo: 'CU-1',
      CustomerName: '国网江苏',
      ProjectName: '某工程',
      Status: 2,
      OrderDate: '2026-11-14T08:30:00Z',
      shipmentStatus: 1,
    })
  })

  it('falls back from projectName to entityName', () => {
    expect(MODULES['salesOrder']!.build({ entityName: '主体' }).payload['ProjectName']).toBe('主体')
  })

  it('warns when the category cannot be inferred and no override exists', () => {
    const built = MODULES['salesOrder']!.build({ contractNo: 'HT-1' })
    expect(built.payload['CategoryCode']).toBe('30')
    expect(built.warnings).toHaveLength(1)
    expect(built.warnings[0]).toContain('Category not inferred')
  })

  it('does not warn when the row carries an explicit category code', () => {
    expect(MODULES['salesOrder']!.build({ categoryCode: '31' }).warnings).toEqual([])
  })

  it('does not warn when the part name matches', () => {
    expect(MODULES['salesOrder']!.build({ salesPartName: '架空绝缘电缆' }).warnings).toEqual([])
  })

  it('uses the inferred category code over the MES default', () => {
    expect(MODULES['salesOrder']!.build({ salesPartName: '3kV及以下电力电缆' }).payload['CategoryCode']).toBe('31')
  })

  it('renders a missing order date as null rather than an empty string', () => {
    expect(MODULES['salesOrder']!.build({}).payload['OrderDate']).toBeNull()
  })
})

describe('salesOrderLine payload', () => {
  it('maps the line fields and both category codes', () => {
    const { payload, warnings } = MODULES['salesOrderLine']!.build({
      otcLineNo: 10,
      salesPartNo: 'P-1',
      salesPartName: '35kV及以下电力电缆',
      otcUnit: 'km',
      otcQuantity: '12.5',
      customerOrderNo: 'CU-1',
      customerPoLineNo: 'PO-1',
    })
    expect(warnings).toEqual([])
    expect(payload).toMatchObject({
      soItemNo: 10,
      productCode: 'P-1',
      productName: '35kV及以下电力电缆',
      productUnit: 'km',
      productAmount: 12.5,
      salesOrderNo: 'CU-1',
      categoryCode: '30',
      subclassCode: '300102',
      PoItemId: 'PO-1',
      lowestMaterialClassCode: '300102',
    })
  })

  it('warns and sends null codes when the part name does not match', () => {
    const built = MODULES['salesOrderLine']!.build({ otcLineNo: 1 })
    expect(built.warnings).toEqual(['Category and subclass codes were not inferred; they will be null.'])
    expect(built.payload['categoryCode']).toBeNull()
    expect(built.payload['subclassCode']).toBeNull()
    expect(built.payload['lowestMaterialClassCode']).toBeNull()
  })

  it('falls back from the sales fields to the plain part fields', () => {
    const { payload } = MODULES['salesOrderLine']!.build({ partNo: 'P-2', partName: '架空绝缘电缆', unit: 'm', quantity: 3 })
    expect(payload).toMatchObject({
      productCode: 'P-2', productName: '架空绝缘电缆', productUnit: 'm', productAmount: 3,
    })
  })
})

describe('productionPlan payload', () => {
  it('computes both dates, the period and the progress', () => {
    const { payload, warnings } = MODULES['productionPlan']!.build({
      mpsNo: 'MPS-1',
      qtyRequired: '100',
      factoryPlaceOrderDate: local(2000, 1, 1),
      wantedDeliveryDate: local(2000, 1, 11),
      otcLineNo: 2,
      customerOrderNo: 'CU-1',
    })
    expect(warnings).toEqual([])
    expect(payload).toMatchObject({
      scheduleCode: 'MPS-1',
      scheduleAmount: 100,
      planStartDate: '2000-01-01T00:00:00Z',
      planPeriod: 10,
      planFinishDate: '2000-01-18T00:00:00Z',
      dueDate: '2000-01-11T00:00:00Z',
      soItemNo: 2,
      salesOrderNo: 'CU-1',
    })
    // The plan window is entirely in the past, so progress saturates.
    expect(payload['schedule']).toBe('100')
  })

  it('warns when the requested delivery date is missing', () => {
    const built = MODULES['productionPlan']!.build({ factoryPlaceOrderDate: local(2026, 1, 1) })
    expect(built.warnings.some(warning => warning.includes('Requested delivery date is missing'))).toBe(true)
    expect(built.payload['dueDate']).toBeNull()
    expect(built.payload['planFinishDate']).toBeNull()
  })

  it('warns when the factory order date is missing', () => {
    const built = MODULES['productionPlan']!.build({ wantedDeliveryDate: local(2026, 1, 11) })
    expect(built.warnings.some(warning => warning.includes('Factory order date is missing'))).toBe(true)
    expect(built.payload['planStartDate']).toBeNull()
    expect(built.payload['planPeriod']).toBeNull()
  })

  it('reports both warnings when neither date is present', () => {
    expect(MODULES['productionPlan']!.build({}).warnings).toHaveLength(2)
  })

  it('falls back from qtyRequired to scheduleAmount', () => {
    expect(MODULES['productionPlan']!.build({ scheduleAmount: '7' }).payload['scheduleAmount']).toBe(7)
  })
})

describe('productionOrder payload', () => {
  it('maps the order fields and both category codes', () => {
    const { payload, warnings } = MODULES['productionOrder']!.build({
      mpsNo: 'MPS-1',
      salesPartNo: 'P-1',
      salesPartName: '架空绝缘电缆',
      customerOrderNo: 'CU-1',
      specificationModel: 'YJLV',
      otcLineNo: 3,
      otcUnit: 'km',
      qtyRequired: '50',
      factoryPlaceOrderDate: local(2026, 11, 14, 8, 30, 0),
      wantedDeliveryDate: local(2026, 11, 21, 18, 0, 0),
    })
    expect(warnings).toEqual([])
    expect(payload).toMatchObject({
      no: 'MPS-1',
      materialNo: 'P-1',
      salesOrderNo: 'CU-1',
      specificationType: 'YJLV',
      salesOrderRowNo: 3,
      makt: '架空绝缘电缆',
      unit: 'km',
      demandQuantity: 50,
      plannedStartUpTime: '2026-11-14T08:30:00Z',
      plannedEndTime: '2026-11-21T18:00:00Z',
      materialsName: '架空绝缘电缆',
      materialsUnit: 'km',
      categoryCode: '31',
      lowestMaterialClassCode: '3102',
    })
  })

  it('warns when the category cannot be inferred', () => {
    expect(MODULES['productionOrder']!.build({ mpsNo: 'MPS-1' }).warnings)
      .toEqual(['Category and subclass codes were not inferred.'])
  })
})

describe('workOrder payload', () => {
  const base = {
    mpsNo: 'MPS-1',
    optaskNo: 'OPT-1',
    salesPartNo: 'P-1',
    plannedQuantity: '12',
    plannedStartDate: local(2026, 11, 1),
  }

  it('maps a recognized state and a planned window', () => {
    const { payload, warnings } = MODULES['workOrder']!.build({
      ...base,
      state: '02inProgress',
      plannedFinishDate: local(2026, 11, 10),
      operationName: '绝缘',
      workshop: '高压车间',
      sgNo: 'JY-1',
    })
    expect(warnings).toEqual([])
    expect(payload).toMatchObject({
      ipoNo: 'MPS-1',
      woNo: 'OPT-1',
      materialsCode: 'P-1',
      amount: 12,
      unit: 'km',
      planStartDate: '2026-11-01T00:00:00Z',
      planFinishDate: '2026-11-10T00:00:00Z',
      woStatus: 3,
      ProcedureNo: 'JY-1,jyxxqq',
    })
  })

  it('defaults the finish date to three days after the start', () => {
    expect(MODULES['workOrder']!.build({ ...base, state: '04completed' }).payload['planFinishDate'])
      .toBe('2026-11-04T00:00:00Z')
  })

  it('falls back from the planned start to the actual start', () => {
    expect(MODULES['workOrder']!.build({
      ...base, plannedStartDate: null, actualStartDate: local(2026, 12, 1), state: '02inProgress',
    }).payload['planStartDate']).toBe('2026-12-01T00:00:00Z')
  })

  it('warns for a state outside the mapping table', () => {
    const built = MODULES['workOrder']!.build({ ...base, state: '99whatever' })
    expect(built.warnings).toHaveLength(1)
    expect(built.warnings[0]).toContain('not in the MES mapping table')
    expect(built.payload['woStatus']).toBe(1)
  })

  it('does not warn about an absent state', () => {
    expect(MODULES['workOrder']!.build(base).warnings).toEqual([])
  })

  it('warns that a cancelled work order should not be approved', () => {
    const warnings = MODULES['workOrder']!.build({ ...base, state: '05canceled' }).warnings
    expect(warnings.some(warning => warning.includes('cancelled'))).toBe(true)
  })

  it('reports both the drift warning and the cancel warning for a cancelled state', () => {
    // 05canceled is not in the table either, so both facts are surfaced.
    expect(MODULES['workOrder']!.build({ ...base, state: '05canceled' }).warnings).toHaveLength(2)
  })
})

describe('workReport payload', () => {
  const base = {
    mpsNo: 'MPS-1',
    productNo: 'BATCH-1',
    optaskNo: 'OPT-1',
    deviceNo: 'DEV-1',
    operationName: '绝缘',
    workshop: '低压车间',
    sgNo: 'JY-1',
    actualStartDate: local(2026, 11, 14, 8, 0, 0),
  }

  it('maps the report fields with the hardcoded province', () => {
    const { payload, warnings } = MODULES['workReport']!.build({ ...base, actualFinishDate: local(2026, 11, 14, 18, 0, 0) })
    expect(warnings).toEqual([])
    expect(payload).toEqual({
      productionOrderNo: 'MPS-1',
      productionBatchNo: 'BATCH-1',
      procedureNo: 'jy',
      procedureName: '绝缘',
      deviceNo: 'DEV-1',
      startTime: '2026-11-14T08:00:00Z',
      endTime: '2026-11-14T18:00:00Z',
      woNo: 'OPT-1',
      BuyerProvince: '江苏省',
    })
  })

  it('falls back from deviceNo to the operation number', () => {
    expect(MODULES['workReport']!.build({ ...base, deviceNo: null }).payload['deviceNo']).toBe('JY-1')
  })

  it('warns when the end time is missing', () => {
    const built = MODULES['workReport']!.build(base)
    expect(built.warnings).toEqual(['Work-report end time is missing; MES skips this record, so it should not be approved.'])
    expect(built.payload['endTime']).toBeNull()
  })
})

describe('finishedProduct payload', () => {
  it('warns that the module is insert-only and that re-approving duplicates', () => {
    const { warnings } = MODULES['finishedProduct']!.build({ cable: 'C-1' })
    expect(warnings).toHaveLength(1)
    expect(warnings[0]).toContain('only ever inserts')
    expect(warnings[0]).toContain('duplicate downstream')
  })

  it('maps the stock fields with the constants MES hardcodes', () => {
    const { payload } = MODULES['finishedProduct']!.build({
      cable: 'C-1',
      stockQuantity: '10',
      mpsNo: 'MPS-1',
      specificationModel: 'YJLV',
      deliveryTime: local(2026, 12, 1),
      stockInDate: local(2026, 11, 20),
    })
    expect(payload).toEqual({
      no: 'C-1',
      unit: 1,
      number: 10,
      productionOrderNo: 'MPS-1',
      SpecificationType: 'YJLV',
      DeliveryStatus: 2,
      StockInDate: '2026-11-20T00:00:00Z',
      DeliveryTime: '2026-12-01T00:00:00Z',
      ProductStatus: 1,
    })
  })

  it('reports delivery status 1 when no delivery time exists', () => {
    expect(MODULES['finishedProduct']!.build({ cable: 'C-1' }).payload['DeliveryStatus']).toBe(1)
  })

  it('falls back from stockInDate to createTime', () => {
    expect(MODULES['finishedProduct']!.build({ createTime: local(2026, 5, 1) }).payload['StockInDate'])
      .toBe('2026-05-01T00:00:00Z')
  })
})

describe('rawMaterialStock payload', () => {
  it('maps the stock fields with the hardcoded location constants', () => {
    const { payload, warnings } = MODULES['rawMaterialStock']!.build({
      type: '电缆料',
      partName: '35kV及以下电力电缆',
      unit: 'kg',
      stock: '99',
      receiptDate: local(2026, 11, 1),
      specs: 'YJLV',
      voltage: '35kV',
    })
    expect(warnings).toEqual([])
    expect(payload).toMatchObject({
      matType: '电缆料',
      matName: '35kV及以下电力电缆',
      categoryCode: '30',
      subclassCode: '300102',
      matUnit: 'kg',
      matNum: 99,
      stockInDate: '2026-11-01T00:00:00Z',
      specificationType: 'YJLV',
      voltageLevel: '35kV',
      storeCity: '江苏南通',
      matProdAddr: '中国',
    })
  })

  it('warns and sends null codes when the material category does not match', () => {
    const built = MODULES['rawMaterialStock']!.build({ partName: '未知' })
    expect(built.warnings).toHaveLength(1)
    expect(built.warnings[0]).toContain('category did not match')
    expect(built.payload['categoryCode']).toBeNull()
    expect(built.payload['subclassCode']).toBeNull()
  })

  it('defaults the quantity to zero rather than null', () => {
    expect(MODULES['rawMaterialStock']!.build({}).payload['matNum']).toBe(0)
  })

  it('matches on the voltage when the part name is absent', () => {
    expect(MODULES['rawMaterialStock']!.build({ voltage: '架空绝缘电缆' }).payload['categoryCode']).toBe('31')
  })
})

describe('productionStore payload', () => {
  it('maps the finished-goods stock fields', () => {
    const { payload, warnings } = MODULES['productionStore']!.build({
      salesPartName: '架空绝缘电缆',
      salesPartNo: 'P-1',
      unshipQty: '8',
      customerContractNo: 'CU-1',
      storageTime: local(2026, 11, 2),
      sgId: 'SG-1',
    })
    expect(warnings).toEqual([])
    expect(payload).toMatchObject({
      categoryCode: '31',
      subclassCode: '3102',
      amount: 8,
      MaterialsDes: '架空绝缘电缆',
      materialsCode: 'P-1',
      storeCity: '江苏南通',
      customerOrderNo: 'CU-1',
      putStorageTime: '2026-11-02T00:00:00Z',
      PoItemId: 'SG-1',
    })
  })

  it('warns when no category could be inferred', () => {
    const built = MODULES['productionStore']!.build({ sgId: 'SG-1' })
    expect(built.warnings.some(warning => warning.includes('Category and subclass codes were not inferred'))).toBe(true)
  })

  it('warns that an unsent order line has no ticket id', () => {
    const built = MODULES['productionStore']!.build({ salesPartName: '架空绝缘电缆' })
    expect(built.warnings.some(warning => warning.includes('ticket id is empty'))).toBe(true)
    expect(built.payload['PoItemId']).toBeNull()
  })

  it('reports both warnings when both problems are present', () => {
    expect(MODULES['productionStore']!.build({}).warnings).toHaveLength(2)
  })
})

describe('productionOrderRawMaterial payload', () => {
  it('joins the part number and batch number with an underscore', () => {
    const { payload, warnings } = MODULES['productionOrderRawMaterial']!.build({
      mpsNo: 'MPS-1', partNo: 'P-1', partBatchNo: 'B-1',
    })
    expect(warnings).toEqual([])
    expect(payload).toEqual({ ProductionOrderNo: 'MPS-1', RawMaterialNo: 'P-1_B-1' })
  })

  it('warns when either half of the raw-material number is missing', () => {
    expect(MODULES['productionOrderRawMaterial']!.build({ partNo: 'P-1' }).warnings)
      .toEqual(['Part number or batch number is missing, so RawMaterialNo is incomplete.'])
  })

  it('warns when both halves are missing and sends an empty number', () => {
    const built = MODULES['productionOrderRawMaterial']!.build({})
    expect(built.warnings).toHaveLength(1)
    expect(built.payload['RawMaterialNo']).toBe('')
  })
})

describe('dryingRoom payload carries two sections', () => {
  const row = {
    snNo: 'SN-1',
    id: 42,
    mpsNo: 'MPS-1',
    deviceNo: 'DEV-1',
    optaskNo: 'OPT-1',
    warehouseIn: local(2026, 11, 1, 8, 0, 0),
    warehouseOut: local(2026, 11, 2, 9, 30, 0),
  }

  it('builds a work-report section and a process-inspection section', () => {
    const { payload, warnings } = MODULES['dryingRoom']!.build(row)
    expect(warnings).toEqual([])
    expect(Object.keys(payload).sort()).toEqual(['procedureData', 'workReport'])
  })

  it('uses the same batch number on both sections, built from the serial number and row id', () => {
    const { payload } = MODULES['dryingRoom']!.build(row)
    const workReport = payload['workReport'] as Record<string, unknown>
    const procedureData = payload['procedureData'] as Record<string, unknown>
    expect(workReport['productionBatchNo']).toBe('SN-1-42')
    expect(procedureData['no']).toBe('SN-1-42')
  })

  it('writes the report section with the hardcoded operation and the short province', () => {
    const workReport = MODULES['dryingRoom']!.build(row).payload['workReport'] as Record<string, unknown>
    expect(workReport).toEqual({
      productionOrderNo: 'MPS-1',
      productionBatchNo: 'SN-1-42',
      deviceNo: 'DEV-1',
      woNo: 'OPT-1',
      procedureNo: 'jyxxqq',
      procedureName: '除气',
      startTime: '2026-11-01T08:00:00Z',
      endTime: '2026-11-02T09:30:00Z',
      BuyerProvince: '江苏',
    })
  })

  it('writes the inspection section with the uppercase data type and nested times', () => {
    const procedureData = MODULES['dryingRoom']!.build(row).payload['procedureData'] as Record<string, unknown>
    expect(procedureData).toEqual({
      no: 'SN-1-42',
      productionOrderNo: 'MPS-1',
      ProcedureDataType: 'JYXXQQ',
      testData: { kssj: '2026-11-01T08:00:00Z', jssj: '2026-11-02T09:30:00Z' },
    })
  })

  it('warns when the warehouse exit time is missing', () => {
    const built = MODULES['dryingRoom']!.build({ ...row, warehouseOut: null })
    expect(built.warnings).toEqual(['Warehouse exit time is missing; MES skips this record, so it should not be approved.'])
    const procedureData = built.payload['procedureData'] as Record<string, unknown>
    expect((procedureData['testData'] as Record<string, unknown>)['jssj']).toBeNull()
  })
})

describe('businessKeyOf', () => {
  it('prefers the module key field', () => {
    expect(businessKeyOf('workOrder', { optaskNo: 'OPT-1', id: 7 })).toBe('OPT-1')
  })

  it('falls back through id, ID, contractNo and customerOrderNo', () => {
    expect(businessKeyOf('workOrder', { id: 7 })).toBe('7')
    expect(businessKeyOf('workOrder', { ID: 8 })).toBe('8')
    expect(businessKeyOf('workOrder', { contractNo: 'HT-1' })).toBe('HT-1')
    expect(businessKeyOf('workOrder', { customerOrderNo: 'CU-1' })).toBe('CU-1')
  })

  it('returns an empty string when no candidate is populated', () => {
    expect(businessKeyOf('workOrder', {})).toBe('')
    expect(businessKeyOf('workOrder', { optaskNo: '   ' })).toBe('')
    expect(businessKeyOf('workOrder', { optaskNo: null })).toBe('')
  })

  it('trims the chosen value', () => {
    expect(businessKeyOf('workOrder', { optaskNo: '  OPT-1  ' })).toBe('OPT-1')
  })

  it('still uses the generic candidates for an unknown module', () => {
    expect(businessKeyOf('unknownModule', { contractNo: 'HT-1' })).toBe('HT-1')
  })
})

describe('buildItems', () => {
  it('converts rows into review-pool items with the module business name', () => {
    const { items } = buildItems('workOrder', [{ optaskNo: 'OPT-1', state: '02inProgress' }])
    expect(items).toHaveLength(1)
    expect(items[0]?.module).toBe('工单')
    expect(items[0]?.bizKey).toBe('OPT-1')
    expect(items[0]?.mapped['woNo']).toBe('OPT-1')
    expect(items[0]?.source).toEqual({ optaskNo: 'OPT-1', state: '02inProgress' })
  })

  it('indexes a fallback business key so several keyless rows do not collide', () => {
    const { items } = buildItems('workOrder', [{}, {}])
    expect(items.map(item => item.bizKey)).toEqual(['workOrder#1', 'workOrder#2'])
  })

  it('collects a warning per row that produced one', () => {
    const { items, warnings } = buildItems('workOrder', [
      { optaskNo: 'A', state: '02inProgress' },
      { optaskNo: 'B', state: '99unknown' },
    ])
    expect(items[0]?.warnings).toEqual([])
    expect(items[1]?.warnings).toHaveLength(1)
    expect(warnings).toHaveLength(1)
    expect(warnings[0]?.index).toBe(1)
    expect(warnings[0]?.bizKey).toBe('B')
    expect(warnings[0]?.message).toContain('not in the MES mapping table')
  })

  it('applies a row limit', () => {
    const { items } = buildItems('workOrder', [{ optaskNo: 'A' }, { optaskNo: 'B' }, { optaskNo: 'C' }], 2)
    expect(items.map(item => item.bizKey)).toEqual(['A', 'B'])
  })

  it('rejects an unknown module rather than emitting an empty payload', () => {
    expect(() => buildItems('nope', [])).toThrow(/Unknown push module: nope/)
  })

  it('converts nothing for an empty result', () => {
    expect(buildItems('workOrder', [])).toEqual({ items: [], warnings: [] })
  })
})
