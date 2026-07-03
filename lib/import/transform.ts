import { calcAchievementRate, calcGasUnit, calcTonPerHour } from '@/lib/utils'
import { normalizeToken, parseIntNumber, parseLooseNumber, isTotalLikeHeader } from '@/lib/input/common'
import { normalizeDateText, normalizeFurnaceCode, normalizeLineCode, normalizeMonthDate, normalizeShiftText, detectYearFromSheetName } from '@/lib/import/common'
import { buildFieldAliasMap, buildFurnaceLookup, buildLineLookup, buildProductLookup, findFieldByHeader } from '@/lib/import/aliases'
import {
  importGasCompanyMonthlyRowSchema,
  importGasDailyRowSchema,
  importGasMonthlyRowSchema,
  importProductionRowSchema,
  parseZodIssues,
} from '@/lib/import/validation'
import type { Furnace, Line, Product } from '@/types'
import type {
  GasCompanyMonthlyImportRow,
  GasDailyImportRow,
  GasMonthlyImportRow,
  ImportAliasRecord,
  ImportLayout,
  ImportMappingState,
  ImportPreview,
  ImportPreviewContext,
  ImportPreviewRow,
  ImportSheetAnalysis,
  ProductionImportRow,
} from '@/types/import'
import type { ImportDatasetKey, ImportFieldKey } from '@/types/import'
import { IMPORT_DATASETS } from '@/lib/import/specs'

function sourceKeyToIndex(sourceKey: string | null | undefined) {
  if (!sourceKey) return null
  const match = sourceKey.match(/^col:(\d+)$/)
  return match ? Number(match[1]) : null
}

function getCell(row: string[], index: number | null | undefined) {
  if (index == null || index < 0) return ''
  return String(row[index] ?? '').trim()
}

function buildAutoFieldIndexMap(
  headerRow: string[] | undefined,
  aliases: ImportAliasRecord[]
) {
  const map = new Map<ImportFieldKey, number>()
  if (!headerRow) return map

  const fieldAliasMap = buildFieldAliasMap(aliases)
  headerRow.forEach((cell, index) => {
    const field = findFieldByHeader(cell, fieldAliasMap)
    if (field && !map.has(field)) map.set(field, index)
  })

  return map
}

function resolveFieldText(
  row: string[],
  field: ImportFieldKey,
  mapping: ImportMappingState,
  autoFieldIndexMap: Map<ImportFieldKey, number>
) {
  const sourceKey = mapping.fieldMap[field]
  const sourceIndex = sourceKeyToIndex(sourceKey)
  if (sourceIndex != null) return getCell(row, sourceIndex)

  const autoIndex = autoFieldIndexMap.get(field)
  if (autoIndex != null) return getCell(row, autoIndex)

  const staticValue = mapping.staticValues[field]
  if (staticValue != null) return String(staticValue).trim()

  return ''
}

function makeRowResult<T>(
  rowIndex: number,
  raw: string[],
  value: T | null,
  errors: string[],
  warnings: string[]
): ImportPreviewRow<T> {
  return { rowIndex, raw, value, errors, warnings }
}

function finalizePreview<T>(
  sheet: ImportSheetAnalysis,
  rows: ImportPreviewRow<T>[],
  layout: ImportLayout,
  datasetKey: ImportDatasetKey
): ImportPreview<T> {
  return {
    datasetKey,
    layout,
    sheetName: sheet.sheetName,
    headerRowIndex: sheet.headerRowIndex,
    columns: sheet.columns,
    rows,
    validRows: rows.filter((row) => row.value && row.errors.length === 0).map((row) => row.value as T),
    invalidRowCount: rows.filter((row) => row.errors.length > 0).length,
    warningRowCount: rows.filter((row) => row.warnings.length > 0).length,
    templateSignature: sheet.templateSignature,
  }
}

function validateRecord<T>(schema: { safeParse: (value: unknown) => { success: boolean; data?: T; error?: { issues: Array<{ message: string }> } } }, record: T) {
  const parsed = schema.safeParse(record)
  if (parsed.success) {
    return { record, errors: [] as string[] }
  }

  return { record, errors: parseZodIssues(parsed.error as never) }
}

function normalizeRecordLabel(value: unknown) {
  return normalizeToken(value)
}

function shouldSkipRow(raw: string[]) {
  const token = normalizeRecordLabel(raw.join(' '))
  return !token || isTotalLikeHeader(token)
}

function rowHasAnyData(row: string[]) {
  return row.some((cell) => String(cell ?? '').trim() !== '')
}

function getMonthYearFallback(sheet: ImportSheetAnalysis, mapping: ImportMappingState) {
  const explicit = String(mapping.options.baseYm ?? mapping.staticValues.ym ?? mapping.staticValues.work_month ?? '').trim()
  if (explicit) return explicit

  const fromSheet = normalizeMonthDate(sheet.sheetName, detectYearFromSheetName(sheet.sheetName))
  if (fromSheet) return fromSheet.slice(0, 7)

  return null
}

function getMonthColumns(headerRow: string[], yearFallback: number | null) {
  const months: Array<{ index: number; ym: string; label: string }> = []

  headerRow.forEach((cell, index) => {
    const label = String(cell ?? '').trim()
    const ym = normalizeMonthDate(label, yearFallback)
    if (ym) {
      months.push({ index, ym, label })
    }
  })

  return months
}

function findHeaderIndex(headerRow: string[], candidates: string[]) {
  const normalizedHeaders = headerRow.map((cell) => normalizeToken(cell))

  for (const candidate of candidates) {
    const token = normalizeToken(candidate)
    if (!token) continue

    const matchedIndex = normalizedHeaders.findIndex((headerToken) => {
      return headerToken === token || headerToken.includes(token) || token.includes(headerToken)
    })

    if (matchedIndex >= 0) return matchedIndex
  }

  return null
}

function readDetailFieldText(
  row: string[],
  headerRow: string[],
  mapping: ImportMappingState,
  field: ImportFieldKey,
  candidates: string[]
) {
  const sourceKey = mapping.fieldMap[field]
  const sourceIndex = sourceKeyToIndex(sourceKey)
  if (sourceIndex != null) return getCell(row, sourceIndex)

  const staticValue = mapping.staticValues[field]
  if (staticValue != null) return String(staticValue).trim()

  const headerIndex = findHeaderIndex(headerRow, candidates)
  if (headerIndex != null) return getCell(row, headerIndex)

  return ''
}

function readDetailHeaderText(row: string[], headerRow: string[], candidates: string[]) {
  const headerIndex = findHeaderIndex(headerRow, candidates)
  if (headerIndex != null) return getCell(row, headerIndex)
  return ''
}

function isZeroLikeText(value: unknown) {
  return normalizeToken(value) === '0'
}

function kgToTon(value: number) {
  return Number((value / 1000).toFixed(3))
}

