export type Role = 'admin' | 'editor' | 'viewer'
export type Shift = 'day' | 'night' | 'both'
export type GasSource = 'meter' | 'bill' | 'self'
export type CapacityClass = '5000' | '15000' | 'ringmill'
export type TargetScope = 'line' | 'furnace' | 'dept' | 'company'
export type TargetMetric = 'gas_unit' | 'ton_per_hour' | 'output'
export type BenchmarkOrg = '두산' | '태상' | '태웅'
export type ImportDatasetKey =
  | 'gas-daily'
  | 'gas-monthly'
  | 'production'
  | 'gas-company-monthly'
  | 'work-standards'
  | 'targets'
  | 'raw-material-specs'
export type ImportLayout =
  | 'auto'
  | 'long'
  | 'gas-daily-wide'
  | 'gas-monthly-wide'
  | 'gas-charge-daily-wide'
  | 'production-wide'
  | 'production-detail'
  | 'production-summary'
  | 'production-daily'
  | 'company-wide'

export interface Profile {
  id: string
  name: string
  role: Role
  created_at: string
}

export interface Line {
  id: string
  code: string
  name: string
  capacity_class: CapacityClass
  active: boolean
}

export interface Furnace {
  id: string
  code: string
  name: string
  dept?: string | null
  group_line_id: string | null
  active: boolean
}

export interface Product {
  id: string
  name: string
  material: string
  std_ton_per_hour: number | null
  std_gas_unit: number | null
  active: boolean
}

export interface ProductionRecord {
  id: string
  work_date: string | null
  dept_line: string | null
  shift: Shift | null
  order_no: string | null
  product: string | null
  material: string | null
  process: string | null
  order_size: string | null
  work_size: string | null
  order_weight: number | null
  charge_weight: number | null
  furnace_code: string | null
  work_hours: number | null
  work_count: number | null
  ton_per_hour: number | null
  ton_per_run: number | null
  entered_by_name: string | null
  created_at: string
  updated_at: string | null
  created_by?: string | null
  updated_by?: string | null
  entered_by_shift?: string | null
  // Legacy fields retained for compatibility with older records and screens.
  work_month?: string | null
  line_code?: string | null
  product_name?: string | null
  plan_ton?: number | null
  actual_ton?: number | null
  hwangji_ton?: number | null
  cogging_ton?: number | null
  rework_self_ton?: number | null
  rework_quality_ton?: number | null
  note?: string | null
  line?: Line
  productRef?: Product
}

export interface GasRecord {
  id: string
  ym: string
  furnace_code: string
  order_no?: string | null
  charge_weight_kg: number
  gas_usage: number
  gas_unit: number | null
  source: GasSource
  note: string | null
  created_by: string
  created_at: string
  furnace?: Furnace
}

export interface GasDailyReading {
  id: string
  date: string
  furnace_code: string
  shift: Shift | null
  order_no?: string | null
  value: number
  created_by: string
  furnace?: Furnace
}

export interface GasCompanyMonthly {
  id: string
  ym: string
  charge_weight_kg: number
  gas_usage: number
  created_by: string | null
  created_at: string
}

export interface Target {
  id: string
  year?: number | null
  dept?: string | null
  scope: TargetScope
  ref: string
  metric: TargetMetric
  target_value: number
  note: string | null
}

export interface Benchmark {
  id: string
  org: BenchmarkOrg
  metric: TargetMetric
  scope: string
  value: number
}

export interface WorkStandard {
  id: string
  dept: string
  product: string
  material: string
  basis: 'charge' | 'product'
  min_ton: number | null
  max_ton: number | null
  order_size: string | null
  std_work_count: number
  note: string | null
}

export interface RawMaterialSpec {
  id: string
  product: string
  material: string
  raw_material: string
  spec: string
  note: string | null
}

export interface AppSetting {
  key: string
  value: Record<string, unknown> | string | number | boolean | null
  note: string | null
}

export interface AuditLog {
  id: string
  table_name: string
  row_id: string
  action: 'INSERT' | 'UPDATE' | 'DELETE'
  before: Record<string, unknown> | null
  after: Record<string, unknown> | null
  actor: string
  at: string
}

export interface KpiData {
  label: string
  value: string | number
  unit?: string
  change?: number
  changeLabel?: string
  trend?: 'up' | 'down' | 'neutral'
  goodWhenDown?: boolean
}

export interface ChartDataPoint {
  month: string
  [key: string]: string | number | null
}

export interface ImportAlias {
  id: string
  dataset_key: ImportDatasetKey | 'shared'
  canonical_field: string
  alias_text: string
  active: boolean
  note: string | null
  created_by: string | null
  created_at: string
  updated_at: string | null
}

export interface ImportTemplate {
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

export interface ImportUpload {
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
