'use client'

import { useMemo, useState } from 'react'
import { Info, RotateCcw, Target, TrendingUp } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { BenchmarkGauge } from '@/components/charts/benchmark-gauge'
import { ProductionTrendChart } from '@/components/charts/trend-charts'
import { useBenchmarks, useLines, useProducts, useTargets } from '@/hooks/use-dashboard'
import { useProductionTrend } from '@/hooks/use-production-records'
import {
  getProductionDeptLine,
  getProductionMaterial,
  getProductionOrderWeight,
  getProductionProduct,
  getProductionTonPerHour,
  getProductionWorkDate,
  getProductionWorkHours,
  getProductionWorkCount,
  sumProduction,
} from '@/lib/production/records'
import { calcAchievementRate, calcTonPerHour, formatPercent, formatTonPerHour } from '@/lib/utils'
import { normalizeToken } from '@/lib/input/common'

const FALLBACK_LINE_CODES = ['P5', 'P8', 'P15', 'R/M']

type FilterOption = {
  value: string
  label: string
}

type TargetLike = {
  year?: number | null
  scope: string
  ref?: string | null
  dept?: string | null
  metric: string
  target_value: number
}

type TopProductRow = {
  name: string
  total: number
  tph: number | null
  tpr: number | null
}

type LowTphRow = {
  date: string
  line: string
  product: string
  tph: number
}

function formatMonth(recordDate: string | null | undefined) {
  return recordDate ? recordDate.slice(0, 7) : ''
}

function formatNumber(value: number | null | undefined, decimals = 1) {
  if (value == null || Number.isNaN(value)) return '-'
  return new Intl.NumberFormat('ko-KR', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value)
}

function uniqueSorted(values: Array<string | null | undefined>) {
  return Array.from(
    new Set(
      values
        .map((value) => String(value ?? '').trim())
        .filter((value) => value.length > 0)
    )
  ).sort((a, b) => a.localeCompare(b, 'ko-KR'))
}

function matchesFilter(value: string | null | undefined, selected: string) {
  if (selected === 'all') return true
  return normalizeToken(value) === normalizeToken(selected)
}

function findMatchedTarget(
  targets: Array<TargetLike> | undefined,
  metric: 'output' | 'ton_per_hour',
  currentYear: number,
  selectedLine: string
) {
  const yearTargets = (targets ?? []).filter((target) => target.metric === metric && (target.year == null || target.year === currentYear))

  if (selectedLine !== 'all') {
    const lineKey = normalizeToken(selectedLine)
    const lineTarget =
      yearTargets.find((target) => target.scope === 'line' && (normalizeToken(target.ref ?? '') === lineKey || normalizeToken(target.dept ?? '') === lineKey)) ??
      yearTargets.find((target) => target.scope === 'dept' && normalizeToken(target.dept ?? '') === lineKey) ??
      null

    if (lineTarget) return lineTarget.target_value
  }

  const companyTarget = yearTargets.find((target) => target.scope === 'company') ?? null
  return companyTarget?.target_value ?? null
}

