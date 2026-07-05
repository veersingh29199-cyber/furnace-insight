import type { Metadata } from 'next'
import DashboardShell from '@/components/layout/dashboard-shell'

export const metadata: Metadata = {
  title: '파일 업로드',
  description: '업로드할 파일 종류를 먼저 고르고, 템플릿과 함께 스마트 임포터로 적재합니다.',
}

export default function UploadLayout({ children }: { children: React.ReactNode }) {
  return (
    <DashboardShell
      pageTitle="파일 업로드"
      pageDesc="생산량 집계표, 가열로 일일 가스검침, 월 가스 파일을 카드로 골라 업로드합니다."
    >
      {children}
    </DashboardShell>
  )
}