function buildProductionDetailNote(row: string[], headerRow: string[]) {
  const parts = [
    ['공장', readDetailHeaderText(row, headerRow, ['공장'])],
    ['작업장', readDetailHeaderText(row, headerRow, ['작업장'])],
    ['공정', readDetailHeaderText(row, headerRow, ['공정'])],
    ['고객사', readDetailHeaderText(row, headerRow, ['고객사'])],
    ['산업분야', readDetailHeaderText(row, headerRow, ['산업분야'])],
    ['제품상태', readDetailHeaderText(row, headerRow, ['제품상태'])],
    ['품명', readDetailHeaderText(row, headerRow, ['품명'])],
    ['제품형상', readDetailHeaderText(row, headerRow, ['제품형상'])],
    ['치수', readDetailHeaderText(row, headerRow, ['치수'])],
    ['도면', readDetailHeaderText(row, headerRow, ['도면'])],
    ['재질', readDetailHeaderText(row, headerRow, ['재질'])],
    ['강종', readDetailHeaderText(row, headerRow, ['강종'])],
    ['소재품명', readDetailHeaderText(row, headerRow, ['소재품명'])],
  ] as Array<[string, string]>

  const formatted = parts
    .filter(([, value]) => value)
    .map(([label, value]) => `${label}:${value}`)

  return formatted.length > 0 ? formatted.join(' | ') : null
}

function parseGasDailyLong(
  sheet: ImportSheetAnalysis,
  mapping: ImportMappingState,
  context: ImportPreviewContext
): ImportPreview<GasDailyImportRow> {
  const headerRow = sheet.headerRowIndex != null ? sheet.matrix[sheet.headerRowIndex] ?? [] : sheet.columns.map((col) => col.label)
  const autoFieldIndexMap = buildAutoFieldIndexMap(headerRow, context.master.aliases)
  const furnaceLookup = buildFurnaceLookup(context.master.furnaces as Furnace[], context.master.aliases)
  const rows: ImportPreviewRow<GasDailyImportRow>[] = []

  const baseYm = getMonthYearFallback(sheet, mapping)

  sheet.matrix.slice((sheet.headerRowIndex ?? -1) + 1).forEach((raw, index) => {
    const rowIndex = (sheet.headerRowIndex ?? -1) + index + 2
    if (!rowHasAnyData(raw) || shouldSkipRow(raw)) return

    const dateText = resolveFieldText(raw, 'date', mapping, autoFieldIndexMap)
    const furnaceText = resolveFieldText(raw, 'furnace_code', mapping, autoFieldIndexMap)
    const shiftText = resolveFieldText(raw, 'shift', mapping, autoFieldIndexMap)
    const valueText = resolveFieldText(raw, 'value', mapping, autoFieldIndexMap)
    const orderNo = resolveFieldText(raw, 'order_no', mapping, autoFieldIndexMap)
    const note = resolveFieldText(raw, 'note', mapping, autoFieldIndexMap)

    const errors: string[] = []
    const warnings: string[] = []

    const normalizedDate =
      normalizeDateText(dateText, baseYm) ||
      normalizeDateText(getCell(raw, autoFieldIndexMap.get('date')), baseYm) ||
      null

    const furnace = furnaceLookup.get(normalizeToken(furnaceText)) ?? null
    const value = parseLooseNumber(valueText)
    const shift = normalizeShiftText(shiftText)

    if (!dateText && !normalizedDate) errors.push('일자를 찾지 못했습니다.')
    if (dateText && !normalizedDate) errors.push(`일자 "${dateText}"를 해석하지 못했습니다.`)
    if (furnaceText && !furnace) errors.push(`호기 "${furnaceText}"을 찾지 못했습니다.`)
    if (value == null) errors.push('검침값을 입력해 주세요.')

    if (normalizedDate && baseYm && !normalizedDate.startsWith(baseYm)) {
      warnings.push(`날짜 ${normalizedDate}가 기준 월 ${baseYm}와 다릅니다.`)
    }

    const record: GasDailyImportRow = {
      date: normalizedDate ?? (baseYm ? `${baseYm}-01` : ''),
      furnace_code: furnace?.code ?? normalizeFurnaceCode(furnaceText) ?? furnaceText.trim(),
      shift,
      value: value ?? 0,
      order_no: orderNo || null,
      note: note || null,
    }

    const validation = validateRecord(importGasDailyRowSchema, record)
    const normalizedRecord = validation.record as GasDailyImportRow
    errors.push(...validation.errors)

    if (normalizedRecord.value <= 0) {
      if (!normalizedRecord.date && !normalizedRecord.furnace_code) return
      errors.push('0 또는 음수 값은 저장하지 않습니다.')
    }

    rows.push(makeRowResult(rowIndex, raw, normalizedRecord, errors, warnings))
  })

  return finalizePreview(sheet, rows, context.layout, 'gas-daily')
}

function parseGasDailyWide(
  sheet: ImportSheetAnalysis,
  mapping: ImportMappingState,
  context: ImportPreviewContext
): ImportPreview<GasDailyImportRow> {
  const headerRow = sheet.headerRowIndex != null ? sheet.matrix[sheet.headerRowIndex] ?? [] : []
  const autoFieldIndexMap = buildAutoFieldIndexMap(headerRow, context.master.aliases)
  const furnaceLookup = buildFurnaceLookup(context.master.furnaces as Furnace[], context.master.aliases)
  const rows: ImportPreviewRow<GasDailyImportRow>[] = []
  const baseYm = getMonthYearFallback(sheet, mapping)
  const rowLabelIndex = sourceKeyToIndex(mapping.options.rowLabelSourceKey as string | null | undefined) ?? 0
  const shiftFromMapping = normalizeShiftText(mapping.staticValues.shift ?? null)
  const shiftColumnIndex = sourceKeyToIndex(mapping.fieldMap.shift ?? null)
  const dataColumns = sheet.columns.filter((column) => {
    const furnace = furnaceLookup.get(normalizeToken(column.label))
    return furnace != null || normalizeFurnaceCode(column.label) != null || /호기/.test(column.label)
  })

  sheet.matrix.slice((sheet.headerRowIndex ?? -1) + 1).forEach((raw, index) => {
    const rowIndex = (sheet.headerRowIndex ?? -1) + index + 2
    if (!rowHasAnyData(raw) || shouldSkipRow(raw)) return

    const rowLabel = getCell(raw, rowLabelIndex)
    const shiftText = shiftColumnIndex != null ? getCell(raw, shiftColumnIndex) : resolveFieldText(raw, 'shift', mapping, autoFieldIndexMap)
    const shift = normalizeShiftText(shiftText) ?? shiftFromMapping
    const date = normalizeDateText(rowLabel, baseYm) || normalizeDateText(resolveFieldText(raw, 'date', mapping, autoFieldIndexMap), baseYm)

    if (!date && !rowLabel) return

    dataColumns.forEach((column) => {
      const furnace = furnaceLookup.get(normalizeToken(column.label)) ?? null
      const valueText = getCell(raw, column.index)
      const value = parseLooseNumber(valueText)
      if (value == null || value <= 0) return

      const errors: string[] = []
      const warnings: string[] = []

      if (!furnace) errors.push(`호기 "${column.label}"을 찾지 못했습니다.`)
      if (!date) errors.push(`일자 "${rowLabel}"를 해석하지 못했습니다.`)

      const record: GasDailyImportRow = {
        date: date ?? (baseYm ? `${baseYm}-01` : ''),
        furnace_code: furnace?.code ?? normalizeFurnaceCode(column.label) ?? column.label,
        shift,
        value,
        order_no: resolveFieldText(raw, 'order_no', mapping, autoFieldIndexMap) || null,
        note: resolveFieldText(raw, 'note', mapping, autoFieldIndexMap) || null,
      }

      const validation = validateRecord(importGasDailyRowSchema, record)
      const normalizedRecord = validation.record as GasDailyImportRow
      errors.push(...validation.errors)
      rows.push(makeRowResult(rowIndex, raw, normalizedRecord, errors, warnings))
    })
  })

  return finalizePreview(sheet, rows, context.layout, 'gas-daily')
}

