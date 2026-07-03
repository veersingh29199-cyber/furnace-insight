import { DB, DB_CONFLICT_KEYS } from '@/types/db'
import type { ImportDatasetKey, ImportFieldKey, ImportLayout } from '@/types/import'

export interface ImportFieldSpec {
  key: ImportFieldKey
  label: string
  required: boolean
  kind: 'text' | 'number' | 'date' | 'enum' | 'hidden'
  help?: string
  options?: readonly string[]
  preview?: boolean
}

export interface ImportPreviewColumnSpec {
  key: string
  label: string
  align?: 'left' | 'right' | 'center'
  derived?: boolean
}

export interface ImportDatasetSpec {
  key: ImportDatasetKey
  label: string
  description: string
  table: string
  conflictKey: string
  defaultLayout: ImportLayout
  fields: ImportFieldSpec[]
  previewColumns: ImportPreviewColumnSpec[]
  supportedLayouts: ImportLayout[]
}

export const IMPORT_DATASETS: Record<ImportDatasetKey, ImportDatasetSpec> = {
  'gas-daily': {
    key: 'gas-daily',
    label: '일일 가스',
    description: '일자 × 호기 형태의 일일 가스검침 파일을 long/wide 모두 받아 저장합니다.',
    table: DB.tables.gasDailyReadings,
    conflictKey: DB_CONFLICT_KEYS.gasDailyReadings,
    defaultLayout: 'gas-daily-wide',
    supportedLayouts: ['long', 'gas-daily-wide'],
    fields: [
      { key: 'date', label: '일자', required: true, kind: 'date', preview: true },
      { key: 'furnace_code', label: '가열로', required: true, kind: 'text', preview: true },
      { key: 'shift', label: '주야', required: false, kind: 'enum', options: ['day', 'night', 'both'], preview: true },
      { key: 'value', label: '검침값', required: true, kind: 'number', preview: true },
      { key: 'order_no', label: '수주번호', required: false, kind: 'text', preview: false },
      { key: 'note', label: '비고', required: false, kind: 'text', preview: false },
    ],
    previewColumns: [
      { key: 'date', label: '일자' },
      { key: 'furnace_code', label: '가열로' },
      { key: 'shift', label: '주야' },
      { key: 'value', label: '검침값', align: 'right' },
      { key: 'status', label: '검증' },
    ],
  },
  'gas-monthly': {
    key: 'gas-monthly',
    label: '월 가스',
    description: '가열로별 월 검침량과 일별 장입/투입 파일을 월별 호기 데이터로 변환합니다.',
    table: DB.tables.gasRecords,
    conflictKey: DB_CONFLICT_KEYS.gasRecords,
    defaultLayout: 'gas-monthly-wide',
    supportedLayouts: ['long', 'gas-monthly-wide', 'gas-charge-daily-wide'],
    fields: [
      { key: 'ym', label: '월', required: true, kind: 'date', preview: true },
      { key: 'furnace_code', label: '가열로', required: true, kind: 'text', preview: true },
      { key: 'charge_weight_kg', label: '장입량(kg)', required: false, kind: 'number', preview: true },
      { key: 'gas_usage', label: '가스사용량', required: true, kind: 'number', preview: true },
      { key: 'source', label: '출처', required: false, kind: 'enum', options: ['meter', 'bill', 'self'], preview: true },
      { key: 'order_no', label: '수주번호', required: false, kind: 'text', preview: false },
      { key: 'note', label: '비고', required: false, kind: 'text', preview: false },
    ],
    previewColumns: [
      { key: 'ym', label: '월' },
      { key: 'furnace_code', label: '가열로' },
      { key: 'charge_weight_kg', label: '장입량', align: 'right' },
      { key: 'gas_usage', label: '가스사용량', align: 'right' },
      { key: 'gas_unit', label: '원단위', align: 'right', derived: true },
      { key: 'status', label: '검증' },
    ],
  },
  production: {
    key: 'production',
    label: '생산 실적',
    description: '작업일·작업부서·수주번호·공정 기준의 일일 생산 실적을 저장합니다.',
    table: DB.tables.productionRecords,
    conflictKey: DB_CONFLICT_KEYS.productionRecords,
    defaultLayout: 'production-daily',
    supportedLayouts: ['long', 'production-daily', 'production-detail', 'production-summary', 'production-wide'],
    fields: [
      { key: 'work_date', label: '작업일', required: true, kind: 'date', preview: true },
      { key: 'dept_line', label: '작업부서/라인', required: true, kind: 'text', preview: true },
      { key: 'shift', label: '주야', required: false, kind: 'enum', options: ['day', 'night', 'both'], preview: true },
      { key: 'order_no', label: '수주번호', required: true, kind: 'text', preview: true },
      { key: 'process', label: '공정', required: true, kind: 'text', preview: true },
      { key: 'work_hours', label: '작업시간(h)', required: true, kind: 'number', preview: true },
      { key: 'work_count', label: '작업횟수', required: true, kind: 'number', preview: true },
      { key: 'product', label: '제품', required: false, kind: 'text', preview: true },
      { key: 'material', label: '재질', required: false, kind: 'text', preview: true },
      { key: 'order_size', label: '수주치수', required: false, kind: 'text', preview: false },
      { key: 'work_size', label: '작업치수', required: false, kind: 'text', preview: false },
      { key: 'order_weight', label: '수주중량', required: true, kind: 'number', preview: true },
      { key: 'charge_weight', label: '투입중량', required: true, kind: 'number', preview: true },
      { key: 'furnace_code', label: '가열로', required: true, kind: 'text', preview: true },
      { key: 'entered_by_name', label: '입력자', required: false, kind: 'text', preview: false },
      { key: 'note', label: '비고', required: false, kind: 'text', preview: false },
    ],
    previewColumns: [
      { key: 'work_date', label: '작업일' },
      { key: 'dept_line', label: '작업부서/라인' },
      { key: 'order_no', label: '수주번호' },
      { key: 'process', label: '공정' },
      { key: 'order_weight', label: '수주중량', align: 'right' },
      { key: 'charge_weight', label: '투입중량', align: 'right' },
      { key: 'work_hours', label: '작업시간', align: 'right' },
      { key: 'work_count', label: '작업횟수', align: 'right' },
      { key: 'ton_per_hour', label: '시간당생산량', align: 'right', derived: true },
      { key: 'ton_per_run', label: '1회당생산량', align: 'right', derived: true },
      { key: 'status', label: '검증' },
    ],
  },
  'gas-company-monthly': {
    key: 'gas-company-monthly',
    label: '전사 월별',
    description: '전사 월별 장입량/가스사용량을 long/wide 양식에서 처리합니다.',
    table: DB.tables.gasCompanyMonthly,
    conflictKey: DB_CONFLICT_KEYS.gasCompanyMonthly,
    defaultLayout: 'company-wide',
    supportedLayouts: ['long', 'company-wide'],
    fields: [
      { key: 'ym', label: '월', required: true, kind: 'date', preview: true },
      { key: 'charge_weight_kg', label: '장입량(kg)', required: false, kind: 'number', preview: true },
      { key: 'gas_usage', label: '가스사용량', required: true, kind: 'number', preview: true },
      { key: 'note', label: '비고', required: false, kind: 'text', preview: false },
    ],
    previewColumns: [
      { key: 'ym', label: '월' },
      { key: 'charge_weight_kg', label: '장입량', align: 'right' },
      { key: 'gas_usage', label: '가스사용량', align: 'right' },
      { key: 'gas_unit', label: '원단위', align: 'right', derived: true },
      { key: 'status', label: '검증' },
    ],
  },
  'line-output': {
    key: 'line-output',
    label: '생산량집계표',
    description: '일일/월별 라인×재질 집계표를 원본 형식 그대로 자동 인식합니다.',
    table: DB.tables.lineOutputDaily,
    conflictKey: DB_CONFLICT_KEYS.lineOutputDaily,
    defaultLayout: 'line-output-daily',
    supportedLayouts: ['line-output-daily', 'line-output-monthly'],
    fields: [],
    previewColumns: [
      { key: 'work_date', label: '일자' },
      { key: 'ym', label: '월' },
      { key: 'line_code', label: '라인/호기' },
      { key: 'line_label', label: '원본 라벨' },
      { key: 'plan_ton', label: '계획', align: 'right' },
      { key: 'actual_ton', label: '생산량', align: 'right' },
      { key: 'achievement_pct', label: '달성률', align: 'right', derived: true },
      { key: 'hwangji_ton', label: '황지', align: 'right' },
      { key: 'cogging_ton', label: 'COGGING', align: 'right' },
      { key: 'total_ton', label: '합계', align: 'right' },
      { key: 'work_count', label: '건수', align: 'right' },
      { key: 'status', label: '검증' },
    ],
  },
  'work-standards': {
    key: 'work-standards',
    label: '표준작업수',
    description: '부서·제품·재질·기준별 표준작업수를 등록합니다.',
    table: DB.tables.workStandards,
    conflictKey: DB_CONFLICT_KEYS.workStandards,
    defaultLayout: 'long',
    supportedLayouts: ['long'],
    fields: [
      { key: 'dept', label: '부서', required: true, kind: 'text', preview: true },
      { key: 'product', label: '제품', required: true, kind: 'text', preview: true },
      { key: 'material', label: '재질', required: true, kind: 'text', preview: true },
      { key: 'basis', label: '기준', required: true, kind: 'enum', options: ['charge', 'product'], preview: true },
      { key: 'min_ton', label: '최소투입중량', required: false, kind: 'number', preview: true },
      { key: 'max_ton', label: '최대투입중량', required: false, kind: 'number', preview: true },
      { key: 'order_size', label: '수주치수', required: false, kind: 'text', preview: true },
      { key: 'std_work_count', label: '표준작업수', required: true, kind: 'number', preview: true },
      { key: 'note', label: '비고', required: false, kind: 'text', preview: false },
    ],
    previewColumns: [
      { key: 'dept', label: '부서' },
      { key: 'product', label: '제품' },
      { key: 'material', label: '재질' },
      { key: 'basis', label: '기준' },
      { key: 'min_ton', label: '최소투입중량', align: 'right' },
      { key: 'max_ton', label: '최대투입중량', align: 'right' },
      { key: 'order_size', label: '수주치수' },
      { key: 'std_work_count', label: '표준작업수', align: 'right' },
      { key: 'status', label: '검증' },
    ],
  },
  targets: {
    key: 'targets',
    label: '연간 목표',
    description: '부서·연도·지표별 연간 목표값을 저장합니다.',
    table: DB.tables.targets,
    conflictKey: DB_CONFLICT_KEYS.targets,
    defaultLayout: 'long',
    supportedLayouts: ['long'],
    fields: [
      { key: 'year', label: '연도', required: true, kind: 'number', preview: true },
      { key: 'dept', label: '부서', required: true, kind: 'text', preview: true },
      { key: 'scope', label: 'scope', required: true, kind: 'enum', options: ['company', 'dept', 'line', 'furnace'], preview: true },
      { key: 'metric', label: '지표', required: true, kind: 'enum', options: ['gas_unit', 'ton_per_hour', 'output'], preview: true },
      { key: 'target_value', label: '목표값', required: true, kind: 'number', preview: true },
      { key: 'ref', label: '기준', required: false, kind: 'text', preview: false },
      { key: 'note', label: '비고', required: false, kind: 'text', preview: false },
    ],
    previewColumns: [
      { key: 'year', label: '연도', align: 'right' },
      { key: 'dept', label: '부서' },
      { key: 'scope', label: 'scope' },
      { key: 'metric', label: '지표' },
      { key: 'target_value', label: '목표값', align: 'right' },
      { key: 'status', label: '검증' },
    ],
  },
  'raw-material-specs': {
    key: 'raw-material-specs',
    label: '원소재 규격',
    description: '제품·재질별 원소재와 규격을 저장합니다.',
    table: DB.tables.rawMaterialSpecs,
    conflictKey: DB_CONFLICT_KEYS.rawMaterialSpecs,
    defaultLayout: 'long',
    supportedLayouts: ['long'],
    fields: [
      { key: 'product', label: '제품', required: true, kind: 'text', preview: true },
      { key: 'material', label: '재질', required: true, kind: 'text', preview: true },
      { key: 'raw_material', label: '원소재', required: true, kind: 'text', preview: true },
      { key: 'spec', label: '규격', required: true, kind: 'text', preview: true },
      { key: 'note', label: '비고', required: false, kind: 'text', preview: false },
    ],
    previewColumns: [
      { key: 'product', label: '제품' },
      { key: 'material', label: '재질' },
      { key: 'raw_material', label: '원소재' },
      { key: 'spec', label: '규격' },
      { key: 'status', label: '검증' },
    ],
  },
}

export const IMPORT_DATASET_OPTIONS = Object.values(IMPORT_DATASETS).map((dataset) => ({
  label: dataset.label,
  value: dataset.key,
  description: dataset.description,
}))

export function getImportDatasetSpec(datasetKey: ImportDatasetKey) {
  return IMPORT_DATASETS[datasetKey]
}
