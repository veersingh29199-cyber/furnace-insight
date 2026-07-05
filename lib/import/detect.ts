import { buildFieldAliasMap } from '@/lib/import/aliases'
import {
  detectYearFromSheetName,
  normalizeFurnaceCode,
  normalizeLineCode,
  normalizeMonthDate,
  rowHasMeaningfulValue,
  sampleRowValues,
  trimMatrix,
} from '@/lib/import/common'
import { IMPORT_DATASETS } from '@/lib/import/specs'
import { isTotalLikeHeader, normalizeToken } from '@/lib/input/common'
import type { ImportAliasRecord, ImportDatasetKey, ImportFieldKey, ImportLayout, ImportSheetAnalysis, ImportSourceColumn, ImportTemplateSignature } from '@/types/import'

export interface ImportDetectionContext {
  aliases: ImportAliasRecord[]
  fileName?: string | null
}

function buildSourceColumns(matrix: string[][], headerRowIndex: number | null): ImportSourceColumn[] {
  const headerRow = headerRowIndex != null ? matrix[headerRowIndex] ?? [] : []
  const rowOffset = headerRowIndex != null ? headerRowIndex + 1 : 0
  const columnCount = Math.max(0, ...matrix.map((row) => row.length), headerRow.length)

  return Array.from({ length: columnCount }, (_, index) => {
    const label = String(headerRow[index] ?? '').trim() || `Column ${index + 1}`
    return {
      key: `col:${index}`,
      index,
      label,
      normalizedLabel: normalizeToken(label),
      samples: sampleRowValues(matrix.slice(rowOffset), index),
    }
  })
}

function rowTokens(row: string[]) {
  return row.map((cell) => normalizeToken(cell)).filter(Boolean)
}

function includesAny(tokens: string[], values: string[]) {
  return tokens.some((token) => values.some((value) => token.includes(value)))
}

function countMonthHeaderTokens(tokens: string[]) {
  return tokens.filter((token) => /\d{1,2}월/.test(token) || normalizeMonthDate(token, null) != null).length
}

function countFurnaceHeaderTokens(tokens: string[]) {
  return tokens.filter((token) => normalizeFurnaceCode(token) != null || /\d{1,2}호기/.test(token) || token.includes('호기')).length
}

function detectLineOutputShape(
  sheetName: string,
  fileToken: string,
  sheetToken: string,
  topTokens: string[]
): { datasetKey: ImportDatasetKey; headerRowIndex: number; layout: ImportLayout; confidence: number } | null {
  const looksLikeLineOutput =
    fileToken.includes('outputtabulation') ||
    fileToken.includes('생산량집계표') ||
    sheetToken.includes('생산량집계표') ||
    includesAny(topTokens, ['outputtabulation', '생산량집계표', '작업일자', '작업월'])

  if (!looksLikeLineOutput) return null

  const isMonthlySheet = /년\s*전체$/.test(sheetName) || includesAny(topTokens, ['작업월', '계획일'])
  return {
    datasetKey: 'line-output',
    headerRowIndex: 6,
    layout: isMonthlySheet ? 'line-output-monthly' : 'line-output-daily',
    confidence: 100,
  }
}

