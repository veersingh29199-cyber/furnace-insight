import type { Metadata } from 'next'
import DashboardShell from '@/components/layout/dashboard-shell'

export const metadata: Metadata = { title: '보고서 출력 (PDF/PPT)' }

export default function ReportsLayout({ children }: { children: React.ReactNode }) {
  return (
    <DashboardShell
      pageTitle="생산성·가스원단위 보고서 출력"
      pageDesc="적재된 실적 데이터를 바탕으로 경영진 보고용 PDF 및 편집 가능한 PPT(.pptx)를 생성합니다"
    >
      {children}
    </DashboardShell>
  )
}
