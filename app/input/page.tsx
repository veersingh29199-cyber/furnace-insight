'use client'

import Link from 'next/link'
import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { buttonVariants } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { RouteHero } from '@/components/input/route-hero'
import { createClient } from '@/lib/supabase/client'
import { currentMonthDate } from '@/lib/utils'
import { daysInMonth, currentMonthYm } from '@/lib/input/common'
import { ClipboardList, Flame, CalendarDays, ArrowRight, Upload, Sparkles } from 'lucide-react'

const routeCards = [
  {
    href: '/input/production',
    title: '생산 실적 입력',
    description: '라인, 제품, 교대, 계획/실적/작업시간을 그리드, 붙여넣기, 단건 폼으로 모두 입력합니다.',
    icon: ClipboardList,
    badge: '월간',
  },
  {
    href: '/input/gas-monthly',
    title: '월 가스검침 입력',
    description: '호기별 검침량과 장입량을 함께 관리하고, 원단위를 바로 미리보기 합니다.',
    icon: Flame,
    badge: '월간',
  },
  {
    href: '/input/gas-daily',
    title: '일일 가스검침 입력',
    description: '일 x 호기 표에 그대로 입력하고, 엑셀 붙여넣기와 파일 업로드로 한 번에 적재합니다.',
    icon: CalendarDays,
    badge: '일간',
  },
]

export default function InputHomePage() {
  const supabase = useMemo(() => createClient(), [])
  const ym = currentMonthYm()
  const monthDate = currentMonthDate()
  const lastDay = daysInMonth(ym)

  const { data: productionCount = 0 } = useQuery({
    queryKey: ['input-home-production-count', monthDate],
    queryFn: async () => {
      const { count, error } = await supabase
        .from('production_records')
        .select('*', { count: 'exact', head: true })
        .gte('work_date', `${ym}-01`)
        .lte('work_date', `${ym}-${String(lastDay).padStart(2, '0')}`)

      if (error) throw error
      return count ?? 0
    },
  })

  const { data: gasCount = 0 } = useQuery({
    queryKey: ['input-home-gas-count', monthDate],
    queryFn: async () => {
      const { count, error } = await supabase
        .from('gas_records')
        .select('*', { count: 'exact', head: true })
        .eq('ym', monthDate)

      if (error) throw error
      return count ?? 0
    },
  })

  const { data: dailyCount = 0 } = useQuery({
    queryKey: ['input-home-daily-count', ym],
    queryFn: async () => {
      const { count, error } = await supabase
        .from('gas_daily_readings')
        .select('*', { count: 'exact', head: true })
        .gte('date', `${ym}-01`)
        .lte('date', `${ym}-${String(lastDay).padStart(2, '0')}`)

      if (error) throw error
      return count ?? 0
    },
  })

  return (
    <div className="space-y-6">
      <RouteHero
        eyebrow="입력 허브"
        title="엑셀 습관을 그대로 살리는 데이터 입력 화면"
        description="복사-붙여넣기, 스프레드시트형 그리드, 단건 폼을 같은 화면에서 제공해 부서원 누구나 빠르게 입력할 수 있게 합니다."
        metrics={[
          {
            label: '이번 달 생산 실적',
            value: `${productionCount}건`,
            hint: `${ym} 기준`,
            tone: productionCount > 0 ? 'success' : 'warning',
          },
          {
            label: '이번 달 월 가스',
            value: `${gasCount}건`,
            hint: '호기별 검침 + 장입량',
            tone: gasCount > 0 ? 'success' : 'warning',
          },
          {
            label: '이번 달 일 가스',
            value: `${dailyCount}건`,
            hint: `일 ${lastDay}개 x 호기`,
            tone: dailyCount > 0 ? 'success' : 'warning',
          },
          {
            label: '권장 흐름',
            value: '그리드 → 붙여넣기 → 단건',
            hint: '현장 입력용 빠른 순서',
            tone: 'default',
          },
        ]}
        actions={(
          <>
            <Link href="/input/production" className={buttonVariants({ className: 'gap-2' })}>
              지금 입력 시작 <ArrowRight className="h-4 w-4" />
            </Link>
            <Link href="/upload" className={buttonVariants({ variant: 'outline', className: 'gap-2' })}>
              파일 업로드 <Upload className="h-4 w-4" />
            </Link>
          </>
        )}
      />

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Sparkles className="h-4 w-4 text-primary" />
            입력 방식 안내
          </CardTitle>
          <CardDescription>
            각 화면은 세 가지 입력 모드를 모두 제공하고, 중복은 upsert로 덮어씁니다.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-3">
          <div className="rounded-xl border bg-background/80 p-4">
            <p className="text-sm font-semibold">붙여넣기 / 업로드</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Excel에서 복사한 표를 그대로 붙여넣거나 `.xlsx` / `.csv`를 올려서 미리보기 후 저장합니다.
            </p>
          </div>
          <div className="rounded-xl border bg-background/80 p-4">
            <p className="text-sm font-semibold">그리드 직접 입력</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Tab, Enter, 방향키, 붙여넣기를 지원하는 스프레드시트형 표로 빠르게 입력합니다.
            </p>
          </div>
          <div className="rounded-xl border bg-background/80 p-4">
            <p className="text-sm font-semibold">단건 폼</p>
            <p className="mt-1 text-sm text-muted-foreground">
              현장에서 하나씩 꼼꼼히 넣을 때 쓰는 필드별 안내가 있는 폼입니다.
            </p>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-3">
        {routeCards.map((route) => {
          const Icon = route.icon

          return (
            <Card key={route.href} className="border-border/70 bg-card/80 backdrop-blur-sm">
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="rounded-xl bg-primary/10 p-2.5 text-primary">
                      <Icon className="h-5 w-5" />
                    </div>
                    <div>
                      <CardTitle className="text-base">{route.title}</CardTitle>
                      <CardDescription className="mt-1 text-sm">{route.description}</CardDescription>
                    </div>
                  </div>
                  <Badge variant="outline" className="shrink-0 border-primary/20 bg-primary/5 text-primary">
                    {route.badge}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent>
                <Link
                  href={route.href}
                  className={buttonVariants({ variant: 'outline', className: 'w-full justify-between' })}
                >
                  열기
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </CardContent>
            </Card>
          )
        })}
      </div>
    </div>
  )
}
