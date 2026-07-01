import type { Metadata } from 'next'
import DashboardShell from '@/components/layout/dashboard-shell'

export const metadata: Metadata = { title: '데이터 건강검진' }

export default function DataHealthLayout({ children }: { children: React.ReactNode }) {
  return (
    <DashboardShell
      pageTitle="데이터 건강검진 종합 센터"
      pageDesc="누락된 결측치, 정상 범위 밖의 이상치, 테이블별 입력 현황을 한눈에 점검하고 보완할 수 있습니다"
    >
      {children}
    </DashboardShell>
  )
}
