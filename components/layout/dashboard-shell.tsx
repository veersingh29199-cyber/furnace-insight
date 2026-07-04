'use client'

import { useState } from 'react'
import Sidebar from '@/components/layout/sidebar'
import Header from '@/components/layout/header'
import { OnboardingTour } from '@/components/layout/onboarding-tour'

interface DashboardShellProps {
  children: React.ReactNode
  pageTitle?: string
  pageDesc?: string
}

export default function DashboardShell({ children, pageTitle, pageDesc }: DashboardShellProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false)

  return (
    <div className="relative flex min-h-dvh bg-background overflow-hidden">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(59,130,246,0.10),transparent_34%),radial-gradient(circle_at_top_right,rgba(16,185,129,0.08),transparent_28%),radial-gradient(circle_at_bottom_left,rgba(245,158,11,0.06),transparent_30%)]"
      />

      {/* 온보딩 투어 */}
      <OnboardingTour />

      {/* 사이드바 */}
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      {/* 메인 영역 */}
      <div className="relative z-10 flex flex-1 flex-col min-w-0 overflow-hidden">
        <Header
          onMenuClick={() => setSidebarOpen(true)}
          pageTitle={pageTitle}
          pageDesc={pageDesc}
        />
        <main className="flex-1 overflow-y-auto">
          <div className="container mx-auto p-4 lg:p-6 max-w-7xl">
            {children}
          </div>
        </main>
      </div>
    </div>
  )
}
