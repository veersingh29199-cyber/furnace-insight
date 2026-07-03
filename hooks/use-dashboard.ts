'use client'

import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { calcAchievementRate, calcTonPerHour, currentMonthDate } from '@/lib/utils'
import { normalizeMonthDate } from '@/lib/input/common'
import { DB } from '@/types/db'
import type { Benchmark, Target } from '@/types'

const supabase = createClient()

function monthRange(monthDate: string) {
  const [yearStr, monthStr] = monthDate.split('-')
  const year = Number(yearStr)
  const month = Number(monthStr)
  const lastDay = new Date(year, month, 0).getDate()
  return {
    from: `${year}-${String(month).padStart(2, '0')}-01`,
    to: `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`,
  }
}

function sumNumber<T extends Record<string, unknown>>(rows: T[] | undefined, key: keyof T) {
  return rows?.reduce((sum, row) => sum + Number(row[key] ?? 0), 0) ?? 0
}

function findTarget(
  rows: Target[] | undefined,
  metric: Target['metric'],
  filters: { year?: number | null; dept?: string | null; scope?: string | null } = {}
) {
  const exact = rows?.find((row) => {
    if (row.metric !== metric) return false
    if (filters.year != null && row.year != null && row.year !== filters.year) return false
    if (filters.dept != null && row.dept != null && row.dept !== filters.dept) return false
    if (filters.scope != null && row.scope !== filters.scope) return false
    return true
  })

  if (exact) return exact

  return (
    rows?.find((row) => row.metric === metric && (filters.scope == null || row.scope === filters.scope)) ??
    null
  )
}

export function useDashboardKpi() {
  return useQuery({
    queryKey: ['dashboard-kpi'],
    queryFn: async () => {
      const defaultMonth = currentMonthDate()
      let activeMonth = normalizeMonthDate(defaultMonth) ?? defaultMonth

      let { data: gasThis } = await supabase
        .from('gas_records')
        .select('gas_unit, charge_weight_kg, gas_usage, ym')
        .eq('ym', activeMonth)
        .not('gas_unit', 'is', null)

      if (!gasThis || gasThis.length === 0) {
        const { data: latestGas } = await supabase
          .from('gas_records')
          .select('gas_unit, charge_weight_kg, gas_usage, ym')
          .not('gas_unit', 'is', null)
          .order('ym', { ascending: false })
          .limit(10)
        if (latestGas && latestGas.length > 0) {
          const latestMonth = normalizeMonthDate(latestGas[0].ym)
          if (latestMonth) {
            activeMonth = latestMonth
            gasThis = latestGas.filter((row) => normalizeMonthDate(row.ym) === activeMonth)
          }
        }
      }

      const [yearStr, monthStr] = activeMonth.split('-')
      const activeYear = Number(yearStr)
      const activeMo = Number(monthStr)

      const lastMonthDate = new Date(activeYear, activeMo - 2, 1)
      const lastMonth = `${lastMonthDate.getFullYear()}-${String(lastMonthDate.getMonth() + 1).padStart(2, '0')}-01`
      const lastYearMonth = `${activeYear - 1}-${String(activeMo).padStart(2, '0')}-01`

      const activeRange = monthRange(activeMonth)
      const lastMonthRange = monthRange(lastMonth)
      const lastYearMonthRange = monthRange(lastYearMonth)

      const { data: gasLast } = await supabase
        .from('gas_records')
        .select('gas_unit')
        .eq('ym', lastMonth)
        .not('gas_unit', 'is', null)

      const { data: gasLastYear } = await supabase
        .from('gas_records')
        .select('gas_unit')
        .eq('ym', lastYearMonth)
        .not('gas_unit', 'is', null)

      let { data: prodThis } = await supabase
        .from('production_records')
        .select('plan_ton, order_weight, actual_ton, work_hours, work_date')
        .gte('work_date', activeRange.from)
        .lte('work_date', activeRange.to)

      if ((!prodThis || prodThis.length === 0) && activeMonth === defaultMonth) {
        const { data: latestProd } = await supabase
          .from('production_records')
          .select('plan_ton, order_weight, actual_ton, work_hours, work_date')
          .order('work_date', { ascending: false })
          .limit(10)
        if (latestProd && latestProd.length > 0) {
          const prodMonth = latestProd[0].work_date?.slice(0, 7) ?? activeMonth.slice(0, 7)
          prodThis = latestProd.filter((row) => (row.work_date ?? '').startsWith(prodMonth))
        }
      }

      const { data: prodLast } = await supabase
        .from('production_records')
        .select('plan_ton, order_weight, actual_ton, work_hours, work_date')
        .gte('work_date', lastMonthRange.from)
        .lte('work_date', lastMonthRange.to)

      const { data: prodLastYear } = await supabase
        .from('production_records')
        .select('plan_ton, order_weight, actual_ton, work_hours, work_date')
        .gte('work_date', lastYearMonthRange.from)
        .lte('work_date', lastYearMonthRange.to)

      const { data: targets } = await supabase
        .from(DB.tables.targets)
        .select(`${DB.targets.year}, ${DB.targets.dept}, ${DB.targets.metric}, ${DB.targets.targetValue}, ${DB.targets.scope}, ${DB.targets.ref}, ${DB.targets.note}`)
        .order(DB.targets.year, { ascending: false, nullsFirst: false })
        .order(DB.targets.dept, { ascending: true })
        .order(DB.targets.metric, { ascending: true })

      const { data: benchmarks } = await supabase
        .from(DB.tables.benchmarks)
        .select(`${DB.benchmarks.org}, ${DB.benchmarks.metric}, ${DB.benchmarks.scope}, ${DB.benchmarks.value}`)
        .order(DB.benchmarks.org, { ascending: true })
        .order(DB.benchmarks.metric, { ascending: true })
        .order(DB.benchmarks.scope, { ascending: true })

      const avgGasThis = gasThis && gasThis.length > 0
        ? gasThis.reduce((sum, row) => sum + Number(row.gas_unit ?? 0), 0) / gasThis.length
        : null
      const avgGasLast = gasLast && gasLast.length > 0
        ? gasLast.reduce((sum, row) => sum + Number(row.gas_unit ?? 0), 0) / gasLast.length
        : null
      const avgGasLastYear = gasLastYear && gasLastYear.length > 0
        ? gasLastYear.reduce((sum, row) => sum + Number(row.gas_unit ?? 0), 0) / gasLastYear.length
        : null

      const gasChange = avgGasThis != null && avgGasLast != null
        ? ((avgGasThis - avgGasLast) / avgGasLast) * 100
        : null

      const gasYoYChange = avgGasThis != null && avgGasLastYear != null
        ? ((avgGasThis - avgGasLastYear) / avgGasLastYear) * 100
        : null

      const totalActualThis = prodThis?.reduce((sum, row) => sum + Number(row.order_weight ?? row.actual_ton ?? 0), 0) ?? 0
      const totalHoursThis = prodThis?.reduce((sum, row) => sum + Number(row.work_hours ?? 0), 0) ?? 0
      const totalPlanThis =
        findTarget(targets as Target[] | undefined, 'output', { year: activeYear, dept: 'company', scope: 'company' })?.target_value ??
        sumNumber(prodThis ?? [], 'plan_ton')

      const achievementRate = totalPlanThis > 0 ? calcAchievementRate(totalActualThis, totalPlanThis) : null
      const tonPerHourThis = calcTonPerHour(totalActualThis, totalHoursThis)

      const totalActualLast = prodLast?.reduce((sum, row) => sum + Number(row.order_weight ?? row.actual_ton ?? 0), 0) ?? 0
      const totalHoursLast = prodLast?.reduce((sum, row) => sum + Number(row.work_hours ?? 0), 0) ?? 0
      const tonPerHourLast = calcTonPerHour(totalActualLast, totalHoursLast)

      const tphChange = tonPerHourThis != null && tonPerHourLast != null
        ? ((tonPerHourThis - tonPerHourLast) / tonPerHourLast) * 100
        : null

      const totalActualLastYear = prodLastYear?.reduce((sum, row) => sum + Number(row.order_weight ?? row.actual_ton ?? 0), 0) ?? 0
      const totalHoursLastYear = prodLastYear?.reduce((sum, row) => sum + Number(row.work_hours ?? 0), 0) ?? 0
      const tonPerHourLastYear = calcTonPerHour(totalActualLastYear, totalHoursLastYear)

      const tphYoYChange = tonPerHourThis != null && tonPerHourLastYear != null
        ? ((tonPerHourThis - tonPerHourLastYear) / tonPerHourLastYear) * 100
        : null

      const gasTarget =
        findTarget(targets as Target[] | undefined, 'gas_unit', { year: activeYear, dept: 'company', scope: 'company' })?.target_value ??
        null
      const tphTarget =
        findTarget(targets as Target[] | undefined, 'ton_per_hour', { year: activeYear, dept: 'company', scope: 'company' })?.target_value ??
        null

      return {
        thisMonth: activeMonth,
        avgGasUnit: avgGasThis,
        gasChange,
        gasYoYChange,
        gasTarget,
        achievementRate,
        tonPerHour: tonPerHourThis,
        tphChange,
        tphYoYChange,
        tphTarget,
        totalActualTon: totalActualThis,
        totalPlanTon: totalPlanThis,
        benchmarks: benchmarks ?? [],
        gasRecordCount: gasThis?.length ?? 0,
      }
    },
  })
}

