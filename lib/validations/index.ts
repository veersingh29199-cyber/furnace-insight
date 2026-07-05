import { z } from 'zod'

const positiveNum = z.coerce
  .number({ message: '숫자를 입력해 주세요.' })
  .min(0, '0 이상 값을 입력해 주세요.')

const requiredPositiveNum = z.coerce
  .number({ message: '숫자를 입력해 주세요.' })
  .gt(0, '0보다 큰 값을 입력해 주세요.')

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
  order_weight: requiredPositiveNum,
  charge_weight: requiredPositiveNum,
  furnace_code: requiredText,
  work_hours: requiredPositiveNum,
  work_count: z.coerce.number().int('정수를 입력해 주세요.').min(1, '1 이상 값을 입력해 주세요.'),
  entered_by_name: z.string().trim().nullable().optional(),
  note: z.string().trim().nullable().optional(),
})

export type ProductionRecordInput = z.infer<typeof productionRecordSchema>

export const gasRecordSchema = z.object({
  ym: monthString,
  furnace_code: requiredText,
  order_no: z.string().trim().nullable().optional(),
  charge_weight_kg: requiredPositiveNum,
  gas_usage: requiredPositiveNum,
  source: z.enum(['meter', 'bill', 'self']),
  note: z.string().trim().nullable().optional(),
})

export type GasRecordInput = z.infer<typeof gasRecordSchema>

export const gasDailyReadingSchema = z.object({
  date: dateString,
  furnace_code: requiredText,
  order_no: z.string().trim().nullable().optional(),
  shift: z.enum(['day', 'night', 'both']).nullable().optional(),
  value: requiredPositiveNum,
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
  year: z.coerce.number().int('연도는 정수여야 합니다.').min(2000).max(2100),
  dept: requiredText,
  scope: z.enum(['line', 'furnace', 'dept', 'company']),
  ref: z.string().trim().min(1).optional().nullable(),
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
  dept: z.string().trim().nullable().optional(),
  group_line_id: z.string().nullable().optional(),
  active: z.boolean().default(true),
})

export type FurnaceInput = z.infer<typeof furnaceSchema>

export const workStandardSchema = z.object({
  dept: requiredText,
  product: requiredText,
  material: requiredText,
  basis: z.enum(['charge', 'product']),
  min_ton: z.coerce.number().min(0).nullable().optional(),
  max_ton: z.coerce.number().min(0).nullable().optional(),
  order_size: z.string().trim().nullable().optional(),
  std_work_count: z.coerce.number().int('표준작업수는 정수여야 합니다.').min(0),
  note: z.string().trim().nullable().optional(),
})

export type WorkStandardInput = z.infer<typeof workStandardSchema>

export const rawMaterialSpecSchema = z.object({
  product: requiredText,
  material: requiredText,
  raw_material: requiredText,
  spec: requiredText,
  note: z.string().trim().nullable().optional(),
})

export type RawMaterialSpecInput = z.infer<typeof rawMaterialSpecSchema>

export const appSettingSchema = z.object({
  key: requiredText,
  value: z.union([z.string(), z.number(), z.boolean(), z.record(z.string(), z.unknown()), z.null()]),
  note: z.string().trim().nullable().optional(),
})

export type AppSettingInput = z.infer<typeof appSettingSchema>

export const importTargetSchema = z.object({
  year: z.coerce.number().int().min(2000).max(2100),
  dept: requiredText,
  scope: z.enum(['line', 'furnace', 'dept', 'company']),
  ref: z.string().trim().min(1).nullable().optional(),
  metric: z.enum(['gas_unit', 'ton_per_hour', 'output']),
  target_value: positiveNum,
  note: z.string().trim().nullable().optional(),
})

export const importWorkStandardSchema = z.object({
  dept: requiredText,
  product: requiredText,
  material: requiredText,
  basis: z.enum(['charge', 'product']),
  min_ton: z.coerce.number().min(0).nullable().optional(),
  max_ton: z.coerce.number().min(0).nullable().optional(),
  order_size: z.string().trim().nullable().optional(),
  std_work_count: z.coerce.number().int().min(0),
  note: z.string().trim().nullable().optional(),
})

export const importRawMaterialSpecSchema = z.object({
  product: requiredText,
  material: requiredText,
  raw_material: requiredText,
  spec: requiredText,
  note: z.string().trim().nullable().optional(),
})
