import * as XLSX from 'xlsx'
import { currentMonthDate } from '@/lib/utils'

export function createInputId(prefix: string) {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return `${prefix}-${crypto.randomUUID()}`
  }

  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

export function normalizeToken(value: unknown) {
  return String(value ?? '')
    .normalize('NFKC')
    .trim()
    .toLowerCase()
    .replace(/[\s\u00a0]+/g, '')
}

export function isBlankCell(value: unknown) {
  return value == null || String(value).trim() === ''
}

export function parseLooseNumber(value: unknown): number | null {
  if (isBlankCell(value)) return null

  const normalized = String(value)
    .replace(/,/g, '')
    .replace(/[^\d.-]/g, '')
    .trim()

  if (!normalized || normalized === '-' || normalized === '.' || normalized === '-.') {
    return null
  }

  const parsed = Number(normalized)
  return Number.isFinite(parsed) ? parsed : null
}

export function parseIntNumber(value: unknown): number | null {
  const parsed = parseLooseNumber(value)
  return parsed == null ? null : Math.trunc(parsed)
}

export function parseDelimitedText(text: string) {
  const normalized = text.replace(/\r/g, '').trim()
  if (!normalized) return []

  const lines = normalized
    .split('\n')
    .filter((line) => line.trim() !== '')

  return lines.map((line) => {
    if (line.includes('\t')) {
      return line.split('\t').map((cell) => cell.trim())
    }

    if (line.includes(',') && !line.includes('\t')) {
      return line.split(',').map((cell) => cell.trim())
    }

    return [line]
  })
}

export async function readWorkbookFromFile(file: File) {
  const buffer = await file.arrayBuffer()
  return XLSX.read(buffer, { type: 'array' })
}

export function sheetToMatrix(workbook: XLSX.WorkBook, sheetName?: string) {
  const targetSheetName = sheetName ?? workbook.SheetNames[0]
  const sheet = workbook.Sheets[targetSheetName]

  if (!sheet) return { sheetName: targetSheetName, matrix: [] as string[][] }

  const matrix = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' }) as string[][]
  return { sheetName: targetSheetName, matrix }
}

export function extractMonthFromText(value: string) {
  const normalized = normalizeToken(value)
  if (!normalized) return null

  const match =
    value.match(/(20\d{2})[.\-/년_ ]?(0?[1-9]|1[0-2])/i) ??
    normalized.match(/(20\d{2})(0[1-9]|1[0-2])/)

  if (!match) return null

  const year = match[1]
  const month = match[2].padStart(2, '0')
  return `${year}-${month}-01`
}

export function currentMonthYm() {
  return currentMonthDate().slice(0, 7)
}

export function ymToDate(ym: string) {
  return `${ym}-01`
}

export function normalizeMonthDate(value?: string | null) {
  if (!value) return null
  const trimmed = String(value).trim()
  const match = trimmed.match(/^(20\d{2})-(\d{1,2})(?:-(\d{1,2}))?$/)
  if (!match) return null
  return `${match[1]}-${match[2].padStart(2, '0')}-01`
}

export function previousMonthYm(ym: string) {
  const [year, month] = ym.split('-').map((part) => Number(part))
  const d = new Date(year, month - 2, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

export function daysInMonth(ym: string) {
  const [year, month] = ym.split('-').map((part) => Number(part))
  return new Date(year, month, 0).getDate()
}

export function monthDateForDay(ym: string, day: number) {
  return `${ym}-${String(day).padStart(2, '0')}`
}

export function isTotalLikeHeader(value: unknown) {
  const token = normalizeToken(value)
  return (
    token.includes('합') ||
    token.includes('sum') ||
    token.includes('total') ||
    token.includes('정압실') ||
    token.includes('정압') ||
    token.includes('계')
  )
}