function detectStructuredImportShape(
  sheetName: string,
  matrix: string[][],
  context: ImportDetectionContext
): { datasetKey: ImportDatasetKey; headerRowIndex: number; layout: ImportLayout; confidence: number } | null {
  const fileToken = normalizeToken(context.fileName ?? '')
  const sheetToken = normalizeToken(sheetName)
  const topRows = matrix.slice(0, 12).map((row, index) => ({
    index,
    tokens: rowTokens(row),
  }))
  const topTokens = topRows.flatMap((row) => row.tokens)
  const looksLikeLineOutput = detectLineOutputShape(sheetName, fileToken, sheetToken, topTokens)
  if (looksLikeLineOutput) {
    return looksLikeLineOutput
  }

  const looksLikeProductionSummary =
    (fileToken.includes('생산량집계표') || sheetToken.includes('생산량집계표') || includesAny(topTokens, ['outputtabulation'])) &&
    includesAny(topTokens, ['제품(일일', '재질별제품생산량', '생산량집계표', '생산량']) &&
    includesAny(topTokens, ['달성률', '계획량'])

  if (looksLikeProductionSummary) {
    return {
      datasetKey: 'production',
      headerRowIndex: 6,
      layout: 'production-summary',
      confidence: 100,
    }
  }

  const productionDetailRow = topRows.find((row) => {
    return (
      includesAny(row.tokens, ['단조작업일', '작업일', '일자', '날짜']) &&
      includesAny(row.tokens, ['수주번호']) &&
      includesAny(row.tokens, ['생산중량', '생산중량(양품)']) &&
      includesAny(row.tokens, ['작업조', '프레스별', '작업장', '공정'])
    )
  })

  if (productionDetailRow) {
    return {
      datasetKey: 'production',
      headerRowIndex: productionDetailRow.index,
      layout: 'production-detail',
      confidence: 100,
    }
  }

  const monthlyGasRow = topRows.find((row) => {
    const monthCount = countMonthHeaderTokens(row.tokens)
    const furnaceCount = countFurnaceHeaderTokens(row.tokens)
    return monthCount >= 6 && furnaceCount >= 1 && includesAny(row.tokens, ['가열로', '호기'])
  })

  if (monthlyGasRow) {
    return {
      datasetKey: 'gas-monthly',
      headerRowIndex: monthlyGasRow.index,
      layout: 'gas-monthly-wide',
      confidence: 95,
    }
  }

  const dailyChargeRow = topRows.find((row) => {
    const furnaceCount = countFurnaceHeaderTokens(row.tokens)
    const shiftLike = includesAny(row.tokens, ['주/야구분', '주야구분', '주간조', '야간조'])
    const dateLike = includesAny(row.tokens, ['날짜', '일자', '1월']) || row.tokens.some((token) => /\d{4}\.\d{1,2}/.test(token) || /\d{1,2}월/.test(token))
    return shiftLike && furnaceCount >= 3 && dateLike
  })

  if (dailyChargeRow) {
    return {
      datasetKey: 'gas-monthly',
      headerRowIndex: dailyChargeRow.index,
      layout: 'gas-charge-daily-wide',
      confidence: 92,
    }
  }

  const companyMonthlyRow = topRows.find((row) => {
    const monthCount = countMonthHeaderTokens(row.tokens)
    return monthCount >= 6 && includesAny(row.tokens, ['가스값검침', '장입량', '원단위']) && !includesAny(row.tokens, ['가열로'])
  })

  if (companyMonthlyRow) {
    return {
      datasetKey: 'gas-company-monthly',
      headerRowIndex: companyMonthlyRow.index,
      layout: 'company-wide',
      confidence: 90,
    }
  }

  return null
}