function parseGasMonthlyLong(
  sheet: ImportSheetAnalysis,
  mapping: ImportMappingState,
  context: ImportPreviewContext
): ImportPreview<GasMonthlyImportRow> {
  const headerRow = sheet.headerRowIndex != null ? sheet.matrix[sheet.headerRowIndex] ?? [] : []
  const autoFieldIndexMap = buildAutoFieldIndexMap(headerRow, context.master.aliases)
  const furnaceLookup = buildFurnaceLookup(context.master.furnaces as Furnace[], context.master.aliases)
  const rows: ImportPreviewRow<GasMonthlyImportRow>[] = []
  const baseYm = getMonthYearFallback(sheet, mapping)

  sheet.matrix.slice((sheet.headerRowIndex ?? -1) + 1).forEach((raw, index) => {
    const rowIndex = (sheet.headerRowIndex ?? -1) + index + 2
    if (!rowHasAnyData(raw) || shouldSkipRow(raw)) return

    const ymText = resolveFieldText(raw, 'ym', mapping, autoFieldIndexMap) || resolveFieldText(raw, 'work_month', mapping, autoFieldIndexMap)
    const furnaceText = resolveFieldText(raw, 'furnace_code', mapping, autoFieldIndexMap)
    const chargeWeightText = resolveFieldText(raw, 'charge_weight_kg', mapping, autoFieldIndexMap)
    const gasUsageText = resolveFieldText(raw, 'gas_usage', mapping, autoFieldIndexMap)
    const sourceText = resolveFieldText(raw, 'source', mapping, autoFieldIndexMap)
    const orderNo = resolveFieldText(raw, 'order_no', mapping, autoFieldIndexMap)
    const note = resolveFieldText(raw, 'note', mapping, autoFieldIndexMap)

    const errors: string[] = []
    const warnings: string[] = []

    const ym = normalizeMonthDate(ymText, baseYm ? Number(baseYm.slice(0, 4)) : detectYearFromSheetName(sheet.sheetName))
    const furnace = furnaceLookup.get(normalizeToken(furnaceText)) ?? null
    const chargeWeightKg = parseLooseNumber(chargeWeightText) ?? 0
    const gasUsage = parseLooseNumber(gasUsageText)

    if (!ym) errors.push('월(ym)을 찾지 못했습니다.')
    if (!furnaceText && !furnace) errors.push('호기를 찾지 못했습니다.')
    if (furnaceText && !furnace) errors.push(`호기 "${furnaceText}"을 찾지 못했습니다.`)
    if (gasUsage == null) errors.push('가스사용량을 입력해 주세요.')
    if (chargeWeightKg <= 0) warnings.push('장입량이 0이거나 비어 있어 원단위가 0으로 계산됩니다.')

    const record: GasMonthlyImportRow = {
      ym: ym ?? (baseYm ? `${baseYm}-01` : ''),
      furnace_code: furnace?.code ?? normalizeFurnaceCode(furnaceText) ?? furnaceText,
      charge_weight_kg: chargeWeightKg,
      gas_usage: gasUsage ?? 0,
      source: (['meter', 'bill', 'self'] as const).includes(sourceText as never)
        ? (sourceText as GasMonthlyImportRow['source'])
        : 'meter',
      order_no: orderNo || null,
      note: note || null,
    }

    const validation = validateRecord(importGasMonthlyRowSchema, record)
    const normalizedRecord = validation.record as GasMonthlyImportRow
    errors.push(...validation.errors)

    if (normalizedRecord.gas_usage <= 0) {
      errors.push('0 또는 음수 값은 저장하지 않습니다.')
    }

    const gasUnit = normalizedRecord.charge_weight_kg > 0 ? calcGasUnit(normalizedRecord.gas_usage, normalizedRecord.charge_weight_kg) : null
    if (gasUnit != null && (gasUnit < 100 || gasUnit > 250)) warnings.push(`원단위 ${gasUnit.toFixed(1)}는 일반 범위를 벗어납니다.`)

    rows.push(makeRowResult(rowIndex, raw, normalizedRecord, errors, warnings))
  })

  return finalizePreview(sheet, rows, context.layout, 'gas-monthly')
}

