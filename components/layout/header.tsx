'use client'

import { useAuth } from '@/components/providers/auth-provider'
import { useOperator, DEFAULT_OPERATORS } from '@/hooks/use-operator'
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
import { Input } from '@/components/ui/input'
import { Menu, Moon, Sun, LogOut, User, ChevronDown, UserCheck, Clock } from 'lucide-react'
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
  const { name: operatorName, shift: operatorShift, operatorList, setName: setOperatorName, setShift: setOperatorShift, addOperatorPreset, mounted } = useOperator()
  const [dark, setDark] = useState(false)
  const [customInput, setCustomInput] = useState('')

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
      <Button
        variant="ghost"
        size="icon"
        className="lg:hidden shrink-0"
        onClick={onMenuClick}
      >
        <Menu className="h-5 w-5" />
      </Button>

      {/* 페이지 제목 / 설명 */}
      <div className="flex flex-col min-w-0 flex-1">
        <h1 className="text-sm font-semibold truncate text-foreground">
          {pageTitle || '가열로 인사이트'}
        </h1>
        {pageDesc && (
          <p className="text-xs text-muted-foreground truncate hidden sm:block">
            {pageDesc}
          </p>
        )}
      </div>

      {/* 우측 도구 모음 */}
      <div className="flex items-center gap-2 shrink-0">
        {/* 현장 실무자 선택기 (상시 접근 가능) */}
        {mounted && (
          <div className="flex items-center gap-1.5 rounded-lg border bg-card px-2.5 py-1 shadow-sm">
            <UserCheck className="h-3.5 w-3.5 text-primary" />
            <span className="text-xs text-muted-foreground hidden md:inline">입력자:</span>
            
            <DropdownMenu>
              <DropdownMenuTrigger className="flex items-center gap-1 text-xs font-semibold text-foreground hover:text-primary transition-colors focus:outline-none">
                <span>{operatorName}</span>
                <ChevronDown className="h-3 w-3 text-muted-foreground" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel className="text-xs font-semibold">현장 실무자 선택</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {(operatorList || []).map((op) => (
                  <DropdownMenuItem
                    key={op}
                    className={`cursor-pointer text-xs ${operatorName === op ? 'font-bold text-primary bg-primary/10' : ''}`}
                    onClick={() => setOperatorName(op)}
                  >
                    {op}
                  </DropdownMenuItem>
                ))}
                <DropdownMenuSeparator />
                <div className="p-2 space-y-1">
                  <p className="text-[11px] text-muted-foreground">직접 입력 (새 명단에 자동 추가)</p>
                  <div className="flex gap-1">
                    <Input
                      placeholder="이름 (소속)"
                      value={customInput}
                      onChange={(e) => setCustomInput(e.target.value)}
                      className="h-7 text-xs"
                    />
                    <Button
                      size="sm"
                      className="h-7 text-xs px-2"
                      onClick={() => {
                        if (customInput.trim()) {
                          addOperatorPreset(customInput.trim())
                          setOperatorName(customInput.trim())
                          setCustomInput('')
                        }
                      }}
                    >
                      확인
                    </Button>
                  </div>
                </div>
              </DropdownMenuContent>
            </DropdownMenu>

            <span className="text-muted-foreground">/</span>

            <Button
              variant="ghost"
              size="sm"
              className="h-6 px-1.5 text-xs font-semibold gap-1"
              onClick={() => setOperatorShift(operatorShift === 'day' ? 'night' : 'day')}
            >
              <Clock className="h-3 w-3 text-amber-500" />
              {operatorShift === 'day' ? '주간조' : '야간조'}
            </Button>
          </div>
        )}

        {/* 다크모드 토글 */}
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={toggleDark}>
          {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          <span className="sr-only">다크모드 전환</span>
        </Button>

        {/* 사용자 메뉴 (관리자 로그인 시) */}
        {user ? (
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
        ) : (
          <a
            href="/login"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background hover:bg-accent hover:text-accent-foreground h-8 px-3 text-xs font-medium transition-colors"
          >
            관리자 로그인
          </a>
        )}
      </div>
    </header>
  )
}