export function useFurnaces() {
  return useQuery({
    queryKey: ['furnaces'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('furnaces')
        .select('*')
        .eq('active', true)
        .order('code')
      if (error) throw error
      return data
    },
  })
}

export function useLines() {
  return useQuery({
    queryKey: ['lines'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('lines')
        .select('*')
        .eq('active', true)
        .order('code')
      if (error) throw error
      return data
    },
  })
}

export function useProducts() {
  return useQuery({
    queryKey: ['products'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('products')
        .select('*')
        .eq('active', true)
        .order('name')
      if (error) throw error
      return data
    },
  })
}

export function useTargets(year?: number, dept?: string) {
  return useQuery({
    queryKey: ['targets', year ?? null, dept ?? null],
    queryFn: async () => {
      let query = supabase
        .from(DB.tables.targets)
        .select('id, year, dept, scope, ref, metric, target_value, note')
        .order(DB.targets.scope, { ascending: true })
        .order(DB.targets.year, { ascending: false, nullsFirst: false })
        .order(DB.targets.ref, { ascending: true })
        .order(DB.targets.metric, { ascending: true })

      if (year != null) query = query.eq(DB.targets.year, year)
      if (dept) query = query.eq(DB.targets.dept, dept)

      const { data, error } = await query
      if (error) throw error
      return (data ?? []) as Target[]
    },
  })
}

export function useBenchmarks() {
  return useQuery({
    queryKey: ['benchmarks'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from(DB.tables.benchmarks)
        .select('id, org, metric, scope, value')
        .order(DB.benchmarks.org, { ascending: true })
        .order(DB.benchmarks.metric, { ascending: true })
        .order(DB.benchmarks.scope, { ascending: true })
      if (error) throw error
      return (data ?? []) as Benchmark[]
    },
  })
}
