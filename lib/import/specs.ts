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
    description: '일자 × 호기 그리드와 long/CSV 형식을 모두 흡수합니다.',
    table: DB.tables.gasDailyReadings,
    conflictKey: DB_CONFLICT_KEYS.gasDailyReadings,
    defaultLayout: 'gas-daily-wide',
    supportedLayouts: ['long', 'gas-daily-wide'],
    fields: [
      { key: 'date', label: '일자', required: true, kind: 'date', preview: true },
      { key: 'furnace_code', label: '호기', required: true, kind: 'text', preview: true },
      { key: 'shift', label: '교대', required: false, kind: 'enum', options: ['day', 'night', 'both'], preview: true },
      { key: 'value', label: '검침값', required: true, kind: 'number', preview: true },
      { key: 'order_no', label: '수주번호', required: false, kind: 'text', preview: false },
      { key: 'note', label: '비고', required: false, kind: 'text', preview: false },
    ],
    previewColumns: [
      { key: 'date', label: '일자' },
      { key: 'furnace_code', label: '호기' },
      { key: 'shift', label: '교대' },
      { key: 'value', label: '검침값', align: 'right' },
      { key: 'status', label: '검증' },
    ],
  },
  'gas-monthly': {
    key: 'gas-monthly',
    label: '월 가스',
    description: '호기별 월 검침과 장입량을 long/wide 형식에서 변환합니다.',
    table: DB.tables.gasRecords,
    conflictKey: DB_CONFLICT_KEYS.gasRecords,
    defaultLayout: 'gas-monthly-wide',
    supportedLayouts: ['long', 'gas-monthly-wide'],
    fields: [
      { key: 'ym', label: '월', required: true, kind: 'date', preview: true },
      { key: 'furnace_code', label: '호기', required: true, kind: 'text', preview: true },
      { key: 'charge_weight_kg', label: '장입량(kg)', required: false, kind: 'number', preview: true },
      { key: 'gas_usage', label: '가스사용량', required: true, kind: 'number', preview: true },
      { key: 'source', label: '출처', required: false, kind: 'enum', options: ['meter', 'bill', 'self'], preview: true },
      { key: 'order_no', label: '수주번호', required: false, kind: 'text', preview: false },
      { key: 'note', label: '비고', required: false, kind: 'text', preview: false },
    ],
    previewColumns: [
      { key: 'ym', label: '월' },
      { key: 'furnace_code', label: '호기' },
      { key: 'charge_weight_kg', label: '장입량', align: 'right' },
      { key: 'gas_usage', label: '가스사용량', align: 'right' },
      { key: 'gas_unit', label: '원단위', align: 'right', derived: true },
      { key: 'status', label: '검증' },
    ],
  },
  production: {
    key: 'production',
    label: '생산 실적',
    description: '라인/제품/교대와 월별 목표·실적, 그리고 상세 원장 파일을 자동 적재합니다.',
    table: DB.tables.productionRecords,
    conflictKey: DB_CONFLICT_KEYS.productionRecords,
    defaultLayout: 'production-wide',
    supportedLayouts: ['long', 'production-wide', 'production-detail'],
    fields: [
      { key: 'work_month', label: '작업월', required: true, kind: 'date', help: '상세 파일의 작업일을 넣어도 월(YYYY-MM-01)로 자동 변환됩니다.', preview: true },
      { key: 'line_code', label: '라인', required: true, kind: 'text', preview: true },
      { key: 'product_name', label: '제품', required: false, kind: 'text', help: '상세 파일에서는 소재품명을 우선 사용합니다.', preview: true },
      { key: 'shift', label: '교대', required: false, kind: 'enum', options: ['day', 'night', 'both'], preview: true },
      { key: 'plan_ton', label: '계획(톤)', required: true, kind: 'number', preview: true },
      { key: 'actual_ton', label: '실적(톤)', required: true, kind: 'number', help: '상세 파일의 생산중량(양품) kg를 톤으로 변환해 저장합니다.', preview: true },
      { key: 'hwangji_ton', label: '황지(톤)', required: false, kind: 'number', preview: true },
      { key: 'cogging_ton', label: 'COGGING(톤)', required: false, kind: 'number', preview: true },
      { key: 'work_hours', label: '작업시간(h)', required: true, kind: 'number', preview: true },
      { key: 'work_count', label: '작업횟수', required: true, kind: 'number', help: '상세 파일에서는 실적 수량을 합산해 저장합니다.', preview: true },
      { key: 'order_no', label: '수주번호', required: false, kind: 'text', preview: false },
      { key: 'note', label: '비고', required: false, kind: 'text', preview: false },
    ],
    previewColumns: [
      { key: 'work_month', label: '작업월' },
      { key: 'line_code', label: '라인' },
      { key: 'product_name', label: '제품' },
      { key: 'shift', label: '교대' },
      { key: 'plan_ton', label: '계획', align: 'right' },
      { key: 'actual_ton', label: '실적', align: 'right' },
      { key: 'work_count', label: '작업횟수', align: 'right' },
      { key: 'ton_per_hour', label: 'TPH', align: 'right', derived: true },
      { key: 'achieve_pct', label: '달성률', align: 'right', derived: true },
      { key: 'status', label: '검증' },
    ],
  },
  'gas-company-monthly': {
    key: 'gas-company-monthly',
    label: '전사 월별',
    description: '전사 월별 장입량/가스사용량을 long/wide 양식에서 적재합니다.',
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