function parseGasMonthlyWide(
  sheet: ImportSheetAnalysis,
  mapping: ImportMappingState,
  context: ImportPreviewContext
): ImportPreview<GasMonthlyImportRow> {
  const headerRow = sheet.headerRowIndex != null ? sheet.matrix[sheet.headerRowIndex] ?? [] : []
  const autoFieldIndexMap = buildAutoFieldIndexMap(headerRow, context.master.aliases)
  const furnaceLookup = buildFurnaceLookup(context.master.furnaces as Furnace[], context.master.aliases)
  const rows: ImportPreviewRow<GasMonthlyImportRow>[] = []
  const yearFallback = detectYearFromSheetName(sheet.sheetName)
  const monthColumns = getMonthColumns(headerRow, yearFallback)
  const furnaceColumnIndex = sourceKeyToIndex(mapping.options.rowLabelSourceKey as string | null | undefined) ?? 0
  const sourceColumnIndex = sourceKeyToIndex(mapping.fieldMap.source ?? null)
  const chargeColumnIndex = sourceKeyToIndex(mapping.fieldMap.charge_weight_kg ?? null)
  const rowChargeColumnIndex = sourceKeyToIndex(mapping.options.chargeWeightSourceKey as string | null | undefined)
  const staticSource = (mapping.staticValues.source as GasMonthlyImportRow['source'] | null | undefined) ?? 'meter'
  const baseYm = getMonthYearFallback(sheet, mapping)

  sheet.matrix.slice((sheet.headerRowIndex ?? -1) + 1).forEach((raw, index) => {
    const rowIndex = (sheet.headerRowIndex ?? -1) + index + 2
    if (!rowHasAnyData(raw) || shouldSkipRow(raw)) return

    const furnaceText = getCell(raw, furnaceColumnIndex)
    const furnace = furnaceLookup.get(normalizeToken(furnaceText)) ?? null
    const rowChargeWeight = parseLooseNumber(getCell(raw, rowChargeColumnIndex)) ?? parseLooseNumber(getCell(raw, chargeColumnIndex))
    const sourceText = sourceColumnIndex != null ? getCell(raw, sourceColumnIndex) : ''

    monthColumns.forEach((monthColumn) => {
      const gasUsage = parseLooseNumber(getCell(raw, monthColumn.index))
      if (gasUsage == null || gasUsage <= 0) return

      const chargeWeightKg = rowChargeWeight ?? 0
      const ym = monthColumn.ym || baseYm || ''
      const errors: string[] = []
      const warnings: string[] = []

      if (!ym) errors.push('월 정보를 찾지 못했습니다.')
      if (!furnaceText && !furnace) errors.push('호기를 찾지 못했습니다.')
      if (furnaceText && !furnace) errors.push(`호기 "${furnaceText}"을 찾지 못했습니다.`)
      if (chargeWeightKg <= 0) warnings.push('장입량이 0이거나 비어 있어 원단위가 0으로 계산됩니다.')

      const record: GasMonthlyImportRow = {
        ym,
        furnace_code: furnace?.code ?? normalizeFurnaceCode(furnaceText) ?? furnaceText,
        charge_weight_kg: chargeWeightKg,
        gas_usage: gasUsage,
        source: (['meter', 'bill', 'self'] as const).includes(sourceText as never)
          ? (sourceText as GasMonthlyImportRow['source'])
          : staticSource,
        order_no: resolveFieldText(raw, 'order_no', mapping, autoFieldIndexMap) || null,
        note: resolveFieldText(raw, 'note', mapping, autoFieldIndexMap) || null,
      }

      const validation = validateRecord(importGasMonthlyRowSchema, record)
      const normalizedRecord = validation.record
      errors.push(...validation.errors)

      const gasUnit = normalizedRecord.charge_weight_kg > 0 ? calcGasUnit(normalizedRecord.gas_usage, normalizedRecord.charge_weight_kg) : null
      if (gasUnit != null && (gasUnit < 100 || gasUnit > 250)) warnings.push(`원단위 ${gasUnit.toFixed(1)}는 일반 범위를 벗어납니다.`)

      rows.push(makeRowResult(rowIndex, raw, normalizedRecord, errors, warnings))
    })
  })

  return finalizePreview(sheet, rows, context.layout, 'gas-monthly')
}

function parseProductionLong(
  sheet: ImportSheetAnalysis,
  mapping: ImportMappingState,
  context: ImportPreviewContext
): ImportPreview<ProductionImportRow> {
  const headerRow = sheet.headerRowIndex != null ? sheet.matrix[sheet.headerRowIndex] ?? [] : []
  const autoFieldIndexMap = buildAutoFieldIndexMap(headerRow, context.master.aliases)
  const lineLookup = buildLineLookup(context.master.lines as Line[], context.master.aliases)
  const productLookup = buildProductLookup(context.master.products as Product[], context.master.aliases)
  const rows: ImportPreviewRow<ProductionImportRow>[] = []
  const baseYm = getMonthYearFallback(sheet, mapping)

  sheet.matrix.slice((sheet.headerRowIndex ?? -1) + 1).forEach((raw, index) => {
    const rowIndex = (sheet.headerRowIndex ?? -1) + index + 2
    if (!rowHasAnyData(raw) || shouldSkipRow(raw)) return

    const workMonthText = resolveFieldText(raw, 'work_month', mapping, autoFieldIndexMap) || resolveFieldText(raw, 'ym', mapping, autoFieldIndexMap)
    const lineText = resolveFieldText(raw, 'line_code', mapping, autoFieldIndexMap)
    const productText = resolveFieldText(raw, 'product_name', mapping, autoFieldIndexMap)
    const shiftText = resolveFieldText(raw, 'shift', mapping, autoFieldIndexMap)
    const planText = resolveFieldText(raw, 'plan_ton', mapping, autoFieldIndexMap)
    const actualText = resolveFieldText(raw, 'actual_ton', mapping, autoFieldIndexMap)
    const hwangjiText = resolveFieldText(raw, 'hwangji_ton', mapping, autoFieldIndexMap)
    const coggingText = resolveFieldText(raw, 'cogging_ton', mapping, autoFieldIndexMap)
    const workHoursText = resolveFieldText(raw, 'work_hours', mapping, autoFieldIndexMap)
    const workCountText = resolveFieldText(raw, 'work_count', mapping, autoFieldIndexMap)
    const orderNo = resolveFieldText(raw, 'order_no', mapping, autoFieldIndexMap)
    const note = resolveFieldText(raw, 'note', mapping, autoFieldIndexMap)

    const errors: string[] = []
    const warnings: string[] = []

    const workMonth = normalizeMonthDate(workMonthText, baseYm ? Number(baseYm.slice(0, 4)) : detectYearFromSheetName(sheet.sheetName))
    const line = lineLookup.get(normalizeToken(lineText)) ?? null
    const product = productText ? productLookup.get(normalizeToken(productText)) ?? null : null
    const shift = normalizeShiftText(shiftText)
    const planTon = parseLooseNumber(planText)
    const actualTon = parseLooseNumber(actualText)
    const hwangjiTon = parseLooseNumber(hwangjiText) ?? 0
    const coggingTon = parseLooseNumber(coggingText) ?? 0
    const workHours = parseLooseNumber(workHoursText)
    const workCount = parseIntNumber(workCountText)

    if (!workMonth) errors.push('작업월을 찾지 못했습니다.')
    if (!lineText && !line) errors.push('라인을 찾지 못했습니다.')
    if (lineText && !line) errors.push(`라인 "${lineText}"을 찾지 못했습니다.`)
    if (planTon == null) errors.push('계획 값을 입력해 주세요.')
    if (actualTon == null) errors.push('실적 값을 입력해 주세요.')
    if (workHours == null) errors.push('작업시간을 입력해 주세요.')
    if (workCount == null) errors.push('작업횟수를 입력해 주세요.')
    if (productText && !product) errors.push(`제품 "${productText}"을 찾지 못했습니다.`)

    const record: ProductionImportRow = {
      work_month: workMonth ?? (baseYm ? `${baseYm}-01` : ''),
      line_code: line?.code ?? normalizeLineCode(lineText) ?? lineText,
      product_name: (product?.name ?? productText) || null,
      shift,
      plan_ton: planTon ?? 0,
      actual_ton: actualTon ?? 0,
      hwangji_ton: hwangjiTon,
      cogging_ton: coggingTon,
      work_hours: workHours ?? 0,
      work_count: workCount ?? 0,
      order_no: orderNo || null,
      note: note || null,
    }

    const validation = validateRecord(importProductionRowSchema, record)
    const normalizedRecord = validation.record as ProductionImportRow
    errors.push(...validation.errors)

    if (normalizedRecord.plan_ton <= 0 && normalizedRecord.actual_ton <= 0) warnings.push('계획/실적이 0이라 저장 시 업서트만 수행됩니다.')

    if (normalizedRecord.plan_ton > 0 && normalizedRecord.actual_ton > 0) {
      const rate = calcAchievementRate(normalizedRecord.actual_ton, normalizedRecord.plan_ton)
      if (rate != null && (rate < 40 || rate > 160)) warnings.push(`달성률 ${rate.toFixed(1)}%는 일반 범위를 벗어납니다.`)
    }

    if (normalizedRecord.actual_ton > 0 && normalizedRecord.work_hours > 0) {
      const tph = calcTonPerHour(normalizedRecord.actual_ton, normalizedRecord.work_hours)
      if (tph != null && (tph < 5 || tph > 40)) warnings.push(`TPH ${tph.toFixed(2)}는 일반 범위를 벗어납니다.`)
    }

    rows.push(makeRowResult(rowIndex, raw, normalizedRecord, errors, warnings))
  })

  return finalizePreview(sheet, rows, context.layout, 'production')
}

