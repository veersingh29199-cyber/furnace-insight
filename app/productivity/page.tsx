'use client'

import { useMemo, useState } from 'react'
import { useProductionRecords, useProductionTrend } from '@/hooks/use-production-records'
import { useBenchmarks, useLines } from '@/hooks/use-dashboard'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { ProductionTrendChart } from '@/components/charts/trend-charts'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  Legend, ResponsiveContainer, ReferenceLine, ScatterChart, Scatter
} from 'recharts'
import { Info, BarChart3, TrendingUp, Target } from 'lucide-react'
import {
  calcTonPerHour, calcAchievementRate, formatTonPerHour,
  formatPercent, formatYearMonth, median, percentile, achievementColor, cn
} from '@/lib/utils'

const FALLBACK_LINE_CODES = ['P5', 'P8', 'P15', 'R/M']
const COLORS     = ['var(--chart-1)', 'var(--chart-2)', 'var(--chart-3)', 'var(--chart-4)']

// 라인 정보 안전 파싱 헬퍼
function getLineCode(lineProp: unknown): string {
  if (!lineProp) return '-'
  const obj = Array.isArray(lineProp) ? lineProp[0] : lineProp
  return obj && typeof obj === 'object' && 'code' in obj ? String((obj as { code: string }).code) : '-'
}

// 제품 정보 안전 파싱 헬퍼
function getProductName(productProp: unknown): { name: string; stdTph?: number } {
  if (!productProp) return { name: '미지정' }
  const obj = Array.isArray(productProp) ? productProp[0] : productProp
  if (obj && typeof obj === 'object') {
    return {
      name: 'name' in obj ? String((obj as { name: string }).name) : '미지정',
      stdTph: 'std_ton_per_hour' in obj ? Number((obj as { std_ton_per_hour?: number }).std_ton_per_hour) : undefined,
    }
  }
  return { name: '미지정' }
}

