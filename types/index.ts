// 데이터베이스 테이블 타입 정의
export type Role = 'admin' | 'editor' | 'viewer'
export type Shift = 'day' | 'night' | 'both'
export type GasSource = 'meter' | 'bill' | 'self'
export type CapacityClass = '5000' | '15000' | 'ringmill'
export type TargetScope = 'line' | 'furnace' | 'company'
export type TargetMetric = 'gas_unit' | 'ton_per_hour' | 'output'
export type BenchmarkOrg = '두산' | '태상' | '태웅'

export interface Profile {
  id: string
  name: string
  role: Role
  created_at: string
}

export interface Line {
  id: string
  code: string // P5 | P8 | P15 | R/M | ...
  name: string
  capacity_class: CapacityClass
  active: boolean
}

export interface Furnace {
  id: string
  code: string // 1호기 ~ 20호기
  name: string
  group_line_id: string | null
  active: boolean
}

export interface Product {
  id: string
  name: string
  material: string // 금형강|크랭크축|쉘|로터|C/S|A/S|SUS
  std_ton_per_hour: number | null
  std_gas_unit: number | null
  active: boolean
}

export interface ProductionRecord {
  id: string
  work_month: string // date (YYYY-MM-01)
  line_code: string
  product_name: string | null
  shift: Shift | null
  order_no?: string | null
  plan_ton: number
  actual_ton: number
  hwangji_ton: number
  cogging_ton: number
  rework_self_ton: number
  rework_quality_ton: number
  work_hours: number
  work_count: number
  note: string | null
  created_by: string
  created_at: string
  updated_by: string | null
  updated_at: string | null
  // joined
  line?: Line
  product?: Product
}

export interface GasRecord {
  id: string
  ym: string // date (YYYY-MM-01)
  furnace_code: string
  order_no?: string | null
  charge_weight_kg: number
  gas_usage: number
  gas_unit: number | null // GENERATED
  source: GasSource
  note: string | null
  created_by: string
  created_at: string
  // joined
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
  // joined
  furnace?: Furnace
}

export interface Target {
  id: string
  year: number
  scope: TargetScope
  ref_id: string | null
  metric: TargetMetric
  target_value: number
  note: string | null
}

export interface Benchmark {
  id: string
  org: BenchmarkOrg
  metric: TargetMetric
  product_or_scope: string
  value: number
  year: number
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

// UI 유틸 타입
export interface KpiData {
  label: string
  value: string | number
  unit?: string
  change?: number // 전월 대비 증감률 (%)
  changeLabel?: string
  trend?: 'up' | 'down' | 'neutral'
  goodWhenDown?: boolean // true면 값이 내려갈 때 파란색 (원단위 등)
}

export interface ChartDataPoint {
  month: string
  [key: string]: string | number | null
}
