'use client'

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Info } from 'lucide-react'
import ProductionRecordForm from '@/components/forms/production-record-form'
import GasRecordForm from '@/components/forms/gas-record-form'
import GasDailyForm from '@/components/forms/gas-daily-form'

export default function DataEntryPage() {
  return (
    <div className="space-y-6">
      <Alert className="border-primary/30 bg-primary/5">
        <Info className="h-4 w-4 text-primary" />
        <AlertDescription className="text-sm">
          데이터는 <strong>월 단위(YYYY-MM)</strong>로 저장됩니다.
          같은 월·라인·제품으로 다시 저장하면 <strong>자동으로 덮어씁니다</strong> (upsert).
          editor 이상 권한이 있어야 입력할 수 있습니다.
        </AlertDescription>
      </Alert>

      <Tabs defaultValue="production" className="space-y-4">
        <TabsList className="grid grid-cols-3 w-full max-w-lg">
          <TabsTrigger value="production">생산 실적</TabsTrigger>
          <TabsTrigger value="gas-monthly">가스 월 검침</TabsTrigger>
          <TabsTrigger value="gas-daily">가스 일 검침</TabsTrigger>
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
