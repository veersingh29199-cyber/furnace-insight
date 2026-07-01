import { z } from 'zod'

// ─────────────────────────────────────────────
// 공통 검증 규칙
// ─────────────────────────────────────────────
const positiveNum = z.coerce
  .number({ message: '숫자를 입력해 주세요' })
  .min(0, '0 이상의 값을 입력해 주세요')

const requiredText = z.string().min(1, '필수 항목입니다')

// ─────────────────────────────────────────────
// 생산 실적 입력 폼
// ─────────────────────────────────────────────
export const productionRecordSchema = z.object({
  work_month:         z.string().regex(/^\d{4}-\d{2}-01$/, 'YYYY-MM-01 형식이어야 합니다'),
  line_id:            requiredText,
  product_id:         z.string().optional().nullable(),
  shift:              z.enum(['day', 'night', 'both']).optional().nullable(),
  plan_ton:           positiveNum,
  actual_ton:         positiveNum,
  hwangji_ton:        positiveNum.default(0),
  cogging_ton:        positiveNum.default(0),
  rework_self_ton:    positiveNum.default(0),
  rework_quality_ton: positiveNum.default(0),
  work_hours:         positiveNum,
  work_count:         z.coerce.number().int('정수를 입력해 주세요').min(0),
  note:               z.string().optional().nullable(),
})

export type ProductionRecordInput = z.infer<typeof productionRecordSchema>

// ─────────────────────────────────────────────
// 가열로 월 검침 입력 폼
// ─────────────────────────────────────────────
export const gasRecordSchema = z.object({
  ym:               z.string().regex(/^\d{4}-\d{2}-01$/, 'YYYY-MM-01 형식이어야 합니다'),
  furnace_id:       requiredText,
  charge_weight_kg: positiveNum,
  gas_usage:        positiveNum,
  source:           z.enum(['meter', 'bill', 'self']),
  note:             z.string().optional().nullable(),
})

export type GasRecordInput = z.infer<typeof gasRecordSchema>

// ─────────────────────────────────────────────
// 일별 자체 검침 입력 폼
// ─────────────────────────────────────────────
export const gasDailyReadingSchema = z.object({
  date:       z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'YYYY-MM-DD 형식이어야 합니다'),
  furnace_id: requiredText,
  shift:      z.enum(['day', 'night', 'both']),
  value:      positiveNum,
})

export type GasDailyReadingInput = z.infer<typeof gasDailyReadingSchema>

// ─────────────────────────────────────────────
// 제품 마스터 폼
// ─────────────────────────────────────────────
export const productSchema = z.object({
  name:             requiredText,
  material:         requiredText,
  std_ton_per_hour: z.coerce.number().min(0).optional().nullable(),
  std_gas_unit:     z.coerce.number().min(0).optional().nullable(),
  active:           z.boolean().default(true),
})

export type ProductInput = z.infer<typeof productSchema>

// ─────────────────────────────────────────────
// 목표 설정 폼
// ─────────────────────────────────────────────
export const targetSchema = z.object({
  year:         z.coerce.number().int().min(2000).max(2100),
  scope:        z.enum(['line', 'furnace', 'company']),
  ref_id:       z.string().optional().nullable(),
  metric:       z.enum(['gas_unit', 'ton_per_hour', 'output']),
  target_value: positiveNum,
  note:         z.string().optional().nullable(),
})

export type TargetInput = z.infer<typeof targetSchema>

// ─────────────────────────────────────────────
// 벤치마크 폼
// ─────────────────────────────────────────────
export const benchmarkSchema = z.object({
  org:              z.enum(['두산', '태상', '태웅']),
  metric:           z.enum(['gas_unit', 'ton_per_hour', 'output']),
  product_or_scope: requiredText,
  value:            positiveNum,
  year:             z.coerce.number().int().min(2000).max(2100),
})

export type BenchmarkInput = z.infer<typeof benchmarkSchema>

// ─────────────────────────────────────────────
// 라인 마스터 폼
// ─────────────────────────────────────────────
export const lineSchema = z.object({
  code:           requiredText,
  name:           requiredText,
  capacity_class: z.enum(['5000', '15000', 'ringmill']),
  active:         z.boolean().default(true),
})

export type LineInput = z.infer<typeof lineSchema>

// ─────────────────────────────────────────────
// 가열로 마스터 폼
// ─────────────────────────────────────────────
export const furnaceSchema = z.object({
  code:          requiredText,
  name:          requiredText,
  group_line_id: z.string().optional().nullable(),
  active:        z.boolean().default(true),
})

export type FurnaceInput = z.infer<typeof furnaceSchema>