function scoreRowForDataset(row: string[], datasetKey: ImportDatasetKey, aliasMap: Map<string, ImportFieldKey>) {
  const spec = IMPORT_DATASETS[datasetKey]
  const tokens = row.map((cell) => normalizeToken(cell)).filter(Boolean)
  if (tokens.length === 0) return 0

  let score = 0

  spec.fields
    .filter((field) => field.kind !== 'hidden')
    .forEach((field) => {
      const fieldToken = normalizeToken(field.label)
      const matched = tokens.some((token) => {
        const aliasField = aliasMap.get(token)
        return aliasField === field.key || token.includes(fieldToken) || fieldToken.includes(token)
      })
      if (matched) score += 3
    })

  if (datasetKey === 'gas-daily') {
    if (tokens.some((token) => token.includes('일자') || token.includes('날짜') || token === 'date')) score += 4
    if (tokens.some((token) => token.includes('호기') || token.includes('furnace') || normalizeFurnaceCode(token))) score += 4
    if (tokens.some((token) => token.includes('값') || token.includes('검침') || token.includes('value'))) score += 3
  }

  if (datasetKey === 'gas-monthly') {
    if (tokens.some((token) => token.includes('호기') || token.includes('furnace'))) score += 4
    if (tokens.some((token) => token.includes('가스') || token.includes('usage') || token.includes('검침'))) score += 4
    if (tokens.some((token) => token.includes('장입') || token.includes('투입') || token.includes('weight'))) score += 3
    if (tokens.some((token) => token.includes('가열로') || token.includes('가스값검침') || token.includes('원단위'))) score += 5
    if (tokens.some((token) => token.includes('주/야구분') || token.includes('주간조') || token.includes('야간조'))) score += 2
    if (tokens.some((token) => normalizeMonthDate(token, null) != null)) score += 2
  }

  if (datasetKey === 'production') {
    if (tokens.some((token) => token.includes('라인') || token.includes('line') || normalizeLineCode(token))) score += 4
    if (tokens.some((token) => token.includes('계획') || token.includes('plan'))) score += 4
    if (tokens.some((token) => token.includes('실적') || token.includes('actual'))) score += 4
    if (tokens.some((token) => token.includes('작업시간') || token.includes('hours'))) score += 2
    if (tokens.some((token) => token.includes('작업횟수') || token.includes('count'))) score += 2
    if (tokens.some((token) => token.includes('수주번호') || token.includes('생산중량') || token.includes('프레스별') || token.includes('작업조') || token.includes('단조작업일'))) score += 5
    if (tokens.some((token) => token.includes('생산량집계표') || token.includes('재질별제품생산량') || token.includes('달성률'))) score += 6
    if (tokens.some((token) => token.includes('고객사') || token.includes('제품형상') || token.includes('강종'))) score += 2
  }

  if (datasetKey === 'gas-company-monthly') {
    if (tokens.some((token) => token.includes('가스') || token.includes('usage'))) score += 4
    if (tokens.some((token) => token.includes('장입') || token.includes('weight'))) score += 3
    if (tokens.some((token) => normalizeMonthDate(token, null) != null)) score += 2
  }

  return score + 1
}

function guessHeaderRow(matrix: string[][], aliasMap: Map<string, ImportFieldKey>) {
  let bestIndex: number | null = null
  let bestScore = -1

  matrix.slice(0, 10).forEach((row, index) => {
    if (!rowHasMeaningfulValue(row)) return
    const tokens = row.map((cell) => normalizeToken(cell)).filter(Boolean)
    if (tokens.length === 0) return

    let score = 0
    tokens.forEach((token) => {
      if (aliasMap.has(token)) score += 2
      if (token.includes('호기') || normalizeFurnaceCode(token)) score += 2
      if (token.includes('라인') || normalizeLineCode(token)) score += 2
      if (token.includes('월') || normalizeMonthDate(token, null)) score += 1
      if (token.includes('일자') || token.includes('날짜') || token.includes('date')) score += 1
      if (token.includes('단조작업일') || token.includes('수주번호') || token.includes('생산중량')) score += 4
      if (token.includes('생산량집계표') || token.includes('재질별제품생산량') || token.includes('달성률')) score += 5
      if (token.includes('주/야구분') || token.includes('주간조') || token.includes('야간조')) score += 3
      if (token.includes('가스값검침') || token.includes('원단위') || token.includes('장입량') || token.includes('투입중량')) score += 3
      if (isTotalLikeHeader(token)) score -= 1
    })

    if (score > bestScore) {
      bestScore = score
      bestIndex = index
    }
  })

  return bestIndex
}

