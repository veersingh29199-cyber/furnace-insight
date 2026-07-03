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
}

export const IMPORT_DATASET_OPTIONS = Object.values(IMPORT_DATASETS).map((dataset) => ({
  label: dataset.label,
  value: dataset.key,
  description: dataset.description,
}))

export function getImportDatasetSpec(datasetKey: ImportDatasetKey) {
  return IMPORT_DATASETS[datasetKey]
}