export default function ProductivityPage() {
  const [selectedLine, setSelectedLine] = useState<string>('all')
  const [selectedProduct, setSelectedProduct] = useState<string>('all')
  const [selectedMaterial, setSelectedMaterial] = useState<string>('all')
  const currentYear = new Date().getFullYear()
  const { data: lines } = useLines()
  const { data: products } = useProducts()
  const { data: benchmarks } = useBenchmarks()
  const { data: records = [] } = useProductionTrend(3)
  const { data: targets } = useTargets()

  const lineOptions = useMemo(() => {
    if (lines && lines.length > 0) {
      return lines.map((line) => ({
        value: line.code,
        label: `${line.code} · ${line.name}`,
      }))
    }

    return FALLBACK_LINE_CODES.map((code) => ({ value: code, label: code }))
  }, [lines])

  const productOptions = useMemo<FilterOption[]>(() => {
    return uniqueSorted([
      ...(products ?? []).map((product) => product.name),
      ...records.map((record) => getProductionProduct(record)),
    ]).map((value) => ({ value, label: value }))
  }, [products, records])

  const materialOptions = useMemo<FilterOption[]>(() => {
    return uniqueSorted([
      ...(products ?? []).map((product) => product.material),
      ...records.map((record) => getProductionMaterial(record)),
    ]).map((value) => ({ value, label: value }))
  }, [products, records])

  const filteredRecords = useMemo(() => {
    return records.filter((record) => {
      return (
        matchesFilter(getProductionDeptLine(record), selectedLine) &&
        matchesFilter(getProductionProduct(record), selectedProduct) &&
        matchesFilter(getProductionMaterial(record), selectedMaterial)
      )
    })
  }, [records, selectedLine, selectedProduct, selectedMaterial])

  const totals = useMemo(() => sumProduction(filteredRecords), [filteredRecords])
  const throughputTargetTph = useMemo(
    () => findMatchedTarget(targets as TargetLike[] | undefined, 'ton_per_hour', currentYear, selectedLine) ?? 20,
    [currentYear, selectedLine, targets]
  )
  const monthlyTargetTon = useMemo(
    () => findMatchedTarget(targets as TargetLike[] | undefined, 'output', currentYear, selectedLine),
    [currentYear, selectedLine, targets]
  )
  const achievementTargetTon = useMemo(
    () => monthlyTargetTon ?? (totals.workHours > 0 ? throughputTargetTph * totals.workHours : null),
    [monthlyTargetTon, throughputTargetTph, totals.workHours]
  )
  const achievementRate = useMemo(
    () => (achievementTargetTon != null ? calcAchievementRate(totals.orderWeight, achievementTargetTon) : null),
    [achievementTargetTon, totals.orderWeight]
  )
  const averageTph = useMemo(
    () => calcTonPerHour(totals.orderWeight, totals.workHours),
    [totals.orderWeight, totals.workHours]
  )
  const averageTpr = useMemo(() => {
    if (totals.workCount <= 0) return null
    return totals.orderWeight / totals.workCount
  }, [totals.orderWeight, totals.workCount])

  const benchmarkRows = useMemo(() => {
    const duSanBenchmarks = (benchmarks ?? []).filter((benchmark) => benchmark.org === '두산' && benchmark.metric === 'ton_per_hour')

    if (duSanBenchmarks.length === 0) return []

    if (selectedProduct !== 'all') {
      const productKey = normalizeToken(selectedProduct)
      const matched = duSanBenchmarks.filter((benchmark) => normalizeToken(benchmark.scope) === productKey)
      if (matched.length > 0) return matched
    } else if (selectedMaterial !== 'all') {
      const materialKey = normalizeToken(selectedMaterial)
      const productScopes = new Set(
        (products ?? [])
          .filter((product) => normalizeToken(product.material) === materialKey)
          .map((product) => normalizeToken(product.name))
      )

      if (productScopes.size > 0) {
        const matched = duSanBenchmarks.filter((benchmark) => productScopes.has(normalizeToken(benchmark.scope)))
        if (matched.length > 0) return matched
      }
    }

    return duSanBenchmarks
  }, [benchmarks, products, selectedMaterial, selectedProduct])

  const monthlyTrend = useMemo(() => {
    const grouped = new Map<string, { actual: number; hours: number }>()

    filteredRecords.forEach((record) => {
      const month = formatMonth(getProductionWorkDate(record))
      if (!month) return

      const current = grouped.get(month) ?? { actual: 0, hours: 0 }
      current.actual += getProductionOrderWeight(record)
      current.hours += getProductionWorkHours(record)
      grouped.set(month, current)
    })

    return Array.from(grouped.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, value]) => ({
        month,
        plan: monthlyTargetTon ?? value.hours * throughputTargetTph,
        actual: value.actual,
      }))
  }, [filteredRecords, monthlyTargetTon, throughputTargetTph])

  const topProducts = useMemo<TopProductRow[]>(() => {
    const grouped = new Map<string, { total: number; hours: number; count: number }>()

    filteredRecords.forEach((record) => {
      const key = getProductionProduct(record) || '미상'
      const current = grouped.get(key) ?? { total: 0, hours: 0, count: 0 }
      current.total += getProductionOrderWeight(record)
      current.hours += getProductionWorkHours(record)
      current.count += getProductionWorkCount(record)
      grouped.set(key, current)
    })

    return Array.from(grouped.entries())
      .map(([name, value]) => ({
        name,
        total: value.total,
        tph: calcTonPerHour(value.total, value.hours),
        tpr: value.count > 0 ? value.total / value.count : null,
      }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 5)
  }, [filteredRecords])

  const lowTphRows = useMemo<LowTphRow[]>(() => {
    return [...filteredRecords]
      .map((record) => {
        const tph = getProductionTonPerHour(record)
        if (tph == null) return null
        return {
          date: getProductionWorkDate(record) ?? '-',
          line: getProductionDeptLine(record),
          product: getProductionProduct(record) || '미상',
          tph,
        }
      })
      .filter((row): row is LowTphRow => row != null)
      .sort((a, b) => a.tph - b.tph)
      .slice(0, 5)
  }, [filteredRecords])

  return (
    <div className="space-y-6">
      <Alert className="border-primary/30 bg-primary/5">
        <Info className="h-4 w-4 text-primary" />
        <AlertDescription className="text-sm">
          선택한 라인의 생산 실적을 최근 3년 기준으로 요약합니다. 새 입력 구조는 `work_date`, `dept_line`, `order_weight`, `work_hours`, `work_count`를 기준으로 계산합니다.
        </AlertDescription>
      </Alert>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">필터</CardTitle>
          <CardDescription>라인·제품·재질로 집계를 좁혀 계산 결과를 확인합니다.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 lg:grid-cols-[repeat(3,minmax(0,1fr))_auto]">
            <div className="space-y-1.5">
              <span className="text-xs font-medium text-muted-foreground">라인</span>
              <Select value={selectedLine} onValueChange={(value) => setSelectedLine(value || 'all')}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="전체" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">전체</SelectItem>
                  {lineOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <span className="text-xs font-medium text-muted-foreground">제품</span>
              <Select value={selectedProduct} onValueChange={(value) => setSelectedProduct(value || 'all')}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="전체" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">전체</SelectItem>
                  {productOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <span className="text-xs font-medium text-muted-foreground">재질</span>
              <Select value={selectedMaterial} onValueChange={(value) => setSelectedMaterial(value || 'all')}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="전체" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">전체</SelectItem>
                  {materialOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-end">
              <Button type="button" variant="outline" size="sm" className="w-full justify-center" onClick={() => {
                setSelectedLine('all')
                setSelectedProduct('all')
                setSelectedMaterial('all')
              }}>
                <RotateCcw className="mr-2 h-4 w-4" />
                초기화
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Σ수주중량</CardDescription>
            <CardTitle className="text-2xl">{formatNumber(totals.orderWeight)} t</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Σ작업시간</CardDescription>
            <CardTitle className="text-2xl">{formatNumber(totals.workHours)} h</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>시간당생산량 = 수주중량 / 작업시간</CardDescription>
            <CardTitle className="text-2xl">{formatTonPerHour(averageTph)}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>1회당 = 수주중량 / 작업횟수</CardDescription>
            <CardTitle className="text-2xl">{formatNumber(averageTpr, 2)}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>달성률 = Σ수주중량 / 목표</CardDescription>
            <CardTitle className="text-2xl">{achievementRate != null ? formatPercent(achievementRate) : '-'}</CardTitle>
          </CardHeader>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.6fr)_minmax(320px,1fr)]">
        <div>
          <h2 className="mb-3 text-sm font-semibold text-muted-foreground">월별 추이</h2>
          <ProductionTrendChart
            data={monthlyTrend}
            title={selectedLine === 'all' ? '전체 라인 추이' : `${selectedLine} 추이`}
          />
        </div>

        <div>
          <h2 className="mb-3 text-sm font-semibold text-muted-foreground">두산 벤치마크 비교</h2>
          <BenchmarkGauge metric="ton_per_hour" currentValue={averageTph} benchmarks={benchmarkRows} />
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <TrendingUp className="h-4 w-4 text-primary" />
              생산 상위 제품
            </CardTitle>
            <CardDescription>수주중량 기준 상위 5개 항목</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>제품</TableHead>
                  <TableHead className="text-right">중량</TableHead>
                  <TableHead className="text-right">TPH</TableHead>
                  <TableHead className="text-right">TPR</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {topProducts.length > 0 ? (
                  topProducts.map((row) => (
                    <TableRow key={row.name}>
                      <TableCell>{row.name}</TableCell>
                      <TableCell className="text-right">{formatNumber(row.total)}</TableCell>
                      <TableCell className="text-right">{formatTonPerHour(row.tph)}</TableCell>
                      <TableCell className="text-right">{formatNumber(row.tpr, 2)}</TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={4} className="py-8 text-center text-sm text-muted-foreground">
                      선택한 조건의 데이터가 없습니다.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Target className="h-4 w-4 text-primary" />
              저효율 기록
            </CardTitle>
            <CardDescription>작업시간 대비 생산성이 낮은 최근 기록</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>일자</TableHead>
                  <TableHead>라인</TableHead>
                  <TableHead>제품</TableHead>
                  <TableHead className="text-right">TPH</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {lowTphRows.length > 0 ? (
                  lowTphRows.map((row) => (
                    <TableRow key={`${row.date}-${row.line}-${row.product}`}>
                      <TableCell>{row.date}</TableCell>
                      <TableCell>{row.line}</TableCell>
                      <TableCell>{row.product}</TableCell>
                      <TableCell className="text-right">{formatTonPerHour(row.tph)}</TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={4} className="py-8 text-center text-sm text-muted-foreground">
                      선택한 조건의 데이터가 없습니다.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">최근 입력 상태</CardTitle>
          <CardDescription>새 입력 구조 기준으로 최근 데이터를 확인합니다.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Badge variant="outline">기록 수 {filteredRecords.length}</Badge>
          <Badge variant="outline">작업횟수 {totals.workCount}</Badge>
          <Badge variant="outline">평균 1회당 생산량 {formatNumber(averageTpr, 2)}</Badge>
          <Badge variant="outline">매칭 목표 {formatNumber(achievementTargetTon)} t</Badge>
        </CardContent>
      </Card>
    </div>
  )
}
