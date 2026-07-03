import type { SupabaseClient } from '@supabase/supabase-js'
import { DB, DB_CONFLICT_KEYS } from '@/types/db'
import type {
  GasCompanyMonthlyImportRow,
  GasDailyImportRow,
  GasMonthlyImportRow,
  ProductionImportRow,
} from '@/types/import'

export interface ImportSaveSummary {
  total: number
  saved: number
  failed: number
  errors: Array<{ rowIndex: number; message: string }>
}

function emptySummary(total: number): ImportSaveSummary {
  return { total, saved: 0, failed: 0, errors: [] }
}

async function upsertBatch<T extends Record<string, unknown>>(
  supabase: SupabaseClient,
  table: string,
  rows: T[],
  conflictKey: string
) {
  if (rows.length === 0) return { error: null as Error | null }
  const { error } = await supabase
    .from(table)
    .upsert(rows as never, { onConflict: conflictKey, ignoreDuplicates: false })
  return { error }
}

export async function saveGasDailyImports(
  supabase: SupabaseClient,
  rows: GasDailyImportRow[],
  meta: { userId: string | null; enteredByName: string | null; enteredByShift: string | null }
): Promise<ImportSaveSummary> {
  const summary = emptySummary(rows.length)
  const payload = rows.map((row) => ({
    date: row.date,
    furnace_code: row.furnace_code,
    shift: row.shift,
    value: row.value,
    order_no: row.order_no ?? null,
    created_by: meta.userId,
    entered_by_name: meta.enteredByName,
    entered_by_shift: meta.enteredByShift,
  }))

  const { error } = await upsertBatch(supabase, DB.tables.gasDailyReadings, payload, DB_CONFLICT_KEYS.gasDailyReadings)
  if (error) {
    summary.failed = rows.length
    summary.errors.push({ rowIndex: 0, message: error.message })
    return summary
  }

  summary.saved = rows.length
  return summary
}

export async function saveGasMonthlyImports(
  supabase: SupabaseClient,
  rows: GasMonthlyImportRow[],
  meta: { userId: string | null; enteredByName: string | null; enteredByShift: string | null }
): Promise<ImportSaveSummary> {
  const summary = emptySummary(rows.length)
  const payload = rows.map((row) => ({
    ym: row.ym,
    furnace_code: row.furnace_code,
    charge_weight_kg: row.charge_weight_kg,
    gas_usage: row.gas_usage,
    source: row.source,
    order_no: row.order_no ?? null,
    note: row.note ?? null,
    created_by: meta.userId,
    entered_by_name: meta.enteredByName,
    entered_by_shift: meta.enteredByShift,
  }))

  const { error } = await upsertBatch(supabase, DB.tables.gasRecords, payload, DB_CONFLICT_KEYS.gasRecords)
  if (error) {
    summary.failed = rows.length
    summary.errors.push({ rowIndex: 0, message: error.message })
    return summary
  }

  summary.saved = rows.length
  return summary
}

export async function saveProductionImports(
  supabase: SupabaseClient,
  rows: ProductionImportRow[],
  meta: { userId: string | null; enteredByName: string | null; enteredByShift: string | null }
): Promise<ImportSaveSummary> {
  const summary = emptySummary(rows.length)

  const withProduct = rows.filter((row) => row.product_name != null && String(row.product_name).trim() !== '')
  const withoutProduct = rows.filter((row) => row.product_name == null || String(row.product_name).trim() === '')

  if (withProduct.length > 0) {
    const payload = withProduct.map((row) => ({
      work_month: row.work_month,
      line_code: row.line_code,
      product_name: row.product_name,
      shift: row.shift,
      plan_ton: row.plan_ton,
      actual_ton: row.actual_ton,
      hwangji_ton: row.hwangji_ton,
      cogging_ton: row.cogging_ton,
      work_hours: row.work_hours,
      work_count: row.work_count,
      order_no: row.order_no ?? null,
      note: row.note ?? null,
      created_by: meta.userId,
      updated_by: meta.userId,
      entered_by_name: meta.enteredByName,
      entered_by_shift: meta.enteredByShift,
      updated_at: new Date().toISOString(),
    }))

    const { error } = await upsertBatch(supabase, DB.tables.productionRecords, payload, DB_CONFLICT_KEYS.productionRecords)
    if (error) {
      summary.failed += withProduct.length
      summary.errors.push({ rowIndex: 0, message: error.message })
    } else {
      summary.saved += withProduct.length
    }
  }

  for (const row of withoutProduct) {
    const payload = {
      work_month: row.work_month,
      line_code: row.line_code,
      product_name: null,
      shift: row.shift,
      plan_ton: row.plan_ton,
      actual_ton: row.actual_ton,
      hwangji_ton: row.hwangji_ton,
      cogging_ton: row.cogging_ton,
      work_hours: row.work_hours,
      work_count: row.work_count,
      order_no: row.order_no ?? null,
      note: row.note ?? null,
      created_by: meta.userId,
      updated_by: meta.userId,
      entered_by_name: meta.enteredByName,
      entered_by_shift: meta.enteredByShift,
      updated_at: new Date().toISOString(),
    }

    const existingQuery = supabase
      .from(DB.tables.productionRecords)
      .select('work_month,line_code,product_name,shift')
      .eq('work_month', row.work_month)
      .eq('line_code', row.line_code)
      .is('product_name', null)

    if (row.shift == null) {
      existingQuery.is('shift', null)
    } else {
      existingQuery.eq('shift', row.shift)
    }

    const { data: existingRows, error: existingError } = await existingQuery.limit(1)
    const existing = existingRows?.[0] ?? null
    if (existingError) {
      summary.failed += 1
      summary.errors.push({ rowIndex: 0, message: existingError.message })
      continue
    }

    if (existing) {
      const updateQuery = supabase
        .from(DB.tables.productionRecords)
        .update(payload)
        .eq('work_month', row.work_month)
        .eq('line_code', row.line_code)
        .is('product_name', null)

      if (row.shift == null) {
        updateQuery.is('shift', null)
      } else {
        updateQuery.eq('shift', row.shift)
      }

      const { error } = await updateQuery
      if (error) {
        summary.failed += 1
        summary.errors.push({ rowIndex: 0, message: error.message })
      } else {
        summary.saved += 1
      }
      continue
    }

    const { error } = await supabase.from(DB.tables.productionRecords).insert(payload)
    if (error) {
      summary.failed += 1
      summary.errors.push({ rowIndex: 0, message: error.message })
    } else {
      summary.saved += 1
    }
  }

  return summary
}

export async function saveGasCompanyMonthlyImports(
  supabase: SupabaseClient,
  rows: GasCompanyMonthlyImportRow[],
  meta: { userId: string | null }
): Promise<ImportSaveSummary> {
  const summary = emptySummary(rows.length)
  const payload = rows.map((row) => ({
    ym: row.ym,
    charge_weight_kg: row.charge_weight_kg,
    gas_usage: row.gas_usage,
    created_by: meta.userId,
  }))

  const { error } = await upsertBatch(supabase, DB.tables.gasCompanyMonthly, payload, DB_CONFLICT_KEYS.gasCompanyMonthly)
  if (error) {
    summary.failed = rows.length
    summary.errors.push({ rowIndex: 0, message: error.message })
    return summary
  }

  summary.saved = rows.length
  return summary
}
