import type { ImportDatasetKey, ImportLayout, ImportMappingState, ImportTemplateRecord, ImportFieldKey } from '@/types/import'
import type { ImportSheetAnalysis, ImportTemplateSignature } from '@/types/import'
import { IMPORT_DATASETS } from '@/lib/import/specs'
import { normalizeToken } from '@/lib/input/common'

export function createDefaultImportMapping(sheet: ImportSheetAnalysis, datasetKey?: ImportDatasetKey): ImportMappingState {
  const resolvedDatasetKey = datasetKey ?? sheet.datasetGuess ?? 'gas-monthly'
  const spec = IMPORT_DATASETS[resolvedDatasetKey]

  return {
    datasetKey: resolvedDatasetKey,
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

export function hydrateImportMappingFromTemplate(
  template: ImportTemplateRecord,
  sheet: ImportSheetAnalysis
): ImportMappingState {
  const payload = (template.mapping_json ?? {}) as Partial<ImportMappingState>
  const fallback = createDefaultImportMapping(sheet, template.dataset_key)

  return {
    datasetKey: template.dataset_key,
    layout: (payload.layout as ImportLayout | undefined) ?? fallback.layout,
    sheetName: sheet.sheetName,
    headerRowIndex: (payload.headerRowIndex as number | null | undefined) ?? sheet.headerRowIndex,
    fieldMap: {
      ...fallback.fieldMap,
      ...(payload.fieldMap ?? {}),
    },
    staticValues: {
      ...fallback.staticValues,
      ...(payload.staticValues ?? {}),
    },
    options: {
      ...fallback.options,
      ...(payload.options ?? {}),
    },
  }
}

export function serializeImportMapping(mapping: ImportMappingState, sheet: ImportSheetAnalysis) {
  return {
    datasetKey: mapping.datasetKey,
    layout: mapping.layout,
    sheetName: mapping.sheetName ?? sheet.sheetName,
    headerRowIndex: mapping.headerRowIndex ?? sheet.headerRowIndex,
    fieldMap: mapping.fieldMap,
    staticValues: mapping.staticValues,
    options: mapping.options,
  }
}

export function buildTemplateSignature(sheet: ImportSheetAnalysis): ImportTemplateSignature {
  return sheet.templateSignature
}

export function matchImportTemplate(
  templates: ImportTemplateRecord[],
  sheet: ImportSheetAnalysis
): ImportTemplateRecord | null {
  const candidates = templates.filter((template) => template.active)
  if (candidates.length === 0) return null

  let best: { template: ImportTemplateRecord | null; score: number } = { template: null, score: -1 }

  candidates.forEach((template) => {
    let score = 0
    if (template.dataset_key === sheet.templateSignature.datasetKey) score += 5

    const signature = template.signature_json ?? {}
    const templateSheetTokens = Array.isArray(signature.sheetNameTokens) ? signature.sheetNameTokens : []
    const templateHeaderTokens = Array.isArray(signature.headerTokens) ? signature.headerTokens : []
    const sheetTokens = new Set(sheet.templateSignature.sheetNameTokens.map((token) => normalizeToken(token)))
    const headerTokens = new Set(sheet.templateSignature.headerTokens.map((token) => normalizeToken(token)))

    templateSheetTokens.forEach((token: string) => {
      if (sheetTokens.has(normalizeToken(token))) score += 2
    })

    templateHeaderTokens.forEach((token: string) => {
      if (headerTokens.has(normalizeToken(token))) score += 2
    })

    const rules = template.sheet_rules ?? {}
    if (typeof rules === 'object' && rules && 'layout' in rules && (rules as { layout?: string }).layout === sheet.layoutGuess) {
      score += 3
    }

    if (score > best.score) {
      best = { template, score }
    }
  })

  return best.score >= 5 ? best.template : null
}

export function buildTemplatePayload(
  name: string,
  sheet: ImportSheetAnalysis,
  mapping: ImportMappingState,
  createdBy: string | null
) {
  return {
    name,
    dataset_key: mapping.datasetKey,
    sheet_rules: {
      layout: mapping.layout,
      sheetName: sheet.sheetName,
      headerRowIndex: mapping.headerRowIndex ?? sheet.headerRowIndex,
    },
    mapping_json: serializeImportMapping(mapping, sheet),
    signature_json: buildTemplateSignature(sheet),
    active: true,
    created_by: createdBy,
    updated_at: new Date().toISOString(),
  }
}

