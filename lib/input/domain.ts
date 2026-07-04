import type { GasSource, Shift } from '@/types'
import { createInputId, monthDateForDay, daysInMonth } from '@/lib/input/common'
import { currentDateString } from '@/lib/utils'

export interface ProductionGridRow {
  id: string
  work_date: string
  dept_line: string | null
  shift: Shift | null
  order_no: string
  product: string | null
  material: string | null
  process: string
  order_size: string
  work_size: string
  order_weight: number | null
  charge_weight: number | null
  furnace_code: string | null
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

export function createBlankProductionRow(workDate = currentDateString()): ProductionGridRow {
  return {
    id: createInputId('production'),
    work_date: workDate,
    dept_line: null,
    shift: 'day',
    order_no: '',
    product: null,
    material: null,
    process: '',
    order_size: '',
    work_size: '',
    order_weight: null,
    charge_weight: null,
    furnace_code: null,
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