function parseProductionDetail(
  sheet: ImportSheetAnalysis,
  mapping: ImportMappingState,
  context: ImportPreviewContext
): ImportPreview<ProductionImportRow> {
  const headerRow = sheet.headerRowIndex != null ? sheet.matrix[sheet.headerRowIndex] ?? [] : []
  const lineLookup = buildLineLookup(context.master.lines as Line[], context.master.aliases)
  const productLookup = buildProductLookup(context.master.products as Product[], context.master.aliases)
  const baseYm = getMonthYearFallback(sheet, mapping)
  const aggregates = new Map<
    string,
    {
      errors: string[]
      firstRowIndex: number
      raw: string[]
      record: ProductionImportRow
      sourceCount: number
      warnings: string[]
    }
  >()

  sheet.matrix.slice((sheet.headerRowIndex ?? -1) + 1).forEach((raw, index) => {
    const rowIndex = (sheet.headerRowIndex ?? -1) + index + 2
    if (!rowHasAnyData(raw) || shouldSkipRow(raw)) return

    const workMonthText = readDetailFieldText(raw, headerRow, mapping, 'work_month', ['단조작업일', '작업일', '일자', '날짜'])
    const lineText = readDetailFieldText(raw, headerRow, mapping, 'line_code', ['프레스별', '작업장', '라인'])
    const productText = readDetailFieldText(raw, headerRow, mapping, 'product_name', ['소재품명', '품명', '제품형상'])
    const shiftText = readDetailFieldText(raw, headerRow, mapping, 'shift', ['작업조', '주간조', '야간조', '주간', '야간'])
    const actualWeightText = readDetailFieldText(raw, headerRow, mapping, 'actual_ton', ['생산중량(양품)', '생산중량', '중량'])
    const workCountText = readDetailFieldText(raw, headerRow, mapping, 'work_count', ['실적', '양품'])
    const orderNoText = readDetailFieldText(raw, headerRow, mapping, 'order_no', ['수주번호'])

    const errors: string[] = []
    const warnings: string[] = []

    const workMonth = normalizeMonthDate(workMonthText, baseYm ? Number(baseYm.slice(0, 4)) : detectYearFromSheetName(sheet.sheetName))
    const line = lineLookup.get(normalizeToken(lineText)) ?? null
    const normalizedProductText = isZeroLikeText(productText) ? '' : productText
    const product = normalizedProductText ? productLookup.get(normalizeToken(normalizedProductText)) ?? null : null
    const shift = normalizeShiftText(shiftText)
    const actualWeightKg = parseLooseNumber(actualWeightText)
    const actualTon = actualWeightKg != null ? kgToTon(actualWeightKg) : null
    const workCount = parseIntNumber(workCountText)
    const note = buildProductionDetailNote(raw, headerRow)

    if (!workMonth) errors.push('작업월을 찾지 못했습니다.')
    if (!lineText && !line) errors.push('라인을 찾지 못했습니다.')
    if (lineText && !line) errors.push(`라인 "${lineText}"을 찾지 못했습니다.`)
    if (actualWeightKg == null) errors.push('생산중량을 찾지 못했습니다.')
    if (actualWeightKg != null && actualWeightKg <= 0) errors.push('생산중량은 0보다 커야 합니다.')
    if (workCount == null) errors.push('실적 수량을 찾지 못했습니다.')
    if (workCount != null && workCount <= 0) errors.push('실적 수량은 0보다 커야 합니다.')

    const productName = (product?.name ?? normalizedProductText) || null
    const normalizedOrderNo = isZeroLikeText(orderNoText) ? '' : orderNoText
    const record: ProductionImportRow = {
      work_month: workMonth ?? (baseYm ? `${baseYm}-01` : ''),
      line_code: line?.code ?? normalizeLineCode(lineText) ?? lineText,
      product_name: productName,
      shift,
      plan_ton: 0,
      actual_ton: actualTon ?? 0,
      hwangji_ton: 0,
      cogging_ton: 0,
      work_hours: 0,
      work_count: workCount ?? 0,
      order_no: normalizedOrderNo || null,
      note,
    }

    const validation = validateRecord(importProductionRowSchema, record)
    const normalizedRecord = validation.record as ProductionImportRow
    errors.push(...validation.errors)

    const key = [
      normalizedRecord.work_month,
      normalizedRecord.line_code,
      normalizedRecord.product_name ?? '',
      normalizedRecord.shift ?? '',
    ].join('|')
    const existing = aggregates.get(key)
    if (existing) {
      existing.record.actual_ton += normalizedRecord.actual_ton
      existing.record.work_count += normalizedRecord.work_count
      if (!existing.record.order_no && normalizedRecord.order_no) existing.record.order_no = normalizedRecord.order_no
      if (normalizedRecord.note) {
        existing.record.note = existing.record.note
          ? `${existing.record.note} | ${normalizedRecord.note}`
          : normalizedRecord.note
      }
      existing.errors.push(...errors)
      existing.warnings.push(...warnings)
      existing.sourceCount += 1
    } else {
      aggregates.set(key, {
        errors,
        firstRowIndex: rowIndex,
        raw,
        record: normalizedRecord,
        sourceCount: 1,
        warnings,
      })
    }
  })

  const aggregatedRows = Array.from(aggregates.values()).map((entry) => {
    const warnings = [...entry.warnings]
    if (entry.sourceCount > 1) warnings.push(`원본 ${entry.sourceCount}건을 집계했습니다.`)
    return makeRowResult(entry.firstRowIndex, entry.raw, entry.record, entry.errors, warnings)
  })

  return finalizePreview(sheet, aggregatedRows, context.layout, 'production')
}