function guessDataset(matrix: string[][], headerRowIndex: number | null, aliasMap: Map<string, ImportFieldKey>) {
  let best: { datasetKey: ImportDatasetKey | null; score: number; headerRowIndex: number | null } = {
    datasetKey: null,
    score: -1,
    headerRowIndex,
  }

  matrix.slice(0, 10).forEach((row, index) => {
    if (!rowHasMeaningfulValue(row)) return
    (Object.keys(IMPORT_DATASETS) as ImportDatasetKey[]).forEach((datasetKey) => {
      const score = scoreRowForDataset(row, datasetKey, aliasMap)
      if (score > best.score) {
        best = { datasetKey, score, headerRowIndex: index }
      }
    })
  })

  return best
}

function guessLayout(datasetKey: ImportDatasetKey | null, matrix: string[][], headerRowIndex: number | null): ImportLayout {
  if (!datasetKey) return 'auto'
  const header = headerRowIndex != null ? matrix[headerRowIndex] ?? [] : []
  const headerTokens = header.map((cell) => normalizeToken(cell)).filter(Boolean)
  const hasFurnaceHeader = headerTokens.some((token) => token.includes('호기') || normalizeFurnaceCode(token))
  const hasLineHeader = headerTokens.some((token) => token.includes('라인') || normalizeLineCode(token))
  const hasMonthHeader = headerTokens.some((token) => normalizeMonthDate(token, detectYearFromSheetName(header.join(' '))) != null || /\b\d{1,2}월\b/.test(token))
  const hasDateHeader = headerTokens.some((token) => token.includes('일자') || token.includes('날짜') || token.includes('작업일') || token === 'date')
  const hasPlanActual = headerTokens.some((token) => token.includes('계획') || token.includes('plan')) && headerTokens.some((token) => token.includes('실적') || token.includes('actual'))
  const hasProductionSummaryHeaders = headerTokens.some((token) => token.includes('달성률') || token.includes('계획량')) && !hasLineHeader && !hasFurnaceHeader
  const hasDailyChargeHeaders = headerTokens.some((token) => token.includes('주/야구분') || token.includes('주간조') || token.includes('야간조'))

  if (datasetKey === 'gas-daily') {
    return hasFurnaceHeader && hasDateHeader ? 'gas-daily-wide' : 'long'
  }

  if (datasetKey === 'gas-monthly') {
    if (hasDailyChargeHeaders && hasFurnaceHeader) return 'gas-charge-daily-wide'
    if (hasFurnaceHeader && hasMonthHeader) return 'gas-monthly-wide'
    return 'long'
  }

  if (datasetKey === 'production') {
    if (headerTokens.some((token) => token.includes('생산중량') || token.includes('생산중량(양품)') || token.includes('단조작업일') || token.includes('프레스별') || token.includes('작업장'))) return 'production-detail'
    if (hasProductionSummaryHeaders && hasMonthHeader) return 'production-summary'
    if (hasLineHeader && hasMonthHeader && !hasPlanActual) return 'production-wide'
    return 'long'
  }

  if (datasetKey === 'gas-company-monthly') {
    return hasMonthHeader ? 'company-wide' : 'long'
  }

  return 'long'
}

function buildTemplateSignature(sheetName: string, layout: ImportLayout, datasetKey: ImportDatasetKey | null, headerTokens: string[]): ImportTemplateSignature {
  return {
    datasetKey: datasetKey ?? 'gas-monthly',
    layout,
    sheetName,
    sheetNameTokens: normalizeToken(sheetName).split(/[^a-z0-9가-힣]+/i).filter(Boolean),
    headerTokens,
  }
}

