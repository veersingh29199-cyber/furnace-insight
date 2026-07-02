import { normalizeToken, parseDelimitedText, readWorkbookFromFile, sheetToMatrix } from '@/lib/input/common'

export function buildLookup<T>(items: T[] | undefined, labels: (item: T) => string[]) {
  const map = new Map<string, T>()

  items?.forEach((item) => {
    labels(item).forEach((label) => {
      const token = normalizeToken(label)
      if (token) map.set(token, item)
    })
  })

  return map
}

export function findHeaderRow(
  matrix: string[][],
  predicate: (row: string[], index: number) => boolean,
  limit = 6
) {
  return matrix.findIndex((row, index) => index < limit && predicate(row, index))
}

export function findHeaderIndex(headers: string[], aliases: string[]) {
  const tokens = headers.map((cell) => normalizeToken(cell))
  return tokens.findIndex((token) => aliases.some((alias) => token.includes(normalizeToken(alias))))
}

export function getCell(row: string[], index: number) {
  if (index < 0) return ''
  return String(row[index] ?? '').trim()
}

export async function readInputMatrix(file: File) {
  if (file.name.toLowerCase().endsWith('.csv')) {
    return { sheetName: file.name, matrix: parseDelimitedText(await file.text()) }
  }

  const workbook = await readWorkbookFromFile(file)
  return sheetToMatrix(workbook)
}

