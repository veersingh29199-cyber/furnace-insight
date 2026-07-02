'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import type { GasRecord } from '@/types'
import type { GasRecordInput } from '@/lib/validations'

const supabase = createClient()

// ─────────────────────────────────────────────
// 가스 검침 조회 훅
// ─────────────────────────────────────────────
export function useGasRecords(params?: {
  ymFrom?: string
  ymTo?: string
  furnaceId?: string
  furnaceCode?: string
}) {
  return useQuery({
    queryKey: ['gas-records', params],
    queryFn: async () => {
      let query = supabase
        .from('gas_records')
        .select('*, furnace:furnaces(code, name)')
        .order('ym', { ascending: false })

      if (params?.ymFrom) query = query.gte('ym', params.ymFrom)
      if (params?.ymTo)   query = query.lte('ym', params.ymTo)
      if (params?.furnaceCode) query = query.eq('furnace_code', params.furnaceCode)
      else if (params?.furnaceId) query = query.eq('furnace_code', params.furnaceId)

      const { data, error } = await query
      if (error) throw error
      return data as GasRecord[]
    },
  })
}

// ─────────────────────────────────────────────
// 가스 검침 입력 훅
// ─────────────────────────────────────────────
export function useUpsertGasRecord() {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async (input: GasRecordInput) => {
      const { data: { user } } = await supabase.auth.getUser()
      const opName = typeof window !== 'undefined' ? localStorage.getItem('furnace_operator_name') || '김철수 (단조1팀)' : null
      const opShift = typeof window !== 'undefined' ? localStorage.getItem('furnace_operator_shift') || 'day' : null

      const payload = {
        ...input,
        order_no: input.order_no || null,
        created_by: user?.id || null,
        entered_by_name: opName,
        entered_by_shift: opShift,
      }

      const { data, error } = await supabase
        .from('gas_records')
        .upsert(payload, { onConflict: 'ym,furnace_id' })
        .select()
        .single()

      if (error) throw error
      return data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['gas-records'] })
      qc.invalidateQueries({ queryKey: ['dashboard-kpi'] })
      toast.success('가스 검침이 저장되었습니다.')
    },
    onError: (err: Error) => {
      toast.error(err.message || '저장에 실패했습니다.')
    },
  })
}

// ─────────────────────────────────────────────
// 가스 통계 (월별 평균 원단위 계산)
// ─────────────────────────────────────────────
export function useGasStats(ym: string) {
  return useQuery({
    queryKey: ['gas-stats', ym],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('gas_records')
        .select('gas_unit, furnace:furnaces(code, name)')
        .eq('ym', ym)
        .not('gas_unit', 'is', null)

      if (error) throw error
      return data
    },
  })
}
