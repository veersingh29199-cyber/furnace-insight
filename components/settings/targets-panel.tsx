'use client'

import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Plus, Target } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useFurnaces, useLines } from '@/hooks/use-dashboard'
import { DB, DB_CONFLICT_KEYS } from '@/types/db'
import type { Target as TargetType, TargetMetric, TargetScope } from '@/types'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'

const supabase = createClient()

const SCOPE_LABELS: Record<TargetScope, string> = {
  line: '라인',
  furnace: '가열로',
  dept: '부서',
  company: '전사',
}

const METRIC_LABELS: Record<TargetMetric, string> = {
  gas_unit: '가스원단위',
  ton_per_hour: '시간당 생산량',
  output: '생산량',
}

function formatTargetValue(value: number) {
  return value.toLocaleString('ko-KR', { maximumFractionDigits: 1 })
}

export default function TargetsPanel() {
  const qc = useQueryClient()
  const { data: lines } = useLines()
  const { data: furnaces } = useFurnaces()
  const currentYear = new Date().getFullYear()

  const [scope, setScope] = useState<TargetScope>('company')
  const [ref, setRef] = useState('company')
  const [year, setYear] = useState(String(currentYear))
  const [dept, setDept] = useState('P5')
  const [metric, setMetric] = useState<TargetMetric>('gas_unit')
  const [value, setValue] = useState('')
  const [note, setNote] = useState('')

  const { data: targets } = useQuery({
    queryKey: ['targets-admin'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from(DB.tables.targets)
        .select('id, year, dept, scope, ref, metric, target_value, note')
        .order(DB.targets.year, { ascending: false, nullsFirst: false })
        .order(DB.targets.dept, { ascending: true })
        .order(DB.targets.scope, { ascending: true })
        .order(DB.targets.ref, { ascending: true })
        .order(DB.targets.metric, { ascending: true })

      if (error) throw error
      return (data ?? []) as TargetType[]
    },
  })

  const lineOptions = useMemo(
    () => (lines ?? []).map((line) => ({ value: line.code, label: `${line.code} · ${line.name}` })),
    [lines]
  )

  const furnaceOptions = useMemo(
    () => (furnaces ?? []).map((furnace) => ({ value: furnace.code, label: `${furnace.code} · ${furnace.name}` })),
    [furnaces]
  )
  const deptOptions = useMemo(
    () =>
      Array.from(
        new Set(
          (furnaces ?? [])
            .map((furnace) => furnace.dept)
            .filter((value): value is string => Boolean(value))
        )
      ).map((value) => ({ value, label: value })),
    [furnaces]
  )

  const refOptions = scope === 'line' ? lineOptions : scope === 'furnace' ? furnaceOptions : []

  const addTarget = useMutation({
    mutationFn: async () => {
      const normalizedRef = scope === 'company' ? 'company' : scope === 'dept' ? dept.trim() || 'company' : ref.trim()
      const payload = {
        year: Number(year),
        dept: dept.trim() || normalizedRef,
        scope,
        ref: normalizedRef,
        metric,
        target_value: Number(value),
        note: note.trim() || null,
      }

      const { error } = await supabase
        .from(DB.tables.targets)
        .upsert(payload, { onConflict: DB_CONFLICT_KEYS.targets, ignoreDuplicates: false })

      if (error) throw error
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['targets-admin'] })
      await qc.invalidateQueries({ queryKey: ['targets'] })
      await qc.invalidateQueries({ queryKey: ['dashboard-kpi'] })
      toast.success('목표를 저장했습니다.')
      setValue('')
      setNote('')
    },
    onError: (error: Error) => toast.error(error.message),
  })

  const canSave =
    year.trim().length > 0 &&
    dept.trim().length > 0 &&
    value.trim().length > 0 &&
    Number(value) > 0 &&
    (scope === 'company' || scope === 'dept' || ref.trim().length > 0)

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-sm">
            <Target className="h-4 w-4 text-primary" />
            목표 추가 / 수정
          </CardTitle>
          <CardDescription className="text-xs">
            회사, 라인, 가열로 목표를 한 화면에서 바로 등록하고 같은 키는 덮어씁니다.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-8">
            <div className="space-y-1.5">
              <Label className="text-xs">연도</Label>
              <Input
                type="number"
                value={year}
                onChange={(event) => setYear(event.target.value)}
                placeholder="2026"
                className="h-9"
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">부서</Label>
              <Select
                value={dept}
                onValueChange={(next) => {
                  const nextDept = next ?? ''
                  setDept(nextDept)
                  if (scope === 'dept') setRef(nextDept)
                }}
              >
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="부서 선택" />
                </SelectTrigger>
                <SelectContent>
                  {(deptOptions.length > 0 ? deptOptions : [
                    { value: 'P5', label: 'P5' },
                    { value: 'P8', label: 'P8' },
                    { value: 'P15', label: 'P15' },
                    { value: 'R/M', label: 'R/M' },
                  ]).map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">범위</Label>
              <Select
                value={scope}
                onValueChange={(next) => {
                  const nextScope = next as TargetScope
                  setScope(nextScope)
                  setRef(nextScope === 'company' ? 'company' : nextScope === 'dept' ? dept : '')
                }}
              >
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="범위 선택" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="company">전사</SelectItem>
                  <SelectItem value="dept">부서</SelectItem>
                  <SelectItem value="line">라인</SelectItem>
                  <SelectItem value="furnace">가열로</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {scope === 'line' || scope === 'furnace' ? (
              <div className="space-y-1.5">
                <Label className="text-xs">{SCOPE_LABELS[scope]} 선택</Label>
                <Select value={ref} onValueChange={(next) => setRef(next ?? '')}>
                  <SelectTrigger className="h-9">
                    <SelectValue placeholder="선택" />
                  </SelectTrigger>
                  <SelectContent>
                    {refOptions.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : (
              <div className="space-y-1.5">
                <Label className="text-xs">기준값</Label>
                <Input
                  value={scope === 'company' ? 'company' : dept}
                  readOnly
                  className="h-9 bg-muted/40"
                />
              </div>
            )}

            <div className="space-y-1.5">
              <Label className="text-xs">지표</Label>
              <Select value={metric} onValueChange={(next) => setMetric(next as TargetMetric)}>
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="지표 선택" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="gas_unit">가스원단위</SelectItem>
                  <SelectItem value="ton_per_hour">시간당 생산량</SelectItem>
                  <SelectItem value="output">생산량</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">목표값</Label>
              <Input
                type="number"
                step="0.1"
                value={value}
                onChange={(event) => setValue(event.target.value)}
                placeholder="0"
                className="h-9"
              />
            </div>

            <div className="space-y-1.5 md:col-span-2 xl:col-span-2">
              <Label className="text-xs">비고</Label>
              <Input
                value={note}
                onChange={(event) => setNote(event.target.value)}
                placeholder="선택 입력"
                className="h-9"
              />
            </div>

            <div className="flex items-end">
              <Button
                className="h-9 w-full"
                onClick={() => addTarget.mutate()}
                disabled={!canSave || addTarget.isPending}
              >
                <Plus className="mr-2 h-4 w-4" />
                {addTarget.isPending ? '저장 중' : '저장'}
              </Button>
            </div>
          </div>
          {scope === 'company' && (
            <p className="mt-3 text-xs text-muted-foreground">
              전사 목표는 `ref = company`로 저장됩니다.
            </p>
          )}
          {scope === 'dept' && (
            <p className="mt-3 text-xs text-muted-foreground">
              부서 목표는 `dept`와 `ref`를 같은 값으로 저장합니다.
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">등록된 목표</CardTitle>
          <CardDescription className="text-xs">현재 저장된 목표를 범위와 지표 기준으로 확인합니다.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-hidden rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>연도</TableHead>
                  <TableHead>부서</TableHead>
                  <TableHead>범위</TableHead>
                  <TableHead>대상</TableHead>
                  <TableHead>지표</TableHead>
                  <TableHead className="text-right">목표값</TableHead>
                  <TableHead>비고</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {targets?.map((target) => (
                  <TableRow key={target.id}>
                    <TableCell>{target.year ?? '-'}</TableCell>
                    <TableCell>{target.dept ?? '-'}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-xs">
                        {SCOPE_LABELS[target.scope]}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-medium">{target.ref || 'company'}</TableCell>
                    <TableCell>{METRIC_LABELS[target.metric]}</TableCell>
                    <TableCell className="text-right tabular-nums font-semibold">
                      {formatTargetValue(target.target_value)}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">{target.note ?? '-'}</TableCell>
                  </TableRow>
                ))}
                {!targets?.length && (
                  <TableRow>
                    <TableCell colSpan={7} className="py-8 text-center text-sm text-muted-foreground">
                      아직 등록된 목표가 없습니다.
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
