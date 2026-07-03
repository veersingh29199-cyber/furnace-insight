import * as XLSX from 'xlsx'
import type { LineOutputPeriodType, LineOutputRow } from '@/types'
import { normalizeToken, parseIntNumber, parseLooseNumber } from '@/lib/input/common'

export interface LineOutputParseOptions {
  excludeTotal?: boolean
}

type CanonicalBand = '15000TON' | '5000TON' | '8000TON' | '11000RM' | 'TOTAL'

interface BandRange {
  band: CanonicalBand
  start: number
  end: number
}

interface BandMetricColumns {
  output_kg: number | null
  plan_kg: number | null
  achievement: number | null
  hwangji_kg: number | null
  cogging_kg: number | null
  subtotal_kg: number | null
  remake_self_remake: number | null
  remake_self_fix: number | null
  remake_qc_remake: number | null
  remake_qc_fix: number | null
  mat_cs_kg: number | null
  mat_as_kg: number | null
  mat_sus_kg: number | null
  mat_total_kg: number | null
}

const DAILY_SHEET_RE = /^(\d{2})(\d{2})월$/
const MONTHLY_SHEET_RE = /^(\d{4})년 전체$/
const BAND_ORDER: CanonicalBand[] = ['15000TON', '5000TON', '8000TON', '11000RM', 'TOTAL']

function compactToken(value: unknown) {
  return normalizeToken(value).replace(/[,\.\u00a0]/g, '')
}

function canonicalBand(value: unknown): CanonicalBand | null {
  const token = compactToken(value)
  if (!token) return null

  if (token.includes('total') || token.includes('합계') || token.includes('합산') || token.includes('전체')) {
    return 'TOTAL'
  }

  if (token.includes('15000') || token.includes('15,000') || token.includes('15ton')) {
    return '15000TON'
  }

  if (token.includes('5000') || token.includes('5,000') || token.includes('5ton')) {
    return '5000TON'
  }

  if (token.includes('8000') || token.includes('8,000') || token.includes('8ton')) {
    return '8000TON'
  }

  if (token.includes('11000') || token.includes('9500') || token.includes('rm') || token.includes('r/m')) {
    return '11000RM'
  }

  return null
}

function isTerminalColumn(value: unknown) {
  const token = compactToken(value)
  return token.includes('양품') || token.includes('ko411') || token.includes('product')
}

function isOutputLabel(token: string) {
  return token.includes('생산량') || token.includes('output')
}

function isPlanLabel(token: string) {
  return token.includes('계획량') || token === '계획' || token.includes('plan')
}

function isAchievementLabel(token: string) {
  return token.includes('달성률') || token.includes('achievement')
}

function isHwangjiLabel(token: string) {
  return token.includes('황지')
}

function isCoggingLabel(token: string) {
  return token.includes('cogging') || token.includes('코깅')
}

function isSubtotalLabel(token: string) {
  return token.includes('합계') || token.includes('subtotal')
}

function isMatCsLabel(token: string) {
  return token.includes('c/s') || token === 'cs'
}

function isMatAsLabel(token: string) {
  return token.includes('a/s') || token === 'as'
}

function isMatSusLabel(token: string) {
  return token.includes('sus')
}

function isRemakeLabel(token: string) {
  return token.includes('재제작') || token.includes('remake')
}

function isFixLabel(token: string) {
  return token.includes('수정') || token.includes('fix')
}

function getSheetKind(sheetName: string): { ptype: LineOutputPeriodType; year: number; month?: number } | null {
  const dailyMatch = sheetName.match(DAILY_SHEET_RE)
  if (dailyMatch) {
    const year = Number(`20${dailyMatch[1]}`)
    const month = Number(dailyMatch[2])
    if (!Number.isFinite(year) || !Number.isFinite(month)) return null
    return { ptype: 'daily', year, month }
  }

  const monthlyMatch = sheetName.match(MONTHLY_SHEET_RE)
  if (monthlyMatch) {
    const year = Number(monthlyMatch[1])
    if (!Number.isFinite(year)) return null
    return { ptype: 'monthly', year }
  }

  return null
}

