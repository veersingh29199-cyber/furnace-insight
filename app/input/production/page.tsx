'use client'

import { useEffect, useEffectEvent, useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { DataSheetGrid } from 'react-datasheet-grid'
import { ArrowDownToLine, ArrowUpDown, FileUp, Loader2, Plus, Save, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import type { ProductionRecord } from '@/types'
import { DB, DB_CONFLICT_KEYS } from '@/types/db'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Separator } from '@/components/ui/separator'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import ProductionRecordForm from '@/components/forms/production-record-form'
import { InputPageSkeleton } from '@/components/input/input-page-skeleton'
import { RouteHero } from '@/components/input/route-hero'
import {
  createDateKeyColumn,
  createNumberKeyColumn,
  createSelectKeyColumn,
  createTextKeyColumn,
} from '@/components/input/datasheet-columns'
import { useFurnaces, useLines, useProducts, useTargets } from '@/hooks/use-dashboard'
import { createClient } from '@/lib/supabase/client'
import {
  createBlankProductionRow,
  type ProductionGridRow,
} from '@/lib/input/domain'
import {
  buildLookup,
  findHeaderIndex,
  findHeaderRow,
  getCell,
  readInputMatrix,
} from '@/lib/input/parsers'
import { ParsedSpreadsheet, ParsedSpreadsheetRow } from '@/lib/input/result'
import {
  currentMonthYm,
  extractMonthFromText,
  monthDateForDay,
  parseDelimitedText,
  parseIntNumber,
  parseLooseNumber,
  previousMonthYm,
  normalizeToken,
  daysInMonth,
} from '@/lib/input/common'
import {
  calcAchievementRate,
  calcTonPerHour,
  formatPercent,
  formatTonPerHour,
} from '@/lib/utils'
import {
  getProductionAchievementRate,
  getProductionChargeWeight,
  getProductionDeptLine,
  getProductionFurnaceCode,
  getProductionMaterial,
  getProductionOrderNo,
  getProductionOrderWeight,
  getProductionProcess,
  getProductionProduct,
  getProductionTonPerHour,
  getProductionTonPerRun,
  getProductionWorkDate,
  getProductionWorkHours,
  getProductionWorkCount,
  sumProduction,
} from '@/lib/production/records'
import { createInputId } from '@/lib/input/common'

const DRAFT_KEY = 'furnace-input-production-daily-draft-v1'
const MAX_PREVIEW_ROWS = 20

type ProductionPreviewRow = ParsedSpreadsheetRow<ProductionGridRow>
type ProductionDraft = {
  monthYm: string
  mode: 'grid' | 'paste' | 'single'
  gridRows: ProductionGridRow[]
  pasteText: string
  activeFileName: string
}

function todayDate() {
  return new Date().toISOString().slice(0, 10)
}

function monthBounds(ym: string) {
  const [year, month] = ym.split('-').map((value) => Number(value))
  const lastDay = new Date(year, month, 0).getDate()
  return {
    from: `${ym}-01`,
    to: `${ym}-${String(lastDay).padStart(2, '0')}`,
  }
}

function normalizeDateText(value: string, fallbackYm: string) {
  const token = value.trim().replace(/\./g, '-').replace(/\//g, '-')
  if (!token) return null

  const full = token.match(/^(20\d{2})-(\d{1,2})-(\d{1,2})$/)
  if (full) {
    return `${full[1]}-${full[2].padStart(2, '0')}-${full[3].padStart(2, '0')}`
  }

  const dayOnly = token.match(/^(\d{1,2})$/)
  if (dayOnly) {
    return `${fallbackYm}-${dayOnly[1].padStart(2, '0')}`
  }

  return null
}

function parseShift(value: string) {
  const token = normalizeToken(value)
  if (!token) return 'both'
  if (token.includes('night') || token.includes('야간')) return 'night'
  if (token.includes('day') || token.includes('주간')) return 'day'
  return 'both'
}

function getDraftFallback(): ProductionDraft {
  return {
    monthYm: currentMonthYm(),
    mode: 'grid',
    gridRows: [createBlankProductionRow()],
    pasteText: '',
    activeFileName: '',
  }
}

function readDraft(): ProductionDraft {
  if (typeof window === 'undefined') return getDraftFallback()

  try {
    const raw = window.localStorage.getItem(DRAFT_KEY)
    if (!raw) return getDraftFallback()

    const draft = JSON.parse(raw) as Partial<ProductionDraft>
    return {
      monthYm: draft.monthYm || currentMonthYm(),
      mode: draft.mode === 'grid' || draft.mode === 'paste' || draft.mode === 'single' ? draft.mode : 'grid',
      gridRows: Array.isArray(draft.gridRows) && draft.gridRows.length > 0 ? draft.gridRows : [createBlankProductionRow()],
      pasteText: draft.pasteText || '',
      activeFileName: draft.activeFileName || '',
    }
  } catch {
    return getDraftFallback()
  }
}

function isBlankProductionRow(row: ProductionGridRow) {
  return (
    !row.work_date &&
    !row.dept_line &&
    !row.order_no.trim() &&
    !row.process.trim() &&
    !row.product &&
    !row.material &&
    !row.order_size.trim() &&
    !row.work_size.trim() &&
    !row.furnace_code &&
    !row.note.trim() &&
    row.order_weight == null &&
    row.charge_weight == null &&
    row.work_hours == null &&
    row.work_count == null
  )
}

function normalizeProductionPayload(row: ProductionGridRow) {
  return {
    work_date: row.work_date,
    dept_line: row.dept_line,
    shift: row.shift || null,
    order_no: row.order_no.trim(),
    product: row.product || null,
    material: row.material || null,
    process: row.process.trim(),
    order_size: row.order_size.trim() || null,
    work_size: row.work_size.trim() || null,
    order_weight: row.order_weight ?? 0,
    charge_weight: row.charge_weight ?? 0,
    furnace_code: row.furnace_code || null,
    work_hours: row.work_hours ?? 0,
    work_count: row.work_count ?? 0,
    entered_by_name: null,
    note: row.note.trim() || null,
    created_by: null,
    updated_by: null,
    entered_by_shift: null,
    updated_at: new Date().toISOString(),
  }
}

function hydrateProductionRow(record: ProductionRecord) {
  return {
    id: createInputId('production-copy'),
    work_date: getProductionWorkDate(record) ?? todayDate(),
    dept_line: getProductionDeptLine(record),
    shift: record.shift ?? 'both',
    order_no: getProductionOrderNo(record) ?? '',
    product: getProductionProduct(record),
    material: getProductionMaterial(record),
    process: getProductionProcess(record) ?? '',
    order_size: record.order_size ?? '',
    work_size: record.work_size ?? '',
    order_weight: getProductionOrderWeight(record) || null,
    charge_weight: getProductionChargeWeight(record) || null,
    furnace_code: getProductionFurnaceCode(record),
    work_hours: getProductionWorkHours(record) || null,
    work_count: getProductionWorkCount(record) || null,
    note: record.note ?? '',
  } satisfies ProductionGridRow
}

async function fetchProductionMonthRows(supabase: ReturnType<typeof createClient>, monthYm: string) {
  const { from, to } = monthBounds(monthYm)
  const [newRows, legacyRows] = await Promise.all([
    supabase
      .from(DB.tables.productionRecords)
      .select('*')
      .gte(DB.productionRecords.workDate, from)
      .lte(DB.productionRecords.workDate, to),
    supabase
      .from(DB.tables.productionRecords)
      .select('*')
      .gte(DB.productionRecords.workMonth, from)
      .lte(DB.productionRecords.workMonth, to),
  ])

  const error = newRows.error || legacyRows.error
  if (error) throw error

  const merged = new Map<string, ProductionRecord>()
  ;[...(newRows.data ?? []), ...(legacyRows.data ?? [])].forEach((row) => {
    merged.set(row.id, row as ProductionRecord)
  })

  return Array.from(merged.values())
}

function buildProductionParser(
  monthYm: string,
  lines: ReturnType<typeof useLines>['data'],
  products: ReturnType<typeof useProducts>['data'],
  furnaces: ReturnType<typeof useFurnaces>['data']
) {
  const lineLookup = buildLookup(lines, (line) => [line.code, line.name])
  const productLookup = buildLookup(products, (product) => [product.name])
  const furnaceLookup = buildLookup(furnaces, (furnace) => [furnace.code, furnace.name])

  return (matrix: string[][], sourceName: string): ParsedSpreadsheet<ProductionGridRow> => {
    const rows: ProductionPreviewRow[] = []
    const headerRowIndex = findHeaderRow(
      matrix,
      (row) => {
        const headers = row.map((cell) => normalizeToken(cell))
        const hasDate = headers.some((token) => token.includes('작업일') || token.includes('일자') || token.includes('date'))
        const hasOrder = headers.some((token) => token.includes('수주번호') || token.includes('order'))
        const hasProcess = headers.some((token) => token.includes('공정') || token.includes('process'))
        const hasHours = headers.some((token) => token.includes('작업시간') || token.includes('hours'))
        const hasCount = headers.some((token) => token.includes('작업횟수') || token.includes('count'))
        return hasDate && hasOrder && hasProcess && hasHours && hasCount
      },
      8
    )

    if (headerRowIndex < 0) {
      return {
        sheetName: sourceName,
        rows: [
          {
            rowIndex: 0,
            raw: [],
            value: null,
            errors: ['헤더를 찾지 못했습니다. 작업일·수주번호·공정·작업시간·작업횟수가 필요합니다.'],
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
      workDate: findHeaderIndex(header, ['작업일', '일자', 'date', '작업월']),
      deptLine: findHeaderIndex(header, ['작업부서', '부서', '라인', 'dept', 'line_code']),
      shift: findHeaderIndex(header, ['주야', '주간', '야간', 'shift']),
      orderNo: findHeaderIndex(header, ['수주번호', '오더번호', 'order', 'lot']),
      process: findHeaderIndex(header, ['공정', 'process']),
      workHours: findHeaderIndex(header, ['작업시간', '시간', 'hours']),
      workCount: findHeaderIndex(header, ['작업횟수', '횟수', 'count']),
      product: findHeaderIndex(header, ['제품', 'product', 'product_name']),
      material: findHeaderIndex(header, ['재질', 'material']),
      orderSize: findHeaderIndex(header, ['수주치수', 'order size']),
      workSize: findHeaderIndex(header, ['작업치수', 'work size']),
      orderWeight: findHeaderIndex(header, ['수주중량', '실적', '생산량', 'actual', 'order_weight', 'actual_ton']),
      chargeWeight: findHeaderIndex(header, ['투입중량', '장입량', 'charge_weight', 'hwangji_ton']),
      furnaceCode: findHeaderIndex(header, ['가열로', '호기', 'furnace']),
      note: findHeaderIndex(header, ['비고', 'note']),
    }

    matrix.slice(headerRowIndex + 1).forEach((raw, index) => {
      const sourceRow = headerRowIndex + index + 2
      const values = {
        workDate: getCell(raw, columns.workDate),
        deptLine: getCell(raw, columns.deptLine),
        shift: getCell(raw, columns.shift),
        orderNo: getCell(raw, columns.orderNo),
        process: getCell(raw, columns.process),
        workHours: getCell(raw, columns.workHours),
        workCount: getCell(raw, columns.workCount),
        product: getCell(raw, columns.product),
        material: getCell(raw, columns.material),
        orderSize: getCell(raw, columns.orderSize),
        workSize: getCell(raw, columns.workSize),
        orderWeight: getCell(raw, columns.orderWeight),
        chargeWeight: getCell(raw, columns.chargeWeight),
        furnaceCode: getCell(raw, columns.furnaceCode),
        note: getCell(raw, columns.note),
      }

      const hasMeaningfulInput = Object.values(values).some((value) => value.trim() !== '')
      if (!hasMeaningfulInput) return

      const errors: string[] = []
      const warnings: string[] = []

      const workDate = normalizeDateText(values.workDate, monthYm)
      const deptLine = lineLookup.get(normalizeToken(values.deptLine)) ?? null
      const product = values.product ? productLookup.get(normalizeToken(values.product)) ?? null : null
      const furnace = values.furnaceCode ? furnaceLookup.get(normalizeToken(values.furnaceCode)) ?? null : null
      const processText = values.process.trim()
      const orderNo = values.orderNo.trim()
      const workHours = parseLooseNumber(values.workHours)
      const workCount = parseIntNumber(values.workCount)
      const orderWeight = parseLooseNumber(values.orderWeight)
      const chargeWeight = parseLooseNumber(values.chargeWeight)
      const material = values.material.trim() || product?.material || null
      const orderSize = values.orderSize.trim() || null
      const workSize = values.workSize.trim() || null
      const note = values.note.trim()

      if (!workDate) errors.push('작업일을 확인해 주세요.')
      if (!values.deptLine) errors.push('작업부서/라인을 입력해 주세요.')
      if (values.deptLine && !deptLine) errors.push(`작업부서/라인 "${values.deptLine}"을 찾지 못했습니다.`)
      if (!orderNo) errors.push('수주번호를 입력해 주세요.')
      if (!processText) errors.push('공정을 입력해 주세요.')
      if (workHours == null || workHours <= 0) errors.push('작업시간을 입력해 주세요.')
      if (workCount == null || workCount <= 0) errors.push('작업횟수를 입력해 주세요.')
      if (orderWeight == null || orderWeight <= 0) errors.push('수주중량을 입력해 주세요.')
      if (chargeWeight == null || chargeWeight <= 0) warnings.push('투입중량이 0이거나 비어 있어 원단위 계산이 불완전합니다.')
      if (values.furnaceCode && !furnace) errors.push(`가열로 "${values.furnaceCode}"를 찾지 못했습니다.`)

      const value: ProductionGridRow = {
        id: `${sourceName}-${sourceRow}`,
        work_date: workDate ?? `${monthYm}-01`,
        dept_line: deptLine?.code ?? values.deptLine,
        shift: parseShift(values.shift),
        order_no: orderNo,
        product: product?.name ?? (values.product.trim() || null),
        material,
        process: processText,
        order_size: orderSize || '',
        work_size: workSize || '',
        order_weight: orderWeight,
        charge_weight: chargeWeight,
        furnace_code: furnace?.code ?? (values.furnaceCode.trim() || null),
        work_hours: workHours,
        work_count: workCount,
        note,
      }

      const tph = value.order_weight != null && value.work_hours != null ? calcTonPerHour(value.order_weight, value.work_hours) : null
      const tpr = value.order_weight != null && value.work_count != null && value.work_count > 0 ? value.order_weight / value.work_count : null

      if (tph != null && (tph < 5 || tph > 40)) {
        warnings.push(`시간당 생산량 ${formatTonPerHour(tph)}t/h가 일반 범위를 벗어납니다.`)
      }
      if (tpr != null && (tpr < 1 || tpr > 40)) {
        warnings.push(`1회당 생산량 ${tpr.toFixed(2)}t가 일반 범위를 벗어납니다.`)
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
      validRows: rows.filter((row) => row.value && row.errors.length === 0).map((row) => row.value as ProductionGridRow),
      invalidRowCount: rows.filter((row) => row.errors.length > 0).length,
      warningRowCount: rows.filter((row) => row.warnings.length > 0).length,
    }
  }
}

function summarizeGroup(
  rows: ProductionRecord[],
  keyFn: (row: ProductionRecord) => string | null | undefined
) {
  const map = new Map<string, { label: string; count: number; orderWeight: number; chargeWeight: number; workHours: number; workCount: number }>()

  rows.forEach((row) => {
    const key = keyFn(row)
    if (!key) return
    const current = map.get(key) ?? { label: key, count: 0, orderWeight: 0, chargeWeight: 0, workHours: 0, workCount: 0 }
    current.count += 1
    current.orderWeight += getProductionOrderWeight(row)
    current.chargeWeight += getProductionChargeWeight(row)
    current.workHours += getProductionWorkHours(row)
    current.workCount += getProductionWorkCount(row)
    map.set(key, current)
  })

  return Array.from(map.values())
    .map((item) => ({
      ...item,
      tph: calcTonPerHour(item.orderWeight, item.workHours),
      tpr: item.workCount > 0 ? item.orderWeight / item.workCount : null,
    }))
    .sort((a, b) => b.orderWeight - a.orderWeight)
}

function summarizeFurnaceGas(
  productionRows: ProductionRecord[],
  gasRows: Array<{ date: string; furnace_code: string; value: number }>
) {
  const chargeByDateFurnace = new Map<string, number>()
  productionRows.forEach((row) => {
    const date = getProductionWorkDate(row)
    const furnace = getProductionFurnaceCode(row)
    if (!date || !furnace) return
    const key = `${date}|${furnace}`
    chargeByDateFurnace.set(key, (chargeByDateFurnace.get(key) ?? 0) + getProductionChargeWeight(row))
  })

  const gasByDateFurnace = new Map<string, number>()
  gasRows.forEach((row) => {
    const key = `${row.date}|${row.furnace_code}`
    gasByDateFurnace.set(key, (gasByDateFurnace.get(key) ?? 0) + Number(row.value || 0))
  })

  const furnaceMap = new Map<string, { label: string; gasUsage: number; chargeWeight: number }>()
  Array.from(new Set([...chargeByDateFurnace.keys(), ...gasByDateFurnace.keys()])).forEach((key) => {
    const [date, furnace] = key.split('|')
    if (!date || !furnace) return
    const current = furnaceMap.get(furnace) ?? { label: furnace, gasUsage: 0, chargeWeight: 0 }
    current.gasUsage += gasByDateFurnace.get(key) ?? 0
    current.chargeWeight += chargeByDateFurnace.get(key) ?? 0
    furnaceMap.set(furnace, current)
  })

  return Array.from(furnaceMap.values())
    .map((item) => ({
      ...item,
      gasUnit: item.chargeWeight > 0 ? item.gasUsage / (item.chargeWeight / 1000) : null,
    }))
    .filter((item) => item.gasUnit != null)
    .sort((a, b) => (b.gasUnit ?? 0) - (a.gasUnit ?? 0))
}

export default function ProductionInputPage() {
  const supabase = useMemo(() => createClient(), [])
  const queryClient = useQueryClient()
  const { data: lines } = useLines()
  const { data: products } = useProducts()
  const { data: furnaces } = useFurnaces()
  const { data: targets } = useTargets(new Date().getFullYear())

  const [monthYm, setMonthYm] = useState(() => currentMonthYm())
  const [mode, setMode] = useState<ProductionDraft['mode']>('grid')
  const [gridRows, setGridRows] = useState<ProductionGridRow[]>(() => [createBlankProductionRow()])
  const [pasteText, setPasteText] = useState('')
  const [preview, setPreview] = useState<ParsedSpreadsheet<ProductionGridRow> | null>(null)
  const [activeFileName, setActiveFileName] = useState('')
  const [isHydrated, setIsHydrated] = useState(false)
  const [isContentReady, setIsContentReady] = useState(false)

  const lineOptions = useMemo(
    () => (lines ?? []).map((line) => ({ label: `${line.code} · ${line.name}`, value: line.code })),
    [lines]
  )
  const productOptions = useMemo(
    () => (products ?? []).map((product) => ({ label: `${product.name} (${product.material})`, value: product.name })),
    [products]
  )
  const materialOptions = useMemo(() => {
    const values = Array.from(new Set((products ?? []).map((product) => product.material).filter(Boolean)))
    return values.map((material) => ({ label: material, value: material }))
  }, [products])
  const furnaceOptions = useMemo(
    () => (furnaces ?? []).map((furnace) => ({ label: `${furnace.code} · ${furnace.name}`, value: furnace.code })),
    [furnaces]
  )
  const processOptions = useMemo(() => ['기본', '단조', '가열', '검사'].map((value) => ({ label: value, value })), [])

  const previousMonth = previousMonthYm(monthYm)
  const currentMonthTarget = targets?.find((target) => target.metric === 'output' && target.scope === 'company' && target.year === new Date().getFullYear())?.target_value ?? null

  const { data: previousMonthRecords, isFetching: loadingPrevious } = useQuery({
    queryKey: ['input-production-prev-month', previousMonth],
    enabled: isHydrated,
    queryFn: async () => fetchProductionMonthRows(supabase, previousMonth),
  })

  const { data: currentMonthRecords = [] } = useQuery({
    queryKey: ['input-production-month', monthYm],
    enabled: isHydrated,
    queryFn: async () => fetchProductionMonthRows(supabase, monthYm),
  })

  const { data: currentMonthGasRows = [] } = useQuery({
    queryKey: ['input-production-gas-daily', monthYm],
    enabled: isHydrated,
    queryFn: async () => {
      const { from, to } = monthBounds(monthYm)
      const { data, error } = await supabase
        .from(DB.tables.gasDailyReadings)
        .select('date,furnace_code,shift,value')
        .gte(DB.gasDailyReadings.date, from)
        .lte(DB.gasDailyReadings.date, to)

      if (error) throw error
      return (data ?? []) as Array<{ date: string; furnace_code: string; shift: string | null; value: number }>
    },
  })

  const columns = useMemo(
    () => [
      createDateKeyColumn<ProductionGridRow, 'work_date'>('work_date', '작업일 *', { basis: 130, minWidth: 120 }),
      createSelectKeyColumn<ProductionGridRow, 'dept_line'>('dept_line', '작업부서/라인 *', lineOptions, {
        placeholder: '선택',
        minWidth: 180,
        basis: 180,
      }),
      createSelectKeyColumn<ProductionGridRow, 'shift'>(
        'shift',
        '주야',
        [
          { label: '주간', value: 'day' },
          { label: '야간', value: 'night' },
          { label: '주야합계', value: 'both' },
        ],
        { placeholder: '선택', minWidth: 120, basis: 120 }
      ),
      createTextKeyColumn<ProductionGridRow, 'order_no'>('order_no', '수주번호 *', { placeholder: '예: ORD-2026-001', minWidth: 160 }),
      createSelectKeyColumn<ProductionGridRow, 'process'>('process', '공정 *', processOptions, {
        placeholder: '선택',
        minWidth: 140,
        basis: 140,
      }),
      createNumberKeyColumn<ProductionGridRow, 'work_hours'>('work_hours', '작업시간(h) *', { integer: false, minWidth: 120 }),
      createNumberKeyColumn<ProductionGridRow, 'work_count'>('work_count', '작업횟수 *', { integer: true, minWidth: 110 }),
      createSelectKeyColumn<ProductionGridRow, 'product'>('product', '제품', productOptions, {
        placeholder: '선택',
        minWidth: 180,
        basis: 180,
      }),
      createSelectKeyColumn<ProductionGridRow, 'material'>('material', '재질', materialOptions, {
        placeholder: '선택',
        minWidth: 140,
        basis: 140,
      }),
      createTextKeyColumn<ProductionGridRow, 'order_size'>('order_size', '수주치수', { placeholder: '예: 1200×800', minWidth: 130 }),
      createTextKeyColumn<ProductionGridRow, 'work_size'>('work_size', '작업치수', { placeholder: '예: 1180×780', minWidth: 130 }),
      createNumberKeyColumn<ProductionGridRow, 'order_weight'>('order_weight', '수주중량(t) *', { integer: false, minWidth: 120 }),
      createNumberKeyColumn<ProductionGridRow, 'charge_weight'>('charge_weight', '투입중량(kg) *', { integer: true, minWidth: 120 }),
      createSelectKeyColumn<ProductionGridRow, 'furnace_code'>('furnace_code', '가열로 *', furnaceOptions, {
        placeholder: '선택',
        minWidth: 130,
        basis: 130,
      }),
      createTextKeyColumn<ProductionGridRow, 'note'>('note', '비고', { placeholder: '메모', minWidth: 180 }),
    ],
    [furnaceOptions, lineOptions, materialOptions, processOptions, productOptions]
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
  }, [activeFileName, gridRows, isHydrated, monthYm, mode, pasteText])

  const parseProductionInput = useMemo(
    () => buildProductionParser(monthYm, lines, products, furnaces),
    [furnaces, lines, monthYm, products]
  )

  const rowChecks = useMemo(() => {
    return gridRows.map((row) => {
      if (isBlankProductionRow(row)) {
        return { row, errors: [] as string[], warnings: [] as string[], blank: true }
      }

      const errors: string[] = []
      const warnings: string[] = []

      if (!row.work_date) errors.push('작업일을 입력해 주세요.')
      if (!row.dept_line) errors.push('작업부서/라인을 입력해 주세요.')
      if (!row.order_no.trim()) errors.push('수주번호를 입력해 주세요.')
      if (!row.process.trim()) errors.push('공정을 입력해 주세요.')
      if (!row.furnace_code) errors.push('가열로를 입력해 주세요.')
      if (row.work_hours == null || row.work_hours <= 0) errors.push('작업시간을 입력해 주세요.')
      if (row.work_count == null || row.work_count <= 0) errors.push('작업횟수를 입력해 주세요.')
      if (row.order_weight == null || row.order_weight <= 0) errors.push('수주중량을 입력해 주세요.')
      if (row.charge_weight == null || row.charge_weight <= 0) warnings.push('투입중량이 0이거나 비어 있습니다.')

      if (row.order_weight != null && row.work_hours != null) {
        const tph = calcTonPerHour(row.order_weight, row.work_hours)
        if (tph != null && (tph < 5 || tph > 40)) warnings.push(`TPH ${formatTonPerHour(tph)}가 일반 범위를 벗어납니다.`)
      }

      if (row.order_weight != null && row.work_count != null && row.work_count > 0) {
        const tpr = row.order_weight / row.work_count
        if (tpr < 1 || tpr > 40) warnings.push(`1회당 생산량 ${tpr.toFixed(2)}t가 일반 범위를 벗어납니다.`)
      }

      return { row, errors, warnings, blank: false }
    })
  }, [gridRows])

  const activeRows = rowChecks.filter((item) => !item.blank)
  const validGridRows = activeRows.filter((item) => item.errors.length === 0).map((item) => item.row)
  const invalidGridRows = activeRows.filter((item) => item.errors.length > 0)

  const productionTotals = useMemo(() => sumProduction(validGridRows), [validGridRows])
  const currentYearTarget = currentMonthTarget ?? null
  const achievementRate = getProductionAchievementRate(productionTotals.orderWeight, currentYearTarget)
  const totalTph = calcTonPerHour(productionTotals.orderWeight, productionTotals.workHours)
  const totalTpr = productionTotals.workCount > 0 ? productionTotals.orderWeight / productionTotals.workCount : null

  const latestDate = useMemo(() => {
    const dates = [
      ...currentMonthRecords.map((record) => getProductionWorkDate(record)).filter((value): value is string => Boolean(value)),
      ...currentMonthGasRows.map((record) => record.date).filter(Boolean),
    ]
    return dates.sort().at(-1) ?? null
  }, [currentMonthGasRows, currentMonthRecords])

  const latestDayProduction = useMemo(
    () => currentMonthRecords.filter((record) => getProductionWorkDate(record) === latestDate),
    [currentMonthRecords, latestDate]
  )
  const latestDayGas = useMemo(
    () => currentMonthGasRows.filter((record) => record.date === latestDate),
    [currentMonthGasRows, latestDate]
  )

  const latestDayTotals = useMemo(() => sumProduction(latestDayProduction), [latestDayProduction])
  const latestDayFurnaceStats = useMemo(() => summarizeFurnaceGas(latestDayProduction, latestDayGas), [latestDayGas, latestDayProduction])

  const lineSummary = useMemo(
    () => summarizeGroup(currentMonthRecords, (row) => getProductionDeptLine(row)),
    [currentMonthRecords]
  )
  const productSummary = useMemo(
    () => summarizeGroup(currentMonthRecords, (row) => getProductionProduct(row)),
    [currentMonthRecords]
  )
  const materialSummary = useMemo(
    () => summarizeGroup(currentMonthRecords, (row) => getProductionMaterial(row)),
    [currentMonthRecords]
  )
  const processSummary = useMemo(
    () => summarizeGroup(currentMonthRecords, (row) => getProductionProcess(row)),
    [currentMonthRecords]
  )
  const furnaceSummary = useMemo(
    () => summarizeGroup(currentMonthRecords, (row) => getProductionFurnaceCode(row)),
    [currentMonthRecords]
  )

  const saveRows = async (rowsToSave: ProductionGridRow[]) => {
    const payloads = rowsToSave
      .filter((row) => !isBlankProductionRow(row))
      .map((row) => normalizeProductionPayload(row))
      .filter((payload) => payload.work_date && payload.dept_line && payload.order_no && payload.process && payload.furnace_code)

    if (payloads.length === 0) {
      toast.error('저장할 유효한 데이터가 없습니다.')
      return
    }

    const {
      data: { user },
    } = await supabase.auth.getUser()
    const operatorName =
      typeof window !== 'undefined' ? window.localStorage.getItem('furnace_operator_name') || '현장 입력' : null
    const operatorShift =
      typeof window !== 'undefined' ? window.localStorage.getItem('furnace_operator_shift') || 'day' : null

    const batchSize = 50
    let saved = 0

    for (let index = 0; index < payloads.length; index += batchSize) {
      const batch = payloads.slice(index, index + batchSize).map((payload) => ({
        ...payload,
        created_by: user?.id ?? null,
        updated_by: user?.id ?? null,
        entered_by_name: operatorName,
        entered_by_shift: operatorShift,
        updated_at: new Date().toISOString(),
      }))

      const { error } = await supabase.from(DB.tables.productionRecords).upsert(batch, {
        onConflict: DB_CONFLICT_KEYS.productionRecords,
      })

      if (error) throw error
      saved += batch.length
    }

    await queryClient.invalidateQueries({ queryKey: ['production-records'] })
    await queryClient.invalidateQueries({ queryKey: ['dashboard-kpi'] })
    await queryClient.invalidateQueries({ queryKey: ['input-production-month', monthYm] })
    window.localStorage.removeItem(DRAFT_KEY)
    setPreview(null)
    toast.success(`${saved}건을 저장했습니다.`)
  }

  const handleGridSave = async () => {
    if (invalidGridRows.length > 0) {
      toast.warning(`${invalidGridRows.length}건의 오류를 제외하고 저장합니다.`)
    }
    await saveRows(validGridRows)
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
  }, [isHydrated, onSaveShortcut])

  const handleParsePaste = () => {
    const matrix = parseDelimitedText(pasteText)
    const result = parseProductionInput(matrix, 'paste')
    setPreview(result)
    setActiveFileName('paste')
    setMode('paste')

    if (result.validRows.length === 0) {
      toast.error('유효한 행을 찾지 못했습니다.')
      return
    }

    toast.success(`정상 ${result.validRows.length}건 / 오류 ${result.invalidRowCount}건`)
  }

  const handleFile = async (file: File) => {
    const { matrix } = await readInputMatrix(file)
    const inferredMonth = extractMonthFromText(file.name)
    const sourceName = file.name
    const result = parseProductionInput(matrix, sourceName)

    setPreview(result)
    setActiveFileName(file.name)
    setMode('paste')

    if (inferredMonth) {
      setMonthYm(inferredMonth.slice(0, 7))
    }

    if (result.validRows.length === 0) {
      toast.error('유효한 행을 찾지 못했습니다.')
      return
    }

    toast.success(`파일에서 정상 ${result.validRows.length}건을 읽었습니다.`)
  }

  const previewRows = preview?.rows.slice(0, MAX_PREVIEW_ROWS) ?? []

  const applyPreviewToGrid = () => {
    if (!preview) return
    setGridRows([...preview.validRows.map((row) => ({ ...row, id: createInputId('production') })), createBlankProductionRow()])
    setMode('grid')
    toast.success('미리보기를 그리드에 반영했습니다.')
  }

  const loadPreviousMonth = async () => {
    if (!previousMonthRecords || previousMonthRecords.length === 0) {
      toast.info('지난달 데이터가 없습니다.')
      return
    }

    const copied = previousMonthRecords.map((record) => hydrateProductionRow(record))
    setGridRows(copied.length > 0 ? [...copied, createBlankProductionRow(`${monthDateForDay(previousMonth, 1)}`)] : [createBlankProductionRow()])
    setMonthYm(previousMonth)
    setMode('grid')
    toast.success('지난달 데이터를 불러왔습니다.')
  }

  const resetGrid = () => {
    setGridRows([createBlankProductionRow()])
    setPreview(null)
    toast.success('그리드를 초기화했습니다.')
  }

  const gridMetrics = [
    {
      label: '입력 행수',
      value: `${activeRows.length}건`,
      hint: `${daysInMonth(monthYm)}일 기준`,
      tone: activeRows.length > 0 ? ('success' as const) : ('warning' as const),
    },
    {
      label: '수주중량 / 투입중량',
      value: `${productionTotals.orderWeight.toLocaleString('ko-KR')} / ${productionTotals.chargeWeight.toLocaleString('ko-KR')}`,
      hint: '톤 / kg',
    },
    {
      label: '작업시간 / 작업횟수',
      value: `${productionTotals.workHours.toLocaleString('ko-KR')} h / ${productionTotals.workCount.toLocaleString('ko-KR')} 회`,
      hint: '합계',
    },
    {
      label: 'TPH / TPR / 달성률',
      value: `${totalTph != null ? formatTonPerHour(totalTph) : '-'} / ${totalTpr != null ? totalTpr.toFixed(2) : '-'} / ${achievementRate != null ? formatPercent(achievementRate) : '-'}`,
      hint: '자동 계산',
      tone: achievementRate != null && achievementRate >= 100 ? ('success' as const) : ('default' as const),
    },
  ]

  if (!isContentReady) {
    return <InputPageSkeleton />
  }

  return (
    <div className="space-y-6">
      <RouteHero
        eyebrow="생산 실적"
        title="일일 생산 실적을 수주번호·공정 중심으로 입력"
        description="작업시간·작업횟수를 수주번호와 공정 옆에 두고, 수주중량과 투입중량을 함께 저장해 TPH, TPR, 달성률과 가스원단위 연결을 준비합니다."
        metrics={gridMetrics}
        actions={(
          <>
            <Button variant="outline" className="gap-2" onClick={loadPreviousMonth} disabled={loadingPrevious}>
              {loadingPrevious ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowDownToLine className="h-4 w-4" />}
              지난달 불러오기
            </Button>
            <Button variant="outline" className="gap-2" onClick={resetGrid}>
              <Trash2 className="h-4 w-4" />
              초기화
            </Button>
            <Button className="gap-2" onClick={handleGridSave}>
              <Save className="h-4 w-4" />
              현재 그리드 저장
            </Button>
          </>
        )}
      />

      {isContentReady ? (
        <>
          <Tabs value={mode} onValueChange={(value) => setMode(value as ProductionDraft['mode'])} className="space-y-4">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="grid">그리드 직접 입력</TabsTrigger>
              <TabsTrigger value="paste">붙여넣기 / 업로드</TabsTrigger>
              <TabsTrigger value="single">단건 폼</TabsTrigger>
            </TabsList>

            <TabsContent value="grid" className="space-y-4">
              <Card className="overflow-hidden">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">일일 생산 그리드</CardTitle>
                  <CardDescription>
                    날짜·수주번호·공정·작업시간·작업횟수를 한 줄씩 입력합니다. Tab/Enter 이동과 붙여넣기를 지원합니다.
                  </CardDescription>
                </CardHeader>
                <CardContent className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
                  <div className="grid gap-2 sm:max-w-sm">
                    <label className="text-sm font-medium">기준월</label>
                    <Input type="month" value={monthYm} onChange={(event) => setMonthYm(event.target.value || currentMonthYm())} />
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline" className="gap-1">
                      <ArrowUpDown className="h-3.5 w-3.5" />
                      Tab / Enter / 방향키
                    </Badge>
                    <Badge variant="outline" className="gap-1">
                      <FileUp className="h-3.5 w-3.5" />
                      붙여넣기 / 파일 업로드
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
                    height={620}
                    autoAddRow
                    lockRows={false}
                    disableContextMenu={false}
                    rowClassName={({ rowData }) => {
                      const item = rowChecks.find((entry) => entry.row.id === rowData.id)
                      if (item?.errors.length) return 'bg-rose-500/10'
                      if (item?.warnings.length) return 'bg-amber-500/10'
                      if (isBlankProductionRow(rowData)) return 'bg-muted/20'
                      return undefined
                    }}
                  />
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="paste" className="space-y-4">
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">붙여넣기 / 파일 업로드</CardTitle>
                  <CardDescription>
                    엑셀에서 복사한 표를 바로 붙여넣거나 .xlsx / .csv 파일을 올리면 자동으로 분석해서 미리보기로 보여줍니다.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid gap-4 lg:grid-cols-[1.3fr_0.7fr]">
                    <div className="space-y-3">
                      <label className="text-sm font-medium">붙여넣기 영역</label>
                      <Textarea
                        value={pasteText}
                        onChange={(event) => setPasteText(event.target.value)}
                        placeholder="엑셀에서 복사한 표를 붙여넣어 주세요."
                        rows={8}
                      />
                      <div className="flex flex-wrap gap-2">
                        <Button type="button" variant="outline" onClick={handleParsePaste}>
                          붙여넣기 분석
                        </Button>
                        <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm">
                          <FileUp className="h-4 w-4" />
                          파일 업로드
                          <input
                            type="file"
                            className="hidden"
                            accept=".xlsx,.xls,.csv"
                            onChange={(event) => {
                              const file = event.target.files?.[0]
                              if (file) {
                                void handleFile(file)
                              }
                              event.target.value = ''
                            }}
                          />
                        </label>
                      </div>
                    </div>

                    <div className="space-y-3">
                      <Card className="border-dashed">
                        <CardHeader className="pb-2">
                          <CardTitle className="text-sm">현재 파일</CardTitle>
                        </CardHeader>
                        <CardContent className="text-sm text-muted-foreground">
                          {activeFileName || '선택된 파일이 없습니다.'}
                        </CardContent>
                      </Card>
                      <Card className="border-dashed">
                        <CardHeader className="pb-2">
                          <CardTitle className="text-sm">미리보기 반영</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-3">
                          <p className="text-sm text-muted-foreground">
                            정상 행만 그리드에 옮겨서 이어서 수정할 수 있습니다.
                          </p>
                          <Button type="button" onClick={applyPreviewToGrid} disabled={!preview?.validRows.length}>
                            그리드에 반영
                          </Button>
                        </CardContent>
                      </Card>
                    </div>
                  </div>

                  {preview && (
                    <div className="space-y-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant="outline">정상 {preview.validRows.length}건</Badge>
                        <Badge variant="outline">오류 {preview.invalidRowCount}건</Badge>
                        <Badge variant="outline">경고 {preview.warningRowCount}건</Badge>
                      </div>
                      <Card className="overflow-hidden">
                        <CardContent className="p-0">
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead>상태</TableHead>
                                <TableHead>작업일</TableHead>
                                <TableHead>수주번호</TableHead>
                                <TableHead>공정</TableHead>
                                <TableHead className="text-right">수주중량</TableHead>
                                <TableHead className="text-right">작업시간</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {previewRows.map((row) => (
                                <TableRow key={`${row.rowIndex}-${row.raw.join('|')}`}>
                                  <TableCell>
                                    <div className="flex flex-wrap gap-1">
                                      {row.errors.length > 0 ? (
                                        <Badge variant="destructive">오류</Badge>
                                      ) : (
                                        <Badge variant="outline">정상</Badge>
                                      )}
                                      {row.warnings.length > 0 && <Badge variant="secondary">경고</Badge>}
                                    </div>
                                  </TableCell>
                                  <TableCell>{row.value?.work_date ?? '-'}</TableCell>
                                  <TableCell>{row.value?.order_no ?? '-'}</TableCell>
                                  <TableCell>{row.value?.process ?? '-'}</TableCell>
                                  <TableCell className="text-right">
                                    {row.value?.order_weight != null ? row.value.order_weight.toLocaleString('ko-KR') : '-'}
                                  </TableCell>
                                  <TableCell className="text-right">
                                    {row.value?.work_hours != null ? row.value.work_hours.toLocaleString('ko-KR') : '-'}
                                  </TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </CardContent>
                      </Card>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="single" className="space-y-4">
              <ProductionRecordForm />
            </TabsContent>
          </Tabs>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">이번 달 요약</CardTitle>
              <CardDescription>입력된 생산과 일일 가스 데이터를 기준으로 자동 계산한 요약입니다.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3 md:grid-cols-3 xl:grid-cols-6">
              <div className="rounded-xl border bg-background/80 p-4">
                <p className="text-xs text-muted-foreground">수주중량 합계</p>
                <p className="mt-1 text-lg font-bold">{productionTotals.orderWeight.toLocaleString('ko-KR')} t</p>
              </div>
              <div className="rounded-xl border bg-background/80 p-4">
                <p className="text-xs text-muted-foreground">투입중량 합계</p>
                <p className="mt-1 text-lg font-bold">{productionTotals.chargeWeight.toLocaleString('ko-KR')} kg</p>
              </div>
              <div className="rounded-xl border bg-background/80 p-4">
                <p className="text-xs text-muted-foreground">시간당 생산량</p>
                <p className="mt-1 text-lg font-bold">{totalTph != null ? formatTonPerHour(totalTph) : '-'} t/h</p>
              </div>
              <div className="rounded-xl border bg-background/80 p-4">
                <p className="text-xs text-muted-foreground">1회당 생산량</p>
                <p className="mt-1 text-lg font-bold">{totalTpr != null ? totalTpr.toFixed(2) : '-'}</p>
              </div>
              <div className="rounded-xl border bg-background/80 p-4">
                <p className="text-xs text-muted-foreground">달성률</p>
                <p className="mt-1 text-lg font-bold">{achievementRate != null ? formatPercent(achievementRate) : '-'}</p>
              </div>
              <div className="rounded-xl border bg-background/80 p-4">
                <p className="text-xs text-muted-foreground">최근 일자</p>
                <p className="mt-1 text-lg font-bold">{latestDate ?? '-'}</p>
              </div>
            </CardContent>
          </Card>

          <div className="grid gap-4 xl:grid-cols-2">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">전일 요약</CardTitle>
                <CardDescription>가장 최근 작업일 기준의 생산·가스 연결 요약입니다.</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-3 md:grid-cols-2">
                <div className="rounded-xl border bg-background/80 p-4">
                  <p className="text-xs text-muted-foreground">전일 수주중량</p>
                  <p className="mt-1 text-lg font-bold">{latestDayTotals.orderWeight.toLocaleString('ko-KR')} t</p>
                </div>
                <div className="rounded-xl border bg-background/80 p-4">
                  <p className="text-xs text-muted-foreground">전일 작업시간</p>
                  <p className="mt-1 text-lg font-bold">{latestDayTotals.workHours.toLocaleString('ko-KR')} h</p>
                </div>
                <div className="rounded-xl border bg-background/80 p-4">
                  <p className="text-xs text-muted-foreground">전일 평균 TPH</p>
                  <p className="mt-1 text-lg font-bold">
                    {calcTonPerHour(latestDayTotals.orderWeight, latestDayTotals.workHours) != null
                      ? formatTonPerHour(calcTonPerHour(latestDayTotals.orderWeight, latestDayTotals.workHours))
                      : '-'} t/h
                  </p>
                </div>
                <div className="rounded-xl border bg-background/80 p-4">
                  <p className="text-xs text-muted-foreground">전일 평균 원단위</p>
                  <p className="mt-1 text-lg font-bold">
                    {latestDayFurnaceStats.length > 0
                      ? (latestDayFurnaceStats.reduce((sum, item) => sum + (item.gasUnit ?? 0), 0) / latestDayFurnaceStats.length).toFixed(1)
                      : '-'}
                  </p>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">원단위 높은 가열로 TOP 5</CardTitle>
                <CardDescription>전일 기준으로 가스 사용량과 투입중량을 연결해 계산했습니다.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>가열로</TableHead>
                      <TableHead className="text-right">가스원단위</TableHead>
                      <TableHead className="text-right">가스사용량</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {latestDayFurnaceStats.slice(0, 5).map((item) => (
                      <TableRow key={item.label}>
                        <TableCell>{item.label}</TableCell>
                        <TableCell className="text-right">{item.gasUnit != null ? item.gasUnit.toFixed(1) : '-'}</TableCell>
                        <TableCell className="text-right">{item.gasUsage.toLocaleString('ko-KR')}</TableCell>
                      </TableRow>
                    ))}
                    {latestDayFurnaceStats.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={3} className="text-center text-sm text-muted-foreground">
                          전일 가스 데이터가 없습니다.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-4 xl:grid-cols-2">
            <SummaryCard title="작업부서/라인별" rows={lineSummary} />
            <SummaryCard title="제품별" rows={productSummary} />
            <SummaryCard title="재질별" rows={materialSummary} />
            <SummaryCard title="공정별" rows={processSummary} />
            <SummaryCard title="가열로별" rows={furnaceSummary} />
          </div>
        </>
      ) : (
        <InputPageSkeleton />
      )}
    </div>
  )
}

function SummaryCard({
  title,
  rows,
}: {
  title: string
  rows: Array<{ label: string; count: number; orderWeight: number; chargeWeight: number; workHours: number; workCount: number; tph: number | null; tpr: number | null }>
}) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent className="overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>항목</TableHead>
              <TableHead className="text-right">수주중량</TableHead>
              <TableHead className="text-right">TPH</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.slice(0, 5).map((row) => (
              <TableRow key={row.label}>
                <TableCell>
                  <div>
                    <p className="font-medium">{row.label}</p>
                    <p className="text-xs text-muted-foreground">{row.count}건 / {row.workHours.toFixed(1)}h</p>
                  </div>
                </TableCell>
                <TableCell className="text-right">{row.orderWeight.toFixed(1)}t</TableCell>
                <TableCell className="text-right">{row.tph != null ? row.tph.toFixed(2) : '-'}</TableCell>
              </TableRow>
            ))}
            {rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={3} className="text-center text-sm text-muted-foreground">
                  데이터가 없습니다.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  )
}
