import type { GasSource, Shift } from '@/types'
import { createInputId, monthDateForDay, daysInMonth } from '@/lib/input/common'

export interface ProductionGridRow {
  id: string
  line_code: string | null
  product_name: string | null
  shift: Shift | null
  order_no: string
  plan_ton: number | null
  actual_ton: number | null
  hwangji_ton: number | null
  cogging_ton: number | null
  rework_self_ton: number | null
  rework_quality_ton: number | null
  work_hours: number | null
  work_count: number | null
  note: string
}

export interface GasMonthlyGridRow {
  id: string
  furnace_code: string | null
  order_no: string
  charge_weight_kg: number | null
  gas_usage: number | null
  source: GasSource
  note: string
}

export interface DailyGasGridRow {
  id: string
  day: number
  date: string
  shift: Shift
  order_no: string
  [key: string]: string | number | null
}

export function createBlankProductionRow(): ProductionGridRow {
  return {
    id: createInputId('production'),
    line_code: null,
    product_name: null,
    shift: 'both',
    order_no: '',
    plan_ton: null,
    actual_ton: null,
    hwangji_ton: null,
    cogging_ton: null,
    rework_self_ton: null,
    rework_quality_ton: null,
    work_hours: null,
    work_count: null,
    note: '',
  }
}

export function createBlankGasMonthlyRow(): GasMonthlyGridRow {
  return {
    id: createInputId('gas-monthly'),
    furnace_code: null,
    order_no: '',
    charge_weight_kg: null,
    gas_usage: null,
    source: 'meter',
    note: '',
  }
}

export function createBlankDailyGasRows(ym: string, furnaceIds: string[]) {
  const totalDays = daysInMonth(ym)

  return Array.from({ length: totalDays }, (_, index) => {
    const day = index + 1
    const row: DailyGasGridRow = {
      id: createInputId('gas-daily'),
      day,
      date: monthDateForDay(ym, day),
      shift: 'day',
      order_no: '',
    }

    furnaceIds.forEach((code) => {
      row[code] = null
    })

    return row
  })
}

export function cloneDailyRowsForMonth(
  ym: string,
  furnaceIds: string[],
  rows: Array<Partial<DailyGasGridRow> & Record<string, string | number | null | undefined>>
) {
  const nextRows = createBlankDailyGasRows(ym, furnaceIds)
  rows.forEach((row) => {
    const day = Number(row.day)
    const target = nextRows.find((item) => item.day === day)
    if (!target) return

    if (row.shift === 'day' || row.shift === 'night' || row.shift === 'both') {
      target.shift = row.shift
    }
    if (typeof row.order_no === 'string') {
      target.order_no = row.order_no
    }

    furnaceIds.forEach((code) => {
      const value = row[code]
      target[code] = typeof value === 'number' && Number.isFinite(value) ? value : null
    })
  })

  return nextRows
}
