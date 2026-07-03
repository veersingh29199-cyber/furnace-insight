"use client"

import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button, buttonVariants } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Activity, AlertTriangle, Database, RefreshCw } from 'lucide-react'
import Link from 'next/link'
import { useTargets } from '@/hooks/use-dashboard'
import { DB } from '@/types/db'
import {
  getProductionDeptLine,
  getProductionOrderWeight,
  getProductionTonPerHour,
  getProductionWorkDate,
  getProductionWorkHours,
} from '@/lib/production/records'

const supabase = createClient()

function yearBounds(year: string) {
  return {
    from: `${year}-01-01`,
    to: `${year}-12-31`,
  }
}

export default function DataHealthPage() {
  const currentYear = new Date().getFullYear().toString()
  const { from, to } = yearBounds(currentYear)
  const { data: targets } = useTargets(Number(currentYear))

  const tphTarget = targets?.find((target) => target.metric === 'ton_per_hour' && target.scope === 'company' && target.year === Number(currentYear))?.target_value ?? 20
  const gasTarget = targets?.find((target) => target.metric === 'gas_unit' && target.scope === 'company' && target.year === Number(currentYear))?.target_value ?? 150
  const tphThreshold = tphTarget * 2
  const gasThreshold = Math.round(gasTarget * 1.33)

  const { data: prodHealth, refetch: refetchProd } = useQuery({
    queryKey: ['health-production', currentYear, tphThreshold],
    queryFn: async () => {
      const { data, error } = await supabase
        .from(DB.tables.productionRecords)
        .select('*')
        .gte(DB.productionRecords.workDate, from)
        .lte(DB.productionRecords.workDate, to)
        .order(DB.productionRecords.workDate, { ascending: false })

      if (error) throw error

      const list = data ?? []
      const missingHours = list.filter((record) => getProductionWorkHours(record) <= 0)
      const outliers = list.filter((record) => {
        const tph = getProductionTonPerHour(record)
        return tph != null && tph > tphThreshold
      })

      return { total: list.length, missingHours, outliers }
    },
  })

  const { data: gasHealth, refetch: refetchGas } = useQuery({
    queryKey: ['health-gas', currentYear, gasThreshold],
    queryFn: async () => {
      const { data, error } = await supabase
        .from(DB.tables.gasRecords)
        .select('id, ym, furnace_code, charge_weight_kg, gas_usage, gas_unit, source, note, created_by, created_at')
        .gte(DB.gasRecords.ym, `${currentYear}-01-01`)
        .lte(DB.gasRecords.ym, `${currentYear}-12-31`)
        .order(DB.gasRecords.ym, { ascending: false })

      if (error) throw error

      const list = data ?? []
      const missingWeight = list.filter((record) => Number(record.charge_weight_kg ?? 0) <= 0)
      const outliers = list.filter((record) => {
        const weightTon = Number(record.charge_weight_kg ?? 0) / 1000
        if (weightTon <= 0) return false
        const unit = Number(record.gas_usage ?? 0) / weightTon
        return unit > gasThreshold
      })

      return { total: list.length, missingWeight, outliers }
    },
  })

  const issues = useMemo(() => {
    const rows: Array<{
      key: string
      group: string
      period: string
      subject: string
      message: string
      severity: 'danger' | 'warning'
    }> = []

    for (const record of prodHealth?.missingHours ?? []) {
      rows.push({
        key: `prod-hours-${record.id}`,
        group: '생산 실적',
        period: getProductionWorkDate(record)?.slice(0, 10) ?? '-',
        subject: `${getProductionDeptLine(record) ?? '-'} / ${getProductionOrderWeight(record).toLocaleString()}t`,
        message: '작업시간이 0 또는 비어 있습니다. TPH 계산 전 반드시 입력해야 합니다.',
        severity: 'danger',
      })
    }

    for (const record of prodHealth?.outliers ?? []) {
      rows.push({
        key: `prod-tph-${record.id}`,
        group: '생산 실적',
        period: getProductionWorkDate(record)?.slice(0, 10) ?? '-',
        subject: `${getProductionDeptLine(record) ?? '-'} / ${record.order_no ?? '-'}`,
        message: `시간당 생산량이 ${tphThreshold.toFixed(1)} t/h를 초과했습니다. 입력값을 다시 확인해 주세요.`,
        severity: 'warning',
      })
    }

    for (const record of gasHealth?.missingWeight ?? []) {
      rows.push({
        key: `gas-weight-${record.id}`,
        group: '가스 검침',
        period: record.ym,
        subject: `${record.furnace_code ?? '-'}`,
        message: '장입량이 비어 있어 원단위 계산이 불가능합니다.',
        severity: 'danger',
      })
    }

    for (const record of gasHealth?.outliers ?? []) {
      rows.push({
        key: `gas-unit-${record.id}`,
        group: '가스 검침',
        period: record.ym,
        subject: `${record.furnace_code ?? '-'}`,
        message: `가스원단위가 ${gasThreshold.toFixed(1)} Nm³/t를 초과했습니다.`,
        severity: 'warning',
      })
    }

    return rows
  }, [gasHealth?.missingWeight, gasHealth?.outliers, gasThreshold, prodHealth?.missingHours, prodHealth?.outliers, tphThreshold])

  return (
    <div className="space-y-6 pb-12">
      <Card className="border-primary/20 bg-gradient-to-r from-primary/5 via-card to-card">
        <CardHeader className="flex flex-row items-center justify-between gap-4 pb-4">
          <div>
            <CardTitle className="text-lg flex items-center gap-2">
              <Activity className="w-5 h-5 text-primary" />
              {currentYear} 데이터 건강도 점검
            </CardTitle>
            <CardDescription className="mt-1">
              생산 실적과 가스 검침의 누락, 이상치를 빠르게 확인하는 점검 화면입니다.
            </CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={() => { refetchProd(); refetchGas() }} className="gap-1.5 text-xs">
            <RefreshCw className="w-3.5 h-3.5" />
            새로고침
          </Button>
        </CardHeader>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-bold flex items-center gap-2">
              <Database className="w-4 h-4 text-primary" />
              생산 실적 점검 ({prodHealth?.total ?? 0}건)
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between text-xs border-b pb-2">
              <span className="text-muted-foreground">작업시간 누락</span>
              <strong className={prodHealth?.missingHours.length ? 'text-destructive font-bold' : 'text-emerald-600'}>
                {prodHealth?.missingHours.length ?? 0}건
              </strong>
            </div>
            <div className="flex items-center justify-between text-xs border-b pb-2">
              <span className="text-muted-foreground">TPH 이상치</span>
              <strong className={prodHealth?.outliers.length ? 'text-amber-600 font-bold' : 'text-emerald-600'}>
                {prodHealth?.outliers.length ?? 0}건
              </strong>
            </div>
            <Link
              href="/input/production"
              className={buttonVariants({ variant: 'outline', size: 'sm', className: 'w-full text-xs h-8' })}
            >
              생산 실적 입력하러 가기
            </Link>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-bold flex items-center gap-2">
              <Database className="w-4 h-4 text-amber-500" />
              가스 검침 점검 ({gasHealth?.total ?? 0}건)
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between text-xs border-b pb-2">
              <span className="text-muted-foreground">장입량 누락</span>
              <strong className={gasHealth?.missingWeight.length ? 'text-destructive font-bold' : 'text-emerald-600'}>
                {gasHealth?.missingWeight.length ?? 0}건
              </strong>
            </div>
            <div className="flex items-center justify-between text-xs border-b pb-2">
              <span className="text-muted-foreground">원단위 이상치</span>
              <strong className={gasHealth?.outliers.length ? 'text-amber-600 font-bold' : 'text-emerald-600'}>
                {gasHealth?.outliers.length ?? 0}건
              </strong>
            </div>
            <Link
              href="/input/gas-monthly"
              className={buttonVariants({ variant: 'outline', size: 'sm', className: 'w-full text-xs h-8' })}
            >
              가스 검침 입력하러 가기
            </Link>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-500" />
            점검 상세 목록
          </CardTitle>
          <CardDescription>누락이나 이상치가 있는 항목만 모아 보여줍니다.</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader className="bg-muted/50">
              <TableRow>
                <TableHead className="text-xs">분류</TableHead>
                <TableHead className="text-xs">일자/월</TableHead>
                <TableHead className="text-xs">대상</TableHead>
                <TableHead className="text-xs">문제</TableHead>
                <TableHead className="text-xs">안내</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {issues.length > 0 ? (
                issues.map((issue) => (
                  <TableRow key={issue.key}>
                    <TableCell>
                      <Badge
                        variant={issue.severity === 'danger' ? 'destructive' : 'secondary'}
                        className="text-[10px]"
                      >
                        {issue.group}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs font-mono">{issue.period}</TableCell>
                    <TableCell className="text-xs font-semibold">{issue.subject}</TableCell>
                    <TableCell className="text-xs">
                      <Badge variant={issue.severity === 'danger' ? 'destructive' : 'outline'} className="text-[10px]">
                        {issue.severity === 'danger' ? '누락' : '경고'}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">{issue.message}</TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-10 text-xs text-muted-foreground">
                    아직 점검할 이상 항목이 없습니다. 모든 입력이 비교적 안정적입니다.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}
