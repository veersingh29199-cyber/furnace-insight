'use client'

import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { Loader2, Pencil, Plus, Save } from 'lucide-react'
import { toast } from 'sonner'
import { DB, DB_CONFLICT_KEYS } from '@/types/db'
import type { AppSetting, Benchmark, BenchmarkOrg, Furnace, Line, Product, RawMaterialSpec, WorkStandard } from '@/types'
import type { TargetMetric } from '@/types'

const supabase = createClient()

const BENCHMARK_ORGS: BenchmarkOrg[] = ['두산', '태상', '태웅']
const BENCHMARK_SCOPES = ['전사', '실적', '부서']
const BENCHMARK_METRICS: TargetMetric[] = ['gas_unit', 'ton_per_hour', 'output']
const WORK_BASIS_OPTIONS = [
  { value: 'charge', label: '장입 기준' },
  { value: 'product', label: '제품 기준' },
] as const

function formatNumber(value: number | null | undefined) {
  if (value == null || Number.isNaN(value)) return '-'
  return value.toLocaleString('ko-KR', { maximumFractionDigits: 2 })
}

function stringifySettingValue(value: AppSetting['value']) {
  if (value == null) return ''
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  return JSON.stringify(value, null, 2)
}

function parseSettingValue(text: string): AppSetting['value'] {
  const trimmed = text.trim()
  if (!trimmed) return null
  try {
    return JSON.parse(trimmed)
  } catch {
    return trimmed
  }
}

function useFurnacesAdmin() {
  return useQuery({
    queryKey: ['furnaces-admin'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from(DB.tables.furnaces)
        .select('id, code, name, dept, active')
        .order(DB.furnaces.code)
      if (error) throw error
      return (data ?? []) as Furnace[]
    },
  })
}

function useLinesAdmin() {
  return useQuery({
    queryKey: ['lines-admin'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from(DB.tables.lines)
        .select('id, code, name, capacity_class, active')
        .order(DB.lines.code)
      if (error) throw error
      return (data ?? []) as Line[]
    },
  })
}

function useProductsAdmin() {
  return useQuery({
    queryKey: ['products-admin'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from(DB.tables.products)
        .select('id, name, material, std_ton_per_hour, std_gas_unit, active')
        .order(DB.products.name)
      if (error) throw error
      return (data ?? []) as Product[]
    },
  })
}

function useBenchmarksAdmin() {
  return useQuery({
    queryKey: ['benchmarks-admin'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from(DB.tables.benchmarks)
        .select('id, org, metric, scope, value')
        .order(DB.benchmarks.org)
        .order(DB.benchmarks.metric)
        .order(DB.benchmarks.scope)
      if (error) throw error
      return (data ?? []) as Benchmark[]
    },
  })
}

function useWorkStandardsAdmin() {
  return useQuery({
    queryKey: ['work-standards-admin'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from(DB.tables.workStandards)
        .select('id, dept, product, material, basis, min_ton, max_ton, order_size, std_work_count, note')
        .order(DB.workStandards.dept)
        .order(DB.workStandards.product)
        .order(DB.workStandards.material)
      if (error) throw error
      return (data ?? []) as WorkStandard[]
    },
  })
}

function useRawMaterialSpecsAdmin() {
  return useQuery({
    queryKey: ['raw-material-specs-admin'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from(DB.tables.rawMaterialSpecs)
        .select('id, product, material, raw_material, spec, note')
        .order(DB.rawMaterialSpecs.product)
        .order(DB.rawMaterialSpecs.material)
        .order(DB.rawMaterialSpecs.rawMaterial)
      if (error) throw error
      return (data ?? []) as RawMaterialSpec[]
    },
  })
}

function useAppSettingsAdmin() {
  return useQuery({
    queryKey: ['app-settings-admin'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from(DB.tables.appSettings)
        .select('key, value, note')
        .order(DB.appSettings.key)
      if (error) throw error
      return (data ?? []) as AppSetting[]
    },
  })
}

