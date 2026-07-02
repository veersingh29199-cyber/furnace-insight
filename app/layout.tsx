import type { Metadata } from 'next'
import { Noto_Sans_KR } from 'next/font/google'
import './globals.css'
import 'react-datasheet-grid/dist/style.css'
import QueryProvider from '@/components/providers/query-provider'
import { AuthProvider } from '@/components/providers/auth-provider'
import { Toaster } from '@/components/ui/sonner'

const notoSansKR = Noto_Sans_KR({
  subsets: ['latin'],
  weight: ['300', '400', '500', '600', '700'],
  variable: '--font-noto-sans-kr',
})

export const metadata: Metadata = {
  title: {
    default: '가열로 인사이트 | 단조 생산성·가스원단위 분석',
    template: '%s | 가열로 인사이트',
  },
  description:
    '단조 공장 생산성과 가스원단위를 실시간으로 분석하고 목표 대비 실적을 추적하는 통합 플랫폼',
  keywords: ['단조', '가열로', '가스원단위', '생산성', '공장관리'],
  robots: {
    index: false,
    follow: false,
  },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko" suppressHydrationWarning>
      <body className={`${notoSansKR.variable} font-sans antialiased`}>
        <AuthProvider>
          <QueryProvider>
            {children}
            <Toaster richColors position="top-right" />
          </QueryProvider>
        </AuthProvider>
      </body>
    </html>
  )
}
