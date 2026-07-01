'use client'

import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { currentMonthDate, calcTonPerHour, calcAchievementRate } from '@/lib/utils'

const supabase = createClient()

export function useDashboardKpi() {
  return useQuery({
    queryKey: ['dashboard-kpi'],
    queryFn: async () => {
      const thisMonth = currentMonthDate()
      const lastDate  = new Date(thisMonth)
      lastDate.setMonth(lastDate.getMonth() - 1)
      const lastMonth = `${lastDate.getFullYear()}-${String(lastDate.getMonth() + 1).padStart(2, '0')}-01`

      // 이번달 가스 원단위
      const { data: gasThis } = await supabase
        .from('gas_records')
        .select('gas_unit, charge_weight_kg, gas_usage')
        .eq('ym', thisMonth)
        .not('gas_unit', 'is', null)

      // 지난달 가스 원단위
      const { data: gasLast } = await supabase
        .from('gas_records')
        .select('gas_unit')
        .eq('ym', lastMonth)
        .not('gas_unit', 'is', null)

      // 이번달 생산 실적
      const { data: prodThis } = await supabase
        .from('production_records')
        .select('plan_ton, actual_ton, work_hours')
        .eq('work_month', thisMonth)

      // 지난달 생산 실적
      const { data: prodLast } = await supabase
        .from('production_records')
        .select('plan_ton, actual_ton, work_hours')
        .eq('work_month', lastMonth)

      // 전사 목표 (올해)
      const { data: targets } = await supabase
        .from('targets')
        .select('metric, target_value, scope')
        .eq('year', new Date().getFullYear())
        .eq('scope', 'company')

      // 벤치마크
      const { data: benchmarks } = await supabase
        .from('benchmarks')
        .select('org, metric, product_or_scope, value')
        .eq('year', new Date().getFullYear())

      // 이번달 평균 원단위 계산
      const avgGasThis = gasThis && gasThis.length > 0
        ? gasThis.reduce((s, r) => s + (r.gas_unit ?? 0), 0) / gasThis.length
        : null

      const avgGasLast = gasLast && gasLast.length > 0
        ? gasLast.reduce((s, r) => s + (r.gas_unit ?? 0), 0) / gasLast.length
        : null

      const gasChange = avgGasThis != null && avgGasLast != null
        ? ((avgGasThis - avgGasLast) / avgGasLast) * 100
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

      // 목표 원단위
      const gasTarget  = targets?.find(t => t.metric === 'gas_unit')?.target_value ?? null
      const tphTarget  = targets?.find(t => t.metric === 'ton_per_hour')?.target_value ?? null

      return {
        thisMonth,
        avgGasUnit:       avgGasThis,
        gasChange,
        gasTarget,
        achievementRate,
        tonPerHour:       tonPerHourThis,
        tphChange,
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
