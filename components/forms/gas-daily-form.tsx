'use client'

import { useForm } from 'react-hook-form'
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

export default function GasDailyForm() {
  const { data: furnaces } = useFurnaces()
  const supabase = createClient()
  const qc       = useQueryClient()

  const { register, handleSubmit, setValue, reset, formState: { errors } } =
    useForm<GasDailyReadingInput>({
      resolver: zodResolver(gasDailyReadingSchema) as any,
      defaultValues: {
        date:  new Date().toISOString().substring(0, 10),
        shift: 'day',
        value: 0,
      },
    })

  const upsert = useMutation({
    mutationFn: async (data: GasDailyReadingInput) => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('로그인이 필요합니다.')
      const { error } = await supabase
        .from('gas_daily_readings')
        .upsert({ ...data, created_by: user.id }, { onConflict: 'date,furnace_id,shift' })
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['gas-daily'] })
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
        <form onSubmit={handleSubmit(d => upsert.mutate(d))} className="space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="space-y-1.5">
              <Label>날짜 *</Label>
              <Input type="date" {...register('date')} />
              {errors.date && <p className="text-xs text-destructive">{errors.date.message}</p>}
            </div>

            <div className="space-y-1.5">
              <Label>가열로 *</Label>
              <Select onValueChange={(v: string | null) => setValue('furnace_id', String(v ?? ''))}>
                <SelectTrigger><SelectValue placeholder="선택" /></SelectTrigger>
                <SelectContent className="max-h-60">
                  {furnaces?.map(f => (
                    <SelectItem key={f.id} value={f.id}>{f.code}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.furnace_id && <p className="text-xs text-destructive">{errors.furnace_id.message}</p>}
            </div>

            <div className="space-y-1.5">
              <Label>교대조 *</Label>
              <Select defaultValue="day" onValueChange={(v: string | null) => setValue('shift', (String(v ?? 'day')) as 'day' | 'night' | 'both')}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="day">주간조</SelectItem>
                  <SelectItem value="night">야간조</SelectItem>
                  <SelectItem value="both">합계</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>검침값 (Nm³) *</Label>
              <Input type="number" step="1" min="0" placeholder="0" {...register('value')} />
              {errors.value && <p className="text-xs text-destructive">{errors.value.message}</p>}
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
