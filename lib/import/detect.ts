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
    if (tokens.some((token) => normalizeMonthDate(token, null) != null)) score += 2
  }

  if (datasetKey === 'production') {
    if (tokens.some((token) => token.includes('라인') || token.includes('line') || normalizeLineCode(token))) score += 4
    if (tokens.some((token) => token.includes('계획') || token.includes('plan'))) score += 4
    if (tokens.some((token) => token.includes('실적') || token.includes('actual'))) score += 4
    if (tokens.some((token) => token.includes('작업시간') || token.includes('hours'))) score += 2
    if (tokens.some((token) => token.includes('작업횟수') || token.includes('count'))) score += 2
    if (tokens.some((token) => token.includes('수주번호') || token.includes('생산중량') || token.includes('프레스별') || token.includes('작업조') || token.includes('단조작업일'))) score += 5
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
  const hasProductionDetailHeaders = headerTokens.some((token) => token.includes('생산중량') || token.includes('수주번호') || token.includes('프레스별') || token.includes('작업조'))

  if (datasetKey === 'gas-daily') {
    return hasFurnaceHeader && hasDateHeader ? 'gas-daily-wide' : 'long'
  }

  if (datasetKey === 'gas-monthly') {
    if (hasFurnaceHeader && hasMonthHeader) return 'gas-monthly-wide'
    return 'long'
  }

  if (datasetKey === 'production') {
    if (hasProductionDetailHeaders || (hasDateHeader && hasLineHeader && headerTokens.some((token) => token.includes('생산중량')))) return 'production-detail'
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
