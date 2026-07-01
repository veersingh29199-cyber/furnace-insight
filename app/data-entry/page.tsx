'use client'

import { Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Info, HelpCircle, CheckCircle2, ClipboardList } from 'lucide-react'
import ProductionRecordForm from '@/components/forms/production-record-form'
import GasRecordForm from '@/components/forms/gas-record-form'
import GasDailyForm from '@/components/forms/gas-daily-form'

function DataEntryContent() {
  const searchParams = useSearchParams()
  const defaultTab = searchParams.get('tab') || 'production'

  return (
    <div className="space-y-6">
      {/* 무엇을 어디에 어떻게 입력하나요 안내 카드 */}
      <Card className="border-primary/20 bg-gradient-to-r from-primary/5 via-card to-card">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <ClipboardList className="w-5 h-5 text-primary" />
            현장 데이터 입력 3단계 가이드 (무엇을 · 어디에 · 어떻게)
          </CardTitle>
          <CardDescription>
            부서원이 매월 말일 또는 일일 작업 완료 후 아래 안내에 따라 입력하면 전사 대시보드와 보고서에 즉시 동기화됩니다.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
            <div className="p-3 rounded-lg border bg-background/80 space-y-1">
              <p className="font-bold text-primary flex items-center gap-1">
                <span>① 무엇을 입력하나요?</span>
              </p>
              <p className="text-muted-foreground leading-relaxed">
                라인별 월간 생산 실적(중량·가동시간) 및 가열로별 가스 사용량·장입 중량을 기입합니다.
              </p>
            </div>
            <div className="p-3 rounded-lg border bg-background/80 space-y-1">
              <p className="font-bold text-primary flex items-center gap-1">
                <span>② 어디에 입력하나요?</span>
              </p>
              <p className="text-muted-foreground leading-relaxed">
                아래 3개 탭(생산 실적 / 월 가스검침 / 일 일일검침) 중 목적에 맞는 탭을 선택합니다.
              </p>
            </div>
            <div className="p-3 rounded-lg border bg-background/80 space-y-1">
              <p className="font-bold text-primary flex items-center gap-1">
                <span>③ 어떻게 입력하나요?</span>
              </p>
              <p className="text-muted-foreground leading-relaxed">
                날짜/라인은 오타 방지를 위해 드롭다운으로 선택합니다. 동일 조건 저장 시 마지막 값으로 안전하게 덮어씁니다.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Tabs defaultValue={defaultTab} className="space-y-4">
        <TabsList className="grid grid-cols-3 w-full max-w-lg">
          <TabsTrigger value="production">1. 월별 생산 실적</TabsTrigger>
          <TabsTrigger value="gas-monthly">2. 월간 가스 검침</TabsTrigger>
          <TabsTrigger value="gas-daily">3. 일일 가스 검침</TabsTrigger>
        </TabsList>

        <TabsContent value="production">
          <ProductionRecordForm />
        </TabsContent>

        <TabsContent value="gas-monthly">
          <GasRecordForm />
        </TabsContent>

        <TabsContent value="gas-daily">
          <GasDailyForm />
        </TabsContent>
      </Tabs>
    </div>
  )
}

export default function DataEntryPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-xs text-muted-foreground">화면 불러오는 중...</div>}>
      <DataEntryContent />
    </Suspense>
  )
}
