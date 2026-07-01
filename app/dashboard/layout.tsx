import type { Metadata } from 'next'
import DashboardShell from '@/components/layout/dashboard-shell'

export const metadata: Metadata = {
  title: '대시보드',
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <DashboardShell
      pageTitle="대시보드"
      pageDesc="이번 달 가열로·생산 현황을 한눈에 확인하세요"
    >
      {children}
    </DashboardShell>
  )
}