function looksLikeProductionSummarySheet(sheet: ImportSheetAnalysis) {
  const topTokens = sheet.matrix.slice(0, 6).flatMap((row) => row.map((cell) => normalizeToken(cell)).filter(Boolean))
  return (
    topTokens.some((token) => token.includes('제품(일일')) &&
    topTokens.some((token) => token.includes('재질별제품생산량')) &&
    topTokens.some((token) => token.includes('생산량'))
  )
}

function mapSummaryLineCode(title: string) {
  const token = normalizeToken(title)
  if (!token) return null
  if (token.includes('total') || token.includes('ko411')) return null
  if (token.includes('15000') || token.includes('145ton') || token.includes('p15')) return 'P15'
  if (token.includes('5000') || token.includes('70ton') || token.includes('p5')) return 'P5'
  if (token.includes('11000') || token.includes('rm') || token.includes('r/m')) return 'R/M'
  return null
}

function extractWorkCountFromLabel(rowLabel: string) {
  const match = String(rowLabel ?? '').match(/\((\d+)\)/)
  return match ? Number(match[1]) : null
}

function normalizeProductionSummaryMonth(value: unknown, fallbackYear: number | null) {
  const text = String(value ?? '').trim()
  if (!text) return null

  const directMonth = normalizeMonthDate(text, fallbackYear)
  if (directMonth) return directMonth

  const dateText = normalizeDateText(text, null)
  if (dateText) return `${dateText.slice(0, 7)}-01`

  return null
}

function detectProductionSummaryYear(sheet: ImportSheetAnalysis) {
  const topCells = sheet.matrix.slice(0, 3).flat()
  for (const cell of topCells) {
    const match = String(cell ?? '').match(/(20\d{2})/)
    if (match) return Number(match[1])
  }

  return detectYearFromSheetName(sheet.sheetName)
}

function parseProductionSummary(
  sheet: ImportSheetAnalysis,
  mapping: ImportMappingState,
  context: ImportPreviewContext
): ImportPreview<ProductionImportRow> {
  const rowLabelIndex = sourceKeyToIndex(mapping.options.rowLabelSourceKey as string | null | undefined) ?? 0
  const titleRow = sheet.matrix[3] ?? []
  const productRow = sheet.matrix[4] ?? []
  const subHeaderRow = sheet.matrix[5] ?? []
  const yearFallback = detectProductionSummaryYear(sheet)

  const blockStarts = subHeaderRow
    .map((cell, index) => ({ cell: String(cell ?? '').trim(), index }))
    .filter(({ cell }) => normalizeToken(cell) === normalizeToken('생산량'))
    .map(({ index }) => index)

  if (blockStarts.length === 0) {
    return parseProductionWide(sheet, mapping, context)
  }

  const blocks = blockStarts
    .map((startIndex, blockIndex) => {
      const nextStart = blockStarts[blockIndex + 1] ?? sheet.columnCount
      const endIndex = Math.max(startIndex, nextStart - 1)
      const title = String(titleRow[startIndex] ?? '').trim()
      const productLabel = String(productRow[startIndex] ?? '').trim()
      return {
        endIndex,
        lineCode: mapSummaryLineCode(title),
        productLabel: productLabel || null,
        startIndex,
        title,
      }
    })
    .filter((block) => block.lineCode)

  const rows: ImportPreviewRow<ProductionImportRow>[] = []

  sheet.matrix.slice((sheet.headerRowIndex ?? 5) + 1).forEach((raw, index) => {
    const rowIndex = (sheet.headerRowIndex ?? 5) + index + 2
    if (!rowHasAnyData(raw) || shouldSkipRow(raw)) return

    const rowLabel = getCell(raw, rowLabelIndex)
    const workMonth = normalizeProductionSummaryMonth(rowLabel, yearFallback)
    const workCount = extractWorkCountFromLabel(rowLabel)
    if (!workMonth) return

    blocks.forEach((block) => {
      const actualKg = parseLooseNumber(getCell(raw, block.startIndex))
      const planKg = parseLooseNumber(getCell(raw, block.startIndex + 1))
      const hwangjiKg = parseLooseNumber(getCell(raw, block.startIndex + 3))
      const coggingKg = parseLooseNumber(getCell(raw, block.startIndex + 4))

      if (actualKg == null && planKg == null && hwangjiKg == null && coggingKg == null) return

      const errors: string[] = []
      const warnings: string[] = []

      if (!block.lineCode) errors.push('쇠인이름을 찾지 못했습니다.')
      if (actualKg == null && planKg == null) errors.push('생산량과 계획량을 찾지 못했습니다.')

      const record: ProductionImportRow = {
        work_month: workMonth,
        line_code: block.lineCode ?? 'UNKNOWN',
        product_name: null,
        shift: null,
        plan_ton: kgToTon(planKg ?? 0),
        actual_ton: kgToTon(actualKg ?? 0),
        hwangji_ton: kgToTon(hwangjiKg ?? 0),
        cogging_ton: kgToTon(coggingKg ?? 0),
        work_hours: 0,
        work_count: workCount ?? 0,
        order_no: null,
        note: block.title || block.productLabel || null,
      }

      const validation = validateRecord(importProductionRowSchema, record)
      const normalizedRecord = validation.record as ProductionImportRow
      errors.push(...validation.errors)

      const existing = rows.find((row) => {
        const value = row.value
        return (
          value != null &&
          value.work_month === normalizedRecord.work_month &&
          value.line_code === normalizedRecord.line_code &&
          (value.product_name ?? '') === (normalizedRecord.product_name ?? '') &&
          (value.shift ?? '') === (normalizedRecord.shift ?? '')
        )
      })

      if (existing && existing.value) {
        existing.value.plan_ton += normalizedRecord.plan_ton
        existing.value.actual_ton += normalizedRecord.actual_ton
        existing.value.hwangji_ton += normalizedRecord.hwangji_ton
        existing.value.cogging_ton += normalizedRecord.cogging_ton
        existing.value.work_count += normalizedRecord.work_count
        if (!existing.value.note && normalizedRecord.note) existing.value.note = normalizedRecord.note
        if (errors.length > 0) existing.errors.push(...errors)
        if (warnings.length > 0) existing.warnings.push(...warnings)
        return
      }

      rows.push(makeRowResult(rowIndex, raw, normalizedRecord, errors, warnings))
    })
  })

  return finalizePreview(sheet, rows, 'production-wide', 'production')
}

