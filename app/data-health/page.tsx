"use client"

import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { buttonVariants } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Activity, AlertTriangle, CheckCircle2, XCircle, ArrowRight, Database, RefreshCw } from 'lucide-react'
import Link from 'next/link'
import { useTargets } from '@/hooks/use-dashboard'

const supabase = createClient()

export default function DataHealthPage() {
  const currentYear = new Date().getFullYear().toString()
  const { data: targets } = useTargets()

  // 목표치 기반 동적 임계값 산출
  const tphTarget = targets?.find(t => t.metric === 'ton_per_hour' && t.scope === 'company')?.target_value ?? 20
  const tphThreshold = tphTarget * 2 // 목표의 2배 초과 시 이상치 (기본 40)

  const gasTarget = targets?.find(t => t.metric === 'gas_unit' && t.scope === 'company')?.target_value ?? 150
  const gasThreshold = Math.round(gasTarget * 1.33) // 목표의 1.33배 초과 시 이상치 (기본 200)

  // 생산 실적 건강검진
  const { data: prodHealth, isLoading: pLoading, refetch: refetchP } = useQuery({
    queryKey: ['health-prod', currentYear, tphThreshold],
    queryFn: async () => {
      const { data } = await supabase.from('production_records').select('*, line:lines(code, name)').gte('work_month', `${currentYear}-01-01`)
      const list = data || []
      const missingHours = list.filter(r => !r.work_hours || Number(r.work_hours) === 0)
      const outliers = list.filter(r => {
        const h = Number(r.work_hours || 1)
        const tph = Number(r.actual_ton || 0) / h
        return tph > tphThreshold // 동적 TPH 임계값
      })
      return { total: list.length, missingHours, outliers }
    },
  })

  // 가스 검침 건강검진
  const { data: gasHealth, isLoading: gLoading, refetch: refetchG } = useQuery({
    queryKey: ['health-gas', currentYear, gasThreshold],
    queryFn: async () => {
      const { data } = await supabase.from('gas_records').select('*, furnace:furnaces(code, name)').gte('ym', `${currentYear}-01`)
      const list = data || []
      const missingWeight = list.filter(r => !r.charge_weight_kg || Number(r.charge_weight_kg) === 0)
      const outliers = list.filter(r => {
        const w = Number(r.charge_weight_kg || 1) / 1000
        const unit = Number(r.gas_usage || 0) / w
        return unit > gasThreshold // 동적 가스원단위 임계값
      })
      return { total: list.length, missingWeight, outliers }
    },
  })

  return (
    <div className="space-y-6 pb-12">
      {/* 상단 요약 배너 */}
      <Card className="border-primary/20 bg-gradient-to-r from-primary/5 via-card to-card">
        <CardHeader className="flex flex-row items-center justify-between pb-4">
          <div>
            <CardTitle className="text-lg flex items-center gap-2">
              <Activity className="w-5 h-5 text-primary" />
              {currentYear}년도 데이터 신뢰성 & 누락 검진 리포트
            </CardTitle>
            <CardDescription className="mt-1">
              결측값(장입량·작업시간 누락)이나 계산상 비정상 이상치를 한눈에 점검하고 신뢰도를 100%로 유지합니다.
            </CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={() => { refetchP(); refetchG() }} className="gap-1.5 text-xs">
            <RefreshCw className="w-3.5 h-3.5" /> 새로고침
          </Button>
        </CardHeader>
      </Card>

      {/* 요약 현황 카드 */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* 생산 실적 상태 */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-bold flex items-center gap-2">
                <Database className="w-4 h-4 text-primary" />
                생산 실적 검진 ({prodHealth?.total || 0}행)
              </CardTitle>
              <Badge variant={(prodHealth?.missingHours.length || 0) > 0 ? 'destructive' : 'default'} className="text-[10px]">
                {(prodHealth?.missingHours.length || 0) === 0 ? '정상 100%' : `누락 ${prodHealth?.missingHours.length}건`}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between text-xs border-b pb-2">
              <span className="text-muted-foreground">작업시간 누락 (TPH 계산 불가):</span>
              <strong className={prodHealth?.missingHours.length ? 'text-destructive font-bold' : 'text-emerald-600'}>
                {prodHealth?.missingHours.length || 0} 건
              </strong>
            </div>
            <div className="flex items-center justify-between text-xs border-b pb-2">
              <span className="text-muted-foreground">TPH 과다 이상치 (&gt; {tphThreshold} t/h):</span>
              <strong className={prodHealth?.outliers.length ? 'text-amber-600 font-bold' : 'text-emerald-600'}>
                {prodHealth?.outliers.length || 0} 건
              </strong>
            </div>
            <Link href="/data-entry?tab=production" className={buttonVariants({ variant: 'outline', size: 'sm', className: 'w-full text-xs h-8' })}>
              생산 실적 보완하러 가기
            </Link>
          </CardContent>
        </Card>

        {/* 가스 검침 상태 */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-bold flex items-center gap-2">
                <Database className="w-4 h-4 text-amber-500" />
                가스 검침 검진 ({gasHealth?.total || 0}행)
              </CardTitle>
              <Badge variant={(gasHealth?.missingWeight.length || 0) > 0 ? 'destructive' : 'default'} className="text-[10px]">
                {(gasHealth?.missingWeight.length || 0) === 0 ? '정상 100%' : `누락 ${gasHealth?.missingWeight.length}건`}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between text-xs border-b pb-2">
              <span className="text-muted-foreground">장입량 누락 (원단위 계산 불가):</span>
              <strong className={gasHealth?.missingWeight.length ? 'text-destructive font-bold' : 'text-emerald-600'}>
                {gasHealth?.missingWeight.length || 0} 건
              </strong>
            </div>
            <div className="flex items-center justify-between text-xs border-b pb-2">
              <span className="text-muted-foreground">원단위 과다 이상치 (&gt; {gasThreshold} Nm³/t):</span>
              <strong className={gasHealth?.outliers.length ? 'text-amber-600 font-bold' : 'text-emerald-600'}>
                {gasHealth?.outliers.length || 0} 건
              </strong>
            </div>
            <Link href="/data-entry?tab=gas-monthly" className={buttonVariants({ variant: 'outline', size: 'sm', className: 'w-full text-xs h-8' })}>
              가스 검침 보완하러 가기
            </Link>
          </CardContent>
        </Card>
      </div>

      {/* 결측치/이상치 목록 테이블 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">🚨 주의/결측 대상 상세 리스트</CardTitle>
          <CardDescription>아래 행의 값을 확인하고 올바른 값으로 업데이트해 주세요.</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader className="bg-muted/50">
              <TableRow>
                <TableHead className="text-xs">구분</TableHead>
                <TableHead className="text-xs">일자/월</TableHead>
                <TableHead className="text-xs">대상 (라인/호기)</TableHead>
                <TableHead className="text-xs">문제 유형</TableHead>
                <TableHead className="text-xs">현재 상태 / 안내</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {/* 장입량 누락 목록 */}
              {gasHealth?.missingWeight.map((g) => (
                <TableRow key={g.id}>
                  <TableCell><Badge variant="outline" className="text-[10px] text-amber-600 border-amber-400">가스월검침</Badge></TableCell>
                  <TableCell className="text-xs font-mono">{g.ym}</TableCell>
                  <TableCell className="text-xs font-semibold">{g.furnace?.code || '-'}</TableCell>
                  <TableCell><Badge variant="destructive" className="text-[10px]">장입량 누락 (0kg)</Badge></TableCell>
                  <TableCell className="text-xs text-muted-foreground">원단위: — (미입력). 장입량을 기입해 주세요.</TableCell>
                </TableRow>
              ))}

              {/* 작업시간 누락 목록 */}
              {prodHealth?.missingHours.map((p) => (
                <TableRow key={p.id}>
                  <TableCell><Badge variant="outline" className="text-[10px] text-blue-600 border-blue-400">생산실적</Badge></TableCell>
                  <TableCell className="text-xs font-mono">{p.work_month.substring(0, 7)}</TableCell>
                  <TableCell className="text-xs font-semibold">{p.line?.code || '-'}</TableCell>
                  <TableCell><Badge variant="destructive" className="text-[10px]">작업시간 누락 (0h)</Badge></TableCell>
                  <TableCell className="text-xs text-muted-foreground">TPH: — (미입력). 작업시간을 입력해 주세요.</TableCell>
                </TableRow>
              ))}

              {(!gasHealth?.missingWeight.length && !prodHealth?.missingHours.length) && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-8 text-xs text-muted-foreground">
                    🎉 누락된 데이터가 없습니다. 모든 데이터가 완벽히 입력되었습니다!
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
