import type { Metadata } from 'next'
import DashboardShell from '@/components/layout/dashboard-shell'

export const metadata: Metadata = {
  title: '스마트 파일 임포트',
}

export default function ImportLayout({ children }: { children: React.ReactNode }) {
  return (
    <DashboardShell
      pageTitle="스마트 파일 임포트"
      pageDesc="제각각인 엑셀/CSV 양식을 앱 표준 형태로 자동 감지하고, 매핑을 확인한 뒤 upsert 저장합니다."
    >
      {children}
    </DashboardShell>
  )
}
