export interface ParsedSpreadsheetRow<T> {
  rowIndex: number
  raw: string[]
  value: T | null
  errors: string[]
  warnings: string[]
}

export interface ParsedSpreadsheet<T> {
  sheetName: string
  rows: ParsedSpreadsheetRow<T>[]
  validRows: T[]
  invalidRowCount: number
  warningRowCount: number
}

