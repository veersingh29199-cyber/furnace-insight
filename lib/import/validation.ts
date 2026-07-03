import { z } from 'zod'

const positiveNum = z.coerce
  .number({ message: '숫자를 입력해 주세요.' })
  .min(0, '0 이상 값을 입력해 주세요.')

const requiredText = z.string().trim().min(1, '필수 항목입니다.')
const dateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'YYYY-MM-DD 형식이어야 합니다.')
const monthString = z.string().regex(/^\d{4}-\d{2}-01$/, 'YYYY-MM-01 형식이어야 합니다.')

export const importGasDailyRowSchema = z.object({
  date: dateString,
  furnace_code: requiredText,
  shift: z.enum(['day', 'night', 'both']).nullable().optional(),
  value: positiveNum,
  order_no: z.string().trim().nullable().optional(),
  note: z.string().trim().nullable().optional(),
})

export const importGasMonthlyRowSchema = z.object({
  ym: monthString,
  furnace_code: requiredText,
  charge_weight_kg: positiveNum.default(0),
  gas_usage: positiveNum,
  source: z.enum(['meter', 'bill', 'self']).default('meter'),
  order_no: z.string().trim().nullable().optional(),
  note: z.string().trim().nullable().optional(),
})

const importProductionInputSchema = z.object({
  work_date: dateString.optional(),
  work_month: monthString.optional(),
  dept_line: z.string().trim().optional(),
  line_code: z.string().trim().optional(),
  shift: z.enum(['day', 'night', 'both']).nullable().optional(),
  order_no: z.string().trim().optional(),
  product: z.string().trim().nullable().optional(),
  product_name: z.string().trim().nullable().optional(),
  material: z.string().trim().nullable().optional(),
  process: z.string().trim().optional(),
  order_size: z.string().trim().nullable().optional(),
  work_size: z.string().trim().nullable().optional(),
  order_weight: positiveNum.optional(),
  charge_weight: positiveNum.optional(),
  furnace_code: z.string().trim().optional(),
  work_hours: positiveNum.optional(),
  work_count: z.coerce.number().int('정수를 입력해 주세요.').min(0).optional(),
  ton_per_hour: z.coerce.number().min(0).nullable().optional(),
  ton_per_run: z.coerce.number().min(0).nullable().optional(),
  entered_by_name: z.string().trim().nullable().optional(),
  note: z.string().trim().nullable().optional(),
  plan_ton: z.coerce.number().min(0).nullable().optional(),
  actual_ton: z.coerce.number().min(0).nullable().optional(),
  hwangji_ton: z.coerce.number().min(0).nullable().optional(),
  cogging_ton: z.coerce.number().min(0).nullable().optional(),
  rework_self_ton: z.coerce.number().min(0).nullable().optional(),
  rework_quality_ton: z.coerce.number().min(0).nullable().optional(),
})

export const importProductionRowSchema = importProductionInputSchema.transform((value) => ({
  work_date: value.work_date ?? value.work_month ?? '',
  dept_line: value.dept_line ?? value.line_code ?? '',
  shift: value.shift ?? null,
  order_no: value.order_no ?? null,
  product: value.product ?? value.product_name ?? null,
  material: value.material ?? null,
  process: value.process ?? '기본',
  order_size: value.order_size ?? null,
  work_size: value.work_size ?? null,
  order_weight: value.order_weight ?? value.actual_ton ?? value.plan_ton ?? 0,
  charge_weight: value.charge_weight ?? value.hwangji_ton ?? value.cogging_ton ?? 0,
  furnace_code: value.furnace_code ?? '',
  work_hours: value.work_hours ?? 0,
  work_count: value.work_count ?? 0,
  ton_per_hour: value.ton_per_hour ?? null,
  ton_per_run: value.ton_per_run ?? null,
  entered_by_name: value.entered_by_name ?? null,
  note: value.note ?? null,
  work_month: value.work_month ?? null,
  line_code: value.line_code ?? null,
  product_name: value.product_name ?? null,
  plan_ton: value.plan_ton ?? 0,
  actual_ton: value.actual_ton ?? 0,
  hwangji_ton: value.hwangji_ton ?? 0,
  cogging_ton: value.cogging_ton ?? 0,
  rework_self_ton: value.rework_self_ton ?? 0,
  rework_quality_ton: value.rework_quality_ton ?? 0,
}))

export const importGasCompanyMonthlyRowSchema = z.object({
  ym: monthString,
  charge_weight_kg: positiveNum.default(0),
  gas_usage: positiveNum,
  note: z.string().trim().nullable().optional(),
})

export function parseZodIssues(error: z.ZodError) {
  return error.issues.map((issue) => issue.message)
}

export { importRawMaterialSpecSchema, importTargetSchema, importWorkStandardSchema } from '@/lib/validations'
