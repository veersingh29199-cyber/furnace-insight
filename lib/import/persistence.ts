import type { SupabaseClient } from '@supabase/supabase-js'
import { DB, DB_CONFLICT_KEYS } from '@/types/db'
import type {
  GasCompanyMonthlyImportRow,
  GasDailyImportRow,
  GasMonthlyImportRow,
  LineOutputDailyImportRow,
  LineOutputMonthlyImportRow,
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
    source_upload_id: row.source_upload_id ?? null,
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
    source_upload_id: row.source_upload_id ?? null,
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
    source_upload_id: row.source_upload_id ?? null,
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
    source_upload_id: row.source_upload_id ?? null,
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
    source_upload_id: row.source_upload_id ?? null,
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
    source_upload_id: row.source_upload_id ?? null,
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
    source_upload_id: row.source_upload_id ?? null,
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

export async function saveLineOutputImports(
  supabase: SupabaseClient,
  rows: Array<LineOutputDailyImportRow | LineOutputMonthlyImportRow>,
  meta: { userId: string | null },
  layout: 'line-output-daily' | 'line-output-monthly'
): Promise<ImportSaveSummary> {
  const summary = emptySummary(rows.length)
  const isMonthly = layout === 'line-output-monthly'
  const table = isMonthly ? DB.tables.lineOutputMonthly : DB.tables.lineOutputDaily
  const conflictKey = isMonthly ? DB_CONFLICT_KEYS.lineOutputMonthly : DB_CONFLICT_KEYS.lineOutputDaily

  const payload: Array<Record<string, unknown>> = isMonthly
    ? (rows as LineOutputMonthlyImportRow[]).map((row) => ({
        ym: row.ym,
        line_code: row.line_code,
        line_label: row.line_label ?? null,
        plan_ton: row.plan_ton,
        actual_ton: row.actual_ton,
        achievement_pct: row.achievement_pct,
        hwangji_ton: row.hwangji_ton,
        cogging_ton: row.cogging_ton,
        rework_self_ton: row.rework_self_ton,
        rework_quality_ton: row.rework_quality_ton,
        cs_ton: row.cs_ton,
        as_ton: row.as_ton,
        sus_ton: row.sus_ton,
        total_ton: row.total_ton,
        work_count: row.work_count,
        note: row.note ?? null,
        source_upload_id: row.source_upload_id ?? null,
        created_by: meta.userId,
        updated_at: new Date().toISOString(),
      }))
    : (rows as LineOutputDailyImportRow[]).map((row) => ({
        work_date: row.work_date,
        line_code: row.line_code,
        line_label: row.line_label ?? null,
        plan_ton: row.plan_ton,
        actual_ton: row.actual_ton,
        achievement_pct: row.achievement_pct,
        hwangji_ton: row.hwangji_ton,
        cogging_ton: row.cogging_ton,
        rework_self_ton: row.rework_self_ton,
        rework_quality_ton: row.rework_quality_ton,
        cs_ton: row.cs_ton,
        as_ton: row.as_ton,
        sus_ton: row.sus_ton,
        total_ton: row.total_ton,
        work_count: row.work_count,
        note: row.note ?? null,
        source_upload_id: row.source_upload_id ?? null,
        created_by: meta.userId,
        updated_at: new Date().toISOString(),
      }))

  const { error } = await upsertBatch(supabase, table, payload, conflictKey)
  if (error) {
    summary.failed = rows.length
    summary.errors.push({ rowIndex: 0, message: error.message })
    return summary
  }

  summary.saved = rows.length
  return summary
}
