import { z } from 'zod'

const positiveNum = z.coerce
  .number({ message: '숫자를 입력해 주세요.' })
  .min(0, '0 이상 값을 입력해 주세요.')

const requiredText = z.string().trim().min(1, '필수 항목입니다.')
const dateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'YYYY-MM-DD 형식이어야 합니다.')
const monthString = z.string().regex(/^\d{4}-\d{2}-01$/, 'YYYY-MM-01 형식이어야 합니다.')

export const productionRecordSchema = z.object({
  work_date: dateString,
  dept_line: requiredText,
  shift: z.enum(['day', 'night', 'both']).nullable().optional(),
  order_no: requiredText,
  product: z.string().trim().nullable().optional(),
  material: z.string().trim().nullable().optional(),
  process: requiredText,
  order_size: z.string().trim().nullable().optional(),
  work_size: z.string().trim().nullable().optional(),
  order_weight: positiveNum,
  charge_weight: positiveNum,
  furnace_code: requiredText,
  work_hours: positiveNum,
  work_count: z.coerce.number().int('정수를 입력해 주세요.').min(0, '0 이상 값을 입력해 주세요.'),
  entered_by_name: z.string().trim().nullable().optional(),
  note: z.string().trim().nullable().optional(),
})

export type ProductionRecordInput = z.infer<typeof productionRecordSchema>

export const gasRecordSchema = z.object({
  ym: monthString,
  furnace_code: requiredText,
  order_no: z.string().trim().nullable().optional(),
  charge_weight_kg: positiveNum,
  gas_usage: positiveNum,
  source: z.enum(['meter', 'bill', 'self']),
  note: z.string().trim().nullable().optional(),
})

export type GasRecordInput = z.infer<typeof gasRecordSchema>

export const gasDailyReadingSchema = z.object({
  date: dateString,
  furnace_code: requiredText,
  order_no: z.string().trim().nullable().optional(),
  shift: z.enum(['day', 'night', 'both']).nullable().optional(),
  value: positiveNum,
})

export type GasDailyReadingInput = z.infer<typeof gasDailyReadingSchema>

export const productSchema = z.object({
  name: requiredText,
  material: requiredText,
  std_ton_per_hour: z.coerce.number().min(0).nullable().optional(),
  std_gas_unit: z.coerce.number().min(0).nullable().optional(),
  active: z.boolean().default(true),
})

export type ProductInput = z.infer<typeof productSchema>

export const targetSchema = z.object({
  scope: z.enum(['line', 'furnace', 'company']),
  ref: requiredText,
  metric: z.enum(['gas_unit', 'ton_per_hour', 'output']),
  target_value: positiveNum,
  note: z.string().trim().nullable().optional(),
})

export type TargetInput = z.infer<typeof targetSchema>

export const benchmarkSchema = z.object({
  org: z.enum(['두산', '태상', '태웅']),
  metric: z.enum(['gas_unit', 'ton_per_hour', 'output']),
  scope: requiredText,
  value: positiveNum,
})

export type BenchmarkInput = z.infer<typeof benchmarkSchema>

export const lineSchema = z.object({
  code: requiredText,
  name: requiredText,
  capacity_class: z.enum(['5000', '15000', 'ringmill']),
  active: z.boolean().default(true),
})

export type LineInput = z.infer<typeof lineSchema>

export const furnaceSchema = z.object({
  code: requiredText,
  name: requiredText,
  group_line_id: z.string().nullable().optional(),
  active: z.boolean().default(true),
})

export type FurnaceInput = z.infer<typeof furnaceSchema>
