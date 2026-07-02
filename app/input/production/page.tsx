'use client'

import { useEffect, useEffectEvent, useMemo, useState } from 'react'
import type { ProductionRecord, Shift } from '@/types'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { DataSheetGrid } from 'react-datasheet-grid'
import { toast } from 'sonner'
import { ArrowDownToLine, ArrowUpDown, FileUp, Loader2, Plus, Save, Trash2 } from 'lucide-react'
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
import { RouteHero } from '@/components/input/route-hero'
import {
  createNumberKeyColumn,
  createSelectKeyColumn,
  createTextKeyColumn,
} from '@/components/input/datasheet-columns'
import { useLines, useProducts } from '@/hooks/use-dashboard'
import { createClient } from '@/lib/supabase/client'
import { createBlankProductionRow, type ProductionGridRow } from '@/lib/input/domain'
import {
  createInputId,
  currentMonthYm,
  extractMonthFromText,
  normalizeToken,
  parseIntNumber,
  parseLooseNumber,
  previousMonthYm,
  ymToDate,
} from '@/lib/input/common'
import { buildLookup, findHeaderIndex, findHeaderRow, getCell, readInputMatrix } from '@/lib/input/parsers'
import { ParsedSpreadsheet, ParsedSpreadsheetRow } from '@/lib/input/result'
import { calcAchievementRate, calcTonPerHour, formatPercent, formatTonPerHour } from '@/lib/utils'
import { DB, DB_CONFLICT_KEYS } from '@/types/db'
import type { ComponentProps } from 'react'

const DRAFT_KEY = 'furnace-input-production-draft-v2'
const MAX_PREVIEW_ROWS = 20

type ProductionPreviewRow = ParsedSpreadsheetRow<ProductionGridRow>
type ProductionDraft = {
  monthYm: string
  mode: 'grid' | 'paste' | 'single'
  gridRows: ProductionGridRow[]
  pasteText: string
  activeFileName: string
}

function getDraftFallback(): ProductionDraft {
  return {
    monthYm: currentMonthYm(),
    mode: 'grid',
    gridRows: [createBlankProductionRow()],
    pasteText: '',
    activeFileName: '붙여넣기',
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
      activeFileName: draft.activeFileName || '붙여넣기',
    }
  } catch {
    return getDraftFallback()
  }
}

function parseShift(value: string): Shift {
  const token = normalizeToken(value)
  if (!token) return 'both'
  if (token.includes('night') || token.includes(normalizeToken('야간')) || token.includes(normalizeToken('야'))) return 'night'
  if (token.includes('day') || token.includes(normalizeToken('주간')) || token.includes(normalizeToken('주'))) return 'day'
  return 'both'
}

