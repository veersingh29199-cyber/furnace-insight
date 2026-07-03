import type { SupabaseClient } from '@supabase/supabase-js'
import { DB, DB_CONFLICT_KEYS } from '@/types/db'
import type {
  GasCompanyMonthlyImportRow,
  GasDailyImportRow,
  GasMonthlyImportRow,
  RawMaterialSpecImportRow,
  TargetImportRow,
  ProductionImportRow,
  WorkStandardImportRow,
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

async function upsertBatch<T extends object>(
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

  const payload = rows.map((row) => ({
    work_date: row.work_date,
    dept_line: row.dept_line,
    shift: row.shift,
    order_no: row.order_no,
    product: row.product ?? row.product_name ?? null,
    material: row.material ?? null,
    process: row.process,
    order_size: row.order_size ?? null,
    work_size: row.work_size ?? null,
    order_weight: row.order_weight,
    charge_weight: row.charge_weight,
    furnace_code: row.furnace_code,
    work_hours: row.work_hours,
    work_count: row.work_count,
    entered_by_name: row.entered_by_name ?? meta.enteredByName,
    note: row.note ?? null,
    created_by: meta.userId,
    updated_by: meta.userId,
    entered_by_shift: meta.enteredByShift,
    updated_at: new Date().toISOString(),
  }))

  const { error } = await upsertBatch(supabase, DB.tables.productionRecords, payload, DB_CONFLICT_KEYS.productionRecords)
  if (error) {
    summary.failed = rows.length
    summary.errors.push({ rowIndex: 0, message: error.message })
    return summary
  }

  summary.saved = rows.length
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

export async function saveTargetImports(
  supabase: SupabaseClient,
  rows: TargetImportRow[]
): Promise<ImportSaveSummary> {
  const summary = emptySummary(rows.length)
  const payload = rows.map((row) => ({
    year: row.year,
    dept: row.dept,
    scope: row.scope,
    ref: row.ref ?? row.dept,
    metric: row.metric,
    target_value: row.target_value,
    note: row.note ?? null,
  }))

  const { error } = await upsertBatch(supabase, DB.tables.targets, payload, DB_CONFLICT_KEYS.targets)
  if (error) {
    summary.failed = rows.length
    summary.errors.push({ rowIndex: 0, message: error.message })
    return summary
  }

  summary.saved = rows.length
  return summary
}

export async function saveWorkStandardImports(
  supabase: SupabaseClient,
  rows: WorkStandardImportRow[]
): Promise<ImportSaveSummary> {
  const summary = emptySummary(rows.length)
  const payload = rows.map((row) => ({
    dept: row.dept,
    product: row.product,
    material: row.material,
    basis: row.basis,
    min_ton: row.min_ton,
    max_ton: row.max_ton,
    order_size: row.order_size,
    std_work_count: row.std_work_count,
    note: row.note ?? null,
  }))

  const { error } = await upsertBatch(supabase, DB.tables.workStandards, payload, DB_CONFLICT_KEYS.workStandards)
  if (error) {
    summary.failed = rows.length
    summary.errors.push({ rowIndex: 0, message: error.message })
    return summary
  }

  summary.saved = rows.length
  return summary
}

export async function saveRawMaterialSpecImports(
  supabase: SupabaseClient,
  rows: RawMaterialSpecImportRow[]
): Promise<ImportSaveSummary> {
  const summary = emptySummary(rows.length)
  const payload = rows.map((row) => ({
    product: row.product,
    material: row.material,
    raw_material: row.raw_material,
    spec: row.spec,
    note: row.note ?? null,
  }))

  const { error } = await upsertBatch(supabase, DB.tables.rawMaterialSpecs, payload, DB_CONFLICT_KEYS.rawMaterialSpecs)
  if (error) {
    summary.failed = rows.length
    summary.errors.push({ rowIndex: 0, message: error.message })
    return summary
  }

  summary.saved = rows.length
  return summary
}
