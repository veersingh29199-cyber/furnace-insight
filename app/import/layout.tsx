import type { Metadata } from 'next'
import DashboardShell from '@/components/layout/dashboard-shell'

export const metadata: Metadata = {
  title: '파일 업로드',
  description: '호환용 /import 경로입니다. 실제 업로드 화면은 /upload에서 제공합니다.',
}

export default function ImportLayout({ children }: { children: React.ReactNode }) {
  return (
    <DashboardShell
      pageTitle="파일 업로드"
      pageDesc="호환용 경로입니다. 새 업로드 화면으로 자동 이동합니다."
    >
      {children}
    </DashboardShell>
  )
}