function parseProductionWide(
  sheet: ImportSheetAnalysis,
  mapping: ImportMappingState,
  context: ImportPreviewContext
): ImportPreview<ProductionImportRow> {
  const headerRow = sheet.headerRowIndex != null ? sheet.matrix[sheet.headerRowIndex] ?? [] : []
  const autoFieldIndexMap = buildAutoFieldIndexMap(headerRow, context.master.aliases)
  const lineLookup = buildLineLookup(context.master.lines as Line[], context.master.aliases)
  const productLookup = buildProductLookup(context.master.products as Product[], context.master.aliases)
  const yearFallback = detectYearFromSheetName(sheet.sheetName)
  const monthColumns = getMonthColumns(headerRow, yearFallback)
  const rowLabelIndex = sourceKeyToIndex(mapping.options.rowLabelSourceKey as string | null | undefined) ?? 0
  const productColumnIndex = sourceKeyToIndex(mapping.fieldMap.product_name ?? null)
  const shiftColumnIndex = sourceKeyToIndex(mapping.fieldMap.shift ?? null)
  const baseYm = getMonthYearFallback(sheet, mapping)
  const aggregate = new Map<string, { raw: string[]; record: ProductionImportRow; rowIndex: number; errors: string[]; warnings: string[] }>()

  sheet.matrix.slice((sheet.headerRowIndex ?? -1) + 1).forEach((raw, index) => {
    const rowIndex = (sheet.headerRowIndex ?? -1) + index + 2
    if (!rowHasAnyData(raw) || shouldSkipRow(raw)) return

    const rowLabel = getCell(raw, rowLabelIndex)
    const rowLabelToken = normalizeToken(rowLabel)
    const lineText =
      resolveFieldText(raw, 'line_code', mapping, autoFieldIndexMap) ||
      normalizeLineCode(rowLabel) ||
      rowLabel
    const productText =
      getCell(raw, productColumnIndex) ||
      resolveFieldText(raw, 'product_name', mapping, autoFieldIndexMap)
    const shiftText =
      getCell(raw, shiftColumnIndex) ||
      resolveFieldText(raw, 'shift', mapping, autoFieldIndexMap)
    const shift = normalizeShiftText(shiftText) || null
    const line = lineLookup.get(normalizeToken(lineText)) ?? null
    const product = productText ? productLookup.get(normalizeToken(productText)) ?? null : null
    const measureIsPlan =
      rowLabelToken.includes('목표') ||
      rowLabelToken.includes('plan') ||
      rowLabelToken.includes('계획')
    const measureIsActual =
      rowLabelToken.includes('실적') ||
      rowLabelToken.includes('actual') ||
      rowLabelToken.includes('달성')

    monthColumns.forEach((monthColumn) => {
      const amount = parseLooseNumber(getCell(raw, monthColumn.index))
      if (amount == null || amount <= 0) return

      const ym = monthColumn.ym || baseYm || ''
      const key = [line?.code ?? normalizeLineCode(lineText) ?? lineText, (product?.name ?? productText) || '', ym, shift ?? ''].join('|')
      const existing = aggregate.get(key)
      const errors: string[] = []
      const warnings: string[] = []

      if (!ym) errors.push('작업월을 찾지 못했습니다.')
      if (!line && !lineText) errors.push('라인을 찾지 못했습니다.')
      if (lineText && !line) errors.push(`라인 "${lineText}"을 찾지 못했습니다.`)
      if (productText && !product) errors.push(`제품 "${productText}"을 찾지 못했습니다.`)

      const record: ProductionImportRow = existing?.record ?? {
        work_month: ym,
        line_code: line?.code ?? normalizeLineCode(lineText) ?? lineText,
        product_name: (product?.name ?? productText) || null,
        shift,
        plan_ton: 0,
        actual_ton: 0,
        hwangji_ton: 0,
        cogging_ton: 0,
        work_hours: 0,
        work_count: 0,
        order_no: resolveFieldText(raw, 'order_no', mapping, autoFieldIndexMap) || null,
        note: resolveFieldText(raw, 'note', mapping, autoFieldIndexMap) || null,
      }

      if (measureIsPlan || (!measureIsPlan && !measureIsActual && rowLabelToken.includes('목표'))) {
        record.plan_ton += amount
      } else if (measureIsActual || (!measureIsPlan && !measureIsActual)) {
        record.actual_ton += amount
      }

      if (existing) {
        existing.record = record
        existing.errors.push(...errors)
        existing.warnings.push(...warnings)
      } else {
        aggregate.set(key, { raw, record, rowIndex, errors, warnings })
      }
    })
  })

  const aggregatedRows = Array.from(aggregate.values()).map((entry) => {
    const warnings = [...entry.warnings]
    if (entry.record.plan_ton > 0 && entry.record.actual_ton > 0) {
      const rate = calcAchievementRate(entry.record.actual_ton, entry.record.plan_ton)
      if (rate != null && (rate < 40 || rate > 160)) warnings.push(`달성률 ${rate.toFixed(1)}%는 일반 범위를 벗어납니다.`)
    }

    if (entry.record.actual_ton > 0 && entry.record.work_hours > 0) {
      const tph = calcTonPerHour(entry.record.actual_ton, entry.record.work_hours)
      if (tph != null && (tph < 5 || tph > 40)) warnings.push(`TPH ${tph.toFixed(2)}는 일반 범위를 벗어납니다.`)
    }

    return makeRowResult(entry.rowIndex, entry.raw, entry.record, entry.errors, warnings)
  })

  return finalizePreview(sheet, aggregatedRows, context.layout, 'production')
}

function parseGasCompanyMonthlyLong(
  sheet: ImportSheetAnalysis,
  mapping: ImportMappingState,
  context: ImportPreviewContext
): ImportPreview<GasCompanyMonthlyImportRow> {
  const headerRow = sheet.headerRowIndex != null ? sheet.matrix[sheet.headerRowIndex] ?? [] : []
  const autoFieldIndexMap = buildAutoFieldIndexMap(headerRow, context.master.aliases)
  const rows: ImportPreviewRow<GasCompanyMonthlyImportRow>[] = []
  const baseYm = getMonthYearFallback(sheet, mapping)

  sheet.matrix.slice((sheet.headerRowIndex ?? -1) + 1).forEach((raw, index) => {
    const rowIndex = (sheet.headerRowIndex ?? -1) + index + 2
    if (!rowHasAnyData(raw) || shouldSkipRow(raw)) return

    const ymText = resolveFieldText(raw, 'ym', mapping, autoFieldIndexMap)
    const chargeWeightText = resolveFieldText(raw, 'charge_weight_kg', mapping, autoFieldIndexMap)
    const gasUsageText = resolveFieldText(raw, 'gas_usage', mapping, autoFieldIndexMap)
    const note = resolveFieldText(raw, 'note', mapping, autoFieldIndexMap)

    const errors: string[] = []
    const warnings: string[] = []

    const ym = normalizeMonthDate(ymText, baseYm ? Number(baseYm.slice(0, 4)) : detectYearFromSheetName(sheet.sheetName))
    const chargeWeightKg = parseLooseNumber(chargeWeightText) ?? 0
    const gasUsage = parseLooseNumber(gasUsageText)

    if (!ym) errors.push('월 정보를 찾지 못했습니다.')
    if (gasUsage == null) errors.push('가스사용량을 입력해 주세요.')
    if (chargeWeightKg <= 0) warnings.push('장입량이 0이거나 비어 있습니다.')

    const record: GasCompanyMonthlyImportRow = {
      ym: ym ?? (baseYm ? `${baseYm}-01` : ''),
      charge_weight_kg: chargeWeightKg,
      gas_usage: gasUsage ?? 0,
      note: note || null,
    }

    const validation = validateRecord(importGasCompanyMonthlyRowSchema, record)
    const normalizedRecord = validation.record
    errors.push(...validation.errors)

    if (normalizedRecord.gas_usage <= 0) errors.push('0 또는 음수 값은 저장하지 않습니다.')

    const gasUnit = normalizedRecord.charge_weight_kg > 0 ? calcGasUnit(normalizedRecord.gas_usage, normalizedRecord.charge_weight_kg) : null
    if (gasUnit != null && (gasUnit < 100 || gasUnit > 250)) warnings.push(`원단위 ${gasUnit.toFixed(1)}는 일반 범위를 벗어납니다.`)

    rows.push(makeRowResult(rowIndex, raw, normalizedRecord, errors, warnings))
  })

  return finalizePreview(sheet, rows, context.layout, 'gas-company-monthly')
}