function buildProductionParser(
  monthDate: string,
  lines: ReturnType<typeof useLines>['data'],
  products: ReturnType<typeof useProducts>['data']
) {
  const lineLookup = buildLookup(lines, (line) => [line.code, line.name])
  const productLookup = buildLookup(products, (product) => [product.name])

  return (matrix: string[][], sourceName: string): ParsedSpreadsheet<ProductionGridRow> => {
    const rows: ProductionPreviewRow[] = []
    const headerRowIndex = findHeaderRow(
      matrix,
      (row) => {
        const headers = row.map((cell) => normalizeToken(cell))
        const score = [
          ['line', '라인'],
          ['plan', '계획'],
          ['actual', '실적'],
        ].filter((aliases) => headers.some((token) => aliases.some((alias) => token.includes(normalizeToken(alias))))).length

        return score >= 2
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
            errors: ['헤더 행을 찾지 못했습니다. 라인/계획/실적 열이 있는지 확인해 주세요.'],
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
      line: findHeaderIndex(header, ['라인', 'line']),
      product: findHeaderIndex(header, ['제품', 'product']),
      shift: findHeaderIndex(header, ['교대', 'shift', '근무']),
      orderNo: findHeaderIndex(header, ['수주', 'order', 'lot', '작업지시']),
      plan: findHeaderIndex(header, ['계획', 'plan']),
      actual: findHeaderIndex(header, ['실적', 'actual']),
      hwangji: findHeaderIndex(header, ['황지']),
      cogging: findHeaderIndex(header, ['cogging', '코깅']),
      self: findHeaderIndex(header, ['자체', 'rework']),
      quality: findHeaderIndex(header, ['불량', 'quality']),
      workHours: findHeaderIndex(header, ['작업시간', '시간', 'work hours']),
      workCount: findHeaderIndex(header, ['작업횟수', '횟수', 'count']),
      note: findHeaderIndex(header, ['비고', 'note']),
    }

    matrix.slice(headerRowIndex + 1).forEach((raw, idx) => {
      const sourceRow = headerRowIndex + idx + 2
      const lineToken = getCell(raw, columns.line)
      const productToken = getCell(raw, columns.product)
      const shiftToken = getCell(raw, columns.shift)
      const orderNo = getCell(raw, columns.orderNo)
      const note = getCell(raw, columns.note)

      const numericValues = [
        getCell(raw, columns.plan),
        getCell(raw, columns.actual),
        getCell(raw, columns.hwangji),
        getCell(raw, columns.cogging),
        getCell(raw, columns.self),
        getCell(raw, columns.quality),
        getCell(raw, columns.workHours),
        getCell(raw, columns.workCount),
      ]

      const hasMeaningfulInput =
        [lineToken, productToken, shiftToken, orderNo, note].some((value) => value.trim() !== '') ||
        numericValues.some((value) => value.trim() !== '')

      if (!hasMeaningfulInput) return

      const errors: string[] = []
      const warnings: string[] = []
      const line = lineLookup.get(normalizeToken(lineToken)) ?? null
      const product = productToken
        ? productLookup.get(normalizeToken(productToken)) ?? null
        : null
      const planTon = parseLooseNumber(getCell(raw, columns.plan))
      const actualTon = parseLooseNumber(getCell(raw, columns.actual))
      const hwangjiTon = parseLooseNumber(getCell(raw, columns.hwangji)) ?? 0
      const coggingTon = parseLooseNumber(getCell(raw, columns.cogging)) ?? 0
      const reworkSelfTon = parseLooseNumber(getCell(raw, columns.self)) ?? 0
      const reworkQualityTon = parseLooseNumber(getCell(raw, columns.quality)) ?? 0
      const workHours = parseLooseNumber(getCell(raw, columns.workHours))
      const workCount = parseIntNumber(getCell(raw, columns.workCount))

      if (!lineToken) errors.push('라인은 필수입니다.')
      if (lineToken && !line) errors.push(`라인 "${lineToken}"을 찾지 못했습니다.`)
      if (productToken && !product) errors.push(`제품 "${productToken}"을 찾지 못했습니다.`)
      if (planTon == null) errors.push('계획 수량을 입력해 주세요.')
      if (actualTon == null) errors.push('실적 수량을 입력해 주세요.')
      if (workHours == null) errors.push('작업시간을 입력해 주세요.')
      if (workCount == null) errors.push('작업횟수를 입력해 주세요.')

      if (planTon != null && actualTon != null) {
        const rate = calcAchievementRate(actualTon, planTon)
        if (rate != null && (rate < 40 || rate > 160)) {
          warnings.push(`달성률 ${formatPercent(rate)}는 일반 범위를 벗어납니다.`)
        }
      }

      if (actualTon != null && workHours != null) {
        const tph = calcTonPerHour(actualTon, workHours)
        if (tph != null && (tph < 5 || tph > 40)) {
          warnings.push(`TPH ${formatTonPerHour(tph)}는 일반 범위를 벗어납니다.`)
        }
      }

      const value: ProductionGridRow = {
        id: `${sourceName}-${sourceRow}`,
        line_code: line?.code ?? null,
        product_name: product?.name ?? null,
        shift: parseShift(shiftToken),
        order_no: orderNo,
        plan_ton: planTon,
        actual_ton: actualTon,
        hwangji_ton: hwangjiTon,
        cogging_ton: coggingTon,
        rework_self_ton: reworkSelfTon,
        rework_quality_ton: reworkQualityTon,
        work_hours: workHours,
        work_count: workCount,
        note,
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

function isBlankProductionRow(row: ProductionGridRow) {
  return (
    !row.line_code &&
    !row.product_name &&
    !row.order_no.trim() &&
    !row.note.trim() &&
    row.plan_ton == null &&
    row.actual_ton == null &&
    row.hwangji_ton == null &&
    row.cogging_ton == null &&
    row.rework_self_ton == null &&
    row.rework_quality_ton == null &&
    row.work_hours == null &&
    row.work_count == null
  )
}

function normalizeProductionPayload(row: ProductionGridRow, monthDate: string) {
  return {
    work_month: monthDate,
    line_code: row.line_code,
    product_name: row.product_name || null,
    shift: row.shift || 'both',
    order_no: row.order_no.trim() || null,
    plan_ton: row.plan_ton ?? 0,
    actual_ton: row.actual_ton ?? 0,
    hwangji_ton: row.hwangji_ton ?? 0,
    cogging_ton: row.cogging_ton ?? 0,
    rework_self_ton: row.rework_self_ton ?? 0,
    rework_quality_ton: row.rework_quality_ton ?? 0,
    work_hours: row.work_hours ?? 0,
    work_count: row.work_count ?? 0,
    note: row.note.trim() || null,
  }
}

function hydrateProductionRow(record: ProductionRecord) {
  return {
    id: createInputId('production-copy'),
    line_code: record.line_code ?? null,
    product_name: record.product_name ?? null,
    shift: record.shift ?? 'both',
    order_no: record.order_no ?? '',
    plan_ton: record.plan_ton ?? null,
    actual_ton: record.actual_ton ?? null,
    hwangji_ton: record.hwangji_ton ?? null,
    cogging_ton: record.cogging_ton ?? null,
    rework_self_ton: record.rework_self_ton ?? null,
    rework_quality_ton: record.rework_quality_ton ?? null,
    work_hours: record.work_hours ?? null,
    work_count: record.work_count ?? null,
    note: record.note ?? '',
  } satisfies ProductionGridRow
}

export default function ProductionInputPage() {
  const supabase = useMemo(() => createClient(), [])
  const queryClient = useQueryClient()
  const { data: lines } = useLines()
  const { data: products } = useProducts()
  const initialDraft = useMemo(() => readDraft(), [])
  const [monthYm, setMonthYm] = useState(() => initialDraft.monthYm)
  const [mode, setMode] = useState<ProductionDraft['mode']>(() => initialDraft.mode)
  const [gridRows, setGridRows] = useState<ProductionGridRow[]>(() => initialDraft.gridRows)
  const [pasteText, setPasteText] = useState(() => initialDraft.pasteText)
  const [preview, setPreview] = useState<ParsedSpreadsheet<ProductionGridRow> | null>(null)
  const [activeFileName, setActiveFileName] = useState(() => initialDraft.activeFileName)

  const lineOptions = useMemo(
    () => (lines ?? []).map((line) => ({ label: `${line.code} · ${line.name}`, value: line.code })),
    [lines]
  )
  const productOptions = useMemo(
    () => (products ?? []).map((product) => ({ label: `${product.name} (${product.material})`, value: product.name })),
    [products]
  )
  const lineByCode = useMemo(() => new Map((lines ?? []).map((line) => [line.code, line])), [lines])
  const productByName = useMemo(() => new Map((products ?? []).map((product) => [product.name, product])), [products])
  const previousMonth = previousMonthYm(monthYm)

  const { data: previousMonthRecords, isFetching: loadingPrevious } = useQuery({
    queryKey: ['input-production-prev-month', previousMonth],
    queryFn: async () => {
      const { data, error } = await supabase
        .from(DB.tables.productionRecords)
        .select('*')
        .eq('work_month', ymToDate(previousMonth))
        .order('created_at', { ascending: true })

      if (error) throw error
      return (data ?? []) as ProductionRecord[]
    },
  })

  const columns = useMemo(
    () => [
      createSelectKeyColumn<ProductionGridRow, 'line_code'>('line_code', '라인 *', lineOptions, {
        placeholder: '라인 선택',
        minWidth: 180,
        basis: 180,
      }),
      createSelectKeyColumn<ProductionGridRow, 'product_name'>('product_name', '제품', productOptions, {
        placeholder: '제품 선택',
        minWidth: 180,
        basis: 180,
      }),
      createSelectKeyColumn<ProductionGridRow, 'shift'>(
        'shift',
        '교대',
        [
          { label: '주간', value: 'day' },
          { label: '야간', value: 'night' },
          { label: '주야합', value: 'both' },
        ],
        { placeholder: '교대 선택', minWidth: 140, basis: 140 }
      ),
      createTextKeyColumn<ProductionGridRow, 'order_no'>('order_no', '수주번호', {
        placeholder: '선택',
        minWidth: 160,
      }),
      createNumberKeyColumn<ProductionGridRow, 'plan_ton'>('plan_ton', '계획(t)', { integer: false }),
      createNumberKeyColumn<ProductionGridRow, 'actual_ton'>('actual_ton', '실적(t)', { integer: false }),
      createNumberKeyColumn<ProductionGridRow, 'hwangji_ton'>('hwangji_ton', '황지(t)', { integer: false }),
      createNumberKeyColumn<ProductionGridRow, 'cogging_ton'>('cogging_ton', 'COGGING(t)', { integer: false }),
      createNumberKeyColumn<ProductionGridRow, 'rework_self_ton'>('rework_self_ton', '자체수정(t)', { integer: false }),
      createNumberKeyColumn<ProductionGridRow, 'rework_quality_ton'>('rework_quality_ton', '품질수정(t)', {
        integer: false,
      }),
      createNumberKeyColumn<ProductionGridRow, 'work_hours'>('work_hours', '작업시간(h)', { integer: false }),
      createNumberKeyColumn<ProductionGridRow, 'work_count'>('work_count', '작업횟수', { integer: true }),
      createTextKeyColumn<ProductionGridRow, 'note'>('note', '비고', { placeholder: '메모', minWidth: 200 }),
    ],
    [lineOptions, productOptions]
  )

  useEffect(() => {
    if (typeof window === 'undefined') return

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
  }, [monthYm, mode, gridRows, pasteText, activeFileName])

  const parseProductionInput = useMemo(
    () => buildProductionParser(`${monthYm}-01`, lines, products),
    [lines, monthYm, products]
  )

  const rowChecks = useMemo(() => {
    return gridRows.map((row) => {
      if (isBlankProductionRow(row)) {
        return { row, errors: [] as string[], warnings: [] as string[], blank: true }
      }

      const errors: string[] = []
      const warnings: string[] = []

      if (!row.line_code) errors.push('라인은 필수입니다.')
      if (row.plan_ton == null) errors.push('계획 수량을 입력해 주세요.')
      if (row.actual_ton == null) errors.push('실적 수량을 입력해 주세요.')
      if (row.work_hours == null) errors.push('작업시간을 입력해 주세요.')
      if (row.work_count == null) errors.push('작업횟수를 입력해 주세요.')

      if (row.plan_ton != null && row.actual_ton != null) {
        const rate = calcAchievementRate(row.actual_ton, row.plan_ton)
        if (rate != null && (rate < 40 || rate > 160)) warnings.push(`달성률 ${formatPercent(rate)}`)
      }

      if (row.actual_ton != null && row.work_hours != null) {
        const tph = calcTonPerHour(row.actual_ton, row.work_hours)
        if (tph != null && (tph < 5 || tph > 40)) warnings.push(`TPH ${formatTonPerHour(tph)}`)
      }

      return { row, errors, warnings, blank: false }
    })
  }, [gridRows])

  const activeRows = rowChecks.filter((item) => !item.blank)
  const validGridRows = activeRows.filter((item) => item.errors.length === 0).map((item) => item.row)
  const invalidGridRows = activeRows.filter((item) => item.errors.length > 0)

  const planTonTotal = validGridRows.reduce((sum, row) => sum + (row.plan_ton ?? 0), 0)
  const actualTonTotal = validGridRows.reduce((sum, row) => sum + (row.actual_ton ?? 0), 0)
  const workHoursTotal = validGridRows.reduce((sum, row) => sum + (row.work_hours ?? 0), 0)
  const workCountTotal = validGridRows.reduce((sum, row) => sum + (row.work_count ?? 0), 0)
  const tph = calcTonPerHour(actualTonTotal, workHoursTotal)
  const achievement = calcAchievementRate(actualTonTotal, planTonTotal)

  const saveRows = async (rowsToSave: ProductionGridRow[]) => {
    const payloads = rowsToSave
      .filter((row) => !isBlankProductionRow(row))
      .map((row) => normalizeProductionPayload(row, ymToDate(monthYm)))
      .filter((payload) => payload.line_code)

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

    const commonFields = {
      created_by: user?.id ?? null,
      updated_by: user?.id ?? null,
      entered_by_name: operatorName,
      entered_by_shift: operatorShift,
      updated_at: new Date().toISOString(),
    }

    const withProduct = payloads
      .filter((payload) => payload.product_name)
      .map((payload) => ({ ...payload, ...commonFields }))
    const withoutProduct = payloads
      .filter((payload) => !payload.product_name)
      .map((payload) => ({ ...payload, ...commonFields }))

    for (let index = 0; index < withProduct.length; index += batchSize) {
      const batch = withProduct.slice(index, index + batchSize)
      const { error } = await supabase
        .from(DB.tables.productionRecords)
        .upsert(batch, { onConflict: DB_CONFLICT_KEYS.productionRecords })

      if (error) throw error
      saved += batch.length
    }

    for (const row of withoutProduct) {
      const { data: existing, error: findError } = await supabase
        .from(DB.tables.productionRecords)
        .select('id')
        .eq('work_month', row.work_month)
        .eq('line_code', row.line_code)
        .is('product_name', null)
        .eq('shift', row.shift)
        .maybeSingle()

      if (findError) throw findError

      if (existing?.id) {
        const { error: updateError } = await supabase
          .from(DB.tables.productionRecords)
          .update(row)
          .eq('id', existing.id)

        if (updateError) throw updateError
      } else {
        const { error: insertError } = await supabase.from(DB.tables.productionRecords).insert(row)
        if (insertError) throw insertError
      }

      saved += 1
    }

    await queryClient.invalidateQueries({ queryKey: ['production-records'] })
    await queryClient.invalidateQueries({ queryKey: ['dashboard-kpi'] })
    window.localStorage.removeItem(DRAFT_KEY)
    setPreview(null)
    toast.success(`${saved}건을 저장했습니다.`)
  }

  const handleGridSave = async () => {
    if (invalidGridRows.length > 0) {
      toast.warning(`${invalidGridRows.length}건의 오류 행은 제외하고 저장합니다.`)
    }
    await saveRows(validGridRows)
  }

  const onSaveShortcut = useEffectEvent(() => {
    void handleGridSave()
  })

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
        event.preventDefault()
        onSaveShortcut()
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  const handleParsePaste = () => {
    const matrix = pasteText
      .replace(/\r/g, '')
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => (line.includes('\t') ? line.split('\t').map((cell) => cell.trim()) : line.split(',').map((cell) => cell.trim())))

    const result = parseProductionInput(matrix, '붙여넣기')
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
    const nextMonthYm = inferredMonth ? inferredMonth.slice(0, 7) : monthYm
    const sourceName = inferredMonth ? `${file.name} (${nextMonthYm})` : file.name
    const result = buildProductionParser(`${nextMonthYm}-01`, lines, products)(matrix, sourceName)

    setPreview(result)
    setActiveFileName(file.name)
    setMode('paste')

    if (inferredMonth) setMonthYm(nextMonthYm)

    toast.success(`파일에서 정상 ${result.validRows.length}건을 읽었습니다.`)
  }

  const previewRows = preview?.rows.slice(0, MAX_PREVIEW_ROWS) ?? []

  const applyPreviewToGrid = () => {
    if (!preview) return
    setGridRows([...preview.validRows.map((row) => ({ ...row, id: createInputId('production') })), createBlankProductionRow()])
    setMode('grid')
    toast.success('미리보기를 그리드로 옮겼습니다.')
  }

  const loadPreviousMonth = () => {
    if (!previousMonthRecords || previousMonthRecords.length === 0) {
      toast.info('지난달 데이터가 없습니다.')
      return
    }

    const copied = previousMonthRecords.map((record) => hydrateProductionRow(record))
    setGridRows(copied.length > 0 ? [...copied, createBlankProductionRow()] : [createBlankProductionRow()])
    setMode('grid')
    toast.success('지난달 데이터를 불러왔습니다.')
  }

  const gridMetrics = [
    {
      label: '입력 건수',
      value: `${activeRows.length}건`,
      hint: '빈 행 제외',
      tone: activeRows.length > 0 ? ('success' as const) : ('warning' as const),
    },
    {
      label: '계획 / 실적',
      value: `${planTonTotal.toLocaleString('ko-KR')} / ${actualTonTotal.toLocaleString('ko-KR')} t`,
      hint: '합계',
    },
    {
      label: '작업시간',
      value: `${workHoursTotal.toLocaleString('ko-KR')} h`,
      hint: `${workCountTotal.toLocaleString('ko-KR')}회`,
    },
    {
      label: 'TPH / 달성률',
      value: `${tph != null ? formatTonPerHour(tph) : '-'} / ${achievement != null ? formatPercent(achievement) : '-'}`,
      hint: '실시간 계산',
      tone: achievement != null && achievement >= 100 ? ('success' as const) : ('default' as const),
    },
  ] satisfies ComponentProps<typeof RouteHero>['metrics']

  return (
    <div className="space-y-6">
      <RouteHero
        eyebrow="생산 실적"
        title="월 생산 실적을 그리드로 입력"
        description="라인·제품·교대조별로 계획/실적/작업시간을 한 번에 입력하고, 붙여넣기와 파일 업로드, 단건 폼을 같은 화면에서 사용할 수 있습니다."
        metrics={gridMetrics}
        actions={
          <>
            <Button variant="outline" className="gap-2" onClick={loadPreviousMonth} disabled={loadingPrevious}>
              {loadingPrevious ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowDownToLine className="h-4 w-4" />}
              지난달 불러오기
            </Button>
            <Button variant="outline" className="gap-2" onClick={() => setGridRows([createBlankProductionRow()])}>
              <Plus className="h-4 w-4" />
              그리드 초기화
            </Button>
            <Button className="gap-2" onClick={handleGridSave}>
              <Save className="h-4 w-4" />
              현재 그리드 저장
            </Button>
          </>
        }
      />

      <Tabs value={mode} onValueChange={(value) => setMode(value as ProductionDraft['mode'])} className="space-y-4">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="grid">그리드 입력</TabsTrigger>
          <TabsTrigger value="paste">붙여넣기 / 업로드</TabsTrigger>
          <TabsTrigger value="single">단건 폼</TabsTrigger>
        </TabsList>

        <TabsContent value="grid" className="space-y-4">
          <Card className="overflow-hidden">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">엑셀처럼 바로 쓰는 표</CardTitle>
              <CardDescription>
                탭/엔터/방향키로 이동하고, 셀을 복사해 붙여넣을 수 있습니다. 입력한 값은 자동 저장되며 Ctrl+S로 즉시 저장할 수 있습니다.
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

          <RouteHero
            eyebrow="실시간 계산"
            title="저장 전 요약"
            description="지금 그리드의 합계와 계산값을 즉시 확인한 뒤 저장할 수 있습니다."
            metrics={gridMetrics}
            actions={
              <>
                <Button variant="outline" onClick={() => setGridRows([createBlankProductionRow()])}>
                  비우기
                </Button>
                <Button onClick={handleGridSave}>
                  <Save className="mr-2 h-4 w-4" />
                  저장
                </Button>
              </>
            }
          />
        </TabsContent>

        <TabsContent value="paste" className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">붙여넣기 / 파일 업로드</CardTitle>
              <CardDescription>
                Excel에서 복사한 범위를 바로 붙여넣거나 .xlsx / .csv 파일을 올리면 컬럼을 자동 매핑해 미리보기를 보여줍니다.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 lg:grid-cols-[1.3fr_0.7fr]">
                <div className="space-y-3">
                  <label className="text-sm font-medium">붙여넣기 영역</label>
                  <Textarea
                    value={pasteText}
                    onChange={(event) => setPasteText(event.target.value)}
                    placeholder="엑셀 범위를 그대로 붙여넣어 주세요."
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
                  <label className="text-sm font-medium">기준월</label>
                  <Input
                    type="month"
                    value={monthYm}
                    onChange={(event) => setMonthYm(event.target.value || currentMonthYm())}
                  />
                  <div className="rounded-xl border bg-muted/30 p-4 text-sm text-muted-foreground">
                    <p className="font-medium text-foreground">팁</p>
                    <ul className="mt-2 space-y-2">
                      <li>빈칸과 0은 자동으로 무시됩니다.</li>
                      <li>라인과 제품은 마스터 목록에서 자동으로 찾습니다.</li>
                      <li>오류가 있는 행은 빨간색으로 표시하고 정상 행만 저장할 수 있습니다.</li>
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
                      <AlertDescription>오류가 있는 행은 저장에서 제외됩니다. 내용을 확인한 뒤 다시 저장해 주세요.</AlertDescription>
                    </Alert>
                  )}

                  <div className="rounded-xl border overflow-hidden">
                    <Table>
                      <TableHeader className="bg-muted/40">
                        <TableRow>
                          <TableHead>행</TableHead>
                          <TableHead>라인</TableHead>
                          <TableHead>제품</TableHead>
                          <TableHead>교대</TableHead>
                          <TableHead className="text-right">계획</TableHead>
                          <TableHead className="text-right">실적</TableHead>
                          <TableHead className="text-right">작업시간</TableHead>
                          <TableHead>상태</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {previewRows.map((row) => {
                          const line = row.value?.line_code ? lineByCode.get(row.value.line_code) : null
                          const product = row.value?.product_name ? productByName.get(row.value.product_name) : null

                          return (
                            <TableRow key={row.rowIndex} className={row.errors.length > 0 ? 'bg-rose-500/10' : ''}>
                              <TableCell className="font-mono text-xs">{row.rowIndex}</TableCell>
                              <TableCell>{line ? line.code : row.value?.line_code ?? '-'}</TableCell>
                              <TableCell>{product ? product.name : row.value?.product_name ?? '-'}</TableCell>
                              <TableCell>{row.value?.shift ?? '-'}</TableCell>
                              <TableCell className="text-right">
                                {row.value?.plan_ton?.toLocaleString('ko-KR') ?? '-'}
                              </TableCell>
                              <TableCell className="text-right">
                                {row.value?.actual_ton?.toLocaleString('ko-KR') ?? '-'}
                              </TableCell>
                              <TableCell className="text-right">
                                {row.value?.work_hours?.toLocaleString('ko-KR') ?? '-'}
                              </TableCell>
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
          <ProductionRecordForm />
        </TabsContent>
      </Tabs>

      <Separator />
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-card p-4 text-sm text-muted-foreground">
        <p>Ctrl+S로 현재 상태를 바로 저장할 수 있고, 자동 저장도 함께 동작합니다.</p>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            if (typeof window !== 'undefined') {
              window.localStorage.removeItem(DRAFT_KEY)
            }
            setPreview(null)
            toast.success('임시저장을 삭제했습니다.')
          }}
        >
          <Trash2 className="mr-2 h-4 w-4" />
          임시저장 삭제
        </Button>
      </div>
    </div>
  )
}
