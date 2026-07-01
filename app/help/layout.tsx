import type { Metadata } from 'next'
import DashboardShell from '@/components/layout/dashboard-shell'

export const metadata: Metadata = { title: '도움말/용어사전' }

export default function HelpLayout({ children }: { children: React.ReactNode }) {
  return (
    <DashboardShell
      pageTitle="도움말 및 현장 데이터 용어사전"
      pageDesc="가열로 인사이트에서 사용하는 공정 지표의 공식 정의, 산출 공식, 벤치마크 기준값을 확인합니다"
    >
      {children}
    </DashboardShell>
  )
}
