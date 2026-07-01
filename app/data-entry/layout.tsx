import type { Metadata } from 'next'
import DashboardShell from '@/components/layout/dashboard-shell'

export const metadata: Metadata = { title: '데이터 입력' }

export default function DataEntryLayout({ children }: { children: React.ReactNode }) {
  return (
    <DashboardShell
      pageTitle="데이터 입력"
      pageDesc="생산 실적과 가열로 가스 검침 데이터를 입력합니다"
    >
      {children}
    </DashboardShell>
  )
}
