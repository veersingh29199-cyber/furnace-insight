'use client'

import { useMemo, useState } from 'react'
import { Info, Target, TrendingUp } from 'lucide-react'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { ProductionTrendChart } from '@/components/charts/trend-charts'
import { useLines, useTargets } from '@/hooks/use-dashboard'
import { useProductionTrend } from '@/hooks/use-production-records'
import {
  getProductionDeptLine,
  getProductionOrderWeight,
  getProductionProduct,
  getProductionTonPerHour,
  getProductionWorkDate,
  getProductionWorkHours,
  getProductionWorkCount,
  sumProduction,
} from '@/lib/production/records'
import { calcAchievementRate, calcTonPerHour, formatPercent, formatTonPerHour } from '@/lib/utils'

const FALLBACK_LINE_CODES = ['P5', 'P8', 'P15', 'R/M']

function formatMonth(recordDate: string | null | undefined) {
  return recordDate ? recordDate.slice(0, 7) : ''
}

function formatNumber(value: number) {
  return new Intl.NumberFormat('ko-KR', { maximumFractionDigits: 1 }).format(value)
}

export default function ProductivityPage() {
  const [selectedLine, setSelectedLine] = useState<string>('all')
  const { data: lines } = useLines()
  const { data: records = [] } = useProductionTrend(3)
  const { data: targets } = useTargets()

  const targetTph = targets?.find((target) => target.metric === 'ton_per_hour' && target.scope === 'company')?.target_value ?? 20

  const lineOptions = useMemo(() => {
    if (lines && lines.length > 0) return lines.map((line) => line.code)
    return FALLBACK_LINE_CODES
  }, [lines])

  const filteredRecords = useMemo(() => {
    if (selectedLine === 'all') return records
    return records.filter((record) => getProductionDeptLine(record) === selectedLine)
  }, [records, selectedLine])

  const totals = useMemo(() => sumProduction(filteredRecords), [filteredRecords])
  const achievementRate = useMemo(
    () => calcAchievementRate(totals.orderWeight, totals.workHours * targetTph),
    [targetTph, totals.orderWeight, totals.workHours]
  )
  const averageTph = useMemo(
    () => calcTonPerHour(totals.orderWeight, totals.workHours) ?? 0,
    [totals.orderWeight, totals.workHours]
  )
  const averageTpr = useMemo(() => {
    if (totals.workCount <= 0) return 0
    return totals.orderWeight / totals.workCount
  }, [totals.orderWeight, totals.workCount])

  const monthlyTrend = useMemo(() => {
    const grouped = new Map<string, { plan: number; actual: number }>()

    filteredRecords.forEach((record) => {
      const month = formatMonth(getProductionWorkDate(record))
      if (!month) return

      const current = grouped.get(month) ?? { plan: 0, actual: 0 }
      current.plan += getProductionWorkHours(record) * targetTph
      current.actual += getProductionOrderWeight(record)
      grouped.set(month, current)
    })

    return Array.from(grouped.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, value]) => ({ month, plan: value.plan, actual: value.actual }))
  }, [filteredRecords, targetTph])

  const topProducts = useMemo(() => {
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
        tph: value.hours > 0 ? calcTonPerHour(value.total, value.hours) ?? 0 : 0,
        tpr: value.count > 0 ? value.total / value.count : 0,
      }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 5)
  }, [filteredRecords])

  const lowTphRows = useMemo(() => {
    return [...filteredRecords]
      .map((record) => {
        const tph = getProductionTonPerHour(record) ?? 0
        return {
          date: getProductionWorkDate(record) ?? '-',
          line: getProductionDeptLine(record),
          product: getProductionProduct(record) || '미상',
          tph,
        }
      })
      .filter((row) => row.tph > 0)
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

      <div className="flex items-center gap-3">
        <span className="text-sm text-muted-foreground">라인 선택</span>
        <Select value={selectedLine} onValueChange={(value) => setSelectedLine(value || 'all')}>
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">전체</SelectItem>
            {lineOptions.map((code) => (
              <SelectItem key={code} value={code}>
                {code}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>총 생산중량</CardDescription>
            <CardTitle className="text-2xl">{formatNumber(totals.orderWeight)} t</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>총 작업시간</CardDescription>
            <CardTitle className="text-2xl">{formatNumber(totals.workHours)} h</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>평균 TPH</CardDescription>
            <CardTitle className="text-2xl">{formatTonPerHour(averageTph)}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>달성률</CardDescription>
            <CardTitle className="text-2xl">
              {achievementRate != null ? formatPercent(achievementRate) : '-'}
            </CardTitle>
          </CardHeader>
        </Card>
      </div>

      <div>
        <h2 className="mb-3 text-sm font-semibold text-muted-foreground">월별 추이</h2>
        <ProductionTrendChart
          data={monthlyTrend}
          title={selectedLine === 'all' ? '전체 라인 추이' : `${selectedLine} 추이`}
        />
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
                {topProducts.map((row) => (
                  <TableRow key={row.name}>
                    <TableCell>{row.name}</TableCell>
                    <TableCell className="text-right">{formatNumber(row.total)}</TableCell>
                    <TableCell className="text-right">{formatTonPerHour(row.tph)}</TableCell>
                    <TableCell className="text-right">{formatNumber(row.tpr)}</TableCell>
                  </TableRow>
                ))}
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
                {lowTphRows.map((row) => (
                  <TableRow key={`${row.date}-${row.line}-${row.product}`}>
                    <TableCell>{row.date}</TableCell>
                    <TableCell>{row.line}</TableCell>
                    <TableCell>{row.product}</TableCell>
                    <TableCell className="text-right">{formatTonPerHour(row.tph)}</TableCell>
                  </TableRow>
                ))}
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
          <Badge variant="outline">평균 1회당 생산량 {formatNumber(averageTpr)}</Badge>
        </CardContent>
      </Card>
    </div>
  )
}
