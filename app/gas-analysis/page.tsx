'use client'

import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { useGasRecords } from '@/hooks/use-gas-records'
import { useBenchmarks, useTargets, useFurnaces, useProducts } from '@/hooks/use-dashboard'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { GasUnitTrendChart } from '@/components/charts/trend-charts'
import {
  ScatterChart, Scatter, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, ReferenceLine, Cell
} from 'recharts'
import { Info, AlertTriangle, Calculator, Flame, CheckCircle2 } from 'lucide-react'
import {
  formatGasUnit, detectOutliers, cn
} from '@/lib/utils'
import { currentMonthYm, normalizeMonthDate } from '@/lib/input/common'

const supabase = createClient()

// 가열로 코드 안전 추출 헬퍼
function getFurnaceCode(rec: unknown): string {
  if (!rec || typeof rec !== 'object') return '-'
  const obj = rec as Record<string, unknown>
  if (obj.furnace) {
    const f = Array.isArray(obj.furnace) ? obj.furnace[0] : obj.furnace
    if (f && typeof f === 'object' && 'code' in f) return String((f as { code: string }).code)
  }
  if (obj.furnace_code) return String(obj.furnace_code)
  return '-'
}

// 가스원단위 = 가스사용량 / (투입중량kg / 1000)
function getCalculatedGasUnit(rec: unknown): number | null {
  if (!rec || typeof rec !== 'object') return null
  const obj = rec as Record<string, unknown>
  const usage = Number(obj.gas_usage || 0)
  const chargeKg = Number(obj.charge_weight_kg || 0)
  if (!Number.isFinite(usage) || !Number.isFinite(chargeKg) || usage <= 0 || chargeKg <= 0) return null
  return usage / (chargeKg / 1000)
}

// 저장된 값이 있으면 우선 쓰되, 원시값이 있으면 공식으로 재계산한다.
function getEffectiveGasUnit(rec: unknown): number | null {
  const calculated = getCalculatedGasUnit(rec)
  if (calculated != null) return calculated
  if (!rec || typeof rec !== 'object') return null
  const obj = rec as Record<string, unknown>
  const stored = Number(obj.gas_unit || 0)
  return Number.isFinite(stored) && stored > 0 ? stored : null
}

