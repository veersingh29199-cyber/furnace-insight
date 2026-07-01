'use client'

import { cn, formatGasUnit, formatTonPerHour, formatPercent, formatChange, changeColor, achievementColor } from '@/lib/utils'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { TrendingUp, TrendingDown, Minus } from 'lucide-react'
import type { ReactNode } from 'react'

interface KpiCardProps {
  label: string
  value: string | number | null
  unit?: string
  change?: number | null
  changeLabel?: string
  goodWhenDown?: boolean
  icon?: ReactNode
  loading?: boolean
  target?: number | null
  targetLabel?: string
}

export function KpiCard({
  label, value, unit, change, changeLabel = '전월 대비',
  goodWhenDown = false, icon, loading = false, target, targetLabel = '목표',
}: KpiCardProps) {
  if (loading) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <Skeleton className="h-4 w-24" />
        </CardHeader>
        <CardContent className="space-y-2">
          <Skeleton className="h-8 w-32" />
          <Skeleton className="h-3 w-20" />
        </CardContent>
      </Card>
    )
  }

  const TrendIcon = change == null || change === 0
    ? Minus
    : change > 0 ? TrendingUp : TrendingDown

  return (
    <Card className="hover:shadow-md transition-shadow">
      <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
        <CardTitle className="text-sm font-medium text-muted-foreground">{label}</CardTitle>
        {icon && <div className="text-muted-foreground">{icon}</div>}
      </CardHeader>
      <CardContent className="space-y-1">
        <div className="flex items-baseline gap-1.5">
          <span className="text-2xl font-bold tracking-tight">
            {value ?? '-'}
          </span>
          {unit && <span className="text-sm text-muted-foreground">{unit}</span>}
        </div>

        {/* 전월 대비 증감 */}
        {change != null && (
          <div className={cn('flex items-center gap-1 text-xs font-medium', changeColor(change, goodWhenDown))}>
            <TrendIcon className="h-3 w-3" />
            <span>{formatChange(change)}</span>
            <span className="text-muted-foreground font-normal">{changeLabel}</span>
          </div>
        )}

        {/* 목표 대비 */}
        {target != null && value != null && (
          <p className="text-xs text-muted-foreground">
            {targetLabel} {typeof value === 'number' ? formatGasUnit(target) : target}
          </p>
        )}
      </CardContent>
    </Card>
  )
}

// ─────────────────────────────────────────────
// 달성률 카드 (프로그레스 바 포함)
// ─────────────────────────────────────────────
interface AchievementCardProps {
  label: string
  actual: number | null
  plan: number | null
  unit?: string
  loading?: boolean
}

export function AchievementCard({ label, actual, plan, unit = '톤', loading = false }: AchievementCardProps) {
  if (loading) {
    return (
      <Card>
        <CardHeader className="pb-2"><Skeleton className="h-4 w-24" /></CardHeader>
        <CardContent><Skeleton className="h-16 w-full" /></CardContent>
      </Card>
    )
  }

  const rate = actual != null && plan != null && plan > 0 ? (actual / plan) * 100 : null
  const clampedRate = rate != null ? Math.min(rate, 150) : 0

  return (
    <Card className="hover:shadow-md transition-shadow">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{label}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        <div className="flex items-end justify-between">
          <div>
            <span className={cn('text-2xl font-bold', achievementColor(rate))}>
              {formatPercent(rate)}
            </span>
          </div>
          <div className="text-right text-xs text-muted-foreground">
            <div>{actual?.toLocaleString('ko-KR') ?? '-'} {unit}</div>
            <div>/ {plan?.toLocaleString('ko-KR') ?? '-'} {unit}</div>
          </div>
        </div>
        {/* 프로그레스 바 */}
        <div className="h-2 bg-muted rounded-full overflow-hidden">
          <div
            className={cn(
              'h-full rounded-full transition-all duration-700',
              clampedRate >= 100 ? 'bg-blue-500' : clampedRate >= 80 ? 'bg-amber-500' : 'bg-red-500'
            )}
            style={{ width: `${clampedRate}%` }}
          />
        </div>
      </CardContent>
    </Card>
  )
}
