'use client'

import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { gasRecordSchema, type GasRecordInput } from '@/lib/validations'
import { useUpsertGasRecord } from '@/hooks/use-gas-records'
import { useFurnaces } from '@/hooks/use-dashboard'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { Loader2, Save, Calculator, Flame } from 'lucide-react'
import { currentMonthDate, calcGasUnit, formatGasUnit, kgToTon } from '@/lib/utils'

export default function GasRecordForm() {
  const { data: furnaces } = useFurnaces()
  const upsert = useUpsertGasRecord()

  const {
    register, handleSubmit, setValue, watch, reset,
    formState: { errors },
  } = useForm<GasRecordInput>({
    resolver: zodResolver(gasRecordSchema) as any,
    defaultValues: {
      ym:               currentMonthDate(),
      charge_weight_kg: 0,
      gas_usage:        0,
      source:           'meter',
    },
  })

  const [chargeKg, gasUsage] = watch(['charge_weight_kg', 'gas_usage'])
  const previewUnit = calcGasUnit(gasUsage, chargeKg)

  const onSubmit = async (data: GasRecordInput) => {
    await upsert.mutateAsync(data)
    reset({ ym: data.ym, furnace_id: data.furnace_id, source: data.source })
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">가열로 월 가스 검침 입력</CardTitle>
        <CardDescription>
          가스원단위 = 가스사용량 ÷ 장입중량(톤). 낮을수록 연료 효율이 좋습니다.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
          {/* 기본 정보 */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="space-y-1.5">
              <Label>검침 월 *</Label>
              <Input type="month"
                defaultValue={currentMonthDate().substring(0, 7)}
                onChange={e => setValue('ym', e.target.value ? `${e.target.value}-01` : '')}
              />
              {errors.ym && <p className="text-xs text-destructive">{errors.ym.message}</p>}
            </div>

            <div className="space-y-1.5">
              <Label>가열로 *</Label>
              <Select onValueChange={(v: string | null) => setValue('furnace_id', String(v ?? ''))}>
                <SelectTrigger><SelectValue placeholder="가열로 선택" /></SelectTrigger>
                <SelectContent className="max-h-60">
                  {furnaces?.map(f => (
                    <SelectItem key={f.id} value={f.id}>{f.code} — {f.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.furnace_id && <p className="text-xs text-destructive">{errors.furnace_id.message}</p>}
            </div>

            <div className="space-y-1.5">
              <Label>검침 구분 *</Label>
              <Select defaultValue="meter" onValueChange={(v: string | null) => setValue('source', String(v ?? 'meter') as GasRecordInput['source'])}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="meter">자동검침 (미터)</SelectItem>
                  <SelectItem value="bill">고지서 기준</SelectItem>
                  <SelectItem value="self">자체검침</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* 수치 데이터 */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-lg">
            <div className="space-y-1.5">
              <Label>장입중량 (kg) *</Label>
              <Input type="number" step="1" min="0" placeholder="예: 4200000"
                {...register('charge_weight_kg')} />
              <p className="text-xs text-muted-foreground">
                {chargeKg > 0 ? `= ${kgToTon(chargeKg).toLocaleString('ko-KR')} 톤` : ''}
              </p>
              {errors.charge_weight_kg && <p className="text-xs text-destructive">{errors.charge_weight_kg.message}</p>}
            </div>

            <div className="space-y-1.5">
              <Label>가스사용량 (Nm³) *</Label>
              <Input type="number" step="1" min="0" placeholder="예: 595000"
                {...register('gas_usage')} />
              {errors.gas_usage && <p className="text-xs text-destructive">{errors.gas_usage.message}</p>}
            </div>
          </div>

          {/* 실시간 원단위 미리보기 */}
          {previewUnit != null && (
            <div className="flex items-center gap-3 p-3 rounded-lg bg-primary/5 border border-primary/20">
              <div className="p-1.5 rounded-md bg-primary/10">
                <Flame className="h-4 w-4 text-primary" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">저장될 가스원단위 (자동 계산)</p>
                <p className="text-lg font-bold text-primary">{formatGasUnit(previewUnit)} Nm³/톤</p>
              </div>
              <div className="ml-auto text-xs text-muted-foreground">
                {previewUnit <= 150
                  ? <span className="text-blue-500 font-medium">✓ 목표 이하 (우수)</span>
                  : <span className="text-amber-500 font-medium">⚠ 목표 초과</span>}
              </div>
            </div>
          )}

          <div className="space-y-1.5">
            <Label>비고</Label>
            <Textarea placeholder="특이사항 (예: 고지서와 차이 발생 사유 등)" rows={2} {...register('note')} />
          </div>

          <Button type="submit" disabled={upsert.isPending} className="w-full sm:w-auto">
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
