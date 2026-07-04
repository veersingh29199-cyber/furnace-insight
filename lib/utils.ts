import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'
import { format, parseISO } from 'date-fns'
import { ko } from 'date-fns/locale'

// Tailwind 클래스 병합 유틸 (shadcn/ui 호환)
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// ─────────────────────────────────────────────
// 숫자 포맷 유틸
// ─────────────────────────────────────────────

/** 천단위 콤마 포맷 */
export function formatNumber(value: number | null | undefined, decimals = 0): string {
  if (value == null || isNaN(value)) return '-'
  return value.toLocaleString('ko-KR', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })
}

/** 원단위 (소수 1자리) */
export function formatGasUnit(value: number | null | undefined): string {
  if (value == null || isNaN(value) || value === 0) return '— (미입력)'
  return value.toLocaleString('ko-KR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
}

/** 톤/h (소수 2자리) */
export function formatTonPerHour(value: number | null | undefined): string {
  if (value == null || isNaN(value) || value === 0) return '— (미입력)'
  return value.toLocaleString('ko-KR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

/** 달성률 (소수 1자리 %) */
export function formatPercent(value: number | null | undefined): string {
  if (value == null || isNaN(value)) return '-'
  return value.toFixed(1) + '%'
}

/** 증감률 포맷 (+ / - 기호 포함) */
export function formatChange(value: number | null | undefined, decimals = 1): string {
  if (value == null || isNaN(value)) return '-'
  const sign = value > 0 ? '+' : ''
  return `${sign}${value.toFixed(decimals)}%`
}

// ─────────────────────────────────────────────
// 단위 변환 유틸
// ─────────────────────────────────────────────

/** kg → 톤 */
export function kgToTon(kg: number): number {
  return kg / 1000
}

/** 톤 → kg */
export function tonToKg(ton: number): number {
  return ton * 1000
}

// ─────────────────────────────────────────────
// 도메인 계산 유틸
// ─────────────────────────────────────────────

/** 가스원단위 = 가스사용량 / 장입중량(톤) */
export function calcGasUnit(gasUsage: number, chargeWeightKg: number): number | null {
  if (!chargeWeightKg || chargeWeightKg === 0) return null
  return gasUsage / kgToTon(chargeWeightKg)
}

/** 시간당 생산량 (톤/h) = 생산중량(톤) / 작업시간(h) */
export function calcTonPerHour(actualTon: number, workHours: number): number | null {
  if (!workHours || workHours === 0) return null
  return actualTon / workHours
}

/** 달성률(%) = 실적 / 목표 * 100 */
export function calcAchievementRate(actual: number, plan: number): number | null {
  if (!plan || plan === 0) return null
  return (actual / plan) * 100
}

// ─────────────────────────────────────────────
// 날짜 유틸 (KST 기준)
// ─────────────────────────────────────────────

/** YYYY-MM-DD → 표시용 (예: 2025년 1월) */
export function formatYearMonth(dateStr: string): string {
  try {
    const d = parseISO(dateStr)
    return format(d, 'yyyy년 M월', { locale: ko })
  } catch {
    return dateStr
  }
}

/** 현재 월 (YYYY-MM-01) */
export function currentMonthDate(): string {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`
}

/** 현재 일자 (YYYY-MM-DD, 로컬 기준) */
export function currentDateString(date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

/** date 객체 → YYYY-MM-01 */
export function toMonthDate(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-01`
}

/** YYYY-MM-01 → 'YYYY-MM' */
export function dateToYearMonth(dateStr: string): string {
  return dateStr.substring(0, 7)
}

// ─────────────────────────────────────────────
// 색상 유틸 (증감)
// ─────────────────────────────────────────────

/**
 * 증감값에 따른 Tailwind 텍스트 색상 클래스
 * @param change 증감값
 * @param goodWhenDown true이면 값이 작을 때 좋음 (가스원단위 등)
 */
export function changeColor(change: number | null | undefined, goodWhenDown = false): string {
  if (change == null || change === 0) return 'text-muted-foreground'
  const isPositive = change > 0
  const isGood = goodWhenDown ? !isPositive : isPositive
  return isGood ? 'text-blue-500' : 'text-red-500'
}

/**
 * 달성률에 따른 색상 클래스
 */
export function achievementColor(rate: number | null | undefined): string {
  if (rate == null) return 'text-muted-foreground'
  if (rate >= 100) return 'text-blue-500'
  if (rate >= 80) return 'text-amber-500'
  return 'text-red-500'
}

// ─────────────────────────────────────────────
// 이상치 감지
// ─────────────────────────────────────────────

/** 중앙값 계산 */
export function median(values: number[]): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 !== 0
    ? sorted[mid]
    : (sorted[mid - 1] + sorted[mid]) / 2
}

/** 상위 N% 분위수 */
export function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const index = Math.ceil((p / 100) * sorted.length) - 1
  return sorted[Math.max(0, index)]
}

/** IQR 기반 이상치 감지 — 이상치 인덱스의 Set 반환 */
export function detectOutliers(values: number[]): Set<number> {
  const q1 = percentile(values, 25)
  const q3 = percentile(values, 75)
  const iqr = q3 - q1
  const lower = q1 - 1.5 * iqr
  const upper = q3 + 1.5 * iqr
  const outlierSet = new Set<number>()
  values.forEach((v, i) => {
    if (v < lower || v > upper) outlierSet.add(i)
  })
  return outlierSet
}
