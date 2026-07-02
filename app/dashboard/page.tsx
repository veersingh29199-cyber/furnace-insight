'use client'

import { useDashboardKpi } from '@/hooks/use-dashboard'
import { useGasRecords } from '@/hooks/use-gas-records'
import { KpiCard, AchievementCard } from '@/components/charts/kpi-card'
import { BenchmarkGauge } from '@/components/charts/benchmark-gauge'
import { GasUnitTrendChart } from '@/components/charts/trend-charts'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Flame, BarChart3, TrendingDown, AlertTriangle, Info,
  CheckCircle2, Clock
} from 'lucide-react'
import {
  formatGasUnit, formatTonPerHour, formatYearMonth,
  detectOutliers, currentMonthDate
} from '@/lib/utils'

import { InputStatusCard } from '@/components/dashboard/input-status-card'

export default function DashboardPage() {
  const { data: kpi, isLoading: kpiLoading } = useDashboardKpi()

  // 최근 6개월 가스 데이터
  const sixMonthsAgo = (() => {
    const d = new Date(); d.setMonth(d.getMonth() - 6)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
  })()
  const { data: gasRecords } = useGasRecords({ ymFrom: sixMonthsAgo })

  // 이상치 감지 (이번달 가스원단위 기준)
  const thisMonthGas = gasRecords?.filter(r => r.ym === currentMonthDate()) ?? []
  const gasUnits = thisMonthGas.map(r => r.gas_unit ?? 0).filter(v => v > 0)
  const outlierIndices = detectOutliers(gasUnits)
  const outlierFurnaces = thisMonthGas
    .filter((_, i) => outlierIndices.has(i))
    .map(r => r.furnace?.code ?? '-')

  // 가열로별 월별 원단위 추이 데이터 가공
  const months = [...new Set(gasRecords?.map(r => r.ym.substring(0, 7)) ?? [])].sort()
  const furnaceCodes = [...new Set(gasRecords?.map(r => r.furnace?.code ?? '') ?? [])].filter(Boolean).slice(0, 7)
  const trendData = months.map(m => {
    const row: Record<string, string | number | null> = { month: m }
    furnaceCodes.forEach(code => {
      const rec = gasRecords?.find(r => r.ym.startsWith(m) && r.furnace?.code === code)
      row[code] = rec?.gas_unit ?? null
    })
    return row
  })

  return (
    <div className="space-y-6">
      {/* 이번 달 입력 현황 카드 */}
      <InputStatusCard />

      {/* 도움말 배너 */}
      <Alert className="border-primary/30 bg-primary/5">
        <Info className="h-4 w-4 text-primary" />
        <AlertDescription className="text-sm">
          <strong>이번 달</strong> 전체 가열로·생산 현황을 요약합니다.
          데이터를 입력하려면{' '}
          <a href="/input" className="text-primary underline underline-offset-2 font-medium">
            데이터 입력
          </a>
          {' '}메뉴를 이용하세요.
        </AlertDescription>
      </Alert>

      {/* 이상치 경고 */}
      {outlierFurnaces.length > 0 && (
        <Alert className="border-amber-500/40 bg-amber-500/5">
          <AlertTriangle className="h-4 w-4 text-amber-500" />
          <AlertDescription className="text-sm">
            <strong>원단위 이상치 감지!</strong>{' '}
            {outlierFurnaces.join(', ')} 가열로의 이번달 가스원단위가 평균에서 크게 벗어났습니다.
            확인이 필요합니다.
          </AlertDescription>
        </Alert>
      )}

      {/* KPI 카드 그리드 */}
      <div>
        <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
          📊 이번 달 핵심 지표 — {kpi ? formatYearMonth(kpi.thisMonth) : ''}
        </h2>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <KpiCard
            label="평균 가스원단위"
            value={kpi?.avgGasUnit != null ? formatGasUnit(kpi.avgGasUnit) : '-'}
            unit="Nm³/톤"
            change={kpi?.gasChange}
            goodWhenDown
            icon={<Flame className="h-4 w-4" />}
            loading={kpiLoading}
            target={kpi?.gasTarget}
            targetLabel="목표:"
          />
          <AchievementCard
            label="전사 달성률"
            actual={kpi?.totalActualTon ?? null}
            plan={kpi?.totalPlanTon ?? null}
            loading={kpiLoading}
          />
          <KpiCard
            label="평균 시간당 생산량"
            value={kpi?.tonPerHour != null ? formatTonPerHour(kpi.tonPerHour) : '-'}
            unit="톤/h"
            change={kpi?.tphChange}
            icon={<BarChart3 className="h-4 w-4" />}
            loading={kpiLoading}
            target={kpi?.tphTarget}
            targetLabel="목표:"
          />
          <KpiCard
            label="검침 가열로 수"
            value={kpi?.gasRecordCount ?? '-'}
            unit="기"
            icon={<CheckCircle2 className="h-4 w-4" />}
            loading={kpiLoading}
          />
        </div>
      </div>

      {/* 벤치마크 비교 */}
      <div>
        <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
          🏆 벤치마크 비교 (태상·태웅·두산)
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <BenchmarkGauge
            metric="gas_unit"
            currentValue={kpi?.avgGasUnit ?? null}
            benchmarks={kpi?.benchmarks ?? []}
          />
          <BenchmarkGauge
            metric="ton_per_hour"
            currentValue={kpi?.tonPerHour ?? null}
            benchmarks={kpi?.benchmarks ?? []}
          />
        </div>
      </div>

      {/* 가열로 원단위 추이 */}
      <div>
        <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
          📈 가열로별 원단위 추이 (최근 6개월)
        </h2>
        {trendData.length > 0 ? (
          <GasUnitTrendChart
            data={trendData as Array<{ month: string; [key: string]: string | number | null }>}
            furnaceCodes={furnaceCodes}
            targetValue={kpi?.gasTarget ?? undefined}
          />
        ) : kpiLoading ? (
          <Card><CardContent className="py-8"><Skeleton className="h-64 w-full" /></CardContent></Card>
        ) : (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-16 text-center gap-3">
              <Flame className="h-10 w-10 text-muted-foreground/30" />
              <div>
                <p className="font-medium text-muted-foreground">가스 검침 데이터가 없습니다</p>
                <p className="text-sm text-muted-foreground mt-1">
                  <a href="/input" className="text-primary underline">데이터 입력</a>에서 가열로 검침을 입력하거나,{' '}
                  <a href="/import" className="text-primary underline">엑셀 임포터</a>로 일괄 적재해 보세요.
                </p>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* 빠른 이동 링크 */}
      <div>
        <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
          ⚡ 빠른 이동
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { href: '/productivity',  label: '생산성 분석',     icon: BarChart3,     desc: '라인·제품별 추이' },
            { href: '/gas-analysis',  label: '가스원단위 분석', icon: Flame,         desc: '호기별 원단위' },
            { href: '/input',         label: '데이터 입력',     icon: Clock,         desc: '실적·검침 입력' },
            { href: '/import',        label: '엑셀 임포터',     icon: TrendingDown,  desc: '과거 데이터 적재' },
          ].map(({ href, label, icon: Icon, desc }) => (
            <a key={href} href={href}
              className="flex items-start gap-3 p-4 rounded-xl border border-border hover:border-primary/40 hover:bg-primary/5 transition-all group">
              <div className="p-2 rounded-lg bg-primary/10 group-hover:bg-primary/20 transition-colors">
                <Icon className="h-4 w-4 text-primary" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-medium truncate">{label}</p>
                <p className="text-xs text-muted-foreground truncate">{desc}</p>
              </div>
            </a>
          ))}
        </div>
      </div>
    </div>
  )
}
