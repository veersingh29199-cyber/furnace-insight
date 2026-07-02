'use client'

import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { currentMonthDate, calcTonPerHour, calcAchievementRate } from '@/lib/utils'

const supabase = createClient()

export function useDashboardKpi() {
  return useQuery({
    queryKey: ['dashboard-kpi'],
    queryFn: async () => {
      const defaultMonth = currentMonthDate()
      let activeMonth = defaultMonth

      // 이번달 가스 원단위
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
          activeMonth = latestGas[0].ym
          gasThis = latestGas.filter(r => r.ym === activeMonth)
        }
      }

      const [yearStr, monthStr] = activeMonth.split('-')
      const activeYear = parseInt(yearStr, 10)
      const activeMo   = parseInt(monthStr, 10)

      const lastMonthDate = new Date(activeYear, activeMo - 2, 1)
      const lastMonth = `${lastMonthDate.getFullYear()}-${String(lastMonthDate.getMonth() + 1).padStart(2, '0')}-01`
      const lastYearMonth = `${activeYear - 1}-${String(activeMo).padStart(2, '0')}-01`

      // 지난달 가스 원단위
      const { data: gasLast } = await supabase
        .from('gas_records')
        .select('gas_unit')
        .eq('ym', lastMonth)
        .not('gas_unit', 'is', null)

      // 전년 동월 가스 원단위
      const { data: gasLastYear } = await supabase
        .from('gas_records')
        .select('gas_unit')
        .eq('ym', lastYearMonth)
        .not('gas_unit', 'is', null)

      // 이번달 생산 실적
      let { data: prodThis } = await supabase
        .from('production_records')
        .select('plan_ton, actual_ton, work_hours, work_month')
        .eq('work_month', activeMonth)

      if ((!prodThis || prodThis.length === 0) && activeMonth === defaultMonth) {
        const { data: latestProd } = await supabase
          .from('production_records')
          .select('plan_ton, actual_ton, work_hours, work_month')
          .order('work_month', { ascending: false })
          .limit(10)
        if (latestProd && latestProd.length > 0) {
          const prodMonth = latestProd[0].work_month
          prodThis = latestProd.filter(r => r.work_month === prodMonth)
        }
      }

      // 지난달 생산 실적
      const { data: prodLast } = await supabase
        .from('production_records')
        .select('plan_ton, actual_ton, work_hours')
        .eq('work_month', lastMonth)

      // 전년 동월 생산 실적
      const { data: prodLastYear } = await supabase
        .from('production_records')
        .select('plan_ton, actual_ton, work_hours')
        .eq('work_month', lastYearMonth)

      // 전사 목표 (올해 또는 최근 년도 fallback)
      let { data: targets } = await supabase
        .from('targets')
        .select('metric, target_value, scope, year')
        .eq('year', activeYear)
        .eq('scope', 'company')

      if (!targets || targets.length === 0) {
        const { data: allTargets } = await supabase
          .from('targets')
          .select('metric, target_value, scope, year')
          .eq('scope', 'company')
          .order('year', { ascending: false })
        if (allTargets && allTargets.length > 0) {
          const latestYear = allTargets[0].year
          targets = allTargets.filter(t => t.year === latestYear)
        }
      }

      // 벤치마크 (올해 또는 최근 년도 fallback)
      let { data: benchmarks } = await supabase
        .from('benchmarks')
        .select('org, metric, product_or_scope, value, year')
        .eq('year', activeYear)

      if (!benchmarks || benchmarks.length === 0) {
        const { data: allBm } = await supabase
          .from('benchmarks')
          .select('org, metric, product_or_scope, value, year')
          .order('year', { ascending: false })
        if (allBm && allBm.length > 0) {
          const latestYear = allBm[0].year
          benchmarks = allBm.filter(b => b.year === latestYear)
        }
      }

      // 이번달 평균 원단위 계산
      const avgGasThis = gasThis && gasThis.length > 0
        ? gasThis.reduce((s, r) => s + (r.gas_unit ?? 0), 0) / gasThis.length
        : null

      const avgGasLast = gasLast && gasLast.length > 0
        ? gasLast.reduce((s, r) => s + (r.gas_unit ?? 0), 0) / gasLast.length
        : null

      const avgGasLastYear = gasLastYear && gasLastYear.length > 0
        ? gasLastYear.reduce((s, r) => s + (r.gas_unit ?? 0), 0) / gasLastYear.length
        : null

      const gasChange = avgGasThis != null && avgGasLast != null
        ? ((avgGasThis - avgGasLast) / avgGasLast) * 100
        : null

      const gasYoYChange = avgGasThis != null && avgGasLastYear != null
        ? ((avgGasThis - avgGasLastYear) / avgGasLastYear) * 100
        : null

      // 이번달 생산 합계
      const totalPlanThis   = prodThis?.reduce((s, r) => s + r.plan_ton, 0) ?? 0
      const totalActualThis = prodThis?.reduce((s, r) => s + r.actual_ton, 0) ?? 0
      const totalHoursThis  = prodThis?.reduce((s, r) => s + r.work_hours, 0) ?? 0

      const achievementRate = calcAchievementRate(totalActualThis, totalPlanThis)
      const tonPerHourThis  = calcTonPerHour(totalActualThis, totalHoursThis)

      // 지난달 생산량
      const totalActualLast = prodLast?.reduce((s, r) => s + r.actual_ton, 0) ?? 0
      const totalHoursLast  = prodLast?.reduce((s, r) => s + r.work_hours, 0) ?? 0
      const tonPerHourLast  = calcTonPerHour(totalActualLast, totalHoursLast)

      const tphChange = tonPerHourThis != null && tonPerHourLast != null
        ? ((tonPerHourThis - tonPerHourLast) / tonPerHourLast) * 100
        : null

      // 전년 동월 생산량
      const totalActualLastYear = prodLastYear?.reduce((s, r) => s + r.actual_ton, 0) ?? 0
      const totalHoursLastYear  = prodLastYear?.reduce((s, r) => s + r.work_hours, 0) ?? 0
      const tonPerHourLastYear  = calcTonPerHour(totalActualLastYear, totalHoursLastYear)

      const tphYoYChange = tonPerHourThis != null && tonPerHourLastYear != null
        ? ((tonPerHourThis - tonPerHourLastYear) / tonPerHourLastYear) * 100
        : null

      // 목표 원단위
      const gasTarget  = targets?.find(t => t.metric === 'gas_unit')?.target_value ?? null
      const tphTarget  = targets?.find(t => t.metric === 'ton_per_hour')?.target_value ?? null

      return {
        thisMonth: activeMonth,
        avgGasUnit:       avgGasThis,
        gasChange,
        gasYoYChange,
        gasTarget,
        achievementRate,
        tonPerHour:       tonPerHourThis,
        tphChange,
        tphYoYChange,
        tphTarget,
        totalActualTon:   totalActualThis,
        totalPlanTon:     totalPlanThis,
        benchmarks:       benchmarks ?? [],
        gasRecordCount:   gasThis?.length ?? 0,
      }
    },
  })
}

// 가열로 / 라인 마스터 훅
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

export function useTargets(year?: number) {
  return useQuery({
    queryKey: ['targets', year],
    queryFn: async () => {
      let q = supabase.from('targets').select('*')
      if (year) q = q.eq('year', year)
      const { data, error } = await q
      if (error) throw error

      if ((!data || data.length === 0) && year) {
        const { data: allTargets, error: err2 } = await supabase.from('targets').select('*').order('year', { ascending: false })
        if (err2) throw err2
        if (allTargets && allTargets.length > 0) {
          const latestYear = allTargets[0].year
          return allTargets.filter(t => t.year === latestYear)
        }
      }
      return data
    },
  })
}

export function useBenchmarks() {
  return useQuery({
    queryKey: ['benchmarks'],
    queryFn: async () => {
      const { data, error } = await supabase.from('benchmarks').select('*')
      if (error) throw error
      return data
    },
  })
}
