'use client'

import { Controller, useForm, type Resolver } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { gasDailyReadingSchema, type GasDailyReadingInput } from '@/lib/validations'
import { useFurnaces } from '@/hooks/use-dashboard'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Loader2, Save } from 'lucide-react'
import { toast } from 'sonner'
import { DB, DB_CONFLICT_KEYS } from '@/types/db'
import { currentDateString } from '@/lib/utils'

export default function GasDailyForm() {
  const { data: furnaces } = useFurnaces()
  const supabase = createClient()
  const qc       = useQueryClient()

  const { register, handleSubmit, reset, control, formState: { errors } } =
    useForm<GasDailyReadingInput>({
      resolver: zodResolver(gasDailyReadingSchema) as unknown as Resolver<GasDailyReadingInput>,
      defaultValues: {
        date: currentDateString(),
        furnace_code: '',
        shift: 'day',
        order_no: '',
        value: 0,
      },
    })

  const upsert = useMutation({
    mutationFn: async (data: GasDailyReadingInput) => {
      const opName = typeof window !== 'undefined' ? localStorage.getItem('furnace_operator_name') || '김철수 (단조1팀)' : null
      const opShift = typeof window !== 'undefined' ? localStorage.getItem('furnace_operator_shift') || 'day' : null
      const { error } = await supabase
        .from(DB.tables.gasDailyReadings)
        .upsert({ ...data, order_no: data.order_no || null, created_by: null, entered_by_name: opName, entered_by_shift: opShift }, { onConflict: DB_CONFLICT_KEYS.gasDailyReadings })
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['gas-daily-all'] })
      qc.invalidateQueries({ queryKey: ['input-home-daily-count'] })
      qc.invalidateQueries({ queryKey: ['dashboard-kpi'] })
      toast.success('일별 검침이 저장되었습니다.')
      reset()
    },
    onError: (e: Error) => toast.error(e.message),
  })

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">일별 자체 검침 입력</CardTitle>
        <CardDescription>일자·교대조별 가스 자체 검침값을 입력합니다.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit((data) => upsert.mutate(data))} className="space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="space-y-1.5">
              <Label>날짜 *</Label>
              <Input type="date" {...register('date')} />
              {errors.date && <p className="text-xs text-destructive">{errors.date.message}</p>}
            </div>

            <div className="space-y-1.5">
              <Label>가열로 *</Label>
              <Controller
                control={control}
                name="furnace_code"
                render={({ field }) => (
                  <Select value={field.value ?? ''} onValueChange={field.onChange}>
                    <SelectTrigger>
                      <SelectValue placeholder="선택" />
                    </SelectTrigger>
                    <SelectContent className="max-h-60">
                      {furnaces?.map((f) => (
                        <SelectItem key={f.code} value={f.code}>
                          {f.code}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
              {errors.furnace_code && <p className="text-xs text-destructive">{errors.furnace_code.message}</p>}
            </div>

            <div className="space-y-1.5">
              <Label>교대조 *</Label>
              <Controller
                control={control}
                name="shift"
                render={({ field }) => (
                  <Select value={field.value ?? 'day'} onValueChange={field.onChange}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="day">주간조</SelectItem>
                      <SelectItem value="night">야간조</SelectItem>
                      <SelectItem value="both">합계</SelectItem>
                    </SelectContent>
                  </Select>
                )}
              />
            </div>

            <div className="space-y-1.5">
              <Label>검침값 (Nm³) *</Label>
              <Input type="number" step="1" min="0" placeholder="0" {...register('value')} />
              {errors.value && <p className="text-xs text-destructive">{errors.value.message}</p>}
            </div>

            <div className="space-y-1.5 sm:col-span-2 lg:col-span-1">
              <Label>수주번호 / 작업번호 (선택)</Label>
              <Input placeholder="예: ORD-2607-01" {...register('order_no')} />
            </div>
          </div>

          <Button type="submit" disabled={upsert.isPending}>
            {upsert.isPending ? (
              <><Loader2 className="mr-2 h-4 w-4 animate-spin" />저장 중...</>
            ) : (
              <><Save className="mr-2 h-4 w-4" />저장</>
            )}
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}