function parsePeriod(
  rawValue: unknown,
  kind: { ptype: LineOutputPeriodType; year: number; month?: number }
) {
  const value = String(rawValue ?? '').trim()
  if (!value) return null

  const isoMatch = value.match(/^(20\d{2})[./-](\d{1,2})[./-](\d{1,2})$/)
  if (isoMatch) {
    const year = Number(isoMatch[1])
    const month = Number(isoMatch[2])
    const day = Number(isoMatch[3])
    if (kind.ptype === 'daily') {
      return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    }
    return `${year}-${String(month).padStart(2, '0')}`
  }

  const parsed = parseIntNumber(value)
  if (parsed == null) return null

  if (kind.ptype === 'daily') {
    if (kind.month == null) return null
    return `${kind.year}-${String(kind.month).padStart(2, '0')}-${String(parsed).padStart(2, '0')}`
  }

  return `${kind.year}-${String(parsed).padStart(2, '0')}`
}

function buildBandRanges(matrix: string[][], excludeTotal = false) {
  const headerRow = matrix[4] ?? []
  const row5 = matrix[5] ?? []
  const row6 = matrix[6] ?? []
  const maxColumns = Math.max(headerRow.length, row5.length, row6.length)

  const starts = new Map<CanonicalBand, number>()
  headerRow.forEach((cell, index) => {
    const band = canonicalBand(cell)
    if (!band || starts.has(band)) return
    if (band === 'TOTAL' && excludeTotal) return
    starts.set(band, index)
  })

  const bandRanges = BAND_ORDER.filter((band) => starts.has(band)).map((band) => ({
    band,
    start: starts.get(band) ?? 0,
    end: maxColumns,
  }))

  bandRanges.forEach((range, index) => {
    const nextBandStart = bandRanges[index + 1]?.start ?? maxColumns
    const terminalStart = (() => {
      for (let col = range.start; col < maxColumns; col += 1) {
        if (isTerminalColumn(row6[col]) || isTerminalColumn(row5[col]) || isTerminalColumn(headerRow[col])) {
          return col
        }
      }
      return maxColumns
    })()

    range.end = Math.min(nextBandStart, terminalStart, maxColumns)
  })

  return { bandRanges, row5, row6 }
}

function buildMetricColumns(row5: string[], row6: string[], range: BandRange): BandMetricColumns {
  const columns: BandMetricColumns = {
    output_kg: null,
    plan_kg: null,
    achievement: null,
    hwangji_kg: null,
    cogging_kg: null,
    subtotal_kg: null,
    remake_self_remake: null,
    remake_self_fix: null,
    remake_qc_remake: null,
    remake_qc_fix: null,
    mat_cs_kg: null,
    mat_as_kg: null,
    mat_sus_kg: null,
    mat_total_kg: null,
  }

  let remakeSeen = 0
  let fixSeen = 0

  for (let col = range.start; col < range.end; col += 1) {
    const header5 = compactToken(row5[col])
    const header6 = compactToken(row6[col])
    const headerToken = header6 || header5
    const combinedToken = compactToken(`${header5} ${header6}`)

    if (!columns.output_kg && isOutputLabel(headerToken)) columns.output_kg = col
    else if (!columns.plan_kg && isPlanLabel(headerToken)) columns.plan_kg = col
    else if (!columns.achievement && isAchievementLabel(headerToken)) columns.achievement = col
    else if (!columns.hwangji_kg && isHwangjiLabel(headerToken)) columns.hwangji_kg = col
    else if (!columns.cogging_kg && isCoggingLabel(headerToken)) columns.cogging_kg = col
    else if (!columns.subtotal_kg && isSubtotalLabel(headerToken) && !header6) columns.subtotal_kg = col
    else if (!columns.mat_cs_kg && isMatCsLabel(headerToken)) columns.mat_cs_kg = col
    else if (!columns.mat_as_kg && isMatAsLabel(headerToken)) columns.mat_as_kg = col
    else if (!columns.mat_sus_kg && isMatSusLabel(headerToken)) columns.mat_sus_kg = col
    else if (!columns.mat_total_kg && isSubtotalLabel(header6)) columns.mat_total_kg = col
    else if (isRemakeLabel(combinedToken) || isRemakeLabel(headerToken)) {
      if (remakeSeen === 0) columns.remake_self_remake = col
      else if (remakeSeen === 1) columns.remake_qc_remake = col
      remakeSeen += 1
    } else if (isFixLabel(combinedToken) || isFixLabel(headerToken)) {
      if (fixSeen === 0) columns.remake_self_fix = col
      else if (fixSeen === 1) columns.remake_qc_fix = col
      fixSeen += 1
    }
  }

  return columns
}

