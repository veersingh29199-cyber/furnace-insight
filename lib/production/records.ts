import type { ProductionRecord } from '@/types'
import { calcAchievementRate, calcTonPerHour } from '@/lib/utils'

type ProductionLike = Partial<ProductionRecord>

type ProductionTotals = {
  orderWeight: number
  chargeWeight: number
  workHours: number
  workCount: number
}

function numberOrNull(value: unknown) {
  const parsed = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function textOrNull(value: unknown) {
  if (value == null) return null
  const text = String(value).trim()
  return text ? text : null
}

export function getProductionWorkDate(record: ProductionLike) {
  return textOrNull(record.work_date) ?? textOrNull(record.work_month)
}

export function getProductionDeptLine(record: ProductionLike) {
  return textOrNull(record.dept_line) ?? textOrNull(record.line_code)
}

export function getProductionOrderNo(record: ProductionLike) {
  return textOrNull(record.order_no)
}

export function getProductionProduct(record: ProductionLike) {
  return textOrNull(record.product) ?? textOrNull(record.product_name)
}

export function getProductionMaterial(record: ProductionLike) {
  return textOrNull(record.material)
}

export function getProductionProcess(record: ProductionLike) {
  return textOrNull(record.process)
}

export function getProductionFurnaceCode(record: ProductionLike) {
  return textOrNull(record.furnace_code)
}

export function getProductionOrderWeight(record: ProductionLike) {
  return (
    numberOrNull(record.order_weight) ??
    numberOrNull(record.actual_ton) ??
    numberOrNull(record.plan_ton) ??
    0
  )
}

export function getProductionChargeWeight(record: ProductionLike) {
  return numberOrNull(record.charge_weight) ?? numberOrNull(record.hwangji_ton) ?? 0
}

export function getProductionWorkHours(record: ProductionLike) {
  return numberOrNull(record.work_hours) ?? 0
}

export function getProductionWorkCount(record: ProductionLike) {
  return Math.max(0, Math.trunc(numberOrNull(record.work_count) ?? 0))
}

export function getProductionTonPerHour(record: ProductionLike) {
  const stored = numberOrNull(record.ton_per_hour)
  if (stored != null) return stored
  return calcTonPerHour(getProductionOrderWeight(record), getProductionWorkHours(record))
}

export function getProductionTonPerRun(record: ProductionLike) {
  const stored = numberOrNull(record.ton_per_run)
  if (stored != null) return stored
  const runs = getProductionWorkCount(record)
  if (runs <= 0) return null
  return getProductionOrderWeight(record) / runs
}

export function getProductionAchievementRate(totalOrderWeight: number, targetWeight: number | null | undefined) {
  if (!targetWeight || targetWeight <= 0) return null
  return calcAchievementRate(totalOrderWeight, targetWeight)
}

export function sumProduction(values: Array<ProductionLike>) {
  return values.reduce<ProductionTotals>(
    (acc, record) => {
      acc.orderWeight += getProductionOrderWeight(record)
      acc.chargeWeight += getProductionChargeWeight(record)
      acc.workHours += getProductionWorkHours(record)
      acc.workCount += getProductionWorkCount(record)
      return acc
    },
    {
      orderWeight: 0,
      chargeWeight: 0,
      workHours: 0,
      workCount: 0,
    }
  )
}
