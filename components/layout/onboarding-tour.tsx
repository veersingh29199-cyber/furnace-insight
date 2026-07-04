"use client"

import { useState, useSyncExternalStore } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ClipboardList, LayoutDashboard, FileText, CheckCircle2, ArrowRight } from 'lucide-react'

const ONBOARDING_CHANGE_EVENT = 'furnace-onboarding-change'

function getOnboardingSnapshot() {
  if (typeof window === 'undefined') return false
  return window.localStorage.getItem('furnace_onboarding_done') !== 'true'
}

function subscribeOnboarding(onStoreChange: () => void) {
  if (typeof window === 'undefined') return () => {}

  const handleChange = () => onStoreChange()
  window.addEventListener('storage', handleChange)
  window.addEventListener(ONBOARDING_CHANGE_EVENT, handleChange)

  return () => {
    window.removeEventListener('storage', handleChange)
    window.removeEventListener(ONBOARDING_CHANGE_EVENT, handleChange)
  }
}

export function OnboardingTour() {
  const [open, setOpen] = useState(false)
  const [step, setStep] = useState(0)
  const showLauncher = useSyncExternalStore(subscribeOnboarding, getOnboardingSnapshot, () => false)

  const handleFinish = () => {
    localStorage.setItem('furnace_onboarding_done', 'true')
    window.dispatchEvent(new Event(ONBOARDING_CHANGE_EVENT))
    setOpen(false)
  }

  const steps = [
    {
      title: "① 현장 실적 및 가스 검침 입력",
      desc: "좌측 메뉴 [데이터 입력 및 안내] 또는 엑셀 업로드 메뉴에서 월별 생산 중량과 가스 사용량을 간편하게 입력합니다. 오타나 중복 걱정 없이 자동 덮어쓰기됩니다.",
      icon: ClipboardList,
      color: "text-blue-500",
      bg: "bg-blue-500/10 border-blue-500/20",
    },
    {
      title: "② 대시보드 실시간 분석 및 신뢰성 확인",
      desc: "입력된 데이터는 즉시 ⚡자동계산 배지와 함께 가스원단위(Nm³/톤), 시간당 생산량(t/h)으로 변환되어 대시보드에 표시됩니다. 누락된 데이터는 [데이터 건강검진]에서 확인할 수 있습니다.",
      icon: LayoutDashboard,
      color: "text-amber-500",
      bg: "bg-amber-500/10 border-amber-500/20",
    },
    {
      title: "③ 경영진 보고용 PDF / PPT 자동 출력",
      desc: "별도의 보고서 작성 작업 없이 [보고서 출력] 메뉴에서 클릭 한 번으로 파워포인트(.pptx)와 인쇄용 PDF를 즉시 생성합니다.",
      icon: FileText,
      color: "text-emerald-500",
      bg: "bg-emerald-500/10 border-emerald-500/20",
    },
  ]

  const current = steps[step]
  const Icon = current.icon

  return (
    <>
      {showLauncher && !open && (
        <div className="fixed bottom-4 right-4 z-40">
          <Button
            size="sm"
            variant="outline"
            className="gap-2 rounded-full border-primary/25 bg-background/95 shadow-lg backdrop-blur"
            onClick={() => {
              setStep(0)
              setOpen(true)
            }}
          >
            <span className="inline-flex h-2 w-2 rounded-full bg-primary" />
            빠른 시작 가이드
          </Button>
        </div>
      )}

      <Dialog
        open={open}
        onOpenChange={(val) => {
          if (!val) handleFinish()
        }}
      >
        <DialogContent className="sm:max-w-md border-primary/30 shadow-xl">
          <DialogHeader>
            <div className="flex items-center justify-between mb-1">
              <Badge variant="outline" className="text-primary border-primary/40 text-[10px] font-semibold">
                🎉 가열로 인사이트 3단계 빠른 시작 가이드
              </Badge>
              <span className="text-xs text-muted-foreground font-mono">
                {step + 1} / {steps.length}
              </span>
            </div>
            <DialogTitle className="text-lg font-extrabold flex items-center gap-2 pt-1">
              <div className={`p-2 rounded-lg border ${current.bg}`}>
                <Icon className={`w-5 h-5 ${current.color}`} />
              </div>
              {current.title}
            </DialogTitle>
            <DialogDescription className="text-xs leading-relaxed text-muted-foreground pt-2">
              {current.desc}
            </DialogDescription>
          </DialogHeader>

          <div className="py-2 flex justify-center gap-1.5">
            {steps.map((_, i) => (
              <div
                key={i}
                className={`h-1.5 rounded-full transition-all duration-300 ${
                  i === step ? 'w-6 bg-primary' : 'w-1.5 bg-muted-foreground/30'
                }`}
              />
            ))}
          </div>

          <DialogFooter className="flex sm:justify-between items-center pt-2">
            <Button variant="ghost" size="sm" onClick={handleFinish} className="text-xs text-muted-foreground">
              다시 보지 않기
            </Button>
            <div className="flex gap-2">
              {step < steps.length - 1 ? (
                <Button size="sm" onClick={() => setStep(step + 1)} className="text-xs gap-1">
                  다음 단계 <ArrowRight className="w-3.5 h-3.5" />
                </Button>
              ) : (
                <Button
                  size="sm"
                  onClick={handleFinish}
                  className="text-xs bg-emerald-600 hover:bg-emerald-700 text-white gap-1"
                >
                  <CheckCircle2 className="w-3.5 h-3.5" /> 시작하기
                </Button>
              )}
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
