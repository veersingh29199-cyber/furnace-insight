import type { Metadata } from 'next'
import DashboardShell from '@/components/layout/dashboard-shell'

export const metadata: Metadata = { title: '엑셀 임포터' }

export default function ImportLayout({ children }: { children: React.ReactNode }) {
  return (
    <DashboardShell
      pageTitle="엑셀 임포터"
      pageDesc="과거 엑셀 파일에서 가스·생산 데이터를 일괄 불러옵니다"
    >
      {children}
    </DashboardShell>
  )
}
