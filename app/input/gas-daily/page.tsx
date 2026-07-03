'use client'

import { useEffect, useEffectEvent, useMemo, useState } from 'react'
import type { Furnace, GasDailyReading, Shift } from '@/types'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { DataSheetGrid } from 'react-datasheet-grid'
import { toast } from 'sonner'
import { ArrowDownToLine, ArrowUpDown, FileUp, Loader2, Save, Trash2 } from 'lucide-react'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Separator } from '@/components/ui/separator'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import GasDailyForm from '@/components/forms/gas-daily-form'
import { InputPageSkeleton } from '@/components/input/input-page-skeleton'
import { RouteHero } from '@/components/input/route-hero'
import {
  createDynamicNumberKeyColumn,
  createReadOnlyKeyColumn,
  createSelectKeyColumn,
  createTextKeyColumn,
} from '@/components/input/datasheet-columns'
import { useFurnaces } from '@/hooks/use-dashboard'
import { createClient } from '@/lib/supabase/client'
import { cloneDailyRowsForMonth, createBlankDailyGasRows, type DailyGasGridRow } from '@/lib/input/domain'
import {
  currentMonthYm,
  daysInMonth,
  extractMonthFromText,
  monthDateForDay,
  normalizeToken,
  parseDelimitedText,
  parseIntNumber,
  parseLooseNumber,
  previousMonthYm,
} from '@/lib/input/common'
import { buildLookup, findHeaderIndex, findHeaderRow, getCell, readInputMatrix } from '@/lib/input/parsers'
import { ParsedSpreadsheet, ParsedSpreadsheetRow } from '@/lib/input/result'
import { DB, DB_CONFLICT_KEYS } from '@/types/db'

const DRAFT_KEY = 'furnace-input-gas-daily-draft-v2'
const MAX_PREVIEW_ROWS = 20

type DailyPreviewRow = ParsedSpreadsheetRow<DailyGasGridRow>
type DailyDraft = {
  monthYm: string
  mode: 'grid' | 'paste' | 'single'
  gridRows: DailyGasGridRow[]
  pasteText: string
  activeFileName: string
}

function getDraftFallback(): DailyDraft {
  return {
    monthYm: currentMonthYm(),
    mode: 'grid',
    gridRows: createBlankDailyGasRows(currentMonthYm(), []),
    pasteText: '',
    activeFileName: '붙여넣기',
  }
}

function readDraft(): DailyDraft {
  if (typeof window === 'undefined') return getDraftFallback()

  try {
    const raw = window.localStorage.getItem(DRAFT_KEY)
    if (!raw) return getDraftFallback()

    const draft = JSON.parse(raw) as Partial<DailyDraft>
    return {
      monthYm: draft.monthYm || currentMonthYm(),
      mode: draft.mode === 'grid' || draft.mode === 'paste' || draft.mode === 'single' ? draft.mode : 'grid',
      gridRows:
        Array.isArray(draft.gridRows) && draft.gridRows.length > 0
          ? (draft.gridRows as DailyGasGridRow[])
          : createBlankDailyGasRows(currentMonthYm(), []),
      pasteText: draft.pasteText || '',
      activeFileName: draft.activeFileName || '붙여넣기',
    }
  } catch {
    return getDraftFallback()
  }
}

function buildFurnaceLookup(furnaces: Furnace[] | undefined) {
  return buildLookup(furnaces, (furnace) => {
    const token = normalizeToken(furnace.code)
    const digits = token.match(/\d+/)?.[0]
    const aliases = new Set<string>([furnace.code, furnace.name, token, normalizeToken(furnace.name)])

    if (digits) {
      aliases.add(digits)
      aliases.add(`${digits}호기`)
      aliases.add(`${digits}호`)
      aliases.add(`${digits}번`)
    }

    return Array.from(aliases).filter(Boolean)
  })
}

function isIgnoredDailyHeader(token: string) {
  return (
    token.includes('합계') ||
    token.includes('총계') ||
    token.includes('소계') ||
    token.includes('정압실') ||
    token.includes('압력실') ||
    token.endsWith('합')
  )
}

function looksLikeFurnaceHeader(token: string) {
  return token.includes('호기') || token.includes('furnace') || /\d+/.test(token)
}

