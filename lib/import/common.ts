import * as XLSX from 'xlsx'
import {
  daysInMonth,
  extractMonthFromText,
  isBlankCell,
  isTotalLikeHeader,
  monthDateForDay,
  normalizeToken,
  parseDelimitedText,
  parseIntNumber,
  parseLooseNumber,
  readWorkbookFromFile,
  sheetToMatrix,
} from '@/lib/input/common'

export type ImportSheetMatrix = {
  sheetName: string
  matrix: string[][]
}

export async function readImportSheets(file: File): Promise<ImportSheetMatrix[]> {
  const lowerName = file.name.toLowerCase()

  if (lowerName.endsWith('.csv')) {
    return [
      {
        sheetName: file.name,
        matrix: parseDelimitedText(await file.text()),
      },
    ]
  }

  const workbook = await readWorkbookFromFile(file)
  return workbook.SheetNames.map((sheetName) => {
    const { matrix } = sheetToMatrix(workbook, sheetName)
    return { sheetName, matrix }
  })
}

export function trimMatrix(matrix: string[][]) {
  return matrix
    .map((row) => row.map((cell) => String(cell ?? '').trim()))
    .filter((row) => row.some((cell) => cell !== ''))
}

export function rowHasMeaningfulValue(row: string[]) {
  return row.some((cell) => !isBlankCell(cell))
}

export function rowHasNonTotalValue(row: string[]) {
  return row.some((cell) => {
    const token = normalizeToken(cell)
    return token !== '' && !isTotalLikeHeader(token)
  })
}

export function rowText(row: string[]) {
  return row.map((cell) => String(cell ?? '').trim()).join(' ')
}

function normalizeExcelSerialDate(value: string) {
  const numeric = Number(value)
  if (!Number.isFinite(numeric) || numeric < 1000) return null

  const parsed = XLSX.SSF.parse_date_code(numeric)
  if (!parsed || !parsed.y || !parsed.m || !parsed.d) return null

  return `${String(parsed.y).padStart(4, '0')}-${String(parsed.m).padStart(2, '0')}-${String(parsed.d).padStart(2, '0')}`
}

export function normalizeMonthDate(value: unknown, fallbackYear?: number | null) {
  const text = String(value ?? '').trim()
  if (!text) return null

  const direct = extractMonthFromText(text)
  if (direct) return direct

  const serialDate = normalizeExcelSerialDate(text)
  if (serialDate) return `${serialDate.slice(0, 7)}-01`

  const yearMatch = text.match(/(20\d{2})/)
  const monthMatch = text.match(/(0?[1-9]|1[0-2])\s*월/) ?? text.match(/(0?[1-9]|1[0-2])$/)
  if (!monthMatch) return null

  const year = yearMatch ? Number(yearMatch[1]) : fallbackYear
  if (!year) return null

  const month = Number(monthMatch[1])
  if (!Number.isFinite(month)) return null
  return `${year}-${String(month).padStart(2, '0')}-01`
}

export function normalizeDateText(value: unknown, fallbackYm?: string | null) {
  const text = String(value ?? '').trim()
  if (!text) return null

  const serialDate = normalizeExcelSerialDate(text)
  if (serialDate) return serialDate

  const normalized = text.replace(/[./]/g, '-')
  const fullDate = normalized.match(/^(20\d{2})-(\d{1,2})-(\d{1,2})$/)
  if (fullDate) {
    const [, year, month, day] = fullDate
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`
  }

  const monthDay = normalized.match(/^(\d{1,2})-(\d{1,2})$/)
  if (monthDay && fallbackYm) {
    return `${fallbackYm}-${monthDay[2].padStart(2, '0')}`
  }

  const monthOnly = normalizeMonthDate(text, fallbackYm ? Number(fallbackYm.slice(0, 4)) : null)
  if (monthOnly) return monthOnly

  return null
}

export function normalizeShiftText(value: unknown) {
  const token = normalizeToken(value)
  if (!token) return null
  if (token.includes('day') || token.includes('주간') || token === '주') return 'day'
  if (token.includes('night') || token.includes('야간') || token === '야') return 'night'
  if (token.includes('both') || token.includes('주야') || token.includes('혼합') || token.includes('양')) return 'both'
  return null
}

export function normalizeFurnaceCode(value: unknown) {
  const text = String(value ?? '').trim()
  if (!text) return null

  const token = normalizeToken(text)
  if (!token || isTotalLikeHeader(token)) return null

  if (token.includes('정압실')) return null

  const digits = text.match(/(?:#\s*)?(\d{1,2})/)
  if (digits) {
    const number = Number(digits[1])
    if (Number.isFinite(number) && number >= 1 && number <= 99) {
      return `${number}호기`
    }
  }

  if (token.includes('호기')) {
    const extracted = token.match(/(\d{1,2})/)
    if (extracted) return `${Number(extracted[1])}호기`
    return text.replace(/\s+/g, '')
  }

  return null
}

export function normalizeLineCode(value: unknown) {
  const text = String(value ?? '').trim()
  if (!text) return null

  const token = normalizeToken(text)
  if (!token || isTotalLikeHeader(token)) return null

  if (token.includes('rm') || token.includes('ring') || token.includes('링밀')) return 'R/M'
  if (token.startsWith('p5')) return 'P5'
  if (token.startsWith('p8')) return 'P8'
  if (token.startsWith('p15')) return 'P15'
  if (text.toUpperCase().includes('P5')) return 'P5'
  if (text.toUpperCase().includes('P8')) return 'P8'
  if (text.toUpperCase().includes('P15')) return 'P15'

  return text
}

export function normalizeNumericText(value: unknown) {
  return parseLooseNumber(value)
}

export function normalizeIntegerText(value: unknown) {
  return parseIntNumber(value)
}

export function getDayCount(ym: string) {
  return daysInMonth(ym)
}

export function makeDayDate(ym: string, day: number) {
  return monthDateForDay(ym, day)
}

export function detectYearFromSheetName(sheetName: string) {
  const match = sheetName.match(/(20\d{2})/)
  return match ? Number(match[1]) : null
}

export function collectHeaderTokens(headerRow: string[]) {
  return headerRow
    .map((cell) => normalizeToken(cell))
    .filter((token) => token && !isTotalLikeHeader(token))
}

export function sampleRowValues(matrix: string[][], columnIndex: number, limit = 3) {
  const values: string[] = []
  for (const row of matrix) {
    const value = String(row[columnIndex] ?? '').trim()
    if (value) values.push(value)
    if (values.length >= limit) break
  }
  return values
}

export function toWorkbookSheetHeader(workbook: XLSX.WorkBook, sheetName: string) {
  const sheet = workbook.Sheets[sheetName]
  return sheet ? XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' }) as string[][] : []
}
