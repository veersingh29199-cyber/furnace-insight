'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import type { ProductionRecord } from '@/types'
import type { ProductionRecordInput } from '@/lib/validations'
import { DB, DB_CONFLICT_KEYS } from '@/types/db'

const supabase = createClient()

// ─────────────────────────────────────────────
// 생산 실적 조회 훅
// ─────────────────────────────────────────────
export function useProductionRecords(params?: {
  from?: string
  to?: string
  lineId?: string
  lineCode?: string
}) {
  return useQuery({
    queryKey: ['production-records', params],
    queryFn: async () => {
      let query = supabase
        .from(DB.tables.productionRecords)
        .select('*, line:lines(code, name), product:products(name, material, std_ton_per_hour)')
        .order('work_month', { ascending: false })

      if (params?.from)   query = query.gte(DB.productionRecords.workMonth, params.from)
      if (params?.to)     query = query.lte(DB.productionRecords.workMonth, params.to)
      if (params?.lineCode) query = query.eq(DB.productionRecords.lineCode, params.lineCode)
      else if (params?.lineId) query = query.eq(DB.productionRecords.lineCode, params.lineId)

      const { data, error } = await query
      if (error) throw error
      return data as ProductionRecord[]
    },
  })
}

// ─────────────────────────────────────────────
// 생산 실적 입력/수정 훅
// ─────────────────────────────────────────────
export function useUpsertProductionRecord() {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async (input: ProductionRecordInput) => {
      const { data: { user } } = await supabase.auth.getUser()
      const opName = typeof window !== 'undefined' ? localStorage.getItem('furnace_operator_name') || '김철수 (단조1팀)' : null
      const opShift = typeof window !== 'undefined' ? localStorage.getItem('furnace_operator_shift') || 'day' : null

      const payload = {
        ...input,
        product_name: input.product_name || null,
        order_no: input.order_no || null,
        shift: input.shift || null,
        created_by: user?.id || null,
        updated_by: user?.id || null,
        entered_by_name: opName,
        entered_by_shift: opShift,
        updated_at: new Date().toISOString(),
      }

      const table = supabase.from(DB.tables.productionRecords)
      const useConflictUpsert = payload.product_name != null && payload.product_name !== ''

      if (useConflictUpsert) {
        const { error } = await table.upsert(payload, { onConflict: DB_CONFLICT_KEYS.productionRecords })

        if (error) throw error
        return payload
      }

      const existingQuery = table
        .select('work_month,line_code,product_name,shift')
        .eq(DB.productionRecords.workMonth, payload.work_month)
        .eq(DB.productionRecords.lineCode, payload.line_code)

      if (payload.shift == null) {
        existingQuery.is(DB.productionRecords.shift, null)
      } else {
        existingQuery.eq(DB.productionRecords.shift, payload.shift)
      }

      existingQuery.is(DB.productionRecords.productName, null)

      const { data: existingRows, error: existingError } = await existingQuery.limit(1)
      const existing = existingRows?.[0] ?? null
      if (existingError) throw existingError

      if (existing) {
        const updateQuery = table
          .update(payload)
          .eq(DB.productionRecords.workMonth, payload.work_month)
          .eq(DB.productionRecords.lineCode, payload.line_code)
          .is(DB.productionRecords.productName, null)

        if (payload.shift == null) {
          updateQuery.is(DB.productionRecords.shift, null)
        } else {
          updateQuery.eq(DB.productionRecords.shift, payload.shift)
        }

        const { error } = await updateQuery

        if (error) throw error
        return payload
      }

      const { error } = await table.insert(payload)
      if (error) throw error
      return payload
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['production-records'] })
      qc.invalidateQueries({ queryKey: ['dashboard-kpi'] })
      toast.success('생산 실적이 저장되었습니다.')
    },
    onError: (err: Error) => {
      toast.error(err.message || '저장에 실패했습니다.')
    },
  })
}

// ─────────────────────────────────────────────
// 연간 생산 추이 조회 (최근 3년)
// ─────────────────────────────────────────────
export function useProductionTrend(years = 3) {
  return useQuery({
    queryKey: ['production-trend', years],
    queryFn: async () => {
      const fromYear = new Date().getFullYear() - years + 1
      const { data, error } = await supabase
        .from(DB.tables.productionRecords)
        .select('work_month, line_code, plan_ton, actual_ton, work_hours, line:lines(code, name)')
        .gte(DB.productionRecords.workMonth, `${fromYear}-01-01`)
        .order('work_month', { ascending: true })

      if (error) throw error
      return data
    },
  })
}
