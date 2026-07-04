'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Flame, BarChart3, Loader2, ShieldCheck, Upload, ArrowRight } from 'lucide-react'
import { toast } from 'sonner'

const featureCards = [
  {
    icon: BarChart3,
    title: '핵심 지표를 한눈에',
    description: '대시보드에서 생산성, 가스원단위, 입력 상태를 한 번에 확인합니다.',
  },
  {
    icon: Upload,
    title: '엑셀 업로드 중심',
    description: '현장 파일을 그대로 올려도 자동 매핑과 검증을 거쳐 저장합니다.',
  },
  {
    icon: ShieldCheck,
    title: '내부 전용 운영',
    description: '부서원 공동입력과 관리자 검토 흐름을 분리해 안정적으로 운영합니다.',
  },
]

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    window.scrollTo(0, 0)
  }, [])

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) throw error
      router.push('/dashboard')
      router.refresh()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '로그인에 실패했습니다.'
      toast.error(msg === 'Invalid login credentials' ? '이메일 또는 비밀번호가 올바르지 않습니다.' : msg)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      className="min-h-dvh"
      style={{
        backgroundImage:
          'radial-gradient(circle at top left, rgba(59, 130, 246, 0.14), transparent 34%), radial-gradient(circle at top right, rgba(16, 185, 129, 0.12), transparent 28%), linear-gradient(to bottom, var(--background), color-mix(in oklab, var(--background) 96%, white))',
      }}
    >
      <div className="mx-auto grid min-h-dvh max-w-6xl gap-10 px-4 py-8 lg:grid-cols-[1.1fr_0.9fr] lg:items-center lg:px-6">
        <section className="space-y-8">
          <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-card/70 px-3 py-1.5 text-xs font-medium text-primary shadow-sm backdrop-blur">
            <Flame className="h-3.5 w-3.5" />
            가열로 인사이트
          </div>

          <div className="space-y-4">
            <h1 className="max-w-xl text-3xl font-semibold tracking-tight text-foreground sm:text-4xl lg:text-5xl">
              현장 입력, 검증, 분석, 보고서를
              <span className="text-primary"> 하나의 흐름</span>으로 묶습니다.
            </h1>
            <p className="max-w-2xl text-sm leading-7 text-muted-foreground sm:text-base">
              단조 생산성과 가스원단위를 같은 기준으로 관리하고, 부서원 공동 입력부터 경영진 보고서 출력까지 같은 화면 흐름으로 이어지게 설계했습니다.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            {featureCards.map((feature) => {
              const Icon = feature.icon

              return (
                <div key={feature.title} className="rounded-2xl border border-border/70 bg-card/70 p-4 shadow-sm backdrop-blur">
                  <div className="flex items-center gap-2 text-sm font-semibold">
                    <div className="rounded-xl bg-primary/10 p-2 text-primary">
                      <Icon className="h-4 w-4" />
                    </div>
                    <span>{feature.title}</span>
                  </div>
                  <p className="mt-3 text-xs leading-6 text-muted-foreground">{feature.description}</p>
                </div>
              )
            })}
          </div>

          <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
            <Badge variant="outline" className="border-primary/20 bg-primary/5 text-primary">
              내부 전용
            </Badge>
            <span>현장 입력 · 업로드 · 분석 · 보고서 출력</span>
          </div>
        </section>

        <Card className="overflow-hidden border-border/70 bg-card/90 shadow-2xl backdrop-blur">
          <div className="h-1 bg-gradient-to-r from-primary via-cyan-400 to-emerald-400" />
          <CardHeader className="space-y-3 pb-4">
            <div className="flex items-center justify-between gap-3">
              <Badge variant="outline" className="border-primary/20 bg-primary/5 text-primary">
                로그인 필요
              </Badge>
              <span className="text-xs text-muted-foreground">내부 계정으로만 접근</span>
            </div>
            <div className="space-y-2">
              <CardTitle className="text-2xl font-semibold tracking-tight">작업을 시작하세요</CardTitle>
              <CardDescription>
                로그인 후 대시보드와 입력 화면에 바로 접근할 수 있습니다.
              </CardDescription>
            </div>
          </CardHeader>

          <CardContent className="space-y-5">
            <form onSubmit={handleLogin} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">이메일</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="your@email.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoComplete="email"
                  autoFocus
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">비밀번호</Label>
                <Input
                  id="password"
                  type="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoComplete="current-password"
                />
              </div>
              <Button type="submit" className="w-full gap-2" disabled={loading}>
                {loading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    로그인 중...
                  </>
                ) : (
                  <>
                    대시보드로 이동
                    <ArrowRight className="h-4 w-4" />
                  </>
                )}
              </Button>
            </form>

            <div className="rounded-2xl border border-dashed border-border/80 bg-muted/30 p-4 text-sm text-muted-foreground">
              계정이 없으면 관리자에게 권한 부여를 요청하세요. 승인된 계정만 입력과 업로드를 수행할 수 있습니다.
            </div>

            <div className="text-center text-sm text-muted-foreground">
              계정이 없으신가요?{' '}
              <Link href="/signup" className="font-medium text-primary hover:underline">
                회원가입
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>

      <p className="pb-6 text-center text-xs text-muted-foreground">
        © {new Date().getFullYear()} 가열로 인사이트. 내부 운영 전용 시스템.
      </p>
    </div>
  )
}
