'use client'

import { useMemo, useState } from 'react'
import { useGasRecords } from '@/hooks/use-gas-records'
import { useBenchmarks, useTargets, useFurnaces, useProducts } from '@/hooks/use-dashboard'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { GasUnitTrendChart } from '@/components/charts/trend-charts'
import {
  ScatterChart, Scatter, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, ReferenceLine, Cell
} from 'recharts'
import { Info, AlertTriangle, Calculator, Flame } from 'lucide-react'
import {
  formatGasUnit, kgToTon, detectOutliers, cn
} from '@/lib/utils'

export default function GasAnalysisPage() {
  const { data: allGas }    = useGasRecords({})
  const { data: furnaces }  = useFurnaces()
  const { data: products }  = useProducts()
  const { data: benchmarks } = useBenchmarks()
  const { data: targets }    = useTargets(new Date().getFullYear())

  // 제품 Mix 시뮬레이터 상태
  const [mixInputs, setMixInputs] = useState<Record<string, number>>({})

  // ── 추이 데이터 가공 (최근 12개월, 주요 호기만) ──
  const months = [...new Set(allGas?.map(r => r.ym.substring(0, 7)) ?? [])].sort().slice(-12)
  const topFurnaces = [...new Set(allGas?.map(r => r.furnace?.code ?? '').filter(Boolean) ?? [])].slice(0, 7)
  const trendData = months.map(m => {
    const row: Record<string, string | number | null> = { month: m }
    topFurnaces.forEach(code => {
      const rec = allGas?.find(r => r.ym.startsWith(m) && r.furnace?.code === code)
      row[code] = rec?.gas_unit ?? null
    })
    return row
  })

  // ── 이상치 감지 (이번달) ──
  const thisMonth = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}-01`
  const thisMonthGas = allGas?.filter(r => r.ym === thisMonth) ?? []
  const gasUnitValues = thisMonthGas.map(r => r.gas_unit ?? 0).filter(v => v > 0)
  const outlierSet    = detectOutliers(gasUnitValues)
  const outliers      = thisMonthGas.filter((_, i) => outlierSet.has(i))

  // ── 산점도 데이터 (장입량 vs 원단위) ──
  const scatterData = allGas
    ?.filter(r => r.gas_unit != null && r.charge_weight_kg > 0)
    .map((r, i) => ({
      x: kgToTon(r.charge_weight_kg),
      y: r.gas_unit ?? 0,
      code: r.furnace?.code ?? '-',
      ym:   r.ym.substring(0, 7),
      isOutlier: outlierSet.has(i),
    })) ?? []

  // ── 목표 원단위 ──
  const gasTarget = targets?.find(t => t.metric === 'gas_unit' && t.scope === 'company')?.target_value

  // ── 제품 Mix 시뮬레이터 ──
  const mixTotal = Object.values(mixInputs).reduce((s, v) => s + (v || 0), 0)
  const expectedUnit = useMemo(() => {
    if (!products || mixTotal === 0) return null
    return products.reduce((sum, p) => {
      const ratio = (mixInputs[p.id] ?? 0) / mixTotal
      return sum + ratio * (p.std_gas_unit ?? 0)
    }, 0)
  }, [products, mixInputs, mixTotal])

  // ── 태상 vs 태웅 비교 ──
  const taesangBench = benchmarks?.find(b => b.org === '태상' && b.metric === 'gas_unit' && b.product_or_scope === '전사')
  const taesangActual = benchmarks?.find(b => b.org === '태상' && b.metric === 'gas_unit' && b.product_or_scope === '실적')
  const taewungBench  = benchmarks?.find(b => b.org === '태웅' && b.metric === 'gas_unit' && b.product_or_scope === '전사')
  const taewungActual = benchmarks?.find(b => b.org === '태웅' && b.metric === 'gas_unit' && b.product_or_scope === '실적')
  const ourActual = allGas && allGas.length > 0
    ? allGas.filter(r => r.gas_unit != null).reduce((s, r) => s + (r.gas_unit ?? 0), 0) /
      allGas.filter(r => r.gas_unit != null).length
    : null

  return (
    <div className="space-y-6">
      <Alert className="border-primary/30 bg-primary/5">
        <Info className="h-4 w-4 text-primary" />
        <AlertDescription className="text-sm">
          <strong>가스원단위</strong> = 가스사용량(Nm³) ÷ 장입중량(톤). 낮을수록 연료 효율이 좋습니다.
          전사 목표: <strong>{gasTarget ?? 150} Nm³/톤</strong>
        </AlertDescription>
      </Alert>

      {/* 이상치 경고 */}
      {outliers.length > 0 && (
        <Alert className="border-amber-500/40 bg-amber-500/5">
          <AlertTriangle className="h-4 w-4 text-amber-500" />
          <AlertDescription className="text-sm">
            <strong>이번달 원단위 이상치:</strong>{' '}
            {outliers.map(r => `${r.furnace?.code} (${formatGasUnit(r.gas_unit)})`).join(', ')}
          </AlertDescription>
        </Alert>
      )}

      {/* 원단위 추이 */}
      <div>
        <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
          📈 가열로별 원단위 추이 (최근 12개월)
        </h2>
        <GasUnitTrendChart
          data={trendData as Array<{ month: string; [key: string]: string | number | null }>}
          furnaceCodes={topFurnaces}
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
          <CardContent>
            <ResponsiveContainer width="100%" height={280}>
              <ScatterChart margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
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
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