function FurnaceRow({ furnace }: { furnace: Furnace }) {
  const qc = useQueryClient()
  const [deptDraft, setDeptDraft] = useState(furnace.dept ?? '')

  useEffect(() => {
    setDeptDraft(furnace.dept ?? '')
  }, [furnace.dept])

  const saveDept = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from(DB.tables.furnaces)
        .update({ dept: deptDraft.trim() || null })
        .eq(DB.furnaces.code, furnace.code)
      if (error) throw error
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['furnaces-admin'] })
      await qc.invalidateQueries({ queryKey: ['furnaces'] })
      toast.success(`${furnace.code} 부서 매핑을 저장했습니다.`)
    },
    onError: (error: Error) => toast.error(error.message),
  })

  const toggleActive = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from(DB.tables.furnaces)
        .update({ active: !furnace.active })
        .eq(DB.furnaces.code, furnace.code)
      if (error) throw error
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['furnaces-admin'] })
      await qc.invalidateQueries({ queryKey: ['furnaces'] })
    },
    onError: (error: Error) => toast.error(error.message),
  })

  const dirty = deptDraft.trim() !== (furnace.dept ?? '')

  return (
    <TableRow>
      <TableCell className="font-medium">{furnace.code}</TableCell>
      <TableCell>{furnace.name}</TableCell>
      <TableCell>
        <Input
          value={deptDraft}
          onChange={(event) => setDeptDraft(event.target.value)}
          placeholder="P5 / P8 / P15 / R/M"
          className="h-8"
        />
      </TableCell>
      <TableCell>
        <Switch checked={furnace.active} onCheckedChange={() => toggleActive.mutate()} disabled={toggleActive.isPending} />
      </TableCell>
      <TableCell className="text-right">
        <Button
          size="sm"
          variant="outline"
          onClick={() => saveDept.mutate()}
          disabled={!dirty || saveDept.isPending}
        >
          {saveDept.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
          저장
        </Button>
      </TableCell>
    </TableRow>
  )
}

function ProductRow({ product }: { product: Product }) {
  const qc = useQueryClient()
  const toggle = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from(DB.tables.products)
        .update({ active: !product.active })
        .eq('name', product.name)
        .eq('material', product.material)
      if (error) throw error
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['products-admin'] })
      await qc.invalidateQueries({ queryKey: ['products'] })
    },
    onError: (error: Error) => toast.error(error.message),
  })

  return (
    <TableRow>
      <TableCell className="font-medium">{product.name}</TableCell>
      <TableCell>{product.material}</TableCell>
      <TableCell className="text-right">{formatNumber(product.std_ton_per_hour)}</TableCell>
      <TableCell className="text-right">{formatNumber(product.std_gas_unit)}</TableCell>
      <TableCell>
        <Switch checked={product.active} onCheckedChange={() => toggle.mutate()} disabled={toggle.isPending} />
      </TableCell>
    </TableRow>
  )
}