function resolveDateText(value: string) {
  const normalized = value.trim().replace(/\./g, '-').replace(/\//g, '-')
  const match = normalized.match(/^(20\d{2})-(\d{1,2})-(\d{1,2})$/)
  if (!match) return null
  return `${match[1]}-${match[2].padStart(2, '0')}-${match[3].padStart(2, '0')}`
}

function parseShiftToken(value: string): Shift | null {
  const token = normalizeToken(value)
  if (!token) return null
  if (token === 'day' || token.includes('주간') || token === '주') return 'day'
  if (token === 'night' || token.includes('야간') || token === '야') return 'night'
  if (token === 'both' || token.includes('주야') || token.includes('혼합') || token.includes('양')) return 'both'
  return null
}

function resolveFurnaceHeader(cell: string, lookup: Map<string, Furnace>) {
  const token = normalizeToken(cell)
  if (!token || isIgnoredDailyHeader(token)) return null

  const direct = lookup.get(token)
  if (direct) return direct

  const digits = token.match(/\d+/)?.[0]
  if (!digits) return null

  return (
    lookup.get(normalizeToken(`${digits}호기`)) ??
    lookup.get(normalizeToken(`${digits}호`)) ??
    lookup.get(normalizeToken(`${digits}번`)) ??
    lookup.get(normalizeToken(digits)) ??
    null
  )
}

function buildDailyParser(monthYm: string, furnaces: Furnace[] | undefined) {
  const furnaceLookup = buildFurnaceLookup(furnaces)

  return (matrix: string[][], sourceName: string): ParsedSpreadsheet<DailyGasGridRow> => {
    const rows: DailyPreviewRow[] = []
    const headerRowIndex = findHeaderRow(
      matrix,
      (row) => {
        const headers = row.map((cell) => normalizeToken(cell))
        const hasDate = headers.some((token) => token.includes('일자') || token.includes('날짜') || token.includes('date'))
        const furnaceCount = row.filter((cell) => {
          const token = normalizeToken(cell)
          return !isIgnoredDailyHeader(token) && resolveFurnaceHeader(cell, furnaceLookup) != null
        }).length
        return hasDate && furnaceCount >= 1
      },
      6
    )

    if (headerRowIndex < 0) {
      return {
        sheetName: sourceName,
        rows: [
          {
            rowIndex: 0,
            raw: [],
            value: null,
            errors: ['헤더 행을 찾지 못했습니다. 일자와 호기 열을 확인해 주세요.'],
            warnings: [],
          },
        ],
        validRows: [],
        invalidRowCount: 1,
        warningRowCount: 0,
      }
    }

    const header = matrix[headerRowIndex] ?? []
    const columns = {
      day: findHeaderIndex(header, ['일자', 'day', '일']),
      date: findHeaderIndex(header, ['날짜', 'date']),
      shift: findHeaderIndex(header, ['교대', 'shift', '주간', '야간', '주야']),
      orderNo: findHeaderIndex(header, ['수주', 'order', 'lot']),
    }

    const furnaceColumns: Array<{ index: number; furnace: Furnace }> = []
    const unknownFurnaceColumns: Array<{ index: number; header: string }> = []

    header.forEach((cell, index) => {
      const token = normalizeToken(cell)
      if (!token || isIgnoredDailyHeader(token)) return

      const furnace = resolveFurnaceHeader(cell, furnaceLookup)
      if (furnace) {
        furnaceColumns.push({ index, furnace })
        return
      }

      if (looksLikeFurnaceHeader(token)) {
        unknownFurnaceColumns.push({ index, header: String(cell).trim() })
      }
    })

    const startRow = headerRowIndex + 1
    matrix.slice(startRow).forEach((raw, idx) => {
      const sourceRow = startRow + idx + 1
      const dayText = getCell(raw, columns.day)
      const dateText = getCell(raw, columns.date)
      const shiftText = getCell(raw, columns.shift)
      const orderNo = getCell(raw, columns.orderNo)

      const knownValues = furnaceColumns.map((column) => getCell(raw, column.index))
      const unknownValues = unknownFurnaceColumns.map((column) => getCell(raw, column.index))
      const hasMeaningfulInput =
        [dayText, dateText, shiftText, orderNo, ...knownValues, ...unknownValues].some((value) => value.trim() !== '')
      if (!hasMeaningfulInput) return

      const errors: string[] = []
      const warnings: string[] = []

      const parsedShift = parseShiftToken(shiftText)
      if (shiftText && !parsedShift) errors.push(`교대 값 "${shiftText}"를 인식하지 못했습니다.`)

      const dayFromText = parseIntNumber(dayText)
      const dateFromText = resolveDateText(dateText)
      const day = dayFromText ?? (dateFromText ? Number(dateFromText.slice(-2)) : null)

      if (day == null) {
        errors.push('일자를 찾을 수 없습니다.')
      } else if (day < 1 || day > daysInMonth(monthYm)) {
        errors.push(`일자 ${day}는 ${monthYm} 기준 범위를 벗어납니다.`)
      }

      const date = dateFromText ?? (day != null ? monthDateForDay(monthYm, day) : null)
      if (!date) {
        errors.push('날짜를 확인해 주세요.')
      } else if (!date.startsWith(monthYm)) {
        warnings.push(`파일의 날짜(${date})가 선택한 월(${monthYm})과 다릅니다.`)
      }

      const value: DailyGasGridRow = {
        id: `${sourceName}-${sourceRow}`,
        day: day ?? 0,
        date: date ?? monthDateForDay(monthYm, 1),
        shift: parsedShift ?? 'both',
        order_no: orderNo,
      }

      let readingCount = 0

      furnaceColumns.forEach((column) => {
        const rawValue = getCell(raw, column.index)
        const parsed = parseLooseNumber(rawValue)
        if (rawValue.trim() === '' || parsed == null) {
          value[column.furnace.code] = null
          return
        }
        if (parsed < 0) {
          errors.push(`${column.furnace.code} 값은 음수일 수 없습니다.`)
          value[column.furnace.code] = null
          return
        }
        if (parsed === 0) {
          value[column.furnace.code] = null
          return
        }
        value[column.furnace.code] = parsed
        readingCount += 1
      })

      unknownFurnaceColumns.forEach((column) => {
        const rawValue = getCell(raw, column.index)
        const parsed = parseLooseNumber(rawValue)
        if (rawValue.trim() !== '' && parsed != null && parsed > 0) {
          errors.push(`알 수 없는 호기 열 "${column.header}"을(를) 확인해 주세요.`)
        }
      })

      if (readingCount === 0) {
        if (orderNo.trim() !== '' || dayText.trim() !== '' || dateText.trim() !== '' || shiftText.trim() !== '') {
          errors.push('호기별 검침값을 하나 이상 입력해 주세요.')
        } else {
          return
        }
      }

      rows.push({
        rowIndex: sourceRow,
        raw,
        value,
        errors,
        warnings,
      })
    })

    return {
      sheetName: sourceName,
      rows,
      validRows: rows.filter((row) => row.value && row.errors.length === 0).map((row) => row.value as DailyGasGridRow),
      invalidRowCount: rows.filter((row) => row.errors.length > 0).length,
      warningRowCount: rows.filter((row) => row.warnings.length > 0).length,
    }
  }
}

function isBlankDailyRow(row: DailyGasGridRow, furnaceCodes: string[]) {
  const hasReadings = furnaceCodes.some((code) => typeof row[code] === 'number')
  return !hasReadings && row.order_no.trim() === ''
}

function normalizeDailyPayload(row: DailyGasGridRow, furnaceCode: string) {
  const value = row[furnaceCode]
  if (typeof value !== 'number' || !Number.isFinite(value)) return null

  return {
    date: row.date,
    furnace_code: furnaceCode,
    shift: row.shift,
    order_no: row.order_no.trim() || null,
    value,
  }
}

export default function GasDailyInputPage() {
  const supabase = useMemo(() => createClient(), [])
  const queryClient = useQueryClient()
  const { data: furnaces } = useFurnaces()
  const furnaceCodes = useMemo(() => (furnaces ?? []).map((furnace) => furnace.code), [furnaces])
  const [monthYm, setMonthYm] = useState(() => currentMonthYm())
  const [mode, setMode] = useState<DailyDraft['mode']>('grid')
  const [gridRows, setGridRows] = useState<DailyGasGridRow[]>(() => createBlankDailyGasRows(currentMonthYm(), []))
  const [pasteText, setPasteText] = useState('')
  const [preview, setPreview] = useState<ParsedSpreadsheet<DailyGasGridRow> | null>(null)
  const [activeFileName, setActiveFileName] = useState('')
  const [isHydrated, setIsHydrated] = useState(false)
  const [isContentReady, setIsContentReady] = useState(false)

  const previousMonth = previousMonthYm(monthYm)
  const previousMonthLastDay = daysInMonth(previousMonth)

  const { data: previousMonthRecords, isFetching: loadingPrevious } = useQuery({
    queryKey: ['input-gas-daily-prev-month', previousMonth],
    enabled: isHydrated,
    queryFn: async () => {
      const { data, error } = await supabase
        .from(DB.tables.gasDailyReadings)
        .select(
          `id, ${DB.gasDailyReadings.date}, ${DB.gasDailyReadings.furnaceCode}, ${DB.gasDailyReadings.shift}, ${DB.gasDailyReadings.value}, ${DB.gasDailyReadings.orderNo}, ${DB.gasDailyReadings.sourceUploadId}, ${DB.gasDailyReadings.createdBy}, ${DB.gasDailyReadings.enteredByName}, ${DB.gasDailyReadings.enteredByShift}`
        )
        .gte(DB.gasDailyReadings.date, `${previousMonth}-01`)
        .lte(DB.gasDailyReadings.date, `${previousMonth}-${String(previousMonthLastDay).padStart(2, '0')}`)
        .order(DB.gasDailyReadings.date, { ascending: true })
        .order(DB.gasDailyReadings.shift, { ascending: true, nullsFirst: true })
        .order(DB.gasDailyReadings.furnaceCode, { ascending: true })

      if (error) throw error
      return (data ?? []) as GasDailyReading[]
    },
  })

  const columns = useMemo(
    () => [
      createReadOnlyKeyColumn<DailyGasGridRow, 'day'>('day', '일', { basis: 60, minWidth: 60 }),
      createReadOnlyKeyColumn<DailyGasGridRow, 'date'>('date', '일자', { basis: 110, minWidth: 96 }),
      createSelectKeyColumn<DailyGasGridRow, 'shift'>(
        'shift',
        '교대',
        [
          { label: '주간', value: 'day' },
          { label: '야간', value: 'night' },
          { label: '혼합', value: 'both' },
        ],
        { placeholder: '교대', basis: 110, minWidth: 100 }
      ),
      createTextKeyColumn<DailyGasGridRow, 'order_no'>('order_no', '수주번호', {
        placeholder: '선택',
        minWidth: 160,
      }),
      ...(furnaces ?? []).map((furnace, index) =>
        createDynamicNumberKeyColumn<DailyGasGridRow>(furnace.code, furnace.code || `${index + 1}호기`, {
          integer: true,
          basis: 110,
          minWidth: 88,
        })
      ),
    ],
    [furnaces]
  )

  useEffect(() => {
    const handle = window.setTimeout(() => {
      const draft = readDraft()
      setMonthYm(draft.monthYm)
      setMode(draft.mode)
      setGridRows(draft.gridRows)
      setPasteText(draft.pasteText)
      setActiveFileName(draft.activeFileName)
      setIsHydrated(true)
    }, 0)

    return () => window.clearTimeout(handle)
  }, [])

  useEffect(() => {
    if (!isHydrated) return

    const handle = window.setTimeout(() => {
      setIsContentReady(true)
    }, 0)

    return () => window.clearTimeout(handle)
  }, [isHydrated])

  useEffect(() => {
    if (!isHydrated || typeof window === 'undefined') return

    const handle = window.setTimeout(() => {
      window.localStorage.setItem(
        DRAFT_KEY,
        JSON.stringify({
          monthYm,
          mode,
          gridRows,
          pasteText,
          activeFileName,
          updatedAt: new Date().toISOString(),
        })
      )
    }, 250)

    return () => window.clearTimeout(handle)
  }, [isHydrated, monthYm, mode, gridRows, pasteText, activeFileName])

  const parser = useMemo(() => buildDailyParser(monthYm, furnaces), [monthYm, furnaces])

  const rowChecks = useMemo(() => {
    return gridRows.map((row) => {
      const numericValues = furnaceCodes
        .map((code) => row[code])
        .filter((value): value is number => typeof value === 'number' && Number.isFinite(value))
      const hasAnyInput = numericValues.length > 0 || row.order_no.trim() !== ''

      if (!hasAnyInput) {
        return { row, errors: [] as string[], warnings: [] as string[], blank: true, filledCount: 0, totalValue: 0 }
      }

      const errors: string[] = []
      const warnings: string[] = []

      if (row.day < 1 || row.day > daysInMonth(monthYm)) {
        errors.push(`일 ${row.day}는 ${monthYm} 기준 범위를 벗어납니다.`)
      }

      if (numericValues.some((value) => value < 0)) {
        errors.push('음수는 입력할 수 없습니다.')
      }

      const totalValue = numericValues.reduce((sum, value) => sum + value, 0)

      return {
        row,
        errors,
        warnings,
        blank: false,
        filledCount: numericValues.length,
        totalValue,
      }
    })
  }, [gridRows, furnaceCodes, monthYm])

  const activeRows = rowChecks.filter((item) => !item.blank)
  const validRows = activeRows.filter((item) => item.errors.length === 0).map((item) => item.row)
  const invalidRows = activeRows.filter((item) => item.errors.length > 0)
  const readingCount = validRows.reduce(
    (sum, row) => sum + furnaceCodes.filter((code) => typeof row[code] === 'number').length,
    0
  )
  const totalValue = validRows.reduce(
    (sum, row) =>
      sum +
      furnaceCodes.reduce((rowSum, furnaceCode) => {
        const value = row[furnaceCode]
        return rowSum + (typeof value === 'number' ? value : 0)
      }, 0),
    0
  )
  const progress = daysInMonth(monthYm) > 0 ? Math.round((activeRows.length / daysInMonth(monthYm)) * 100) : 0

  const saveRows = async (rowsToSave: DailyGasGridRow[]) => {
    if (furnaceCodes.length === 0) {
      toast.error('호기 목록을 불러오는 중입니다.')
      return
    }

    const payloads = rowsToSave.flatMap((row) =>
      furnaceCodes
        .map((furnaceCode) => normalizeDailyPayload(row, furnaceCode))
        .filter((payload): payload is NonNullable<ReturnType<typeof normalizeDailyPayload>> => payload != null)
    )

    if (payloads.length === 0) {
      toast.error('저장할 검침값이 없습니다.')
      return
    }

    const {
      data: { user },
    } = await supabase.auth.getUser()
    const operatorName =
      typeof window !== 'undefined' ? window.localStorage.getItem('furnace_operator_name') || '현장 입력' : null
    const operatorShift =
      typeof window !== 'undefined' ? window.localStorage.getItem('furnace_operator_shift') || 'day' : null

    const batchSize = 100
    let saved = 0

    for (let index = 0; index < payloads.length; index += batchSize) {
      const batch = payloads.slice(index, index + batchSize).map((payload) => ({
        ...payload,
        created_by: user?.id ?? null,
        entered_by_name: operatorName,
        entered_by_shift: operatorShift,
      }))

      const { error } = await supabase.from(DB.tables.gasDailyReadings).upsert(batch, {
        onConflict: DB_CONFLICT_KEYS.gasDailyReadings,
      })

      if (error) throw error
      saved += batch.length
    }

    await queryClient.invalidateQueries({ queryKey: ['gas-daily-all'] })
    await queryClient.invalidateQueries({ queryKey: ['dashboard-kpi'] })
    window.localStorage.removeItem(DRAFT_KEY)
    setPreview(null)
    toast.success(`${saved}건을 저장했습니다.`)
  }

  const handleGridSave = async () => {
    if (invalidRows.length > 0) {
      toast.warning(`${invalidRows.length}개의 행에 오류가 있어 제외하고 저장합니다.`)
    }
    await saveRows(validRows)
  }

  const onSaveShortcut = useEffectEvent(() => {
    void handleGridSave()
  })

  useEffect(() => {
    if (!isHydrated) return

    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
        event.preventDefault()
        onSaveShortcut()
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [isHydrated])

  const handleParsePaste = () => {
    const matrix = parseDelimitedText(pasteText)
    const result = parser(matrix, '붙여넣기')
    setPreview(result)
    setActiveFileName('붙여넣기')
    setMode('paste')

    if (result.validRows.length === 0) {
      toast.error('정상 행을 찾지 못했습니다.')
      return
    }

    toast.success(`정상 ${result.validRows.length}건 / 오류 ${result.invalidRowCount}건`)
  }

  const handleFile = async (file: File) => {
    const { matrix } = await readInputMatrix(file)
    const inferredMonth = extractMonthFromText(file.name)
    const targetMonth = inferredMonth ? inferredMonth.slice(0, 7) : monthYm
    const result = buildDailyParser(targetMonth, furnaces)(matrix, file.name)

    setPreview(result)
    setActiveFileName(file.name)
    setMode('paste')

    if (inferredMonth) {
      setMonthYm(targetMonth)
      setGridRows((prev) => cloneDailyRowsForMonth(targetMonth, furnaceCodes, prev))
    }

    if (result.validRows.length === 0) {
      toast.error('정상 행을 찾지 못했습니다.')
      return
    }

    toast.success(`파일에서 정상 ${result.validRows.length}건을 읽었습니다.`)
  }

  const previewRows = preview?.rows.slice(0, MAX_PREVIEW_ROWS) ?? []

  const updateMonth = (nextMonth: string) => {
    setMonthYm(nextMonth)
    setGridRows((prev) => cloneDailyRowsForMonth(nextMonth, furnaceCodes, prev))
  }

  const applyPreviewToGrid = () => {
    if (!preview) return
    setGridRows(cloneDailyRowsForMonth(monthYm, furnaceCodes, preview.validRows))
    setMode('grid')
    toast.success('미리보기를 그리드로 옮겼습니다.')
  }

  const loadPreviousMonth = () => {
    if (!previousMonthRecords || previousMonthRecords.length === 0) {
      toast.info('지난달 데이터가 없습니다.')
      return
    }

    const copied = createBlankDailyGasRows(monthYm, furnaceCodes)
    previousMonthRecords.forEach((record) => {
      const day = Number(record.date.slice(-2))
      const target = copied.find((row) => row.day === day)
      if (!target) return

      target.shift = record.shift ?? 'both'
      target.order_no = record.order_no ?? ''
      target[record.furnace_code] = record.value
    })

    setGridRows(copied)
    setMode('grid')
    toast.success('지난달 데이터를 불러왔습니다.')
  }

  const resetGrid = () => {
    setGridRows(createBlankDailyGasRows(monthYm, furnaceCodes))
    setPreview(null)
    toast.success('그리드를 초기화했습니다.')
  }

  const gridMetrics = [
    {
      label: '입력 일수',
      value: `${activeRows.length}일`,
      hint: `${daysInMonth(monthYm)}일 기준`,
      tone: activeRows.length > 0 ? ('success' as const) : ('warning' as const),
    },
    {
      label: '검침 건수',
      value: `${readingCount.toLocaleString('ko-KR')}건`,
      hint: '호기별 저장 대상',
    },
    {
      label: '총 검침값',
      value: `${totalValue.toLocaleString('ko-KR')} Nm³`,
      hint: '선택된 호기 합산',
    },
    {
      label: '진행률',
      value: `${progress}%`,
      hint: '이번 달 입력 진행',
      tone: progress >= 100 ? ('success' as const) : ('default' as const),
    },
  ]

  return (
    <div className="space-y-6">
      <RouteHero
        eyebrow="일일 가스검침"
        title="일자 × 호기 표로 빠르게 입력"
        description="현장에서는 한 번에 붙여넣고, 사무실에서는 그리드로 직접 타이핑하고, 급할 때는 단건 폼으로 바로 저장할 수 있습니다."
        metrics={gridMetrics}
        actions={
          <>
            <Button variant="outline" className="gap-2" onClick={loadPreviousMonth} disabled={loadingPrevious}>
              {loadingPrevious ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowDownToLine className="h-4 w-4" />}
              지난달 불러오기
            </Button>
            <Button variant="outline" className="gap-2" onClick={resetGrid}>
              <Trash2 className="h-4 w-4" />
              그리드 초기화
            </Button>
            <Button className="gap-2" onClick={handleGridSave}>
              <Save className="h-4 w-4" />
              현재 그리드 저장
            </Button>
          </>
        }
      />

      {isContentReady ? (
        <>
          <Tabs value={mode} onValueChange={(value) => setMode(value as DailyDraft['mode'])} className="space-y-4">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="grid">그리드 직접 입력</TabsTrigger>
          <TabsTrigger value="paste">붙여넣기 / 파일 업로드</TabsTrigger>
          <TabsTrigger value="single">단건 폼</TabsTrigger>
        </TabsList>

        <TabsContent value="grid" className="space-y-4">
          <Card className="overflow-hidden">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">일별 가열로 검침표</CardTitle>
              <CardDescription>
                일자는 고정하고, 교대와 호기 값을 그대로 입력합니다. 붙여넣기와 키보드 이동을 모두 지원합니다.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
              <div className="grid gap-2 sm:max-w-sm">
                <label className="text-sm font-medium">대상 월</label>
                <Input
                  type="month"
                  value={monthYm}
                  onChange={(event) => updateMonth(event.target.value || currentMonthYm())}
                />
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline" className="gap-1">
                  <ArrowUpDown className="h-3.5 w-3.5" />
                  Tab / Enter / 방향키 지원
                </Badge>
                <Badge variant="outline" className="gap-1">
                  <FileUp className="h-3.5 w-3.5" />
                  붙여넣기와 파일 업로드 지원
                </Badge>
              </div>
            </CardContent>
          </Card>

          <Card className="overflow-hidden">
            <CardContent className="p-0">
              <DataSheetGrid
                value={gridRows}
                onChange={setGridRows}
                columns={columns}
                rowKey="id"
                height={560}
                lockRows
                disableContextMenu={false}
                rowClassName={({ rowData }) => {
                  const item = rowChecks.find((entry) => entry.row.id === rowData.id)
                  if (item?.errors.length) return 'bg-rose-500/10'
                  if (item?.warnings.length) return 'bg-amber-500/10'
                  if (isBlankDailyRow(rowData, furnaceCodes)) return 'bg-muted/20'
                  return undefined
                }}
              />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="paste" className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">엑셀 붙여넣기 / 파일 업로드</CardTitle>
              <CardDescription>
                표를 복사해서 붙여넣거나 `.xlsx` / `.csv` 파일을 올리면 호기 열을 자동으로 찾아 미리보기를 보여줍니다.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 lg:grid-cols-[1.3fr_0.7fr]">
                <div className="space-y-3">
                  <label className="text-sm font-medium">붙여넣기 영역</label>
                  <Textarea
                    value={pasteText}
                    onChange={(event) => setPasteText(event.target.value)}
                    placeholder="엑셀에서 복사한 범위를 그대로 붙여넣어 주세요."
                    className="min-h-48 font-mono text-sm"
                  />
                  <div className="flex flex-wrap gap-2">
                    <Button onClick={handleParsePaste} className="gap-2">
                      <ArrowUpDown className="h-4 w-4" />
                      붙여넣기 분석
                    </Button>
                    <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-input bg-background px-4 py-2 text-sm font-medium shadow-sm transition-colors hover:bg-accent hover:text-accent-foreground">
                      <FileUp className="h-4 w-4" />
                      파일 업로드
                      <input
                        type="file"
                        accept=".xlsx,.xls,.csv"
                        className="hidden"
                        onChange={(event) => {
                          const file = event.target.files?.[0]
                          if (!file) return
                          void handleFile(file)
                          event.target.value = ''
                        }}
                      />
                    </label>
                  </div>
                </div>

                <div className="space-y-3">
                  <label className="text-sm font-medium">대상 월</label>
                  <Input
                    type="month"
                    value={monthYm}
                    onChange={(event) => updateMonth(event.target.value || currentMonthYm())}
                  />
                  <div className="rounded-xl border bg-muted/30 p-4 text-sm text-muted-foreground">
                    <p className="font-medium text-foreground">업로드 팁</p>
                    <ul className="mt-2 space-y-2">
                      <li>0, 빈칸, 합계열, 정압실은 자동 제외됩니다.</li>
                      <li>호기 헤더를 못 찾으면 미리보기에서 오류로 표시됩니다.</li>
                      <li>정상 행만 저장할 수 있고, 오류 행은 제외됩니다.</li>
                    </ul>
                  </div>
                </div>
              </div>

              {preview && (
                <div className="space-y-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge>{preview.sheetName}</Badge>
                    <Badge variant="secondary">정상 {preview.validRows.length}건</Badge>
                    <Badge variant="destructive">오류 {preview.invalidRowCount}건</Badge>
                    <Badge variant="outline">경고 {preview.warningRowCount}건</Badge>
                  </div>

                  {preview.rows.some((row) => row.errors.length > 0) && (
                    <Alert className="border-rose-500/30 bg-rose-500/5">
                      <AlertDescription>
                        오류가 있는 행은 저장에서 제외됩니다. 호기 열과 날짜 형식을 한 번 더 확인해 주세요.
                      </AlertDescription>
                    </Alert>
                  )}

                  <div className="overflow-hidden rounded-xl border">
                    <Table>
                      <TableHeader className="bg-muted/40">
                        <TableRow>
                          <TableHead>행</TableHead>
                          <TableHead>일자</TableHead>
                          <TableHead>교대</TableHead>
                          <TableHead>수주번호</TableHead>
                          <TableHead className="text-right">호기 수</TableHead>
                          <TableHead className="text-right">총합</TableHead>
                          <TableHead>상태</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {previewRows.map((row) => {
                          const validValue = row.value
                          const furnaceCount = furnaceCodes.filter((code) => typeof validValue?.[code] === 'number').length
                          const rowTotal = furnaceCodes.reduce((sum, code) => {
                            const value = validValue?.[code]
                            return sum + (typeof value === 'number' ? value : 0)
                          }, 0)

                          return (
                            <TableRow key={row.rowIndex} className={row.errors.length > 0 ? 'bg-rose-500/10' : ''}>
                              <TableCell className="font-mono text-xs">{row.rowIndex}</TableCell>
                              <TableCell>{validValue?.date ?? '-'}</TableCell>
                              <TableCell>{validValue?.shift ?? '-'}</TableCell>
                              <TableCell>{validValue?.order_no || '-'}</TableCell>
                              <TableCell className="text-right">{furnaceCount.toLocaleString('ko-KR')}</TableCell>
                              <TableCell className="text-right">{rowTotal.toLocaleString('ko-KR')}</TableCell>
                              <TableCell>
                                {row.errors.length > 0 ? (
                                  <div className="space-y-1">
                                    <Badge variant="destructive">오류</Badge>
                                    <p className="text-xs text-rose-500">{row.errors.join(' / ')}</p>
                                  </div>
                                ) : row.warnings.length > 0 ? (
                                  <div className="space-y-1">
                                    <Badge variant="outline" className="border-amber-400 text-amber-600">
                                      경고
                                    </Badge>
                                    <p className="text-xs text-amber-600">{row.warnings.join(' / ')}</p>
                                  </div>
                                ) : (
                                  <Badge variant="secondary">정상</Badge>
                                )}
                              </TableCell>
                            </TableRow>
                          )
                        })}
                      </TableBody>
                    </Table>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <Button variant="outline" onClick={applyPreviewToGrid} disabled={preview.validRows.length === 0}>
                      미리보기를 그리드로 옮기기
                    </Button>
                    <Button onClick={() => saveRows(preview.validRows)} disabled={preview.validRows.length === 0}>
                      <Save className="mr-2 h-4 w-4" />
                      정상 행 저장
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="single" className="space-y-4">
          <GasDailyForm />
        </TabsContent>
      </Tabs>

      <Separator />
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-card p-4 text-sm text-muted-foreground">
        <p>Ctrl+S로 현재 입력 상태를 바로 저장할 수 있고, 자동 저장도 함께 동작합니다.</p>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            if (typeof window !== 'undefined') {
              window.localStorage.removeItem(DRAFT_KEY)
            }
            setPreview(null)
            setGridRows(createBlankDailyGasRows(monthYm, furnaceCodes))
            toast.success('임시저장을 삭제했습니다.')
          }}
        >
          <Trash2 className="mr-2 h-4 w-4" />
          임시저장 삭제
        </Button>
      </div>
        </>
      ) : (
        <InputPageSkeleton />
      )}
    </div>
  )
}
