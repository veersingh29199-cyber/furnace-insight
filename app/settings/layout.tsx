import type { Metadata } from 'next'
import DashboardShell from '@/components/layout/dashboard-shell'
export const metadata: Metadata = { title: '관리/설정' }
export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  return (
    <DashboardShell pageTitle="관리/설정" pageDesc="마스터 데이터 관리, 목표 설정, 사용자 권한 관리">
      {children}
    </DashboardShell>
  )
}
