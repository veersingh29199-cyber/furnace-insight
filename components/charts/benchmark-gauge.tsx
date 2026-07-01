'use client'

import {
  RadialBarChart,
  RadialBar,
  ResponsiveContainer,
  Legend,
  Tooltip,
} from 'recharts'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'

interface BenchmarkGaugeProps {
  metric: 'gas_unit' | 'ton_per_hour'
  currentValue: number | null
  benchmarks: Array<{
    org: string
    metric: string
    product_or_scope: string
    value: number
  }>
}

const COLORS = {
  '태상': '#3b82f6',
  '태웅': '#f59e0b',
  '두산': '#10b981',
  '현재': '#8b5cf6',
}

export function BenchmarkGauge({ metric, currentValue, benchmarks }: BenchmarkGaugeProps) {
  const filtered = benchmarks.filter(b => b.metric === metric)

  const metricLabel = metric === 'gas_unit' ? '가스원단위' : '시간당 생산량'
  const unit        = metric === 'gas_unit' ? '' : '톤/h'

  if (!currentValue && filtered.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">{metricLabel} 벤치마크 비교</CardTitle>
        </CardHeader>
        <CardContent className="text-center text-sm text-muted-foreground py-8">
          데이터가 없습니다
        </CardContent>
      </Card>
    )
  }

  // 표 형식으로 표시
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm">{metricLabel} 벤치마크 비교</CardTitle>
        <CardDescription className="text-xs">
          {metric === 'gas_unit' ? '낮을수록 좋음 (연료 효율 우수)' : '높을수록 좋음 (생산성 우수)'}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* 현재값 */}
        {currentValue != null && (
          <div className="flex items-center justify-between p-2 rounded-lg bg-violet-500/10 border border-violet-500/20">
            <div className="flex items-center gap-2">
              <div className="w-2.5 h-2.5 rounded-full bg-violet-500" />
              <span className="text-sm font-medium">우리 공장 (이번달)</span>
            </div>
            <span className="font-bold text-violet-600 dark:text-violet-400">
              {currentValue.toFixed(1)} {unit}
            </span>
          </div>
        )}

        {/* 벤치마크 항목들 */}
        {filtered.map((b) => {
          const color = COLORS[b.org as keyof typeof COLORS] ?? '#6b7280'
          const diff  = currentValue != null ? currentValue - b.value : null
          const isGood = metric === 'gas_unit'
            ? (diff != null && diff < 0)
            : (diff != null && diff > 0)

          return (
            <div key={`${b.org}-${b.product_or_scope}`}
              className="flex items-center justify-between p-2 rounded-lg bg-muted/50">
              <div className="flex items-center gap-2">
                <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: color }} />
                <span className="text-sm">{b.org}</span>
                <Badge variant="outline" className="text-xs h-4 px-1">{b.product_or_scope}</Badge>
              </div>
              <div className="flex items-center gap-2">
                <span className="font-semibold text-sm">{b.value.toFixed(1)} {unit}</span>
                {diff != null && (
                  <span className={`text-xs ${isGood ? 'text-blue-500' : 'text-red-500'}`}>
                    ({diff > 0 ? '+' : ''}{diff.toFixed(1)})
                  </span>
                )}
              </div>
            </div>
          )
        })}
      </CardContent>
    </Card>
  )
}
