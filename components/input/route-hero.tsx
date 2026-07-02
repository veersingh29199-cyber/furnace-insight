'use client'

import type { ReactNode } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

export type HeroMetric = {
  label: string
  value: ReactNode
  hint?: string
  tone?: 'default' | 'success' | 'warning' | 'danger'
}

interface RouteHeroProps {
  title: string
  description: string
  eyebrow?: string
  metrics?: HeroMetric[]
  actions?: ReactNode
  className?: string
}

export function RouteHero({
  title,
  description,
  eyebrow,
  metrics = [],
  actions,
  className,
}: RouteHeroProps) {
  const toneClass = {
    default: 'border-border bg-background/80 text-foreground',
    success: 'border-emerald-500/20 bg-emerald-500/10 text-emerald-600 dark:text-emerald-300',
    warning: 'border-amber-500/20 bg-amber-500/10 text-amber-600 dark:text-amber-300',
    danger: 'border-rose-500/20 bg-rose-500/10 text-rose-600 dark:text-rose-300',
  }

  return (
    <Card className={cn('overflow-hidden border-primary/20 bg-gradient-to-br from-primary/10 via-card to-card shadow-sm', className)}>
      <CardHeader className="gap-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-2">
            {eyebrow && (
              <Badge variant="outline" className="w-fit border-primary/20 bg-primary/5 text-primary">
                {eyebrow}
              </Badge>
            )}
            <div className="space-y-1">
              <CardTitle className="text-xl font-semibold tracking-tight">{title}</CardTitle>
              <CardDescription className="max-w-3xl text-sm leading-6">{description}</CardDescription>
            </div>
          </div>

          {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
        </div>
      </CardHeader>

      {metrics.length > 0 && (
        <CardContent className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {metrics.map((metric) => (
            <div
              key={metric.label}
              className={cn('rounded-xl border p-4 shadow-sm', toneClass[metric.tone ?? 'default'])}
            >
              <p className="text-xs font-medium uppercase tracking-[0.18em] opacity-70">{metric.label}</p>
              <div className="mt-2 text-lg font-semibold">{metric.value}</div>
              {metric.hint && <p className="mt-1 text-xs opacity-70">{metric.hint}</p>}
            </div>
          ))}
        </CardContent>
      )}
    </Card>
  )
}