function AddProductDialog() {
  const qc = useQueryClient()
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [material, setMaterial] = useState('')
  const [tph, setTph] = useState('')
  const [gu, setGu] = useState('')

  const add = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from(DB.tables.products).insert({
        name,
        material,
        std_ton_per_hour: tph ? Number(tph) : null,
        std_gas_unit: gu ? Number(gu) : null,
      })
      if (error) throw error
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['products-admin'] })
      await qc.invalidateQueries({ queryKey: ['products'] })
      toast.success('제품이 추가되었습니다.')
      setOpen(false)
      setName('')
      setMaterial('')
      setTph('')
      setGu('')
    },
    onError: (error: Error) => toast.error(error.message),
  })

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger className="inline-flex items-center justify-center whitespace-nowrap rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90">
        <Plus className="mr-2 h-4 w-4" />
        제품 추가
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>새 제품 추가</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 pt-2">
          <div className="space-y-1.5">
            <Label>제품명</Label>
            <Input value={name} onChange={(event) => setName(event.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>재질</Label>
            <Input value={material} onChange={(event) => setMaterial(event.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>표준 톤/h</Label>
              <Input type="number" step="0.1" value={tph} onChange={(event) => setTph(event.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>표준 원단위</Label>
              <Input type="number" step="0.1" value={gu} onChange={(event) => setGu(event.target.value)} />
            </div>
          </div>
          <Button onClick={() => add.mutate()} disabled={!name || !material || add.isPending} className="w-full">
            {add.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            추가
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function BenchmarksPanel() {
  const qc = useQueryClient()
  const { data: benchmarks } = useBenchmarksAdmin()
  const [org, setOrg] = useState<BenchmarkOrg>('두산')
  const [metric, setMetric] = useState<TargetMetric>('gas_unit')
  const [scope, setScope] = useState('전사')
  const [value, setValue] = useState('')

  const loadBenchmark = (row: Benchmark) => {
    setOrg(row.org)
    setMetric(row.metric)
    setScope(row.scope)
    setValue(String(row.value))
  }

  const save = useMutation({
    mutationFn: async () => {
      const payload = {
        org,
        metric,
        scope: scope.trim(),
        value: Number(value),
      }

      const { error } = await supabase
        .from(DB.tables.benchmarks)
        .upsert(payload, { onConflict: DB_CONFLICT_KEYS.benchmarks, ignoreDuplicates: false })

      if (error) throw error
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['benchmarks-admin'] })
      await qc.invalidateQueries({ queryKey: ['benchmarks'] })
      toast.success('벤치마크를 저장했습니다.')
    },
    onError: (error: Error) => toast.error(error.message),
  })

  const canSave = scope.trim().length > 0 && value.trim().length > 0 && Number(value) >= 0

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-sm">
            <Pencil className="h-4 w-4 text-primary" />
            벤치마크 추가 / 수정
          </CardTitle>
          <CardDescription className="text-xs">동일한 조직·지표·범위 조합은 덮어씁니다.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
            <div className="space-y-1.5">
              <Label className="text-xs">조직</Label>
              <Select value={org} onValueChange={(next) => setOrg(next as BenchmarkOrg)}>
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="조직" />
                </SelectTrigger>
                <SelectContent>
                  {BENCHMARK_ORGS.map((option) => (
                    <SelectItem key={option} value={option}>
                      {option}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">지표</Label>
              <Select value={metric} onValueChange={(next) => setMetric(next as TargetMetric)}>
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="지표" />
                </SelectTrigger>
                <SelectContent>
                  {BENCHMARK_METRICS.map((option) => (
                    <SelectItem key={option} value={option}>
                      {option === 'gas_unit' ? '가스원단위' : option === 'ton_per_hour' ? '시간당 생산량' : '생산량'}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">범위</Label>
              <Select value={scope} onValueChange={(next) => setScope(next ?? '전사')}>
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="범위" />
                </SelectTrigger>
                <SelectContent>
                  {BENCHMARK_SCOPES.map((option) => (
                    <SelectItem key={option} value={option}>
                      {option}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">값</Label>
              <Input type="number" step="0.1" value={value} onChange={(event) => setValue(event.target.value)} className="h-9" />
            </div>

            <div className="flex items-end">
              <Button className="h-9 w-full" onClick={() => save.mutate()} disabled={!canSave || save.isPending}>
                {save.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                저장
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">등록된 벤치마크</CardTitle>
          <CardDescription className="text-xs">편집 버튼을 누르면 아래 폼에 값을 불러옵니다.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-hidden rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>조직</TableHead>
                  <TableHead>지표</TableHead>
                  <TableHead>범위</TableHead>
                  <TableHead className="text-right">값</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {benchmarks?.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="font-medium">{row.org}</TableCell>
                    <TableCell>{row.metric === 'gas_unit' ? '가스원단위' : row.metric === 'ton_per_hour' ? '시간당 생산량' : '생산량'}</TableCell>
                    <TableCell>{row.scope}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatNumber(row.value)}</TableCell>
                    <TableCell className="text-right">
                      <Button size="sm" variant="ghost" onClick={() => loadBenchmark(row)}>
                        편집
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
                {!benchmarks?.length && (
                  <TableRow>
                    <TableCell colSpan={5} className="py-8 text-center text-sm text-muted-foreground">
                      아직 등록된 벤치마크가 없습니다.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

function WorkStandardsPanel() {
  const qc = useQueryClient()
  const { data: workStandards } = useWorkStandardsAdmin()
  const [dept, setDept] = useState('')
  const [product, setProduct] = useState('')
  const [material, setMaterial] = useState('')
  const [basis, setBasis] = useState<'charge' | 'product'>('charge')
  const [minTon, setMinTon] = useState('')
  const [maxTon, setMaxTon] = useState('')
  const [orderSize, setOrderSize] = useState('')
  const [stdWorkCount, setStdWorkCount] = useState('')
  const [note, setNote] = useState('')

  const loadWorkStandard = (row: WorkStandard) => {
    setDept(row.dept)
    setProduct(row.product)
    setMaterial(row.material)
    setBasis(row.basis)
    setMinTon(row.min_ton == null ? '' : String(row.min_ton))
    setMaxTon(row.max_ton == null ? '' : String(row.max_ton))
    setOrderSize(row.order_size ?? '')
    setStdWorkCount(String(row.std_work_count))
    setNote(row.note ?? '')
  }

  const save = useMutation({
    mutationFn: async () => {
      const normalizedDept = dept.trim()
      const normalizedProduct = product.trim()
      const normalizedMaterial = material.trim()
      const normalizedOrderSize = orderSize.trim() || null
      const payload = {
        dept: normalizedDept,
        product: normalizedProduct,
        material: normalizedMaterial,
        basis,
        min_ton: minTon.trim() === '' ? null : Number(minTon),
        max_ton: maxTon.trim() === '' ? null : Number(maxTon),
        order_size: normalizedOrderSize,
        std_work_count: Number(stdWorkCount),
        note: note.trim() || null,
      }

      let query = supabase
        .from(DB.tables.workStandards)
        .select('id')
        .eq(DB.workStandards.dept, normalizedDept)
        .eq(DB.workStandards.product, normalizedProduct)
        .eq(DB.workStandards.material, normalizedMaterial)
        .eq(DB.workStandards.basis, basis)

      if (normalizedOrderSize == null) {
        query = query.is(DB.workStandards.orderSize, null)
      } else {
        query = query.eq(DB.workStandards.orderSize, normalizedOrderSize)
      }

      const { data: existing, error: lookupError } = await query.maybeSingle()
      if (lookupError) throw lookupError

      if (existing?.id) {
        const { error } = await supabase.from(DB.tables.workStandards).update(payload).eq('id', existing.id)
        if (error) throw error
      } else {
        const { error } = await supabase.from(DB.tables.workStandards).insert(payload)
        if (error) throw error
      }
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['work-standards-admin'] })
      toast.success('표준작업수를 저장했습니다.')
    },
    onError: (error: Error) => toast.error(error.message),
  })

  const canSave =
    dept.trim().length > 0 &&
    product.trim().length > 0 &&
    material.trim().length > 0 &&
    stdWorkCount.trim().length > 0 &&
    Number(stdWorkCount) >= 0

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-sm">
            <Pencil className="h-4 w-4 text-primary" />
            표준작업수 마스터
          </CardTitle>
          <CardDescription className="text-xs">부서·제품·재질·기준 조합으로 표준작업수를 관리합니다.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <div className="space-y-1.5">
              <Label className="text-xs">부서</Label>
              <Input value={dept} onChange={(event) => setDept(event.target.value)} placeholder="P5 / P8 / P15 / R/M" className="h-9" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">제품</Label>
              <Input value={product} onChange={(event) => setProduct(event.target.value)} className="h-9" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">재질</Label>
              <Input value={material} onChange={(event) => setMaterial(event.target.value)} className="h-9" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">기준</Label>
              <Select value={basis} onValueChange={(next) => setBasis(next as 'charge' | 'product')}>
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="기준" />
                </SelectTrigger>
                <SelectContent>
                  {WORK_BASIS_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">최소투입중량</Label>
              <Input type="number" step="0.1" value={minTon} onChange={(event) => setMinTon(event.target.value)} className="h-9" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">최대투입중량</Label>
              <Input type="number" step="0.1" value={maxTon} onChange={(event) => setMaxTon(event.target.value)} className="h-9" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">수주치수</Label>
              <Input value={orderSize} onChange={(event) => setOrderSize(event.target.value)} className="h-9" placeholder="선택 입력" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">표준작업수</Label>
              <Input type="number" step="1" value={stdWorkCount} onChange={(event) => setStdWorkCount(event.target.value)} className="h-9" />
            </div>
            <div className="space-y-1.5 md:col-span-2 xl:col-span-3">
              <Label className="text-xs">비고</Label>
              <Input value={note} onChange={(event) => setNote(event.target.value)} className="h-9" placeholder="선택 입력" />
            </div>
            <div className="flex items-end">
              <Button className="h-9 w-full" onClick={() => save.mutate()} disabled={!canSave || save.isPending}>
                {save.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                저장
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">등록된 표준작업수</CardTitle>
          <CardDescription className="text-xs">편집 버튼으로 값을 불러와 바로 수정할 수 있습니다.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-hidden rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>부서</TableHead>
                  <TableHead>제품</TableHead>
                  <TableHead>재질</TableHead>
                  <TableHead>기준</TableHead>
                  <TableHead className="text-right">최소</TableHead>
                  <TableHead className="text-right">최대</TableHead>
                  <TableHead className="text-right">작업수</TableHead>
                  <TableHead>비고</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {workStandards?.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="font-medium">{row.dept}</TableCell>
                    <TableCell>{row.product}</TableCell>
                    <TableCell>{row.material}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-xs">
                        {row.basis === 'charge' ? '장입 기준' : '제품 기준'}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{formatNumber(row.min_ton)}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatNumber(row.max_ton)}</TableCell>
                    <TableCell className="text-right tabular-nums font-semibold">{formatNumber(row.std_work_count)}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{row.note ?? '-'}</TableCell>
                    <TableCell className="text-right">
                      <Button size="sm" variant="ghost" onClick={() => loadWorkStandard(row)}>
                        편집
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
                {!workStandards?.length && (
                  <TableRow>
                    <TableCell colSpan={9} className="py-8 text-center text-sm text-muted-foreground">
                      아직 등록된 표준작업수가 없습니다.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

function RawMaterialSpecsPanel() {
  const qc = useQueryClient()
  const { data: specs } = useRawMaterialSpecsAdmin()
  const [product, setProduct] = useState('')
  const [material, setMaterial] = useState('')
  const [rawMaterial, setRawMaterial] = useState('')
  const [spec, setSpec] = useState('')
  const [note, setNote] = useState('')

  const loadSpec = (row: RawMaterialSpec) => {
    setProduct(row.product)
    setMaterial(row.material)
    setRawMaterial(row.raw_material)
    setSpec(row.spec)
    setNote(row.note ?? '')
  }

  const save = useMutation({
    mutationFn: async () => {
      const payload = {
        product: product.trim(),
        material: material.trim(),
        raw_material: rawMaterial.trim(),
        spec: spec.trim(),
        note: note.trim() || null,
      }

      const { error } = await supabase
        .from(DB.tables.rawMaterialSpecs)
        .upsert(payload, { onConflict: DB_CONFLICT_KEYS.rawMaterialSpecs, ignoreDuplicates: false })

      if (error) throw error
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['raw-material-specs-admin'] })
      toast.success('원소재 규격을 저장했습니다.')
    },
    onError: (error: Error) => toast.error(error.message),
  })

  const canSave = product.trim().length > 0 && material.trim().length > 0 && rawMaterial.trim().length > 0 && spec.trim().length > 0

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-sm">
            <Pencil className="h-4 w-4 text-primary" />
            원소재 규격
          </CardTitle>
          <CardDescription className="text-xs">제품·재질·원소재 기준의 규격을 관리합니다.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
            <div className="space-y-1.5">
              <Label className="text-xs">제품</Label>
              <Input value={product} onChange={(event) => setProduct(event.target.value)} className="h-9" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">재질</Label>
              <Input value={material} onChange={(event) => setMaterial(event.target.value)} className="h-9" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">원소재</Label>
              <Input value={rawMaterial} onChange={(event) => setRawMaterial(event.target.value)} className="h-9" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">규격</Label>
              <Input value={spec} onChange={(event) => setSpec(event.target.value)} className="h-9" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">비고</Label>
              <Input value={note} onChange={(event) => setNote(event.target.value)} className="h-9" placeholder="선택 입력" />
            </div>
            <div className="flex items-end md:col-span-2 xl:col-span-5">
              <Button className="h-9" onClick={() => save.mutate()} disabled={!canSave || save.isPending}>
                {save.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                저장
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">등록된 원소재 규격</CardTitle>
          <CardDescription className="text-xs">편집 버튼으로 값을 불러와 바로 수정할 수 있습니다.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-hidden rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>제품</TableHead>
                  <TableHead>재질</TableHead>
                  <TableHead>원소재</TableHead>
                  <TableHead>규격</TableHead>
                  <TableHead>비고</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {specs?.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="font-medium">{row.product}</TableCell>
                    <TableCell>{row.material}</TableCell>
                    <TableCell>{row.raw_material}</TableCell>
                    <TableCell>{row.spec}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{row.note ?? '-'}</TableCell>
                    <TableCell className="text-right">
                      <Button size="sm" variant="ghost" onClick={() => loadSpec(row)}>
                        편집
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
                {!specs?.length && (
                  <TableRow>
                    <TableCell colSpan={6} className="py-8 text-center text-sm text-muted-foreground">
                      아직 등록된 원소재 규격이 없습니다.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

function AppSettingsPanel() {
  const qc = useQueryClient()
  const { data: settings } = useAppSettingsAdmin()
  const [key, setKey] = useState('')
  const [valueText, setValueText] = useState('')
  const [note, setNote] = useState('')

  const loadSetting = (row: AppSetting) => {
    setKey(row.key)
    setValueText(stringifySettingValue(row.value))
    setNote(row.note ?? '')
  }

  const save = useMutation({
    mutationFn: async () => {
      const payload = {
        key: key.trim(),
        value: parseSettingValue(valueText),
        note: note.trim() || null,
      }

      const { error } = await supabase
        .from(DB.tables.appSettings)
        .upsert(payload, { onConflict: DB_CONFLICT_KEYS.appSettings, ignoreDuplicates: false })

      if (error) throw error
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['app-settings-admin'] })
      toast.success('설정값을 저장했습니다.')
    },
    onError: (error: Error) => toast.error(error.message),
  })

  const canSave = key.trim().length > 0

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-sm">
            <Pencil className="h-4 w-4 text-primary" />
            app_settings 관리
          </CardTitle>
          <CardDescription className="text-xs">
            운영시간, 교대 수처럼 앱 전반에서 쓰는 값을 저장합니다. JSON도 그대로 넣을 수 있습니다.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <div className="space-y-1.5">
              <Label className="text-xs">키</Label>
              <Input value={key} onChange={(event) => setKey(event.target.value)} className="h-9" placeholder="operating_hours_per_day" />
            </div>
            <div className="space-y-1.5 md:col-span-2">
              <Label className="text-xs">값</Label>
              <Textarea
                value={valueText}
                onChange={(event) => setValueText(event.target.value)}
                className="min-h-24 font-mono text-xs"
                placeholder='예: 24 또는 {"from":"06:00","to":"18:00"}'
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">비고</Label>
              <Input value={note} onChange={(event) => setNote(event.target.value)} className="h-9" placeholder="선택 입력" />
            </div>
            <div className="flex items-end">
              <Button className="h-9 w-full" onClick={() => save.mutate()} disabled={!canSave || save.isPending}>
                {save.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                저장
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">등록된 설정값</CardTitle>
          <CardDescription className="text-xs">편집 버튼으로 값을 불러와 바로 수정할 수 있습니다.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-hidden rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>키</TableHead>
                  <TableHead>값</TableHead>
                  <TableHead>비고</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {settings?.map((row) => (
                  <TableRow key={row.key}>
                    <TableCell className="font-mono text-xs">{row.key}</TableCell>
                    <TableCell className="whitespace-pre-wrap break-all text-xs">
                      {stringifySettingValue(row.value) || '-'}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">{row.note ?? '-'}</TableCell>
                    <TableCell className="text-right">
                      <Button size="sm" variant="ghost" onClick={() => loadSetting(row)}>
                        편집
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
                {!settings?.length && (
                  <TableRow>
                    <TableCell colSpan={4} className="py-8 text-center text-sm text-muted-foreground">
                      아직 등록된 설정값이 없습니다.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

export default function MasterDataPanel() {
  const { data: furnaces } = useFurnacesAdmin()
  const { data: lines } = useLinesAdmin()
  const { data: products } = useProductsAdmin()

  const furnaceDeptSummary = useMemo(() => {
    const values = new Set(
      (furnaces ?? [])
        .map((furnace) => furnace.dept)
        .filter((value): value is string => Boolean(value))
    )
    return Array.from(values)
  }, [furnaces])

  return (
    <Tabs defaultValue="furnaces">
      <TabsList className="flex w-full flex-wrap gap-1">
        <TabsTrigger value="furnaces">가열로</TabsTrigger>
        <TabsTrigger value="lines">라인</TabsTrigger>
        <TabsTrigger value="products">제품</TabsTrigger>
        <TabsTrigger value="benchmarks">벤치마크</TabsTrigger>
        <TabsTrigger value="work-standards">표준작업수</TabsTrigger>
        <TabsTrigger value="raw-material-specs">원소재 규격</TabsTrigger>
        <TabsTrigger value="app-settings">설정값</TabsTrigger>
      </TabsList>

      <TabsContent value="furnaces" className="mt-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">가열로 목록 ({furnaces?.length ?? 0}기)</CardTitle>
            <CardDescription className="text-xs">
              호기별 부서를 지정하면 가스 원단위를 부서 단위로 귀속할 수 있습니다.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="mb-3 flex flex-wrap gap-2">
              {furnaceDeptSummary.map((dept) => (
                <Badge key={dept} variant="outline">
                  {dept}
                </Badge>
              ))}
              {!furnaceDeptSummary.length && (
                <span className="text-xs text-muted-foreground">아직 부서 매핑이 없습니다.</span>
              )}
            </div>
            <div className="rounded-lg border overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>코드</TableHead>
                    <TableHead>이름</TableHead>
                    <TableHead>부서</TableHead>
                    <TableHead>활성화</TableHead>
                    <TableHead className="text-right">저장</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {furnaces?.map((furnace) => (
                    <FurnaceRow key={furnace.id} furnace={furnace} />
                  ))}
                  {!furnaces?.length && (
                    <TableRow>
                      <TableCell colSpan={5} className="py-8 text-center text-sm text-muted-foreground">
                        아직 등록된 가열로가 없습니다.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </TabsContent>

      <TabsContent value="lines" className="mt-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">라인 목록</CardTitle>
            <CardDescription className="text-xs">라인은 현재 활성 상태와 분류만 확인합니다.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="rounded-lg border overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>코드</TableHead>
                    <TableHead>이름</TableHead>
                    <TableHead>분류</TableHead>
                    <TableHead>상태</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {lines?.map((line) => (
                    <TableRow key={line.id}>
                      <TableCell className="font-medium">{line.code}</TableCell>
                      <TableCell>{line.name}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-xs">
                          {line.capacity_class === 'ringmill' ? '링밀' : `${line.capacity_class}톤`}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant={line.active ? 'default' : 'secondary'}>{line.active ? '활성' : '비활성'}</Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                  {!lines?.length && (
                    <TableRow>
                      <TableCell colSpan={4} className="py-8 text-center text-sm text-muted-foreground">
                        아직 등록된 라인이 없습니다.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </TabsContent>

      <TabsContent value="products" className="mt-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-3 pb-3">
            <div>
              <CardTitle className="text-sm">제품 목록</CardTitle>
              <CardDescription className="text-xs">제품 추가와 활성 상태를 관리합니다.</CardDescription>
            </div>
            <AddProductDialog />
          </CardHeader>
          <CardContent>
            <div className="rounded-lg border overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>제품명</TableHead>
                    <TableHead>재질</TableHead>
                    <TableHead className="text-right">표준 톤/h</TableHead>
                    <TableHead className="text-right">표준 원단위</TableHead>
                    <TableHead>활성화</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {products?.map((product) => (
                    <ProductRow key={product.id} product={product} />
                  ))}
                  {!products?.length && (
                    <TableRow>
                      <TableCell colSpan={5} className="py-8 text-center text-sm text-muted-foreground">
                        아직 등록된 제품이 없습니다.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </TabsContent>

      <TabsContent value="benchmarks" className="mt-4">
        <BenchmarksPanel />
      </TabsContent>

      <TabsContent value="work-standards" className="mt-4">
        <WorkStandardsPanel />
      </TabsContent>

      <TabsContent value="raw-material-specs" className="mt-4">
        <RawMaterialSpecsPanel />
      </TabsContent>

      <TabsContent value="app-settings" className="mt-4">
        <AppSettingsPanel />
      </TabsContent>
    </Tabs>
  )
}
