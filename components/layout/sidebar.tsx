'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import {
  LayoutDashboard,
  ClipboardList,
  Upload,
  BarChart3,
  Flame,
  FileText,
  Settings,
  X,
  Activity,
  HelpCircle,
} from 'lucide-react'
import { Button } from '@/components/ui/button'

type NavItem = {
  href: string
  label: string
  description: string
  icon: typeof LayoutDashboard
}

type NavSection = {
  title: string
  items: NavItem[]
}

const navSections: NavSection[] = [
  {
    title: '핵심',
    items: [
      {
        href: '/dashboard',
        label: '대시보드',
        description: '전일 요약과 핵심 KPI를 한눈에',
        icon: LayoutDashboard,
      },
    ],
  },
  {
    title: '데이터 입력',
    items: [
      {
        href: '/input',
        label: '입력 홈',
        description: '생산 실적과 가스 입력 방식 선택',
        icon: ClipboardList,
      },
      {
        href: '/upload',
        label: '파일 업로드',
        description: '엑셀/CSV를 스마트 임포터로 반영',
        icon: Upload,
      },
    ],
  },
  {
    title: '분석',
    items: [
      {
        href: '/productivity',
        label: '생산성 분석',
        description: '라인·제품별 생산성과 병목 확인',
        icon: BarChart3,
      },
      {
        href: '/gas-analysis',
        label: '가스원단위 분석',
        description: '호기별 원단위와 이상치를 점검',
        icon: Flame,
      },
      {
        href: '/data-health',
        label: '데이터 건강도',
        description: '누락·이상치를 빠르게 점검',
        icon: Activity,
      },
    ],
  },
  {
    title: '보고서',
    items: [
      {
        href: '/reports',
        label: '보고서 출력',
        description: 'PDF·PPT로 정리해 공유',
        icon: FileText,
      },
    ],
  },
  {
    title: '관리',
    items: [
      {
        href: '/settings',
        label: '설정',
        description: '마스터와 목표를 관리',
        icon: Settings,
      },
      {
        href: '/help',
        label: '도움말',
        description: '입력 방법과 업로드 가이드',
        icon: HelpCircle,
      },
    ],
  },
]

interface SidebarProps {
  open: boolean
  onClose: () => void
}

function isActivePath(pathname: string, href: string) {
  if (href === '/dashboard') return pathname === href
  return pathname === href || pathname.startsWith(`${href}/`)
}

export default function Sidebar({ open, onClose }: SidebarProps) {
  const pathname = usePathname()

  return (
    <>
      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/50 lg:hidden"
          onClick={onClose}
        />
      )}

      <aside
        className={cn(
          'fixed left-0 top-0 z-50 h-full w-72 bg-sidebar border-r border-sidebar-border',
          'flex flex-col transition-transform duration-300 ease-in-out',
          'lg:relative lg:translate-x-0 lg:z-auto',
          open ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        <div className="flex items-center justify-between px-4 py-5 border-b border-sidebar-border">
          <Link href="/dashboard" className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm">
              <Flame className="h-4 w-4" />
            </div>
            <div className="leading-tight">
              <p className="text-sm font-bold text-sidebar-foreground">가열로 인사이트</p>
              <p className="text-xs text-muted-foreground">입력 · 업로드 · 분석</p>
            </div>
          </Link>
          <Button
            variant="ghost"
            size="icon"
            className="lg:hidden h-8 w-8"
            onClick={onClose}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-5">
          {navSections.map((section) => (
            <div key={section.title} className="space-y-2">
              <p className="px-3 text-[11px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
                {section.title}
              </p>
              <div className="space-y-1">
                {section.items.map((item) => {
                  const Icon = item.icon
                  const active = isActivePath(pathname, item.href)

                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={onClose}
                      className={cn(
                        'group flex items-start gap-3 rounded-xl px-3 py-2.5 text-sm transition-colors',
                        active
                          ? 'bg-primary text-primary-foreground shadow-sm shadow-primary/20'
                          : 'text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'
                      )}
                    >
                      <Icon className="mt-0.5 h-4 w-4 flex-shrink-0" />
                      <span className="min-w-0 flex-1">
                        <span className="block font-medium">{item.label}</span>
                        <span
                          className={cn(
                            'block text-xs leading-5',
                            active ? 'text-primary-foreground/80' : 'text-muted-foreground group-hover:text-sidebar-accent-foreground/80'
                          )}
                        >
                          {item.description}
                        </span>
                      </span>
                    </Link>
                  )
                })}
              </div>
            </div>
          ))}
        </nav>

        <div className="border-t border-sidebar-border px-4 py-3">
          <p className="text-xs text-muted-foreground">v1.0.0 · 업로드 중심 재구성</p>
        </div>
      </aside>
    </>
  )
}
