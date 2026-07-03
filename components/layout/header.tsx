'use client'

import { useEffect, useState } from 'react'
import { useAuth } from '@/components/providers/auth-provider'
import { useOperator } from '@/hooks/use-operator'
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
import { ChevronDown, Clock, LogOut, Menu, Moon, Sun, User, UserCheck } from 'lucide-react'

const roleLabels: Record<string, string> = {
  admin: '관리자',
  editor: '입력자',
  viewer: '조회자',
}

const roleBadgeVariant: Record<string, 'default' | 'secondary' | 'outline'> = {
  admin: 'default',
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
  const {
    name: operatorName,
    shift: operatorShift,
    operatorList,
    setName: setOperatorName,
    setShift: setOperatorShift,
    addOperatorPreset,
    mounted,
  } = useOperator()
  const [dark, setDark] = useState(false)
  const [customInput, setCustomInput] = useState('')

  useEffect(() => {
    const savedTheme = localStorage.getItem('theme')
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
    const shouldUseDark = savedTheme === 'dark' || (!savedTheme && prefersDark)
    document.documentElement.classList.toggle('dark', shouldUseDark)
    setDark(shouldUseDark)
  }, [])

  const toggleDark = () => {
    const next = !dark
    setDark(next)
    document.documentElement.classList.toggle('dark', next)
    localStorage.setItem('theme', next ? 'dark' : 'light')
  }

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-border bg-background/95 px-4 backdrop-blur lg:px-6">
      <Button
        variant="ghost"
        size="icon"
        className="lg:hidden shrink-0"
        onClick={onMenuClick}
      >
        <Menu className="h-5 w-5" />
      </Button>

      <div className="min-w-0 flex-1">
        <h1 className="truncate text-sm font-semibold text-foreground sm:text-base">
          {pageTitle ?? '가열로 인사이트'}
        </h1>
        <p className="hidden truncate text-xs text-muted-foreground sm:block">
          {pageDesc ?? '입력과 분석이 바로 이어지는 작업 화면'}
        </p>
      </div>

      <div className="flex items-center gap-2 shrink-0">
        {mounted && (
          <div className="hidden items-center gap-2 rounded-full border bg-card px-3 py-1.5 shadow-sm md:flex">
            <UserCheck className="h-3.5 w-3.5 text-primary" />
            <DropdownMenu>
              <DropdownMenuTrigger className="inline-flex items-center gap-1 text-xs font-semibold text-foreground outline-none transition-colors hover:text-primary">
                <span>{operatorName}</span>
                <ChevronDown className="h-3 w-3 text-muted-foreground" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel className="text-xs font-semibold">입력자 선택</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {(operatorList ?? []).map((op) => (
                  <DropdownMenuItem
                    key={op}
                    className={`cursor-pointer text-xs ${operatorName === op ? 'font-bold text-primary bg-primary/10' : ''}`}
                    onClick={() => setOperatorName(op)}
                  >
                    {op}
                  </DropdownMenuItem>
                ))}
                <DropdownMenuSeparator />
                <div className="space-y-2 p-2">
                  <p className="text-[11px] text-muted-foreground">새 이름을 입력해 바로 추가할 수 있습니다.</p>
                  <div className="flex gap-1">
                    <Input
                      placeholder="이름"
                      value={customInput}
                      onChange={(e) => setCustomInput(e.target.value)}
                      className="h-7 text-xs"
                    />
                    <Button
                      size="sm"
                      className="h-7 px-2 text-xs"
                      onClick={() => {
                        const next = customInput.trim()
                        if (!next) return
                        addOperatorPreset(next)
                        setOperatorName(next)
                        setCustomInput('')
                      }}
                    >
                      추가
                    </Button>
                  </div>
                </div>
              </DropdownMenuContent>
            </DropdownMenu>

            <span className="text-muted-foreground">/</span>

            <Button
              variant="ghost"
              size="sm"
              className="h-7 gap-1 px-2 text-xs font-medium"
              onClick={() => setOperatorShift(operatorShift === 'day' ? 'night' : 'day')}
            >
              <Clock className="h-3 w-3 text-amber-500" />
              {operatorShift === 'day' ? '주간' : '야간'}
            </Button>
          </div>
        )}

        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={toggleDark}>
          {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          <span className="sr-only">테마 전환</span>
        </Button>

        {user ? (
          <DropdownMenu>
            <DropdownMenuTrigger className="inline-flex items-center justify-center whitespace-nowrap rounded-md px-2 text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground h-8 gap-2 outline-none">
              <div className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
                {profile?.name?.[0] ?? user.email?.[0]?.toUpperCase() ?? 'U'}
              </div>
              <span className="hidden max-w-[100px] truncate sm:inline">
                {profile?.name ?? user.email?.split('@')[0]}
              </span>
              {profile?.role && (
                <Badge variant={roleBadgeVariant[profile.role]} className="hidden h-4 px-1.5 text-xs sm:inline-flex">
                  {roleLabels[profile.role]}
                </Badge>
              )}
              <ChevronDown className="h-3 w-3 text-muted-foreground" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuLabel className="font-normal">
                <div className="flex flex-col gap-0.5">
                  <p className="font-medium text-sm">{profile?.name ?? '-'}</p>
                  <p className="truncate text-xs text-muted-foreground">{user.email}</p>
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
            className="inline-flex h-8 items-center justify-center rounded-md border border-input bg-background px-3 text-xs font-medium transition-colors hover:bg-accent hover:text-accent-foreground"
          >
            관리자 로그인
          </a>
        )}
      </div>
    </header>
  )
}
