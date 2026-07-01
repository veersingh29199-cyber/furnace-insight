import type { Metadata } from 'next'
import DashboardShell from '@/components/layout/dashboard-shell'

export const metadata: Metadata = { title: '생산성 분석' }

export default function ProductivityLayout({ children }: { children: React.ReactNode }) {
  return (
    <DashboardShell
      pageTitle="생산성 분석"
      pageDesc="라인·제품별 목표 대비 실적, 시간당 생산량을 분석합니다"
    >
      {children}
    </DashboardShell>
  )
}