export function analyzeImportSheet(sheetName: string, matrix: string[][], context: ImportDetectionContext): ImportSheetAnalysis {
  const trimmed = trimMatrix(matrix)
  const aliasMap = buildFieldAliasMap(context.aliases)
  const special = detectStructuredImportShape(sheetName, trimmed, context)
  if (special) {
    const headerRow = special.headerRowIndex != null ? trimmed[special.headerRowIndex] ?? [] : []
    const headerTokens = headerRow.map((cell) => normalizeToken(cell)).filter(Boolean)
    const columns = buildSourceColumns(trimmed, special.headerRowIndex)

    return {
      sheetName,
      matrix: trimmed,
      rowCount: trimmed.length,
      columnCount: Math.max(0, ...trimmed.map((row) => row.length)),
      headerRowIndex: special.headerRowIndex,
      datasetGuess: special.datasetKey,
      layoutGuess: special.layout,
      confidence: special.confidence,
      headerTokens,
      columns,
      templateSignature: buildTemplateSignature(sheetName, special.layout, special.datasetKey, headerTokens),
    }
  }

  const headerRowIndexGuess = guessHeaderRow(trimmed, aliasMap)
  const datasetGuessInfo = guessDataset(trimmed, headerRowIndexGuess, aliasMap)
  const headerRowIndex = datasetGuessInfo.headerRowIndex ?? headerRowIndexGuess
  const datasetGuess = datasetGuessInfo.datasetKey
  const layoutGuess = guessLayout(datasetGuess, trimmed, headerRowIndex)
  const headerRow = headerRowIndex != null ? trimmed[headerRowIndex] ?? [] : []
  const headerTokens = headerRow.map((cell) => normalizeToken(cell)).filter(Boolean)
  const columns = buildSourceColumns(trimmed, headerRowIndex)

  return {
    sheetName,
    matrix: trimmed,
    rowCount: trimmed.length,
    columnCount: Math.max(0, ...trimmed.map((row) => row.length)),
    headerRowIndex,
    datasetGuess,
    layoutGuess,
    confidence: Math.max(0, Math.min(100, datasetGuessInfo.score * 5)),
    headerTokens,
    columns,
    templateSignature: buildTemplateSignature(sheetName, layoutGuess, datasetGuess, headerTokens),
  }
}

export function analyzeImportDocument(sheets: Array<{ sheetName: string; matrix: string[][] }>, context: ImportDetectionContext) {
  return sheets.map(({ sheetName, matrix }) => analyzeImportSheet(sheetName, matrix, context))
}

export function buildFieldMappingOptions(columns: ImportSourceColumn[]) {
  return [
    { key: 'manual', label: '직접 입력', description: '사용자가 직접 고정값을 넣습니다.' },
    ...columns.map((column) => ({
      key: column.key,
      label: column.label,
      description: column.samples.length > 0 ? column.samples.slice(0, 3).join(' / ') : undefined,
    })),
  ]
}

export function findBestSheetForDataset(sheets: ImportSheetAnalysis[], datasetKey: ImportDatasetKey) {
  const candidates = sheets.filter((sheet) => sheet.datasetGuess === datasetKey)
  if (candidates.length > 0) {
    return candidates.sort((a, b) => b.confidence - a.confidence)[0] ?? null
  }

  return sheets[0] ?? null
}

export function buildSheetOverview(sheet: ImportSheetAnalysis) {
  return {
    name: sheet.sheetName,
    rows: sheet.rowCount,
    cols: sheet.columnCount,
    datasetGuess: sheet.datasetGuess,
    layoutGuess: sheet.layoutGuess,
    confidence: sheet.confidence,
  }
}

export function buildTemplateMatchScore(template: ImportTemplateSignature, sheet: ImportSheetAnalysis) {
  let score = 0

  if (template.datasetKey === sheet.templateSignature.datasetKey) score += 5
  if (template.layout === sheet.layoutGuess) score += 3

  const sheetNameTokens = new Set(sheet.templateSignature.sheetNameTokens.map((token) => normalizeToken(token)))
  const headerTokens = new Set(sheet.templateSignature.headerTokens.map((token) => normalizeToken(token)))

  template.sheetNameTokens.forEach((token) => {
    if (sheetNameTokens.has(normalizeToken(token))) score += 2
  })

  template.headerTokens.forEach((token) => {
    if (headerTokens.has(normalizeToken(token))) score += 2
  })

  return score
}
