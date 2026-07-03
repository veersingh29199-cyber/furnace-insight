import { calcAchievementRate, kgToTon } from '@/lib/utils'
import { detectYearFromSheetName, normalizeDateText, normalizeMonthDate } from '@/lib/import/common'
import { normalizeToken, parseLooseNumber } from '@/lib/input/common'
import { isTotalLikeHeader } from '@/lib/input/common'
import type { ImportPreview, ImportPreviewContext, ImportPreviewRow, ImportSheetAnalysis, LineOutputDailyImportRow, LineOutputMonthlyImportRow } from '@/types/import'

type LineOutputKind = 'daily' | 'monthly'

interface LineOutputOptions {
  excludeTotal?: boolean
}

function compactText(value: unknown) {
  return String(value ?? '').replace(/\s+/g, ' ').trim()
}

function rowHasValues(row: string[]) {
  return row.some((cell) => String(cell ?? '').trim() !== '')
}

function makeRowResult<TRecord>(
  rowIndex: number,
  raw: string[],
  value: TRecord | null,
  errors: string[],
  warnings: string[]
): ImportPreviewRow<TRecord> {
  return {
    rowIndex,
    raw,
    value,
    errors,
    warnings,
  }
}

function ratioToPercent(value: number | null) {
  if (value == null) return null
  return value <= 1.5 ? value * 100 : value
}

function normalizeLineOutputCode(title: string) {
  const text = compactText(title)
  const token = normalizeToken(text)
  if (!token) return null

  if (token.includes('ko411')) return 'KO411'
  if (token.includes('total')) return 'TOTAL'
  if (token.includes('r/m') || token.includes('rm') || token.includes('ring')) return 'R/M'
  if (token.includes('15000') || token.includes('145ton')) return 'P15'
  if (token.includes('5000') || token.includes('70ton')) return 'P5'
  if (token.includes('8000') || token.includes('95ton')) return 'P8'

  const numeric = text.match(/(\d{4,6})/)
  if (numeric) return numeric[1]

  return text.replace(/\s+/g, '').toUpperCase() || null
}

function extractWorkCount(label: string) {
  const match = compactText(label).match(/\((\d+)\)/)
  return match ? Number(match[1]) : 0
}

function detectLineOutputKind(sheet: ImportSheetAnalysis): LineOutputKind {
  if (sheet.sheetName.includes('전체')) return 'monthly'
  return 'daily'
}

function getBandStarts(sheet: ImportSheetAnalysis) {
  const row5 = sheet.matrix[4] ?? []
  const row6 = sheet.matrix[5] ?? []
  const row7 = sheet.matrix[6] ?? []
  const maxColumns = Math.max(sheet.columnCount, row5.length, row6.length, row7.length)
  const starts = new Set<number>()

  for (let index = 0; index < maxColumns; index += 1) {
    const title = compactText(row5[index])
    if (!title) continue

    const titleToken = normalizeToken(title)
    if (isTotalLikeHeader(titleToken) && !titleToken.includes('ko411')) continue

    const row6Token = normalizeToken(row6[index] ?? '')
    const row6NextToken = normalizeToken(row6[index + 1] ?? '')
    const row7Token = normalizeToken(row7[index] ?? '')
    const row7NextToken = normalizeToken(row7[index + 1] ?? '')

    const hasProductCue = [row6Token, row6NextToken, row7Token, row7NextToken].some((token) => {
      return (
        token.includes('제품') ||
        token.includes('생산량') ||
        token.includes('황지') ||
        token.includes('양품') ||
        token.includes('ea')
      )
    })

    if (hasProductCue) starts.add(index)
  }

  return [...starts].sort((left, right) => left - right)
}

function readNumericValue(row: string[], index: number) {
  return parseLooseNumber(row[index] ?? '')
}

function classifyBandField(
  row5: string[],
  row6: string[],
  row7: string[],
  columnIndex: number,
  reworkState: { seen: number }
) {
  const header5 = normalizeToken(row5[columnIndex] ?? '')
  const header6 = normalizeToken(row6[columnIndex] ?? '')
  const header7 = normalizeToken(row7[columnIndex] ?? '')
  const combined = `${header5} ${header6} ${header7}`

  if (combined.includes('달성률')) return 'achievement_pct'
  if (combined.includes('생산량')) return 'actual_ton'
  if (combined.includes('계획량')) return 'plan_ton'
  if (combined.includes('황지')) return 'hwangji_ton'
  if (combined.includes('cogging')) return 'cogging_ton'
  if (combined.includes('c/s')) return 'cs_ton'
  if (combined.includes('a/s')) return 'as_ton'
  if (combined.includes('sus')) return 'sus_ton'
  if (combined.includes('ea') || combined.includes('양품')) return 'work_count'

  if (combined.includes('재제작') || combined.includes('수정')) {
    const groupLabel = `${header5} ${header6}`
    if (groupLabel.includes('품질')) return 'rework_quality_ton'
    if (groupLabel.includes('자체')) return 'rework_self_ton'
    const field = reworkState.seen < 2 ? 'rework_self_ton' : 'rework_quality_ton'
    reworkState.seen += 1
    return field
  }

  if (combined.includes('합계')) return 'total_ton'

  return null
}

