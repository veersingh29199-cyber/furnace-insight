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

import { InfoTooltip, AutoCalcBadge } from '@/components/ui/tooltip'
import { Badge } from '@/components/ui/badge'

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
        <CardTitle className="text-base flex items-center gap-2">
          🔥 가열로 월 가스 검침 입력
        </CardTitle>
        <CardDescription>
          각 호기별 월간 액화/도시가스 사용량과 투입 장입량을 입력합니다. 동일한 월·호기 입력 시 자동 덮어쓰기됩니다.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
          {/* 기본 정보 */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="space-y-1.5">
              <Label className="flex items-center gap-1">
                검침 월 <span className="text-destructive">*</span>
                <InfoTooltip content="해당 가스검침 실적이 속하는 월(YYYY-MM)을 선택합니다." />
              </Label>
              <Input type="month"
                defaultValue={currentMonthDate().substring(0, 7)}
                onChange={e => setValue('ym', e.target.value ? `${e.target.value}-01` : '')}
              />
              {errors.ym && <p className="text-xs text-destructive">{errors.ym.message}</p>}
            </div>

            <div className="space-y-1.5">
              <Label className="flex items-center gap-1">
                가열로 <span className="text-destructive">*</span>
                <InfoTooltip content="가스를 소비한 단조 공장 내 가열로 호기를 마스터 데이터에서 선택합니다." />
              </Label>
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
              <Label className="flex items-center gap-1">
                검침 구분 <span className="text-destructive">*</span>
                <InfoTooltip content="자동검침 미터값, 고지서 실측값, 현장 자체검침값 중 데이터 출처를 지정합니다." />
              </Label>
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
              <Label className="flex items-center gap-1">
                장입중량 (kg) <span className="text-destructive">*</span>
                <InfoTooltip content="해당 월 가열로에 투입된 단조품 소재의 총 중량(kg)입니다. 분모로 쓰이므로 0 입력 시 원단위는 계산되지 않습니다." />
              </Label>
              <Input type="number" step="1" min="0" placeholder="예: 2730000 (kg)"
                {...register('charge_weight_kg')} />
              <p className="text-[11px] text-muted-foreground">
                {chargeKg > 0 ? `👉 변환 중량: ${kgToTon(chargeKg).toLocaleString('ko-KR')} 톤` : '해당 월 가열로에 투입된 총 중량(kg)'}
              </p>
              {errors.charge_weight_kg && <p className="text-xs text-destructive">{errors.charge_weight_kg.message}</p>}
            </div>

            <div className="space-y-1.5">
              <Label className="flex items-center gap-1">
                가스사용량 (Nm³) <span className="text-destructive">*</span>
                <InfoTooltip content="계량기 또는 고지서 상 확인된 월간 총 가스 부피 사용량입니다." />
              </Label>
              <Input type="number" step="1" min="0" placeholder="예: 450000 (Nm³)"
                {...register('gas_usage')} />
              <p className="text-[11px] text-muted-foreground">가열로에서 월간 소비한 액화/도시가스 사용량</p>
              {errors.gas_usage && <p className="text-xs text-destructive">{errors.gas_usage.message}</p>}
            </div>
          </div>

          {/* 실시간 원단위 미리보기 */}
          {previewUnit != null && (
            <div className={`p-3.5 rounded-lg border space-y-2 ${previewUnit > 180 ? 'bg-amber-500/10 border-amber-500/40' : 'bg-primary/5 border-primary/20'}`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Flame className="h-4 w-4 text-primary" />
                  <span className="text-xs font-bold">저장 전 실시간 미리보기 (이렇게 저장됩니다)</span>
                </div>
                <AutoCalcBadge formula="가스사용량 ÷ 장입중량(톤)" />
              </div>
              <div className="flex items-baseline justify-between pt-1">
                <div>
                  <span className="text-xs text-muted-foreground block">예상 가스원단위:</span>
                  <span className="text-xl font-extrabold text-primary">{formatGasUnit(previewUnit)} Nm³/톤</span>
                </div>
                <div className="text-right">
                  {previewUnit > 180 ? (
                    <Badge variant="destructive" className="text-[10px]">⚠ 정상범위 초과 (확인 필요)</Badge>
                  ) : previewUnit <= 150 ? (
                    <Badge className="bg-emerald-600 text-[10px]">✓ 전사 목표치 150 달성</Badge>
                  ) : (
                    <Badge variant="secondary" className="text-[10px]">목표치 150 소폭 상회</Badge>
                  )}
                </div>
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
