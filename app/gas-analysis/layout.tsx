import type { Metadata } from 'next'
import DashboardShell from '@/components/layout/dashboard-shell'
export const metadata: Metadata = { title: '가스원단위 분석' }
export default function GasAnalysisLayout({ children }: { children: React.ReactNode }) {
  return (
    <DashboardShell pageTitle="가스원단위 분석" pageDesc="가열로별 월별 원단위 추이와 이상치를 분석합니다">
      {children}
    </DashboardShell>
  )
}
