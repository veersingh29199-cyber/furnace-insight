'use client'

import { useForm, useWatch, type Resolver } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { productionRecordSchema, type ProductionRecordInput } from '@/lib/validations'
import { useUpsertProductionRecord } from '@/hooks/use-production-records'
import { useLines, useProducts } from '@/hooks/use-dashboard'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { Separator } from '@/components/ui/separator'
import { Loader2, Save, Calculator } from 'lucide-react'
import { currentMonthDate, calcTonPerHour, calcAchievementRate, formatTonPerHour, formatPercent } from '@/lib/utils'

import { InfoTooltip, AutoCalcBadge } from '@/components/ui/tooltip'

export default function ProductionRecordForm() {
  const { data: lines }    = useLines()
  const { data: products } = useProducts()
  const upsert = useUpsertProductionRecord()

  const {
    register, handleSubmit, setValue, reset, control,
    formState: { errors },
  } = useForm<ProductionRecordInput>({
    resolver: zodResolver(productionRecordSchema) as unknown as Resolver<ProductionRecordInput>,
    defaultValues: {
      work_month:         currentMonthDate(),
      line_code:          '',
      product_name:       null,
      order_no:           '',
      shift:              'both',
      plan_ton:           0,
      actual_ton:         0,
      hwangji_ton:        0,
      cogging_ton:        0,
      rework_self_ton:    0,
      rework_quality_ton: 0,
      work_hours:         0,
      work_count:         0,
    },
  })

  // 실시간 계산값
  const actualTon = useWatch({ control, name: 'actual_ton' })
  const workHours = useWatch({ control, name: 'work_hours' })
  const planTon = useWatch({ control, name: 'plan_ton' })
  const tph  = calcTonPerHour(actualTon, workHours)
  const rate = calcAchievementRate(actualTon, planTon)

  const onSubmit = async (data: ProductionRecordInput) => {
    await upsert.mutateAsync(data)
    reset({
      work_month: data.work_month,
      line_code: data.line_code,
      product_name: data.product_name ?? null,
      order_no: '',
      shift: data.shift ?? 'both',
      plan_ton: 0,
      actual_ton: 0,
      hwangji_ton: 0,
      cogging_ton: 0,
      rework_self_ton: 0,
      rework_quality_ton: 0,
      work_hours: 0,
      work_count: 0,
      note: '',
    })
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          🏭 월별 생산 실적 입력
        </CardTitle>
        <CardDescription>
          라인·제품·교대조별로 목표 중량(톤)과 실적 중량을 입력합니다. 동일한 조건으로 저장 시 마지막 입력값으로 덮어씁니다.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
          {/* 기본 정보 */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="space-y-1.5">
              <Label className="flex items-center gap-1">
                작업월 <span className="text-destructive">*</span>
                <InfoTooltip content="해당 생산 실적이 발생한 월(YYYY-MM)입니다." />
              </Label>
              <Input type="month" {...register('work_month', {
                setValueAs: v => v ? `${v}-01` : '',
              })}
              defaultValue={currentMonthDate().substring(0, 7)}
              onChange={e => setValue('work_month', e.target.value ? `${e.target.value}-01` : '')}
              />
              {errors.work_month && <p className="text-xs text-destructive">{errors.work_month.message}</p>}
            </div>

            <div className="space-y-1.5">
              <Label className="flex items-center gap-1">
                라인 <span className="text-destructive">*</span>
                <InfoTooltip content="생산이 이루어진 단조 공장 생산 라인을 마스터 목록에서 선택합니다." />
              </Label>
              <Select onValueChange={(v: string | null) => setValue('line_code', String(v ?? ''))}>
                <SelectTrigger><SelectValue placeholder="라인 선택" /></SelectTrigger>
                <SelectContent>
                  {lines?.map(l => (
                    <SelectItem key={l.code} value={l.code}>{l.code} — {l.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.line_code && <p className="text-xs text-destructive">{errors.line_code.message}</p>}
            </div>

            <div className="space-y-1.5">
              <Label className="flex items-center gap-1">
                제품 (선택)
                <InfoTooltip content="특정 품종/재질(예: 금형강, 크랭크축) 실적일 경우 선택합니다." />
              </Label>
              <Select onValueChange={(v: string | null) => setValue('product_name', (!v || v === '_none') ? null : String(v))}>
                <SelectTrigger><SelectValue placeholder="전체 (미선택)" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="_none">전체 (미선택)</SelectItem>
                  {products?.map(p => (
                    <SelectItem key={p.name} value={p.name}>{p.name} ({p.material})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label className="flex items-center gap-1">
                수주번호 / 랏 (선택)
                <InfoTooltip content="작업 지시 또는 수주 건별 기록 시 수주번호(예: ORD-202607-01)를 기입합니다." />
              </Label>
              <Input placeholder="예: ORD-2026-001" {...register('order_no')} />
            </div>
          </div>

          <div className="space-y-1.5 max-w-xs">
            <Label className="flex items-center gap-1">
              교대조 (선택)
              <InfoTooltip content="주간/야간 구분 실적이 아니면 '주야간 합계'로 둡니다." />
            </Label>
            <Select onValueChange={(v: string | null) => setValue('shift', String(v ?? 'both') as 'day' | 'night' | 'both')}>
              <SelectTrigger><SelectValue placeholder="전체 (미선택)" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="both">주야간 합계</SelectItem>
                <SelectItem value="day">주간조</SelectItem>
                <SelectItem value="night">야간조</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <Separator />

          {/* 중량 데이터 */}
          <div>
            <h3 className="text-sm font-semibold mb-3 text-foreground flex items-center gap-1.5">
              📦 중량 입력 (단위: 톤)
            </h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              {[
                { key: 'plan_ton',           label: '목표 (톤) *', tip: '사전 확정된 월간 목표 생산 중량' },
                { key: 'actual_ton',         label: '실적 (톤) *', tip: '실제 단조 생산된 총 합격품 중량' },
                { key: 'hwangji_ton',        label: '황지 (선택)', tip: '황지 공정 중량' },
                { key: 'cogging_ton',        label: 'COGGING (선택)', tip: '코깅 공정 중량' },
                { key: 'rework_self_ton',    label: '자체재작 (선택)', tip: '사내 원인 재작업 중량' },
                { key: 'rework_quality_ton', label: '품질재작 (선택)', tip: '품질 원인 재작업 중량' },
              ].map(({ key, label, tip }) => (
                <div key={key} className="space-y-1">
                  <Label className="flex items-center gap-1 text-xs">
                    {label}
                    <InfoTooltip content={tip} />
                  </Label>
                  <Input
                    type="number"
                    step="0.1"
                    min="0"
                    placeholder="0"
                    {...register(key as keyof ProductionRecordInput)}
                  />
                  {errors[key as keyof typeof errors] && (
                    <p className="text-xs text-destructive">
                      {errors[key as keyof typeof errors]?.message as string}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* 작업 시간 */}
          <div>
            <h3 className="text-sm font-semibold mb-3 text-foreground flex items-center gap-1.5">
              ⏱ 가동 및 작업 정보
            </h3>
            <div className="grid grid-cols-2 gap-4 max-w-sm">
              <div className="space-y-1">
                <Label className="flex items-center gap-1 text-xs">
                  작업시간 (h) <span className="text-destructive">*</span>
                  <InfoTooltip content="해당 라인의 실제 가동 시간. 시간당 생산량(t/h) 계산 분모로 쓰입니다." />
                </Label>
                <Input type="number" step="0.5" min="0" placeholder="예: 420" {...register('work_hours')} />
              </div>
              <div className="space-y-1">
                <Label className="flex items-center gap-1 text-xs">
                  작업횟수 <span className="text-destructive">*</span>
                  <InfoTooltip content="월간 총 단조 배치 작업 횟수" />
                </Label>
                <Input type="number" step="1" min="0" placeholder="예: 35" {...register('work_count')} />
              </div>
            </div>
          </div>

          {/* 실시간 계산 */}
          {(tph != null || rate != null) && (
            <div className="p-3.5 rounded-lg bg-primary/5 border border-primary/20 space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Calculator className="h-4 w-4 text-primary" />
                  <span className="text-xs font-bold">저장 전 실시간 미리보기 (이렇게 저장됩니다)</span>
                </div>
                <AutoCalcBadge formula="실적 톤 ÷ 작업시간(h) 및 실적 톤 ÷ 목표 톤" />
              </div>
              <div className="grid grid-cols-2 gap-4 pt-1">
                {tph != null && (
                  <div>
                    <span className="text-xs text-muted-foreground block">예상 시간당 생산량 (TPH):</span>
                    <span className="text-lg font-extrabold text-primary">{formatTonPerHour(tph)} 톤/h</span>
                  </div>
                )}
                {rate != null && (
                  <div>
                    <span className="text-xs text-muted-foreground block">예상 목표 달성률:</span>
                    <span className={`text-lg font-extrabold ${rate >= 100 ? 'text-blue-600 dark:text-blue-400' : 'text-amber-600 dark:text-amber-400'}`}>
                      {formatPercent(rate)}
                    </span>
                  </div>
                )}
              </div>
            </div>
          )}

          <div className="space-y-1.5">
            <Label>비고</Label>
            <Textarea placeholder="특이사항을 입력하세요" rows={2} {...register('note')} />
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
