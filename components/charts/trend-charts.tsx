'use client'

import { useState, useMemo } from 'react'
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
      <CardContent className="px-2 sm:px-6">
        <div className="h-[240px] sm:h-[280px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={data} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
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
        </div>
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
  '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6',
  '#ec4899', '#06b6d4', '#84cc16', '#f97316', '#6366f1',
  '#14b8a6', '#eab308', '#d97706', '#0284c7', '#7c3aed',
  '#be185d', '#15803d', '#b45309', '#4f46e5', '#047857',
]

const CustomGasTooltip = ({ active, payload, label }: {
  active?: boolean
  payload?: Array<{ name: string; value: number; color: string }>
  label?: string
}) => {
  if (!active || !payload?.length) return null
  const sortedPayload = [...payload].sort((a, b) => {
    const numA = parseInt(a.name.replace(/[^0-9]/g, '')) || 0
    const numB = parseInt(b.name.replace(/[^0-9]/g, '')) || 0
    return numA - numB
  })
  return (
    <div className="rounded-lg border border-border bg-background p-3 shadow-lg text-xs max-h-64 overflow-y-auto z-50">
      <p className="font-semibold mb-1.5 text-sm border-b border-border pb-1">{formatYearMonth(label + '-01')}</p>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-1 mt-1">
        {sortedPayload.map((p) => (
          p.value != null && (
            <div key={p.name} className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5">
                <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: p.color }} />
                <span className="text-muted-foreground font-medium">{p.name}:</span>
              </div>
              <span className="font-mono font-bold">{Number(p.value).toFixed(1)}</span>
            </div>
          )
        ))}
      </div>
    </div>
  )
}

export function GasUnitTrendChart({ data, furnaceCodes, targetValue }: GasUnitTrendChartProps) {
  const sortedCodes = useMemo(() => [...furnaceCodes].sort((a, b) => {
    const numA = parseInt(a.replace(/[^0-9]/g, '')) || 0
    const numB = parseInt(b.replace(/[^0-9]/g, '')) || 0
    return numA - numB
  }), [furnaceCodes])

  const [selectedCodes, setSelectedCodes] = useState<string[]>([])
  const [hoveredCode, setHoveredCode] = useState<string | null>(null)
  const activeCodes = selectedCodes.length > 0 ? selectedCodes : sortedCodes

  const toggleCode = (code: string) => {
    setSelectedCodes(prev => {
      const current = prev.length > 0 ? prev : sortedCodes
      if (current.includes(code)) {
        // 최소 1개는 켜져있게 유지
        if (current.length === 1) return current
        return current.filter(c => c !== code)
      }
      return [...current, code]
    })
  }

  const selectGroup = (type: 'all' | 'top5' | 'mid' | 'high') => {
    if (type === 'all') setSelectedCodes(sortedCodes)
    else if (type === 'top5') setSelectedCodes(sortedCodes.slice(0, 6))
    else if (type === 'mid') setSelectedCodes(sortedCodes.filter(c => {
      const n = parseInt(c.replace(/[^0-9]/g, '')) || 0
      return n >= 6 && n <= 13
    }))
    else if (type === 'high') setSelectedCodes(sortedCodes.filter(c => {
      const n = parseInt(c.replace(/[^0-9]/g, '')) || 0
      return n >= 14
    }))
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <CardTitle className="text-sm font-bold">가열로별 가스원단위 추이</CardTitle>
            <CardDescription className="text-xs">
              낮을수록 연료 효율이 좋습니다 (단위: Nm³/톤). 아래 칩을 클릭하여 호기를 끄거나 켤 수 있습니다.
            </CardDescription>
          </div>
          <div className="flex items-center gap-1.5 shrink-0 self-start sm:self-auto">
            <button
              type="button"
              onClick={() => selectGroup('all')}
              className="text-[11px] px-2 py-1 rounded bg-primary/10 text-primary hover:bg-primary/20 font-medium transition-colors"
            >
              전체 보기 ({sortedCodes.length})
            </button>
            <button
              type="button"
              onClick={() => selectGroup('top5')}
              className="text-[11px] px-2 py-1 rounded bg-secondary text-secondary-foreground hover:bg-secondary/80 font-medium transition-colors"
            >
              1~6호기
            </button>
            <button
              type="button"
              onClick={() => selectGroup('mid')}
              className="text-[11px] px-2 py-1 rounded bg-secondary text-secondary-foreground hover:bg-secondary/80 font-medium transition-colors"
            >
              8~13호기
            </button>
            <button
              type="button"
              onClick={() => selectGroup('high')}
              className="text-[11px] px-2 py-1 rounded bg-secondary text-secondary-foreground hover:bg-secondary/80 font-medium transition-colors"
            >
              14~20호기
            </button>
          </div>
        </div>

        {/* 인터랙티브 호기 필터 & 선택 칩 */}
        <div className="flex flex-wrap gap-1.5 pt-2.5 border-t border-border/40 mt-2">
          {sortedCodes.map((code, i) => {
            const color = GAS_COLORS[i % GAS_COLORS.length]
            const isSelected = activeCodes.includes(code)
            const isHovered = hoveredCode === code
            return (
              <button
                key={code}
                type="button"
                onClick={() => toggleCode(code)}
                onMouseEnter={() => setHoveredCode(code)}
                onMouseLeave={() => setHoveredCode(null)}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold border transition-all ${
                  isSelected
                    ? 'shadow-sm'
                    : 'opacity-35 hover:opacity-75 bg-transparent border-dashed border-muted-foreground/30'
                } ${isHovered ? 'scale-105 ring-2 ring-primary/60 z-10' : ''}`}
                style={{
                  backgroundColor: isSelected ? `${color}15` : undefined,
                  borderColor: isSelected ? color : undefined,
                  color: isSelected ? color : 'var(--muted-foreground)'
                }}
              >
                <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: color }} />
                {code}
              </button>
            )
          })}
        </div>
      </CardHeader>

      <CardContent className="px-2 sm:px-6 pt-2">
        <div className="h-[270px] sm:h-[320px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={data} margin={{ top: 10, right: 15, left: -10, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" opacity={0.4} />
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
              <Tooltip content={<CustomGasTooltip />} />
              {targetValue && (
                <ReferenceLine
                  y={targetValue}
                  stroke="var(--destructive)"
                  strokeDasharray="5 5"
                  label={{ value: `목표 ${targetValue}`, fill: 'var(--destructive)', fontSize: 10, position: 'right' }}
                />
              )}
              {sortedCodes.map((code, i) => {
                const isSelected = activeCodes.includes(code)
                if (!isSelected) return null

                const isHovered = hoveredCode === code
                const isAnyHovered = hoveredCode !== null

                return (
                  <Line
                    key={code}
                    type="monotone"
                    dataKey={code}
                    name={code}
                    stroke={GAS_COLORS[i % GAS_COLORS.length]}
                    strokeWidth={isHovered ? 3.5 : 2}
                    strokeOpacity={isAnyHovered && !isHovered ? 0.2 : 1}
                    dot={isHovered ? { r: 5, strokeWidth: 2 } : { r: 2.5 }}
                    connectNulls
                  />
                )
              })}
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  )
}