function parseLineOutputSheet<TRecord extends LineOutputDailyImportRow | LineOutputMonthlyImportRow>(
  sheet: ImportSheetAnalysis,
  context: ImportPreviewContext,
  kind: LineOutputKind,
  options: LineOutputOptions = {}
): ImportPreview<TRecord> {
  const row5 = sheet.matrix[4] ?? []
  const row6 = sheet.matrix[5] ?? []
  const row7 = sheet.matrix[6] ?? []
  const bandStarts = getBandStarts(sheet)
  const bandEnds = bandStarts.map((start, index) => bandStarts[index + 1] ?? sheet.columnCount)
  const rows: ImportPreviewRow<TRecord>[] = []
  const yearFallback = detectYearFromSheetName(sheet.sheetName)

  if (bandStarts.length === 0) {
    return {
      datasetKey: 'line-output',
      layout: kind === 'monthly' ? 'line-output-monthly' : 'line-output-daily',
      sheetName: sheet.sheetName,
      headerRowIndex: 6,
      columns: sheet.columns,
      rows,
      validRows: [],
      invalidRowCount: 0,
      warningRowCount: 0,
      templateSignature: sheet.templateSignature,
    } as ImportPreview<TRecord>
  }

  sheet.matrix.slice(7).forEach((raw, rowOffset) => {
    const rowIndex = 8 + rowOffset
    if (!rowHasValues(raw)) return

    const dateText = compactText(raw[0])
    const workDate = kind === 'daily' ? normalizeDateText(dateText, null) : null
    const ym = kind === 'monthly' ? normalizeMonthDate(dateText, yearFallback) : null
    const rowWorkCount = kind === 'monthly' ? extractWorkCount(dateText) : 0

    const errors: string[] = []
    const warnings: string[] = []

    if (kind === 'daily' && !workDate) errors.push('일자를 읽지 못했습니다.')
    if (kind === 'monthly' && !ym) errors.push('월을 읽지 못했습니다.')

    bandStarts.forEach((start, bandIndex) => {
      const end = Math.max(start + 1, (bandEnds[bandIndex] ?? sheet.columnCount) - 1)
      const rawTitle = compactText(row5[start] ?? row6[start] ?? row6[start + 1] ?? `Band ${bandIndex + 1}`)
      const lineCode = normalizeLineOutputCode(rawTitle)

      if (options.excludeTotal && lineCode === 'TOTAL') return

      const values = {
        actual: null as number | null,
        plan: null as number | null,
        achievement: null as number | null,
        hwangji: null as number | null,
        cogging: null as number | null,
        reworkSelf: 0,
        reworkQuality: 0,
        cs: null as number | null,
        as: null as number | null,
        sus: null as number | null,
        total: null as number | null,
        workCount: 0,
      }
      const reworkState = { seen: 0 }
      let meaningful = false

      for (let columnIndex = start; columnIndex <= end; columnIndex += 1) {
        const numeric = readNumericValue(raw, columnIndex)
        if (numeric == null) continue
        if (numeric !== 0) meaningful = true

        const field = classifyBandField(row5, row6, row7, columnIndex, reworkState)
        switch (field) {
          case 'actual_ton':
            if (values.actual == null) values.actual = numeric
            break
          case 'plan_ton':
            if (values.plan == null) values.plan = numeric
            break
          case 'achievement_pct':
            if (values.achievement == null) values.achievement = numeric
            break
          case 'hwangji_ton':
            if (values.hwangji == null) values.hwangji = numeric
            break
          case 'cogging_ton':
            if (values.cogging == null) values.cogging = numeric
            break
          case 'rework_self_ton':
            values.reworkSelf += numeric
            break
          case 'rework_quality_ton':
            values.reworkQuality += numeric
            break
          case 'cs_ton':
            if (values.cs == null) values.cs = numeric
            break
          case 'as_ton':
            if (values.as == null) values.as = numeric
            break
          case 'sus_ton':
            if (values.sus == null) values.sus = numeric
            break
          case 'total_ton':
            if (values.total == null) values.total = numeric
            break
          case 'work_count':
            values.workCount = Math.max(values.workCount, Math.round(numeric))
            break
          default:
            break
        }
      }

      if (!meaningful) return
      if (options.excludeTotal && (lineCode === 'TOTAL' || rawTitle.includes('TOTAL'))) return

      const actualTon = kgToTon(values.actual ?? 0)
      const planTon = kgToTon(values.plan ?? 0)
      const achievementPct = ratioToPercent(values.achievement)
      const hwangjiTon = kgToTon(values.hwangji ?? 0)
      const coggingTon = kgToTon(values.cogging ?? 0)
      const reworkSelfTon = kgToTon(values.reworkSelf)
      const reworkQualityTon = kgToTon(values.reworkQuality)
      const csTon = kgToTon(values.cs ?? 0)
      const asTon = kgToTon(values.as ?? 0)
      const susTon = kgToTon(values.sus ?? 0)
      const totalTon = kgToTon(values.total ?? 0)

      const record = (
        kind === 'daily'
          ? {
              work_date: workDate ?? '',
              line_code: lineCode ?? rawTitle,
              line_label: rawTitle || null,
              plan_ton: planTon,
              actual_ton: actualTon,
              achievement_pct: achievementPct,
              hwangji_ton: hwangjiTon,
              cogging_ton: coggingTon,
              rework_self_ton: reworkSelfTon,
              rework_quality_ton: reworkQualityTon,
              cs_ton: csTon,
              as_ton: asTon,
              sus_ton: susTon,
              total_ton: totalTon,
              work_count: values.workCount,
              note: rawTitle || null,
              source_upload_id: null,
            }
          : {
              ym: ym ?? '',
              line_code: lineCode ?? rawTitle,
              line_label: rawTitle || null,
              plan_ton: planTon,
              actual_ton: actualTon,
              achievement_pct: achievementPct,
              hwangji_ton: hwangjiTon,
              cogging_ton: coggingTon,
              rework_self_ton: reworkSelfTon,
              rework_quality_ton: reworkQualityTon,
              cs_ton: csTon,
              as_ton: asTon,
              sus_ton: susTon,
              total_ton: totalTon,
              work_count: rowWorkCount > 0 ? rowWorkCount : values.workCount,
              note: rawTitle || null,
              source_upload_id: null,
            }
      ) as TRecord

      if (record.actual_ton > 0 && record.plan_ton > 0) {
        const calculated = calcAchievementRate(record.actual_ton, record.plan_ton)
        if (calculated != null && record.achievement_pct != null && Math.abs(calculated - record.achievement_pct) > 5) {
          warnings.push(`달성률 ${record.achievement_pct.toFixed(1)}%와 계산값 ${calculated.toFixed(1)}%가 다릅니다.`)
        }
      }

      if (record.total_ton <= 0 && record.actual_ton > 0) {
        warnings.push('합계값이 0입니다. 원본 열 구성을 다시 확인해주세요.')
      }

      rows.push(makeRowResult(rowIndex, raw, record, errors, warnings))
    })
  })

  const validRows = rows.filter((row) => row.value != null && row.errors.length === 0).map((row) => row.value as TRecord)
  const invalidRowCount = rows.filter((row) => row.errors.length > 0).length
  const warningRowCount = rows.filter((row) => row.warnings.length > 0).length

  return {
    datasetKey: 'line-output',
    layout: kind === 'monthly' ? 'line-output-monthly' : 'line-output-daily',
    sheetName: sheet.sheetName,
    headerRowIndex: 6,
    columns: sheet.columns,
    rows,
    validRows,
    invalidRowCount,
    warningRowCount,
    templateSignature: sheet.templateSignature,
  }
}

export function parseLineOutputDailySheet(
  sheet: ImportSheetAnalysis,
  context: ImportPreviewContext,
  options?: LineOutputOptions
): ImportPreview<LineOutputDailyImportRow> {
  return parseLineOutputSheet<LineOutputDailyImportRow>(sheet, context, 'daily', options)
}

export function parseLineOutputMonthlySheet(
  sheet: ImportSheetAnalysis,
  context: ImportPreviewContext,
  options?: LineOutputOptions
): ImportPreview<LineOutputMonthlyImportRow> {
  return parseLineOutputSheet<LineOutputMonthlyImportRow>(sheet, context, 'monthly', options)
}
