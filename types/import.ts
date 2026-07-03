import type { GasSource, ImportDatasetKey, ImportLayout, Shift } from '@/types'
export type { GasSource, ImportDatasetKey, ImportLayout, Shift } from '@/types'

export type ImportFieldKey =
  | 'date'
  | 'work_date'
  | 'ym'
  | 'work_month'
  | 'dept_line'
  | 'line_code'
  | 'product'
  | 'product_name'
  | 'material'
  | 'process'
  | 'shift'
  | 'value'
  | 'charge_weight_kg'
  | 'charge_weight'
  | 'gas_usage'
  | 'source'
  | 'order_size'
  | 'work_size'
  | 'order_weight'
  | 'plan_ton'
  | 'actual_ton'
  | 'hwangji_ton'
  | 'cogging_ton'
  | 'rework_self_ton'
  | 'rework_quality_ton'
  | 'furnace_code'
  | 'work_hours'
  | 'work_count'
  | 'order_no'
  | 'note'
  | 'ton_per_hour'
  | 'ton_per_run'
  | 'entered_by_name'

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

export interface ImportUploadRecord {
  id: string
  dataset_key: ImportDatasetKey
  sheet_name: string
  file_name: string
  storage_bucket: string
  storage_path: string
  file_hash: string
  file_size: number
  layout: ImportLayout
  row_count: number
  saved_count: number
  failed_count: number
  warning_count: number
  template_name: string | null
  mapping_json: Record<string, unknown>
  summary_json: Record<string, unknown>
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
  products: Array<{ name: string; material?: string }>
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
  work_date: string
  dept_line: string
  shift: Shift | null
  order_no: string | null
  product: string | null
  material: string | null
  process: string
  order_size: string | null
  work_size: string | null
  order_weight: number
  charge_weight: number
  furnace_code: string
  work_hours: number
  work_count: number
  ton_per_hour: number | null
  ton_per_run: number | null
  entered_by_name: string | null
  note: string | null
  // Legacy compatibility fields used by older import logic and reports.
  work_month: string | null
  line_code: string | null
  product_name: string | null
  plan_ton: number
  actual_ton: number
  hwangji_ton: number
  cogging_ton: number
  rework_self_ton: number
  rework_quality_ton: number
}

export interface GasCompanyMonthlyImportRow {
  ym: string
  charge_weight_kg: number
  gas_usage: number
  note?: string | null
}
