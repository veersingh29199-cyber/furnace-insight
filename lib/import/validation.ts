import { z } from 'zod'

const positiveNum = z.coerce
  .number({ message: '숫자를 입력해 주세요' })
  .min(0, '0 이상의 값을 입력해 주세요')

const dateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'YYYY-MM-DD 형식이어야 합니다')
const monthString = z.string().regex(/^\d{4}-\d{2}-01$/, 'YYYY-MM-01 형식이어야 합니다')
const requiredText = z.string().trim().min(1, '필수 항목입니다')

export const importGasDailyRowSchema = z.object({
  date: dateString,
  furnace_code: requiredText,
  shift: z.enum(['day', 'night', 'both']).nullable().optional(),
  value: positiveNum,
  order_no: z.string().optional().nullable(),
  note: z.string().optional().nullable(),
})

export const importGasMonthlyRowSchema = z.object({
  ym: monthString,
  furnace_code: requiredText,
  charge_weight_kg: positiveNum.default(0),
  gas_usage: positiveNum,
  source: z.enum(['meter', 'bill', 'self']).default('meter'),
  order_no: z.string().optional().nullable(),
  note: z.string().optional().nullable(),
})

export const importProductionRowSchema = z.object({
  work_month: monthString,
  line_code: requiredText,
  product_name: z.string().optional().nullable(),
  shift: z.enum(['day', 'night', 'both']).nullable().optional(),
  plan_ton: positiveNum,
  actual_ton: positiveNum,
  hwangji_ton: positiveNum.default(0),
  cogging_ton: positiveNum.default(0),
  work_hours: positiveNum,
  work_count: z.coerce.number().int('정수를 입력해 주세요').min(0),
  order_no: z.string().optional().nullable(),
  note: z.string().optional().nullable(),
})

export const importGasCompanyMonthlyRowSchema = z.object({
  ym: monthString,
  charge_weight_kg: positiveNum.default(0),
  gas_usage: positiveNum,
  note: z.string().optional().nullable(),
})

export function parseZodIssues(error: z.ZodError) {
  return error.issues.map((issue) => issue.message)
}