export default function ProductivityPage() {
  const [selectedLine, setSelectedLine] = useState<string>('all')
  const { data: lines }      = useLines()
  const { data: trend }      = useProductionTrend(3)
  const { data: benchmarks } = useBenchmarks()

  // 동적 라인 코드 목록
  const activeLineCodes = useMemo(() => {
    if (lines && lines.length > 0) return lines.map(l => l.code)
    return FALLBACK_LINE_CODES
  }, [lines])

  // selectedLine 코드를 UUID로 변환
  const selectedLineId = selectedLine !== 'all'
    ? lines?.find(l => l.code === selectedLine)?.id
    : undefined

  const { data: records }  = useProductionRecords(
    selectedLineId ? { lineId: selectedLineId } : undefined
  )

  // ── 연간 추이 데이터 가공 ──
  const trendData = useMemo(() => {
    if (!trend || trend.length === 0) return []
    const months = [...new Set(trend.map(r => r.work_month.substring(0, 7)))].sort()
    return months.map(m => {
      const row: Record<string, string | number> = { month: m }
      activeLineCodes.forEach(code => {
        const recs = trend.filter(r => {
          const lCode = getLineCode(r.line)
          return r.work_month.startsWith(m) && lCode === code
        })
        row[`${code}_plan`]   = recs.reduce((s, r) => s + (Number(r.plan_ton) || 0), 0)
        row[`${code}_actual`] = recs.reduce((s, r) => s + (Number(r.actual_ton) || 0), 0)
      })
      return row
     })
  }, [trend, activeLineCodes])

  // ── 시간당 생산량 분포 (두산 벤치마크 오버레이) ──
  const tphDistrib = useMemo(() => {
    if (!records || records.length === 0) return []
    return records
      .filter(r => (r.work_hours && r.work_hours > 0) || (r.actual_ton && r.actual_ton > 0) || (r.plan_ton && r.plan_ton > 0))
      .map(r => {
        const lineCode = getLineCode(r.line)
        const productInfo = getProductName(r.product)
        
        let tph = r.work_hours > 0 ? calcTonPerHour(r.actual_ton, r.work_hours) ?? 0 : 0
        // work_hours가 0(예: 엑셀 일괄 업로드 데이터)인 경우 표준 생산성이 있으면 대체하거나 추정치(월 40h 기준) 계산
        if (tph === 0 && r.actual_ton > 0) {
          if (productInfo.stdTph && productInfo.stdTph > 0) {
            tph = productInfo.stdTph
          } else {
            tph = Math.round((r.actual_ton / (r.work_count > 0 ? r.work_count * 8 : 40)) * 10) / 10
          }
        }

        const rate = calcAchievementRate(r.actual_ton, r.plan_ton) ?? 0
        const bench = benchmarks?.find(b =>
          b.metric === 'ton_per_hour' &&
          b.org === '두산' &&
          productInfo.name === b.product_or_scope
        )
        return {
          name:  lineCode,
          month: r.work_month.substring(0, 7),
          tph,
          rate,
          benchmark: bench?.value ?? null,
          product:   productInfo.name,
        }
      })
  }, [records, benchmarks])

  // ── 현실적 목표 제안 ──
  const targetSuggestions = useMemo(() => {
    const tphValues = tphDistrib.map(d => d.tph).filter(v => v > 0)
    if (tphValues.length === 0) return null
    return {
      median:  median(tphValues),
      p75:     percentile(tphValues, 75),
      current: tphValues[tphValues.length - 1] ?? 0,
    }
  }, [tphDistrib])

  // ── 달성률 히트맵 데이터 ──
  const heatmapData = useMemo(() => {
    if (!records || records.length === 0) return []
    const grouped: Record<string, Record<string, number>> = {}
    records.forEach(r => {
      const m    = r.work_month.substring(0, 7)
      const lineCode = getLineCode(r.line)
      const rate = calcAchievementRate(r.actual_ton, r.plan_ton) ?? 0
      if (!grouped[m]) grouped[m] = {}
      grouped[m][lineCode] = rate
    })
    return Object.entries(grouped)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, lData]) => ({ month, ...lData } as Record<string, string | number>))
  }, [records])

  // ── 선택 라인 필터 ──
  const filteredTrend = useMemo(() => {
    if (selectedLine === 'all') return trendData
    return trendData.map(d => ({
      month:  d.month,
      plan:   d[`${selectedLine}_plan`] as number ?? 0,
      actual: d[`${selectedLine}_actual`] as number ?? 0,
    }))
  }, [trendData, selectedLine])

  return (
    <div className="space-y-6">
      <Alert className="border-primary/30 bg-primary/5">
        <Info className="h-4 w-4 text-primary" />
        <AlertDescription className="text-sm">
          최근 3년간의 라인별 생산 추이를 분석합니다.
          두산 벤치마크는 금형강 25·크랭크축 26·쉘 10·로터 7 (톤/h) 기준입니다.
        </AlertDescription>
      </Alert>

      {/* 라인 필터 */}
      <div className="flex items-center gap-3">
        <span className="text-sm text-muted-foreground">라인 선택:</span>
        <Select value={selectedLine} onValueChange={(v) => setSelectedLine(v || 'all')}>
          <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">전체</SelectItem>
            {activeLineCodes.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {/* 연간 추이 차트 */}
      <div>
        <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
          📊 라인별 생산 추이 (최근 3년)
        </h2>
        {selectedLine === 'all' ? (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {activeLineCodes.map((code, i) => {
              const lineData = trendData.map(d => ({
                month:  d.month as string,
                plan:   d[`${code}_plan`] as number ?? 0,
                actual: d[`${code}_actual`] as number ?? 0,
              }))
              return (
                <ProductionTrendChart
                  key={code}
                  data={lineData}
                  title={`${code} 라인`}
                />
              )
            })}
          </div>
        ) : (
          <ProductionTrendChart
            data={filteredTrend as { month: string; plan: number; actual: number }[]}
            title={`${selectedLine} 라인 생산 추이`}
          />
        )}
      </div>

      {/* 시간당 생산량 분포 */}
      <div>
        <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
          ⚡ 시간당 생산량 분포 (두산 벤치마크 오버레이)
        </h2>
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">라인·제품별 시간당 생산량 (톤/h)</CardTitle>
            <CardDescription className="text-xs">점선 = 두산 벤치마크</CardDescription>
          </CardHeader>
          <CardContent className="px-2 sm:px-6">
            <div className="h-[250px] sm:h-[280px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={tphDistrib.slice(-24)}
                margin={{ top: 5, right: 10, left: -10, bottom: 5 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" opacity={0.5} />
                <XAxis dataKey="month" tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }} tickLine={false} axisLine={false} unit="톤/h" />
                <Tooltip
                  contentStyle={{ background: 'var(--background)', border: '1px solid var(--border)', borderRadius: '8px', fontSize: '12px' }}
                  formatter={(v) => [`${(typeof v === 'number' ? v : Number(v)).toFixed(2)} 톤/h`, '']}
                />
                <Bar dataKey="tph" name="시간당 생산량" fill="var(--chart-1)" radius={[3,3,0,0]} />
                <ReferenceLine y={25} stroke="#10b981" strokeDasharray="5 5" label={{ value: '두산 금형강', fill: '#10b981', fontSize: 10 }} />
                <ReferenceLine y={26} stroke="#f59e0b" strokeDasharray="5 5" label={{ value: '두산 크랭크축', fill: '#f59e0b', fontSize: 10 }} />
              </BarChart>
            </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* 현실적 목표 제안 */}
      {targetSuggestions && (
        <div>
          <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
            🎯 현실적 목표 제안 (자동 추천)
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {[
              {
                label: '중앙값 기반 목표',
                value: targetSuggestions.median,
                desc:  '과거 실적의 중앙값. 달성 가능한 보수적 목표.',
                color: 'border-blue-500/30 bg-blue-500/5',
              },
              {
                label: '상위 25% 목표',
                value: targetSuggestions.p75,
                desc:  '상위 25% 실적 기준. 도전적이지만 달성 사례 있음.',
                color: 'border-violet-500/30 bg-violet-500/5',
              },
              {
                label: '두산 금형강 벤치마크',
                value: 25,
                desc:  '두산 글로벌 기준. 장기 목표로 참고.',
                color: 'border-green-500/30 bg-green-500/5',
              },
            ].map(({ label, value, desc, color }) => (
              <Card key={label} className={`border ${color}`}>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium flex items-center gap-2">
                    <Target className="h-3.5 w-3.5" />
                    {label}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-2xl font-bold">{formatTonPerHour(value)}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">톤/h</p>
                  <p className="text-xs text-muted-foreground mt-2">{desc}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* 달성률 히트맵 */}
      <div>
        <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
          🗓 달성률 히트맵 (월 × 라인)
        </h2>
        <Card>
          <CardContent className="pt-4">
            {heatmapData.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-xs border-collapse">
                  <thead>
                    <tr>
                      <th className="text-left p-2 font-medium text-muted-foreground w-20">월</th>
                      {activeLineCodes.map(c => (
                        <th key={c} className="text-center p-2 font-medium">{c}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {heatmapData.slice(-12).map(row => (
                      <tr key={row.month as string}>
                        <td className="p-2 font-medium text-muted-foreground">{row.month as string}</td>
                        {activeLineCodes.map(c => {
                          const rate = ((row as Record<string, unknown>)[c] as number | undefined) ?? null
                          const bg = rate == null
                            ? 'bg-muted/30'
                            : rate >= 100 ? 'bg-blue-500/20 text-blue-700 dark:text-blue-400'
                            : rate >= 80  ? 'bg-amber-500/20 text-amber-700 dark:text-amber-400'
                            : 'bg-red-500/20 text-red-700 dark:text-red-400'
                          return (
                            <td key={c} className={`text-center p-2 rounded font-semibold ${bg}`}>
                              {rate != null ? formatPercent(rate) : '-'}
                            </td>
                          )
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="text-center py-12 text-muted-foreground text-sm">
                생산 실적 데이터가 없습니다.
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
