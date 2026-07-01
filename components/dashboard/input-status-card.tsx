"use client"

import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button, buttonVariants } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { CheckCircle2, AlertCircle, ArrowRight, ClipboardList, Flame, CalendarDays } from 'lucide-react'
import Link from 'next/link'

const supabase = createClient()

export function InputStatusCard() {
  const currentYm = new Date().toISOString().slice(0, 7) // 예: 2026-07
  const todayDate = new Date().toISOString().slice(0, 10)

  // 1. 이번달 생산실적 확인
  const { data: prodCount = 0 } = useQuery({
    queryKey: ['status-prod', currentYm],
    queryFn: async () => {
      const { count } = await supabase.from('production_records').select('*', { count: 'exact', head: true }).gte('work_month', `${currentYm}-01`).lte('work_month', `${currentYm}-31`)
      return count || 0
    },
  })

  // 2. 이번달 월별 가스검침 확인
  const { data: gasCount = 0 } = useQuery({
    queryKey: ['status-gas', currentYm],
    queryFn: async () => {
      const { count } = await supabase.from('gas_records').select('*', { count: 'exact', head: true }).eq('ym', currentYm)
      return count || 0
    },
  })

  // 3. 오늘 일일 가스검침 확인
  const { data: dailyCount = 0 } = useQuery({
    queryKey: ['status-daily', todayDate],
    queryFn: async () => {
      const { count } = await supabase.from('gas_daily_readings').select('*', { count: 'exact', head: true }).eq('date', todayDate)
      return count || 0
    },
  })

  const statusItems = [
    {
      title: `${currentYm}월 생산 실적`,
      desc: '부서/라인별 생산 중량 및 작업 시간',
      isEntered: prodCount > 0,
      countLabel: `${prodCount}건 입력됨`,
      tab: 'production',
      icon: ClipboardList,
    },
    {
      title: `${currentYm}월 가스 검침`,
      desc: '가열로별 월간 사용량 및 장입량',
      isEntered: gasCount > 0,
      countLabel: `${gasCount}건 입력됨`,
      tab: 'gas-monthly',
      icon: Flame,
    },
    {
      title: `${todayDate} 오늘 일일 검침`,
      desc: '가열로 주/야간 자체 검침값',
      isEntered: dailyCount > 0,
      countLabel: `${dailyCount}건 입력됨`,
      tab: 'gas-daily',
      icon: CalendarDays,
    },
  ]

  return (
    <Card className="border-primary/25 bg-gradient-to-r from-primary/5 via-card to-card shadow-sm">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-base font-bold flex items-center gap-2">
              <ClipboardList className="w-5 h-5 text-primary" />
              이번 달 현장 데이터 입력 현황 ({currentYm})
            </CardTitle>
            <CardDescription className="text-xs mt-0.5">
              월 누락 없이 데이터를 입력해야 정확한 시간당 생산량 및 가스원단위가 계산됩니다.
            </CardDescription>
          </div>
          <Link href="/data-entry" className={buttonVariants({ variant: 'outline', size: 'sm', className: 'text-xs h-8 gap-1 hidden sm:flex' })}>
            전체 입력화면 이동 <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {statusItems.map((item) => {
            const Icon = item.icon
            return (
              <div
                key={item.tab}
                className="flex items-center justify-between p-3 rounded-lg border bg-background/80 hover:bg-muted/50 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div className={`p-2 rounded-md ${item.isEntered ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400' : 'bg-amber-500/15 text-amber-600 dark:text-amber-400'}`}>
                    <Icon className="w-4 h-4" />
                  </div>
                  <div>
                    <p className="text-xs font-semibold">{item.title}</p>
                    <p className="text-[10px] text-muted-foreground">{item.desc}</p>
                    <div className="mt-1">
                      {item.isEntered ? (
                        <Badge variant="outline" className="text-[10px] bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border-emerald-300">
                          <CheckCircle2 className="w-3 h-3 mr-1 inline" /> {item.countLabel}
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-[10px] bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border-amber-300">
                          <AlertCircle className="w-3 h-3 mr-1 inline" /> 미입력 (입력 필요)
                        </Badge>
                      )}
                    </div>
                  </div>
                </div>

                <Link href={`/data-entry?tab=${item.tab}`} className={buttonVariants({ variant: item.isEntered ? 'secondary' : 'default', size: 'sm', className: 'h-7 text-[11px] px-2.5' })}>
                  {item.isEntered ? '추가/수정' : '입력하기'}
                </Link>
              </div>
            )
          })}
        </div>
      </CardContent>
    </Card>
  )
}
