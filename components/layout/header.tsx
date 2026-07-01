'use client'

import { useAuth } from '@/components/providers/auth-provider'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Badge } from '@/components/ui/badge'
import { Menu, Moon, Sun, LogOut, User, ChevronDown } from 'lucide-react'
import { useEffect, useState } from 'react'

const roleLabels: Record<string, string> = {
  admin:  '관리자',
  editor: '편집자',
  viewer: '조회자',
}

const roleBadgeVariant: Record<string, 'default' | 'secondary' | 'outline'> = {
  admin:  'default',
  editor: 'secondary',
  viewer: 'outline',
}

interface HeaderProps {
  onMenuClick: () => void
  pageTitle?: string
  pageDesc?: string
}

export default function Header({ onMenuClick, pageTitle, pageDesc }: HeaderProps) {
  const { user, profile, signOut } = useAuth()
  const [dark, setDark] = useState(false)

  useEffect(() => {
    const saved = localStorage.getItem('theme')
    if (saved === 'dark' || (!saved && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
      document.documentElement.classList.add('dark')
      setDark(true)
    }
  }, [])

  const toggleDark = () => {
    const next = !dark
    setDark(next)
    document.documentElement.classList.toggle('dark', next)
    localStorage.setItem('theme', next ? 'dark' : 'light')
  }

  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-border bg-background/95 backdrop-blur px-4 lg:px-6">
      {/* 햄버거 메뉴 (모바일) */}
      <Button variant="ghost" size="icon" className="lg:hidden h-8 w-8" onClick={onMenuClick}>
        <Menu className="h-4 w-4" />
        <span className="sr-only">메뉴 열기</span>
      </Button>

      {/* 페이지 제목 */}
      <div className="flex-1 min-w-0">
        {pageTitle && (
          <h1 className="text-sm font-semibold truncate">{pageTitle}</h1>
        )}
        {pageDesc && (
          <p className="text-xs text-muted-foreground truncate hidden sm:block">{pageDesc}</p>
        )}
      </div>

      {/* 우측 액션 */}
      <div className="flex items-center gap-2">
        {/* 다크모드 토글 */}
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={toggleDark}>
          {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          <span className="sr-only">다크모드 전환</span>
        </Button>

        {/* 사용자 메뉴 */}
        {user && (
          <DropdownMenu>
            <DropdownMenuTrigger className="inline-flex items-center justify-center whitespace-nowrap rounded-md font-medium transition-colors hover:bg-accent hover:text-accent-foreground h-8 gap-2 px-2 text-sm cursor-pointer outline-none">
              <div className="flex items-center justify-center w-6 h-6 rounded-full bg-primary text-primary-foreground text-xs font-semibold">
                {profile?.name?.[0] ?? user.email?.[0]?.toUpperCase() ?? 'U'}
              </div>
              <span className="hidden sm:inline max-w-[100px] truncate">
                {profile?.name ?? user.email?.split('@')[0]}
              </span>
              {profile?.role && (
                <Badge variant={roleBadgeVariant[profile.role]} className="hidden sm:inline-flex text-xs h-4 px-1.5">
                  {roleLabels[profile.role]}
                </Badge>
              )}
              <ChevronDown className="h-3 w-3 text-muted-foreground" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuLabel className="font-normal">
                <div className="flex flex-col gap-0.5">
                  <p className="font-medium text-sm">{profile?.name ?? '-'}</p>
                  <p className="text-xs text-muted-foreground truncate">{user.email}</p>
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem className="cursor-pointer">
                <User className="mr-2 h-4 w-4" />
                내 프로필
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="cursor-pointer text-destructive focus:text-destructive"
                onClick={signOut}
              >
                <LogOut className="mr-2 h-4 w-4" />
                로그아웃
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
    </header>
  )
}
