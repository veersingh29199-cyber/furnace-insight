import type { Metadata } from 'next'
import DashboardShell from '@/components/layout/dashboard-shell'

export const metadata: Metadata = {
  title: '데이터 입력',
  description: '엑셀 붙여넣기, 표 입력, 단건 폼을 한 화면에서 처리하는 입력 허브',
}

export default function InputLayout({ children }: { children: React.ReactNode }) {
  return (
    <DashboardShell
      pageTitle="데이터 입력"
      pageDesc="엑셀 붙여넣기 / 표 입력 / 단건 폼"
    >
      {children}
    </DashboardShell>
  )
}

