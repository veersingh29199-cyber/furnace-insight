'use client'

import { useForm } from 'react-hook-form'
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
import { useEffect, useState } from 'react'

export default function ProductionRecordForm() {
  const { data: lines }    = useLines()
  const { data: products } = useProducts()
  const upsert = useUpsertProductionRecord()

  const {
    register, handleSubmit, setValue, watch, reset,
    formState: { errors },
  } = useForm<ProductionRecordInput>({
    resolver: zodResolver(productionRecordSchema) as any,
    defaultValues: {
      work_month:         currentMonthDate(),
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
  const [actualTon, workHours, planTon] = watch(['actual_ton', 'work_hours', 'plan_ton'])
  const tph  = calcTonPerHour(actualTon, workHours)
  const rate = calcAchievementRate(actualTon, planTon)

  const onSubmit = async (data: ProductionRecordInput) => {
    await upsert.mutateAsync(data)
    reset({ work_month: data.work_month, line_id: data.line_id })
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">월별 생산 실적 입력</CardTitle>
        <CardDescription>라인·제품·교대조별로 목표와 실적을 입력합니다. 같은 조건으로 다시 저장하면 덮어씁니다.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
          {/* 기본 정보 */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="space-y-1.5">
              <Label>작업월 *</Label>
              <Input type="month" {...register('work_month', {
                setValueAs: v => v ? `${v}-01` : '',
              })}
              defaultValue={currentMonthDate().substring(0, 7)}
              onChange={e => setValue('work_month', e.target.value ? `${e.target.value}-01` : '')}
              />
              {errors.work_month && <p className="text-xs text-destructive">{errors.work_month.message}</p>}
            </div>

            <div className="space-y-1.5">
              <Label>라인 *</Label>
              <Select onValueChange={(v: string | null) => setValue('line_id', String(v ?? ''))}>
                <SelectTrigger><SelectValue placeholder="라인 선택" /></SelectTrigger>
                <SelectContent>
                  {lines?.map(l => (
                    <SelectItem key={l.id} value={l.id}>{l.code} — {l.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.line_id && <p className="text-xs text-destructive">{errors.line_id.message}</p>}
            </div>

            <div className="space-y-1.5">
              <Label>제품 (선택)</Label>
              <Select onValueChange={(v: string | null) => setValue('product_id', (!v || v === '_none') ? null : String(v))}>
                <SelectTrigger><SelectValue placeholder="전체 (미선택)" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="_none">전체 (미선택)</SelectItem>
                  {products?.map(p => (
                    <SelectItem key={p.id} value={p.id}>{p.name} ({p.material})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5 max-w-xs">
            <Label>교대조 (선택)</Label>
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
            <h3 className="text-sm font-semibold mb-3 text-muted-foreground">📦 중량 (톤)</h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              {[
                { key: 'plan_ton',           label: '목표 *' },
                { key: 'actual_ton',         label: '실적 *' },
                { key: 'hwangji_ton',        label: '황지' },
                { key: 'cogging_ton',        label: 'COGGING' },
                { key: 'rework_self_ton',    label: '자체재작' },
                { key: 'rework_quality_ton', label: '품질재작' },
              ].map(({ key, label }) => (
                <div key={key} className="space-y-1.5">
                  <Label>{label}</Label>
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
            <h3 className="text-sm font-semibold mb-3 text-muted-foreground">⏱ 작업 정보</h3>
            <div className="grid grid-cols-2 gap-4 max-w-sm">
              <div className="space-y-1.5">
                <Label>작업시간 (h) *</Label>
                <Input type="number" step="0.5" min="0" placeholder="0" {...register('work_hours')} />
              </div>
              <div className="space-y-1.5">
                <Label>작업횟수 *</Label>
                <Input type="number" step="1" min="0" placeholder="0" {...register('work_count')} />
              </div>
            </div>
          </div>

          {/* 실시간 계산 */}
          {(tph != null || rate != null) && (
            <div className="flex items-center gap-4 p-3 rounded-lg bg-muted/50 border border-border text-sm">
              <Calculator className="h-4 w-4 text-muted-foreground flex-shrink-0" />
              {tph != null && (
                <span>시간당 생산량: <strong className="text-primary">{formatTonPerHour(tph)} 톤/h</strong></span>
              )}
              {rate != null && (
                <span>달성률: <strong className={rate >= 100 ? 'text-blue-500' : 'text-amber-500'}>{formatPercent(rate)}</strong></span>
              )}
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
