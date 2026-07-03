import type { ImportDatasetKey, ImportLayout, Shift, GasSource } from '@/types'
export type { ImportDatasetKey, ImportLayout, Shift, GasSource } from '@/types'

export type ImportFieldKey =
  | 'date'
  | 'ym'
  | 'work_month'
  | 'furnace_code'
  | 'line_code'
  | 'product_name'
  | 'shift'
  | 'value'
  | 'charge_weight_kg'
  | 'gas_usage'
  | 'source'
  | 'plan_ton'
  | 'actual_ton'
  | 'hwangji_ton'
  | 'cogging_ton'
  | 'work_hours'
  | 'work_count'
  | 'order_no'
  | 'note'

export interface ImportAliasRecord {
  id: string
  dataset_key: ImportDatasetKey | 'shared'
  canonical_field: ImportFieldKey | string
  alias_text: string
  active: boolean
  note: string | null
  created_by: string | null
  created_at: string
  updated_at: string | null
}

export interface ImportTemplateRecord {
  id: string
  name: string
  dataset_key: ImportDatasetKey
  sheet_rules: Record<string, unknown>
  mapping_json: Record<string, unknown>
  signature_json: Record<string, unknown>
  active: boolean
  created_by: string | null
  created_at: string
  updated_at: string | null
}

export interface ImportSourceColumn {
  key: string
  index: number
  label: string
  normalizedLabel: string
  samples: string[]
  isSynthetic?: boolean
}

export interface ImportTemplateSignature {
  datasetKey: ImportDatasetKey
  layout: ImportLayout
  sheetName: string
  sheetNameTokens: string[]
  headerTokens: string[]
}

export interface ImportBindingOption {
  key: string
  label: string
  description?: string
}

export interface ImportFieldBinding {
  field: ImportFieldKey
  sourceKey: string | null
  staticValue: string | null
  required?: boolean
  help?: string
}

export interface ImportMappingState {
  datasetKey: ImportDatasetKey
  layout: ImportLayout
  sheetName: string | null
  headerRowIndex: number | null
  fieldMap: Partial<Record<ImportFieldKey, string | null>>
  staticValues: Partial<Record<ImportFieldKey, string | null>>
  options: Record<string, string | number | boolean | null>
}

export interface ImportPreviewRow<TRecord> {
  rowIndex: number
  raw: string[]
  value: TRecord | null
  errors: string[]
  warnings: string[]
}

export interface ImportPreview<TRecord> {
  datasetKey: ImportDatasetKey
  layout: ImportLayout
  sheetName: string
  headerRowIndex: number | null
  columns: ImportSourceColumn[]
  rows: ImportPreviewRow<TRecord>[]
  validRows: TRecord[]
  invalidRowCount: number
  warningRowCount: number
  templateSignature: ImportTemplateSignature
}

export interface ImportSheetAnalysis {
  sheetName: string
  matrix: string[][]
  rowCount: number
  columnCount: number
  headerRowIndex: number | null
  datasetGuess: ImportDatasetKey | null
  layoutGuess: ImportLayout
  confidence: number
  headerTokens: string[]
  columns: ImportSourceColumn[]
  templateSignature: ImportTemplateSignature
}

export interface ImportDocument {
  fileName: string
  sheetKind: 'csv' | 'workbook'
  sheets: ImportSheetAnalysis[]
}

export interface ImportMasterData {
  furnaces: Array<{ code: string; name: string }>
  lines: Array<{ code: string; name: string }>
  products: Array<{ name: string }>
  aliases: ImportAliasRecord[]
}

export interface ImportPreviewContext {
  datasetKey: ImportDatasetKey
  layout: ImportLayout
  signature: ImportTemplateSignature
  columns: ImportSourceColumn[]
  bindings: Record<ImportFieldKey, ImportFieldBinding>
  master: ImportMasterData
}

export type ImportValueTransform = {
  shift?: Shift | null
  source?: GasSource
}

export interface GasDailyImportRow {
  date: string
  furnace_code: string
  shift: Shift | null
  value: number
  order_no?: string | null
  note?: string | null
}

export interface GasMonthlyImportRow {
  ym: string
  furnace_code: string
  charge_weight_kg: number
  gas_usage: number
  source: GasSource
  order_no?: string | null
  note?: string | null
}

export interface ProductionImportRow {
  work_month: string
  line_code: string
  product_name: string | null
  shift: Shift | null
  plan_ton: number
  actual_ton: number
  hwangji_ton: number
  cogging_ton: number
  work_hours: number
  work_count: number
  order_no?: string | null
  note?: string | null
}

export interface GasCompanyMonthlyImportRow {
  ym: string
  charge_weight_kg: number
  gas_usage: number
  note?: string | null
}