export default function GasAnalysisPage() {
  const currentYear = new Date().getFullYear()
  const { data: allGas }    = useGasRecords({})
  const { data: furnaces }  = useFurnaces()
  const { data: products }  = useProducts()
  const { data: benchmarks } = useBenchmarks()
  const { data: targets }    = useTargets(currentYear)

  const { data: dailyReadings } = useQuery({
    queryKey: ['gas-daily-all'],
    queryFn: async () => {
      const { data } = await supabase.from('gas_daily_readings').select('*')
      return data || []
    },
  })

  // 제품 Mix 시뮬레이터 상태
  const [mixInputs, setMixInputs] = useState<Record<string, number>>({})

  // ── 1호기부터 20호기까지 순서대로 (미사용 7호기 제외 총 19개 가동 호기) ──
  const activeFurnaceCodes = useMemo(() => {
    const set = new Set<string>()
    const defaultList = [
      '1호기', '2호기', '3호기', '4호기', '5호기', '6호기', '8호기', '9호기', '10호기',
      '11호기', '12호기', '13호기', '14호기', '15호기', '16호기', '17호기', '18호기', '19호기', '20호기'
    ]
    defaultList.forEach(c => set.add(c))

    furnaces?.forEach(f => {
      if (f.code && f.code !== '7호기') set.add(f.code)
    })
    allGas?.forEach(r => {
      const c = getFurnaceCode(r)
      if (c && c !== '-' && c !== '7호기') set.add(c)
    })

    return Array.from(set).sort((a, b) => {
      const numA = parseInt(a.replace(/[^0-9]/g, '')) || 0
      const numB = parseInt(b.replace(/[^0-9]/g, '')) || 0
      return numA - numB
    })
  }, [furnaces, allGas])

  // ── 추이 데이터 가공 (최근 12개월, 19개 가동 호기 전체 순서대로) ──
  const months = [...new Set(allGas?.map(r => normalizeMonthDate(r.ym)?.substring(0, 7) ?? r.ym.substring(0, 7)) ?? [])].sort().slice(-12)
  const trendData = months.map(m => {
    const row: Record<string, string | number | null> = { month: m }
    activeFurnaceCodes.forEach(code => {
      const rec = allGas?.find(r => (normalizeMonthDate(r.ym) ?? r.ym).startsWith(m) && getFurnaceCode(r) === code)
      row[code] = getEffectiveGasUnit(rec)
    })
    return row
  })

  // ── 이상치 감지 (이번달) ──
  const thisMonth = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}-01`
  const thisMonthGas = (allGas?.filter(r => normalizeMonthDate(r.ym) === thisMonth) ?? []).filter(r => {
    const c = getFurnaceCode(r)
    return c !== '7호기'
  })
  const gasUnitValues = thisMonthGas.map(r => getEffectiveGasUnit(r) ?? 0).filter(v => v > 0)
  const outlierSet    = detectOutliers(gasUnitValues)
  const outliers      = thisMonthGas.filter((_, i) => outlierSet.has(i))

  // ── 산점도 데이터 (장입량 vs 원단위) ──
  const scatterData = (allGas ?? [])
    .filter(r => {
      const c = getFurnaceCode(r)
      const u = getEffectiveGasUnit(r)
      return u != null && u > 0 && c !== '-' && c !== '7호기'
    })
    .map((r, i) => {
      const u = getEffectiveGasUnit(r) ?? 0
      const charge = Number(r.charge_weight_kg || 0)
      const cStr = getFurnaceCode(r)
      const effWeightTon = charge > 0 ? (charge / 1000) : null
      if (effWeightTon == null) return null
      return {
        x: effWeightTon,
        y: u,
        code: cStr,
        ym:   (normalizeMonthDate(r.ym) ?? r.ym).substring(0, 7),
        isOutlier: outlierSet.has(i),
      }
    })
    .filter((row): row is { x: number; y: number; code: string; ym: string; isOutlier: boolean } => row != null)
    .sort((a, b) => {
      const numA = parseInt(a.code.replace(/[^0-9]/g, '')) || 0
      const numB = parseInt(b.code.replace(/[^0-9]/g, '')) || 0
      return numA - numB
    })

  // ── 목표 원단위 ──
  const gasTarget = targets?.find(t => t.metric === 'gas_unit' && t.scope === 'company' && t.year === currentYear)?.target_value

  // ── 제품 Mix 시뮬레이터 ──
  const mixTotal = Object.values(mixInputs).reduce((s, v) => s + (v || 0), 0)
  const expectedUnit = useMemo(() => {
    if (!products || mixTotal === 0) return null
    return products.reduce((sum, p) => {
      const ratio = (mixInputs[p.id] ?? 0) / mixTotal
      return sum + ratio * (p.std_gas_unit ?? 0)
    }, 0)
  }, [products, mixInputs, mixTotal])
  const mixBreakdown = useMemo(() => {
    if (!products) return []
    return products
      .filter((p): p is typeof p & { std_gas_unit: number } => p.std_gas_unit != null)
      .map((p) => {
        const ratio = mixTotal > 0 ? (mixInputs[p.id] ?? 0) / mixTotal : 0
        const contribution = ratio * p.std_gas_unit
        return {
          id: p.id,
          name: p.name,
          ratio,
          stdGasUnit: p.std_gas_unit,
          contribution,
        }
      })
      .sort((a, b) => b.contribution - a.contribution)
  }, [products, mixInputs, mixTotal])

  // ── 태상 vs 태웅 비교 ──
  const taesangBench = benchmarks?.find(b => b.org === '태상' && b.metric === 'gas_unit' && b.scope === '전사')
  const taesangActual = benchmarks?.find(b => b.org === '태상' && b.metric === 'gas_unit' && b.scope === '실적')
  const taewungBench  = benchmarks?.find(b => b.org === '태웅' && b.metric === 'gas_unit' && b.scope === '전사')
  const taewungActual = benchmarks?.find(b => b.org === '태웅' && b.metric === 'gas_unit' && b.scope === '실적')
  const validGasRecords = (allGas ?? []).filter(r => {
    const c = getFurnaceCode(r)
    return c !== '7호기' && getEffectiveGasUnit(r) != null
  })
  const ourActual = validGasRecords.length > 0
    ? validGasRecords.reduce((s, r) => s + (getEffectiveGasUnit(r) ?? 0), 0) / validGasRecords.length
    : null

  // ── 일일 검침 vs 월간 공식 검침 교차 대조 (최신 월 기준 19개 가동 호기 전체 순서대로) ──
  const dailyVsMonthly = useMemo(() => {
    if (!allGas || !activeFurnaceCodes.length) return []
    const latestMonth = months[months.length - 1] || currentMonthYm()

    return activeFurnaceCodes.map(furnaceCode => {
      const rec = allGas.find(r => (normalizeMonthDate(r.ym) ?? r.ym).startsWith(latestMonth) && getFurnaceCode(r) === furnaceCode)
      const officialUsage = rec ? Number(rec.gas_usage || 0) : 0

      const dailyMatches = (dailyReadings || []).filter(d => {
        const dCode = getFurnaceCode(d) || (d as Record<string, unknown>).furnace_code || '-'
        return (d.date as string)?.startsWith(latestMonth) && dCode === furnaceCode
      })
      const dailySum = dailyMatches.reduce((s, d) => s + Number(d.value || 0), 0)
      const diff = officialUsage - dailySum
      const diffPct = officialUsage > 0 ? (diff / officialUsage) * 100 : 0
      return { ym: latestMonth, furnaceCode, officialUsage, dailySum, diff, diffPct }
    })
  }, [allGas, activeFurnaceCodes, months, dailyReadings])

  return (
    <div className="space-y-6">
      <Alert className="border-primary/30 bg-primary/5">
        <Info className="h-4 w-4 text-primary" />
        <AlertDescription className="text-sm">
          <strong>가스원단위</strong> = 가스사용량(Nm³) ÷ (투입중량(kg) / 1000). 낮을수록 연료 효율이 좋습니다.
          전사 목표: <strong>{gasTarget ?? 150} Nm³/톤</strong>
        </AlertDescription>
      </Alert>

      {/* 이상치 경고 */}
      {outliers.length > 0 && (
        <Alert className="border-amber-500/40 bg-amber-500/5">
          <AlertTriangle className="h-4 w-4 text-amber-500" />
          <AlertDescription className="text-sm">
            <strong>이번달 원단위 이상치:</strong>{' '}
            {outliers.map(r => `${getFurnaceCode(r)} (${formatGasUnit(getEffectiveGasUnit(r) ?? 0)})`).join(', ')}
          </AlertDescription>
        </Alert>
      )}

      {/* 원단위 추이 */}
      <div>
        <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
          📈 가열로별 원단위 추이 (최근 12개월, 19개 가동 호기 순서대로)
        </h2>
        <GasUnitTrendChart
          data={trendData as Array<{ month: string; [key: string]: string | number | null }>}
          furnaceCodes={activeFurnaceCodes}
          targetValue={gasTarget}
        />
      </div>

      {/* 태상 vs 태웅 비교 보드 */}
      <div>
        <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
          🏆 태상 vs 태웅 원단위 비교
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {[
            { org: '태상', target: taesangBench?.value, actual: taesangActual?.value, color: 'border-blue-500/30 bg-blue-500/5' },
            { org: '우리 공장', target: gasTarget, actual: ourActual, color: 'border-primary/30 bg-primary/5' },
            { org: '태웅', target: taewungBench?.value, actual: taewungActual?.value, color: 'border-amber-500/30 bg-amber-500/5' },
          ].map(({ org, target, actual, color }) => (
            <Card key={org} className={`border ${color}`}>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">{org}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">목표</span>
                  <span className="font-semibold">{target ? formatGasUnit(target) : '-'} Nm³/톤</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">실적</span>
                  <span className={cn('font-semibold', actual && target
                    ? actual < target ? 'text-blue-500' : 'text-red-500'
                    : '')}>
                    {actual ? formatGasUnit(actual) : '-'} Nm³/톤
                  </span>
                </div>
                {target && actual && (
                  <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                    <div
                      className={cn('h-full rounded-full', actual <= target ? 'bg-blue-500' : 'bg-red-500')}
                      style={{ width: `${Math.min((target / actual) * 100, 100)}%` }}
                    />
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {/* 일일 검침 vs 월 공식 고지서 대조 보드 */}
      <div>
        <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
          ⚖️ 일일 자체검침 합산 vs 월 공식 고지서 대조 (교차 검증)
        </h2>
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-bold flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-500" />
              월간 가스 사용량 신뢰성 크로스 체크
            </CardTitle>
            <CardDescription className="text-xs">
              매일 입력된 현장 검침 합산량과 월말 확정된 고지서/계량기 검침량을 대조하여 누락 및 유실을 방지합니다.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {dailyVsMonthly.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-6">대조할 가스 검침 내역이 없습니다.</p>
            ) : (
              <div className="rounded-lg border overflow-hidden">
                <Table>
                  <TableHeader className="bg-muted/50">
                    <TableRow>
                      <TableHead className="text-xs">년월</TableHead>
                      <TableHead className="text-xs">호기</TableHead>
                      <TableHead className="text-xs text-right">일일 검침 합산</TableHead>
                      <TableHead className="text-xs text-right">월 공식 고지서</TableHead>
                      <TableHead className="text-xs text-right">차이 (오차율)</TableHead>
                      <TableHead className="text-xs text-center">검증 결과</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {dailyVsMonthly.map((row, i) => (
                      <TableRow key={i}>
                        <TableCell className="text-xs font-mono">{row.ym}</TableCell>
                        <TableCell className="text-xs font-bold">{row.furnaceCode}</TableCell>
                        <TableCell className="text-xs text-right font-mono">
                          {row.dailySum > 0 ? `${row.dailySum.toLocaleString('ko-KR')} Nm³` : '—'}
                        </TableCell>
                        <TableCell className="text-xs text-right font-mono">
                          {row.officialUsage > 0 ? `${row.officialUsage.toLocaleString('ko-KR')} Nm³` : '—'}
                        </TableCell>
                        <TableCell className="text-xs text-right font-mono">
                          {row.officialUsage > 0 && row.dailySum > 0
                            ? `${row.diff > 0 ? '+' : ''}${row.diff.toLocaleString('ko-KR')} (${row.diffPct > 0 ? '+' : ''}${row.diffPct.toFixed(1)}%)`
                            : '—'}
                        </TableCell>
                        <TableCell className="text-center">
                          {row.officialUsage === 0 || row.dailySum === 0 ? (
                            <Badge variant="outline" className="text-[10px] text-muted-foreground">대기/누락</Badge>
                          ) : Math.abs(row.diffPct) <= 5 ? (
                            <Badge className="bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500/20 text-[10px] border-emerald-300">
                              일치 (정상)
                            </Badge>
                          ) : (
                            <Badge variant="destructive" className="text-[10px]">
                              오차 확인 필요
                            </Badge>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* 장입량 vs 원단위 산점도 */}
      <div>
        <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
          🔍 장입량 vs 원단위 산점도
        </h2>
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">장입량(톤) 대비 가스원단위 분포</CardTitle>
            <CardDescription className="text-xs">빨간 점 = 이상치 (IQR 기반 감지)</CardDescription>
          </CardHeader>
          <CardContent className="px-2 sm:px-6">
            <div className="h-[250px] sm:h-[280px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <ScatterChart margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" opacity={0.5} />
                <XAxis
                  type="number" dataKey="x" name="장입량"
                  unit="톤" tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }}
                  tickLine={false} axisLine={false}
                  tickFormatter={v => `${(v / 1000).toFixed(0)}k`}
                />
                <YAxis
                  type="number" dataKey="y" name="원단위"
                  unit="" tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }}
                  tickLine={false} axisLine={false}
                />
                <Tooltip
                  contentStyle={{ background: 'var(--background)', border: '1px solid var(--border)', borderRadius: '8px', fontSize: '12px' }}
                  formatter={(v, n) => {
                    const val = typeof v === 'number' ? v : Number(v)
                    return [
                      n === '장입량' ? `${val.toLocaleString('ko-KR')} 톤` : `${val.toFixed(1)} Nm³/톤`,
                      String(n)
                    ]
                  }}
                />
                {gasTarget && (
                  <ReferenceLine y={gasTarget} stroke="var(--destructive)" strokeDasharray="5 5"
                    label={{ value: `목표 ${gasTarget}`, fill: 'var(--destructive)', fontSize: 10, position: 'right' }} />
                )}
                <Scatter data={scatterData} name="가열로별">
                  {scatterData.map((entry, i) => (
                    <Cell key={i} fill={entry.isOutlier ? '#ef4444' : 'var(--chart-1)'} opacity={0.7} />
                  ))}
                </Scatter>
              </ScatterChart>
            </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* 제품 Mix 시뮬레이터 */}
      <div>
        <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
          🧪 제품 Mix 원단위 시뮬레이터
        </h2>
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <Calculator className="h-4 w-4" />
              제품 투입 비중 입력 → 예상 원단위 자동 계산
            </CardTitle>
            <CardDescription className="text-xs">
              각 제품의 투입 비중(%)을 입력하면 가중 평균 원단위를 계산합니다.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {products?.filter(p => p.std_gas_unit != null).map(p => (
                <div key={p.id} className="space-y-1">
                  <Label className="text-xs">{p.name}</Label>
                  <div className="relative">
                    <Input
                      type="number" min="0" max="100" step="1"
                      placeholder="0"
                      className="pr-8"
                      value={mixInputs[p.id] ?? ''}
                      onChange={e => setMixInputs(prev => ({ ...prev, [p.id]: Number(e.target.value) }))}
                    />
                    <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">%</span>
                  </div>
                  <p className="text-xs text-muted-foreground">표준: {formatGasUnit(p.std_gas_unit)}</p>
                </div>
              ))}
            </div>

            {/* 합계 표시 */}
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">투입 비중 합계:</span>
              <Badge variant={Math.abs(mixTotal - 100) < 0.1 ? 'default' : 'destructive'}>
                {mixTotal.toFixed(0)}%
              </Badge>
              {Math.abs(mixTotal - 100) > 0.1 && mixTotal > 0 && (
                <span className="text-xs text-amber-500">합계가 100%가 아닙니다</span>
              )}
            </div>

            {/* 예상 원단위 */}
            {expectedUnit != null && mixTotal > 0 && (
              <div className="flex items-center gap-3 p-4 rounded-xl bg-primary/5 border border-primary/20">
                <div className="p-2 rounded-lg bg-primary/10">
                  <Flame className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">예상 가스원단위</p>
                  <p className="text-2xl font-bold text-primary">{formatGasUnit(expectedUnit)} Nm³/톤</p>
                </div>
                <div className="ml-auto text-sm">
                  {gasTarget && (
                    expectedUnit <= gasTarget
                      ? <Badge className="bg-blue-500">목표 달성 예상</Badge>
                      : <Badge variant="destructive">목표 초과 예상 (+{formatGasUnit(expectedUnit - gasTarget)})</Badge>
                  )}
                </div>
              </div>
            )}

            <div className="rounded-lg border">
              <div className="border-b px-3 py-2">
                <p className="text-sm font-semibold">Product Mix 분해표</p>
                <p className="text-xs text-muted-foreground">가중합 = Σ(투입 비중 × 제품 표준 원단위)</p>
              </div>
              <Table>
                <TableHeader className="bg-muted/40">
                  <TableRow>
                    <TableHead>제품</TableHead>
                    <TableHead className="text-right">비중</TableHead>
                    <TableHead className="text-right">표준 원단위</TableHead>
                    <TableHead className="text-right">기여도</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {mixBreakdown.length > 0 ? (
                    mixBreakdown.map((row) => (
                      <TableRow key={row.id}>
                        <TableCell>{row.name}</TableCell>
                        <TableCell className="text-right">{(row.ratio * 100).toFixed(1)}%</TableCell>
                        <TableCell className="text-right">{formatGasUnit(row.stdGasUnit)}</TableCell>
                        <TableCell className="text-right">{formatGasUnit(row.contribution)}</TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell colSpan={4} className="py-8 text-center text-sm text-muted-foreground">
                        표준 원단위가 있는 제품이 없습니다.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
