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
    <div className="flex h-screen bg-background overflow-hidden">
      {/* 온보딩 투어 */}
      <OnboardingTour />

      {/* 사이드바 */}
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      {/* 메인 영역 */}
      <div className="flex flex-1 flex-col min-w-0 overflow-hidden">
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