function parseGasCompanyMonthlyWide(
  sheet: ImportSheetAnalysis,
  mapping: ImportMappingState,
  context: ImportPreviewContext
): ImportPreview<GasCompanyMonthlyImportRow> {
  const headerRow = sheet.headerRowIndex != null ? sheet.matrix[sheet.headerRowIndex] ?? [] : []
  const autoFieldIndexMap = buildAutoFieldIndexMap(headerRow, context.master.aliases)
  const rows: ImportPreviewRow<GasCompanyMonthlyImportRow>[] = []
  const yearFallback = detectYearFromSheetName(sheet.sheetName)
  const monthColumns = getMonthColumns(headerRow, yearFallback)
  const rowLabelIndex = sourceKeyToIndex(mapping.options.rowLabelSourceKey as string | null | undefined) ?? 0
  const chargeColumnIndex = sourceKeyToIndex(mapping.fieldMap.charge_weight_kg ?? null)
  const gasColumnIndex = sourceKeyToIndex(mapping.fieldMap.gas_usage ?? null)
  const baseYm = getMonthYearFallback(sheet, mapping)

  if (monthColumns.length === 0) {
    return parseGasCompanyMonthlyLong(sheet, mapping, context)
  }

  sheet.matrix.slice((sheet.headerRowIndex ?? -1) + 1).forEach((raw, index) => {
    const rowIndex = (sheet.headerRowIndex ?? -1) + index + 2
    if (!rowHasAnyData(raw) || shouldSkipRow(raw)) return

    const rowLabel = getCell(raw, rowLabelIndex)
    const ym = normalizeMonthDate(rowLabel, yearFallback) || baseYm || ''
    const chargeWeightKg = parseLooseNumber(getCell(raw, chargeColumnIndex)) ?? 0
    const gasUsage = parseLooseNumber(getCell(raw, gasColumnIndex))

    const errors: string[] = []
    const warnings: string[] = []

    if (!ym) errors.push('월 정보를 찾지 못했습니다.')
    if (gasUsage == null) errors.push('가스사용량을 입력해 주세요.')

    const record: GasCompanyMonthlyImportRow = {
      ym,
      charge_weight_kg: chargeWeightKg,
      gas_usage: gasUsage ?? 0,
      note: resolveFieldText(raw, 'note', mapping, autoFieldIndexMap) || null,
    }

    const validation = validateRecord(importGasCompanyMonthlyRowSchema, record)
    const normalizedRecord = validation.record
    errors.push(...validation.errors)

    if (normalizedRecord.gas_usage <= 0) errors.push('0 또는 음수 값은 저장하지 않습니다.')

    const gasUnit = normalizedRecord.charge_weight_kg > 0 ? calcGasUnit(normalizedRecord.gas_usage, normalizedRecord.charge_weight_kg) : null
    if (gasUnit != null && (gasUnit < 100 || gasUnit > 250)) warnings.push(`원단위 ${gasUnit.toFixed(1)}는 일반 범위를 벗어납니다.`)

    rows.push(makeRowResult(rowIndex, raw, normalizedRecord, errors, warnings))
  })

  return finalizePreview(sheet, rows, context.layout, 'gas-company-monthly')
}

export function buildImportPreview(
  sheet: ImportSheetAnalysis,
  mapping: ImportMappingState,
  context: ImportPreviewContext
) {
  if (mapping.datasetKey === 'gas-daily') {
    return mapping.layout === 'gas-daily-wide'
      ? parseGasDailyWide(sheet, mapping, context)
      : parseGasDailyLong(sheet, mapping, context)
  }

  if (mapping.datasetKey === 'gas-monthly') {
    return mapping.layout === 'gas-monthly-wide'
      ? parseGasMonthlyWide(sheet, mapping, context)
      : parseGasMonthlyLong(sheet, mapping, context)
  }

  if (mapping.datasetKey === 'production') {
    if (looksLikeProductionSummarySheet(sheet)) return parseProductionSummary(sheet, mapping, context)
    if (mapping.layout === 'production-detail') return parseProductionDetail(sheet, mapping, context)
    return mapping.layout === 'production-wide'
      ? parseProductionWide(sheet, mapping, context)
      : parseProductionLong(sheet, mapping, context)
  }

  if (mapping.datasetKey === 'gas-company-monthly') {
    return mapping.layout === 'company-wide'
      ? parseGasCompanyMonthlyWide(sheet, mapping, context)
      : parseGasCompanyMonthlyLong(sheet, mapping, context)
  }

  return parseGasMonthlyLong(sheet, mapping, context)
}

export function buildDefaultImportMappingForSheet(
  sheet: ImportSheetAnalysis,
  datasetKey?: ImportDatasetKey
): ImportMappingState {
  const resolved = datasetKey ?? sheet.datasetGuess ?? 'gas-monthly'
  const spec = IMPORT_DATASETS[resolved]

  return {
    datasetKey: resolved,
    layout: sheet.layoutGuess === 'auto' ? spec.defaultLayout : sheet.layoutGuess,
    sheetName: sheet.sheetName,
    headerRowIndex: sheet.headerRowIndex,
    fieldMap: spec.fields.reduce<Partial<Record<ImportFieldKey, string | null>>>((acc, field) => {
      acc[field.key] = null
      return acc
    }, {}),
    staticValues: {},
    options: {},
  }
}

export function buildImportContext(master: ImportPreviewContext['master']): ImportPreviewContext {
  return {
    datasetKey: 'gas-monthly',
    layout: 'long',
    signature: {
      datasetKey: 'gas-monthly',
      layout: 'long',
      sheetName: '',
      sheetNameTokens: [],
      headerTokens: [],
    },
    columns: [],
    bindings: {} as ImportPreviewContext['bindings'],
    master,
  }
}
