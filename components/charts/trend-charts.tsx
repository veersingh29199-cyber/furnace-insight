'use client'

import {
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { formatYearMonth } from '@/lib/utils'

interface ProductionTrendChartProps {
  data: Array<{
    month: string
    plan: number
    actual: number
    lineName?: string
  }>
  title?: string
  description?: string
  targetLine?: number
}

const CustomTooltip = ({ active, payload, label }: {
  active?: boolean
  payload?: Array<{ name: string; value: number; color: string }>
  label?: string
}) => {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-lg border border-border bg-background p-3 shadow-lg text-sm">
      <p className="font-semibold mb-1">{formatYearMonth(label + '-01')}</p>
      {payload.map((p) => (
        <div key={p.name} className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full" style={{ backgroundColor: p.color }} />
          <span className="text-muted-foreground">{p.name}:</span>
          <span className="font-medium">{p.value?.toLocaleString('ko-KR')} 톤</span>
        </div>
      ))}
    </div>
  )
}

export function ProductionTrendChart({ data, title = '생산 실적 추이', description, targetLine }: ProductionTrendChartProps) {
  return (
    <Card>
      <CardHeader className="pb-4">
        <CardTitle className="text-sm font-semibold">{title}</CardTitle>
        {description && <CardDescription className="text-xs">{description}</CardDescription>}
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={280}>
          <ComposedChart data={data} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" opacity={0.5} />
            <XAxis
              dataKey="month"
              tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }}
              tickLine={false}
              axisLine={false}
            />
            <YAxis
              tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }}
              tickLine={false}
              axisLine={false}
              tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`}
            />
            <Tooltip content={<CustomTooltip />} />
            <Legend
              iconType="circle"
              iconSize={8}
              wrapperStyle={{ fontSize: '12px' }}
            />
            {targetLine && (
              <ReferenceLine
                y={targetLine}
                stroke="var(--chart-3)"
                strokeDasharray="5 5"
                label={{ value: '목표', fill: 'var(--muted-foreground)', fontSize: 11, position: 'right' }}
              />
            )}
            <Bar dataKey="plan"   name="목표"   fill="var(--muted)"    radius={[3, 3, 0, 0]} />
            <Bar dataKey="actual" name="실적"   fill="var(--chart-1)" radius={[3, 3, 0, 0]} />
          </ComposedChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  )
}

// ─────────────────────────────────────────────
// 가스 원단위 추이 차트
// ─────────────────────────────────────────────
interface GasUnitTrendChartProps {
  data: Array<Record<string, string | number | null>>
  furnaceCodes: string[]
  targetValue?: number
}

const GAS_COLORS = [
  'var(--chart-1)', 'var(--chart-2)', 'var(--chart-3)',
  'var(--chart-4)', 'var(--chart-5)', '#f43f5e', '#8b5cf6',
]

export function GasUnitTrendChart({ data, furnaceCodes, targetValue }: GasUnitTrendChartProps) {
  return (
    <Card>
      <CardHeader className="pb-4">
        <CardTitle className="text-sm font-semibold">가열로별 가스원단위 추이</CardTitle>
        <CardDescription className="text-xs">낮을수록 연료 효율이 좋습니다 (단위: Nm³/톤)</CardDescription>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={280}>
          <ComposedChart data={data} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" opacity={0.5} />
            <XAxis
              dataKey="month"
              tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }}
              tickLine={false}
              axisLine={false}
            />
            <YAxis
              domain={['auto', 'auto']}
              tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }}
              tickLine={false}
              axisLine={false}
            />
            <Tooltip
              contentStyle={{
                background: 'var(--background)',
                border: '1px solid var(--border)',
                borderRadius: '8px',
                fontSize: '12px',
              }}
              formatter={(val) => [(typeof val === 'number' ? val : Number(val))?.toFixed(1), '']}
            />
            <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: '12px' }} />
            {targetValue && (
              <ReferenceLine
                y={targetValue}
                stroke="var(--destructive)"
                strokeDasharray="5 5"
                label={{ value: `목표 ${targetValue}`, fill: 'var(--destructive)', fontSize: 10, position: 'right' }}
              />
            )}
            {furnaceCodes.map((code, i) => (
              <Line
                key={code}
                type="monotone"
                dataKey={code}
                name={code}
                stroke={GAS_COLORS[i % GAS_COLORS.length]}
                strokeWidth={2}
                dot={{ r: 3 }}
                connectNulls
              />
            ))}
          </ComposedChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  )
}