function pickNumber(row: string[], index: number | null) {
  if (index == null) return null
  const value = row[index]
  return parseLooseNumber(value)
}

function hasMeaningfulValue(values: Array<number | null>) {
  return values.some((value) => value != null && value !== 0)
}

function buildRowsFromSheet(
  matrix: string[][],
  kind: { ptype: LineOutputPeriodType; year: number; month?: number },
  opts: LineOutputParseOptions
) {
  const { bandRanges, row5, row6 } = buildBandRanges(matrix, Boolean(opts.excludeTotal))
  if (bandRanges.length === 0) return [] as LineOutputRow[]

  const metricColumnsByBand = new Map<CanonicalBand, BandMetricColumns>()
  bandRanges.forEach((range) => {
    metricColumnsByBand.set(range.band, buildMetricColumns(row5, row6, range))
  })

  const rows: LineOutputRow[] = []
  matrix.slice(7).forEach((raw) => {
    const period = parsePeriod(raw[0], kind)
    if (!period) return

    bandRanges.forEach((range) => {
      const columns = metricColumnsByBand.get(range.band)
      if (!columns) return

      const row: LineOutputRow = {
        period,
        ptype: kind.ptype,
        line_code: range.band,
        output_kg: pickNumber(raw, columns.output_kg),
        plan_kg: pickNumber(raw, columns.plan_kg),
        achievement: pickNumber(raw, columns.achievement),
        hwangji_kg: pickNumber(raw, columns.hwangji_kg),
        cogging_kg: pickNumber(raw, columns.cogging_kg),
        subtotal_kg: pickNumber(raw, columns.subtotal_kg),
        remake_self_remake: pickNumber(raw, columns.remake_self_remake),
        remake_self_fix: pickNumber(raw, columns.remake_self_fix),
        remake_qc_remake: pickNumber(raw, columns.remake_qc_remake),
        remake_qc_fix: pickNumber(raw, columns.remake_qc_fix),
        mat_cs_kg: pickNumber(raw, columns.mat_cs_kg),
        mat_as_kg: pickNumber(raw, columns.mat_as_kg),
        mat_sus_kg: pickNumber(raw, columns.mat_sus_kg),
        mat_total_kg: pickNumber(raw, columns.mat_total_kg),
      }

      if (!hasMeaningfulValue([row.output_kg, row.subtotal_kg, row.mat_total_kg])) return
      rows.push(row)
    })
  })

  return rows
}

export function inspectLineOutput(buf: ArrayBuffer, opts: LineOutputParseOptions = {}) {
  const workbook = XLSX.read(buf, { type: 'array' })
  const rows: LineOutputRow[] = []
  const sheetNames: string[] = []

  workbook.SheetNames.forEach((sheetName) => {
    const kind = getSheetKind(sheetName)
    if (!kind) return

    const sheet = workbook.Sheets[sheetName]
    if (!sheet) return

    const matrix = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' }) as string[][]
    const parsedRows = buildRowsFromSheet(matrix, kind, opts)
    if (parsedRows.length === 0) return

    sheetNames.push(sheetName)
    rows.push(...parsedRows)
  })

  rows.sort((a, b) => {
    const pTypeOrder = a.ptype === b.ptype ? 0 : a.ptype === 'daily' ? -1 : 1
    if (pTypeOrder !== 0) return pTypeOrder
    if (a.period !== b.period) return a.period.localeCompare(b.period)
    return BAND_ORDER.indexOf(a.line_code as CanonicalBand) - BAND_ORDER.indexOf(b.line_code as CanonicalBand)
  })

  return {
    rows,
    sheetNames,
    sheetCount: sheetNames.length,
    dailyCount: rows.filter((row) => row.ptype === 'daily').length,
    monthlyCount: rows.filter((row) => row.ptype === 'monthly').length,
  }
}

export function parseLineOutput(buf: ArrayBuffer, opts: LineOutputParseOptions = {}) {
  return inspectLineOutput(buf, opts).rows
}
