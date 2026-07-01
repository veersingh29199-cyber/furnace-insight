"use client"

import * as React from "react"
import { HelpCircle } from "lucide-react"
import { cn } from "@/lib/utils"

export interface TooltipProps {
  content: React.ReactNode
  children?: React.ReactNode
  className?: string
  iconClassName?: string
}

export function InfoTooltip({ content, children, className, iconClassName }: TooltipProps) {
  const [open, setOpen] = React.useState(false)

  return (
    <span
      className={cn("inline-flex items-center gap-1 relative group cursor-help select-none", className)}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onClick={() => setOpen(!open)}
    >
      {children || <HelpCircle className={cn("w-3.5 h-3.5 text-muted-foreground hover:text-primary transition-colors inline-block", iconClassName)} />}
      
      {/* 툴팁 팝오버 바디 */}
      <span
        className={cn(
          "absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 z-50 w-60 p-2.5 rounded-lg shadow-lg",
          "bg-slate-900 text-slate-100 text-xs font-normal leading-relaxed tracking-normal",
          "transition-all duration-150 pointer-events-none border border-slate-700/50",
          "after:content-[''] after:absolute after:top-full after:left-1/2 after:-translate-x-1/2 after:border-4 after:border-transparent after:border-t-slate-900",
          open || "group-hover:opacity-100 group-hover:scale-100 opacity-0 scale-95 hidden group-hover:block"
        )}
      >
        {content}
      </span>
    </span>
  )
}

export function AutoCalcBadge({ formula }: { formula?: string }) {
  return (
    <InfoTooltip
      content={
        <div className="space-y-1">
          <p className="font-semibold text-amber-300">🤖 시스템 자동계산 지표</p>
          {formula && <p className="text-slate-200">{formula}</p>}
          <p className="text-[10px] text-slate-400">현장 입력 데이터(장입량, 사용량, 작업시간 등)를 바탕으로 실시간 연산됩니다.</p>
        </div>
      }
    >
      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30 cursor-help">
        ⚡ 자동계산
      </span>
    </InfoTooltip>
  )
}
