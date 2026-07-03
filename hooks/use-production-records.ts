'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import type { ProductionRecord } from '@/types'
import type { ProductionRecordInput } from '@/lib/validations'
import { DB, DB_CONFLICT_KEYS } from '@/types/db'

const supabase = createClient()

export function useProductionRecords(params?: {
  from?: string
  to?: string
  lineCode?: string
  deptLine?: string
  furnaceCode?: string
}) {
  return useQuery({
    queryKey: ['production-records', params],
    queryFn: async () => {
      const selectColumns = '*'
      let query = supabase.from(DB.tables.productionRecords).select(selectColumns).order('created_at', { ascending: false })

      if (params?.from) query = query.gte(DB.productionRecords.workDate, params.from)
      if (params?.to) query = query.lte(DB.productionRecords.workDate, params.to)
      if (params?.deptLine) query = query.eq(DB.productionRecords.deptLine, params.deptLine)
      else if (params?.lineCode) query = query.eq(DB.productionRecords.deptLine, params.lineCode)
      if (params?.furnaceCode) query = query.eq(DB.productionRecords.furnaceCode, params.furnaceCode)

      const { data, error } = await query
      if (error) throw error
      return (data ?? []) as ProductionRecord[]
    },
  })
}

export function useUpsertProductionRecord() {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async (input: ProductionRecordInput) => {
      const opName = typeof window !== 'undefined' ? localStorage.getItem('furnace_operator_name') || '현장 입력' : null
      const opShift = typeof window !== 'undefined' ? localStorage.getItem('furnace_operator_shift') || 'day' : null

      const payload = {
        work_date: input.work_date,
        dept_line: input.dept_line,
        shift: input.shift ?? null,
        order_no: input.order_no,
        product: input.product ?? null,
        material: input.material ?? null,
        process: input.process,
        order_size: input.order_size ?? null,
        work_size: input.work_size ?? null,
        order_weight: input.order_weight,
        charge_weight: input.charge_weight,
        furnace_code: input.furnace_code,
        work_hours: input.work_hours,
        work_count: input.work_count,
        entered_by_name: input.entered_by_name || opName,
        note: input.note ?? null,
        created_by: null,
        updated_by: null,
        entered_by_shift: opShift,
        updated_at: new Date().toISOString(),
      }

      const { error } = await supabase
        .from(DB.tables.productionRecords)
        .upsert(payload, { onConflict: DB_CONFLICT_KEYS.productionRecords })

      if (error) throw error
      return payload
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['production-records'] })
      qc.invalidateQueries({ queryKey: ['dashboard-kpi'] })
      qc.invalidateQueries({ queryKey: ['input-production-month'] })
      qc.invalidateQueries({ queryKey: ['input-home-production-count'] })
      toast.success('생산 실적이 저장되었습니다.')
    },
    onError: (err: Error) => {
      toast.error(err.message || '저장에 실패했습니다.')
    },
  })
}

export function useProductionTrend(years = 3) {
  return useQuery({
    queryKey: ['production-trend', years],
    queryFn: async () => {
      const fromYear = new Date().getFullYear() - years + 1
      const { data, error } = await supabase
        .from(DB.tables.productionRecords)
        .select('*')
        .gte(DB.productionRecords.workDate, `${fromYear}-01-01`)
        .order(DB.productionRecords.workDate, { ascending: true })

      if (error) throw error
      return (data ?? []) as ProductionRecord[]
    },
  })
}
