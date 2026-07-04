'use client'

import { useEffect, useMemo } from 'react'
import { Controller, useForm, useWatch, type Resolver } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useQuery } from '@tanstack/react-query'
import { Loader2, Save, Calculator } from 'lucide-react'
import { productionRecordSchema, type ProductionRecordInput } from '@/lib/validations'
import { useUpsertProductionRecord } from '@/hooks/use-production-records'
import { useFurnaces, useLines, useProducts } from '@/hooks/use-dashboard'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { Textarea } from '@/components/ui/textarea'
import { calcTonPerHour, currentDateString, formatTonPerHour } from '@/lib/utils'
import { DB } from '@/types/db'

function todayDate() {
  return currentDateString()
}

export default function ProductionRecordForm() {
  const supabase = useMemo(() => createClient(), [])
  const { data: lines = [] } = useLines()
  const { data: furnaces = [] } = useFurnaces()
  const { data: products = [] } = useProducts()
  const upsert = useUpsertProductionRecord()

  const { data: processRows = [] } = useQuery({
    queryKey: ['production-process-options'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from(DB.tables.productionRecords)
        .select('process')
        .order('created_at', { ascending: false })
        .limit(200)

      if (error) throw error
      return Array.from(
        new Set((data ?? []).map((row) => String((row as { process?: string | null }).process ?? '').trim()).filter(Boolean))
      )
    },
  })

  const lineOptions = useMemo(
    () => lines.map((line) => ({ value: line.code, label: `${line.code} · ${line.name}` })),
    [lines]
  )
  const furnaceOptions = useMemo(
    () => furnaces.map((furnace) => ({ value: furnace.code, label: `${furnace.code} · ${furnace.name}` })),
    [furnaces]
  )
  const productOptions = useMemo(
    () => products.map((product) => ({ value: product.name, label: `${product.name} (${product.material})` })),
    [products]
  )
  const materialOptions = useMemo(() => {
    const values = Array.from(new Set(products.map((product) => product.material).filter(Boolean)))
    return values.map((material) => ({ value: material, label: material }))
  }, [products])
  const processOptions = useMemo(
    () => Array.from(new Set(['기본', ...processRows])).map((value) => ({ value, label: value })),
    [processRows]
  )

  const {
    register,
    handleSubmit,
    setValue,
    reset,
    control,
    formState: { errors },
  } = useForm<ProductionRecordInput>({
    resolver: zodResolver(productionRecordSchema) as unknown as Resolver<ProductionRecordInput>,
    defaultValues: {
      work_date: todayDate(),
      dept_line: '',
      shift: 'day',
      order_no: '',
      product: null,
      material: null,
      process: '',
      order_size: '',
      work_size: '',
      order_weight: 0,
      charge_weight: 0,
      furnace_code: '',
      work_hours: 0,
      work_count: 0,
      entered_by_name: '',
      note: '',
    },
  })

  const productValue = useWatch({ control, name: 'product' })
  const orderWeight = useWatch({ control, name: 'order_weight' })
  const workHours = useWatch({ control, name: 'work_hours' })
  const workCount = useWatch({ control, name: 'work_count' })
  const chargeWeight = useWatch({ control, name: 'charge_weight' })
  const tph = calcTonPerHour(orderWeight, workHours)
  const tpr = workCount > 0 ? orderWeight / workCount : null

  useEffect(() => {
    if (!productValue) return
    const matched = products.find((product) => product.name === productValue)
    if (matched) {
      setValue('material', matched.material, { shouldDirty: true, shouldValidate: true })
    }
  }, [productValue, products, setValue])

  const onSubmit = async (data: ProductionRecordInput) => {
    await upsert.mutateAsync(data)
    reset({
      work_date: data.work_date,
      dept_line: data.dept_line,
      shift: data.shift ?? 'day',
      order_no: '',
      product: null,
      material: null,
      process: data.process,
      order_size: '',
      work_size: '',
      order_weight: 0,
      charge_weight: 0,
      furnace_code: data.furnace_code,
      work_hours: 0,
      work_count: 0,
      entered_by_name: data.entered_by_name ?? '',
      note: '',
    })
  }

  return (
    <Card className="border-border/70 bg-card/85 backdrop-blur-sm">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Calculator className="h-4 w-4 text-primary" />
          생산 실적 단건 입력
        </CardTitle>
        <CardDescription>
          수주번호와 공정 옆에 작업시간·작업횟수를 바로 입력하고, 수주중량·투입중량은 즉시 계산값으로 확인합니다.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <div className="space-y-1.5">
              <Label>작업일 *</Label>
              <Controller
                control={control}
                name="work_date"
                render={({ field }) => (
                  <Input type="date" value={field.value ?? ''} onChange={field.onChange} onBlur={field.onBlur} ref={field.ref} />
                )}
              />
              {errors.work_date && <p className="text-xs text-destructive">{errors.work_date.message}</p>}
            </div>
            <div className="space-y-1.5">
              <Label>작업부서/라인 *</Label>
              <Controller
                control={control}
                name="dept_line"
                render={({ field }) => (
                  <Select value={field.value ?? ''} onValueChange={field.onChange}>
                    <SelectTrigger>
                      <SelectValue placeholder="선택" />
                    </SelectTrigger>
                    <SelectContent>
                      {lineOptions.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
              {errors.dept_line && <p className="text-xs text-destructive">{errors.dept_line.message}</p>}
            </div>
            <div className="space-y-1.5">
              <Label>주야 *</Label>
              <Controller
                control={control}
                name="shift"
                render={({ field }) => (
                  <Select value={field.value ?? 'day'} onValueChange={field.onChange}>
                    <SelectTrigger>
                      <SelectValue placeholder="선택" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="day">주간</SelectItem>
                      <SelectItem value="night">야간</SelectItem>
                      <SelectItem value="both">주야합계</SelectItem>
                    </SelectContent>
                  </Select>
                )}
              />
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
                    <SelectContent className="max-h-64">
                      {furnaceOptions.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
              {errors.furnace_code && <p className="text-xs text-destructive">{errors.furnace_code.message}</p>}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 xl:grid-cols-4">
            <div className="space-y-1.5">
              <Label>수주번호 *</Label>
              <Input placeholder="예: ORD-2026-001" {...register('order_no')} />
              {errors.order_no && <p className="text-xs text-destructive">{errors.order_no.message}</p>}
            </div>
            <div className="space-y-1.5">
              <Label>공정 *</Label>
              <Controller
                control={control}
                name="process"
                render={({ field }) => (
                  <Select value={field.value ?? ''} onValueChange={field.onChange}>
                    <SelectTrigger>
                      <SelectValue placeholder="선택" />
                    </SelectTrigger>
                    <SelectContent>
                      {processOptions.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
              {errors.process && <p className="text-xs text-destructive">{errors.process.message}</p>}
            </div>
            <div className="space-y-1.5">
              <Label>작업시간(h) *</Label>
              <Input type="number" step="0.1" min="0" placeholder="0" {...register('work_hours')} />
              {errors.work_hours && <p className="text-xs text-destructive">{errors.work_hours.message}</p>}
            </div>
            <div className="space-y-1.5">
              <Label>작업횟수 *</Label>
              <Input type="number" step="1" min="0" placeholder="0" {...register('work_count')} />
              {errors.work_count && <p className="text-xs text-destructive">{errors.work_count.message}</p>}
            </div>
          </div>

          <Separator />

          <div className="grid grid-cols-1 gap-4 xl:grid-cols-4">
            <div className="space-y-1.5">
              <Label>제품</Label>
              <Controller
                control={control}
                name="product"
                render={({ field }) => (
                  <Select value={field.value ?? '_none'} onValueChange={(value) => field.onChange(value === '_none' ? null : value)}>
                    <SelectTrigger>
                      <SelectValue placeholder="선택" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="_none">미선택</SelectItem>
                      {productOptions.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </div>
            <div className="space-y-1.5">
              <Label>재질</Label>
              <Controller
                control={control}
                name="material"
                render={({ field }) => (
                  <Select value={field.value ?? '_none'} onValueChange={(value) => field.onChange(value === '_none' ? null : value)}>
                    <SelectTrigger>
                      <SelectValue placeholder="선택" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="_none">미선택</SelectItem>
                      {materialOptions.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </div>
            <div className="space-y-1.5">
              <Label>수주치수</Label>
              <Input placeholder="예: 1200×800" {...register('order_size')} />
            </div>
            <div className="space-y-1.5">
              <Label>작업치수</Label>
              <Input placeholder="예: 1180×780" {...register('work_size')} />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 xl:grid-cols-4">
            <div className="space-y-1.5">
              <Label>수주중량(톤) *</Label>
              <Input type="number" step="0.1" min="0" placeholder="0" {...register('order_weight')} />
              {errors.order_weight && <p className="text-xs text-destructive">{errors.order_weight.message}</p>}
            </div>
            <div className="space-y-1.5">
              <Label>투입중량(kg) *</Label>
              <Input type="number" step="1" min="0" placeholder="0" {...register('charge_weight')} />
              {errors.charge_weight && <p className="text-xs text-destructive">{errors.charge_weight.message}</p>}
            </div>
            <div className="space-y-1.5 xl:col-span-2">
              <Label>입력자</Label>
              <Input placeholder="입력자 이름" {...register('entered_by_name')} />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>비고</Label>
            <Textarea rows={2} placeholder="메모" {...register('note')} />
          </div>

          <div className="rounded-xl border bg-primary/5 p-4">
            <div className="flex items-center gap-2">
              <Calculator className="h-4 w-4 text-primary" />
              <p className="text-sm font-semibold">저장 전 미리보기</p>
            </div>
            <div className="mt-3 grid gap-3 sm:grid-cols-3">
              <div className="rounded-lg border bg-background/80 p-3">
                <p className="text-xs text-muted-foreground">시간당 생산량</p>
                <p className="mt-1 text-lg font-bold">{formatTonPerHour(tph)} t/h</p>
              </div>
              <div className="rounded-lg border bg-background/80 p-3">
                <p className="text-xs text-muted-foreground">1회당 생산량</p>
                <p className="mt-1 text-lg font-bold">{tpr != null ? tpr.toFixed(2) : '-'}</p>
              </div>
              <div className="rounded-lg border bg-background/80 p-3">
                <p className="text-xs text-muted-foreground">투입중량</p>
                <p className="mt-1 text-lg font-bold">{Number(chargeWeight ?? 0).toLocaleString('ko-KR')} kg</p>
              </div>
            </div>
          </div>

          <Button type="submit" disabled={upsert.isPending} className="w-full sm:w-auto">
            {upsert.isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                저장 중...
              </>
            ) : (
              <>
                <Save className="mr-2 h-4 w-4" />
                저장
              </>
            )}
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}
