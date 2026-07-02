'use client'

import { useEffect, useEffectEvent, useMemo, useState } from 'react'
import type { GasRecord, GasSource } from '@/types'
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
import GasRecordForm from '@/components/forms/gas-record-form'
import { RouteHero } from '@/components/input/route-hero'
import {
  createNumberKeyColumn,
  createSelectKeyColumn,
  createTextKeyColumn,
} from '@/components/input/datasheet-columns'
import { useFurnaces } from '@/hooks/use-dashboard'
import { createClient } from '@/lib/supabase/client'
import { createBlankGasMonthlyRow, type GasMonthlyGridRow } from '@/lib/input/domain'
import { createInputId, currentMonthYm, extractMonthFromText, previousMonthYm, ymToDate } from '@/lib/input/common'
import { buildLookup, findHeaderIndex, findHeaderRow, getCell, readInputMatrix } from '@/lib/input/parsers'
import { ParsedSpreadsheet, ParsedSpreadsheetRow } from '@/lib/input/result'
import { calcGasUnit, formatGasUnit } from '@/lib/utils'

const DRAFT_KEY = 'furnace-input-gas-monthly-draft-v2'
const MAX_PREVIEW_ROWS = 20

type GasMonthlyPreviewRow = ParsedSpreadsheetRow<GasMonthlyGridRow>
type GasMonthlyDraft = {
  monthYm: string
  mode: 'grid' | 'paste' | 'single'
  gridRows: GasMonthlyGridRow[]
  pasteText: string
  activeFileName: string
}

function getDraftFallback(): GasMonthlyDraft {
  return {
    monthYm: currentMonthYm(),
    mode: 'grid',
    gridRows: [createBlankGasMonthlyRow()],
    pasteText: '',
    activeFileName: '붙여넣기',
  }
}

function readDraft(): GasMonthlyDraft {
  if (typeof window === 'undefined') return getDraftFallback()

  try {
    const raw = window.localStorage.getItem(DRAFT_KEY)
    if (!raw) return getDraftFallback()

    const draft = JSON.parse(raw) as Partial<GasMonthlyDraft>
    return {
      monthYm: draft.monthYm || currentMonthYm(),
      mode: draft.mode === 'grid' || draft.mode === 'paste' || draft.mode === 'single' ? draft.mode : 'grid',
      gridRows: Array.isArray(draft.gridRows) && draft.gridRows.length > 0 ? draft.gridRows : [createBlankGasMonthlyRow()],
      pasteText: draft.pasteText || '',
      activeFileName: draft.activeFileName || '붙여넣기',
    }
  } catch {
    return getDraftFallback()
  }
}

function parseGasSource(value: string): GasSource {
  const token = value.trim().toLowerCase()
  if (token.includes('bill') || token.includes('청구')) return 'bill'
  if (token.includes('self') || token.includes('자체')) return 'self'
  return 'meter'
}

function buildGasMonthlyParser(furnaces: ReturnType<typeof useFurnaces>['data']) {
  const furnaceLookup = buildLookup(furnaces, (furnace) => [furnace.id, furnace.code, furnace.name])

  return (matrix: string[][], sourceName: string): ParsedSpreadsheet<GasMonthlyGridRow> => {
    const rows: GasMonthlyPreviewRow[] = []
    const headerRowIndex = findHeaderRow(
      matrix,
      (row) => {
        const headers = row.map((cell) => cell.trim().toLowerCase())
        const hasFurnace = headers.some((token) => token.includes('호기') || token.includes('furnace') || token.includes('가열로'))
        const hasUsage = headers.some((token) => token.includes('가스') || token.includes('usage') || token.includes('검침'))
        return hasFurnace && hasUsage
      },
      6
    )

    const hasHeader = headerRowIndex >= 0
    const header = hasHeader ? matrix[headerRowIndex] ?? [] : []
    const columns = {
      furnace: hasHeader ? findHeaderIndex(header, ['호기', 'furnace', '가열로']) : 0,
      chargeWeight: hasHeader ? findHeaderIndex(header, ['장입', '입고', 'weight', 'kg']) : 1,
      gasUsage: hasHeader ? findHeaderIndex(header, ['가스', 'usage', '사용량']) : 2,
      source: hasHeader ? findHeaderIndex(header, ['구분', 'source', '검침']) : 3,
      orderNo: hasHeader ? findHeaderIndex(header, ['수주', 'order', 'lot']) : 4,
      note: hasHeader ? findHeaderIndex(header, ['비고', 'note']) : 5,
    }

    const startRow = hasHeader ? headerRowIndex + 1 : 0

    matrix.slice(startRow).forEach((raw, idx) => {
      const sourceRow = startRow + idx + 1
      const furnaceToken = getCell(raw, columns.furnace)
      const orderNo = getCell(raw, columns.orderNo)
      const note = getCell(raw, columns.note)
      const sourceToken = getCell(raw, columns.source)
      const chargeWeightText = getCell(raw, columns.chargeWeight)
      const gasUsageText = getCell(raw, columns.gasUsage)

      const hasMeaningfulInput =
        [furnaceToken, orderNo, note, sourceToken, chargeWeightText, gasUsageText].some((value) => value.trim() !== '')

      if (!hasMeaningfulInput) return

      const furnace = furnaceLookup.get(furnaceToken.trim()) ?? furnaceLookup.get(furnaceToken.toLowerCase()) ?? null
      const chargeWeightKg = chargeWeightText ? Number(String(chargeWeightText).replace(/,/g, '')) || null : null
      const gasUsage = gasUsageText ? Number(String(gasUsageText).replace(/,/g, '')) || null : null
      const source = parseGasSource(sourceToken)

      const errors: string[] = []
      const warnings: string[] = []

      if (!furnaceToken) errors.push('호기는 필수입니다.')
      if (furnaceToken && !furnace) errors.push(`호기 "${furnaceToken}"을 찾지 못했습니다.`)
      if (gasUsage == null) errors.push('가스사용량을 입력해 주세요.')
      if (chargeWeightKg == null || chargeWeightKg <= 0) warnings.push('장입량이 없으면 원단위가 계산되지 않습니다.')

      const value: GasMonthlyGridRow = {
        id: `${sourceName}-${sourceRow}`,
        furnace_id: furnace?.id ?? null,
        order_no: orderNo,
        charge_weight_kg: chargeWeightKg,
        gas_usage: gasUsage,
        source,
        note,
      }

      const gasUnit = chargeWeightKg != null && gasUsage != null ? calcGasUnit(gasUsage, chargeWeightKg) : null
      if (gasUnit != null && (gasUnit < 100 || gasUnit > 250)) {
        warnings.push(`원단위 ${formatGasUnit(gasUnit)}는 일반 범위를 벗어납니다.`)
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
      validRows: rows.filter((row) => row.value && row.errors.length === 0).map((row) => row.value as GasMonthlyGridRow),
      invalidRowCount: rows.filter((row) => row.errors.length > 0).length,
      warningRowCount: rows.filter((row) => row.warnings.length > 0).length,
    }
  }
}

function isBlankGasMonthlyRow(row: GasMonthlyGridRow) {
  return (
    !row.furnace_id &&
    !row.order_no.trim() &&
    !row.note.trim() &&
    row.charge_weight_kg == null &&
    row.gas_usage == null
  )
}

function normalizeGasMonthlyPayload(row: GasMonthlyGridRow, monthDate: string) {
  return {
    ym: monthDate,
    furnace_id: row.furnace_id,
    order_no: row.order_no.trim() || null,
    charge_weight_kg: row.charge_weight_kg ?? 0,
    gas_usage: row.gas_usage ?? 0,
    source: row.source,
    note: row.note.trim() || null,
  }
}

function hydrateGasMonthlyRow(record: GasRecord) {
  return {
    id: createInputId('gas-monthly-copy'),
    furnace_id: record.furnace_id ?? null,
    order_no: record.order_no ?? '',
    charge_weight_kg: record.charge_weight_kg ?? null,
    gas_usage: record.gas_usage ?? null,
    source: record.source ?? 'meter',
    note: record.note ?? '',
  } satisfies GasMonthlyGridRow
}

export default function GasMonthlyInputPage() {
  const supabase = useMemo(() => createClient(), [])
  const queryClient = useQueryClient()
  const { data: furnaces } = useFurnaces()
  const initialDraft = useMemo(() => readDraft(), [])
  const [monthYm, setMonthYm] = useState(() => initialDraft.monthYm)
  const [mode, setMode] = useState<GasMonthlyDraft['mode']>(() => initialDraft.mode)
  const [gridRows, setGridRows] = useState<GasMonthlyGridRow[]>(() => initialDraft.gridRows)
  const [pasteText, setPasteText] = useState(() => initialDraft.pasteText)
  const [preview, setPreview] = useState<ParsedSpreadsheet<GasMonthlyGridRow> | null>(null)
  const [activeFileName, setActiveFileName] = useState(() => initialDraft.activeFileName)

  const furnaceOptions = useMemo(
    () => (furnaces ?? []).map((furnace) => ({ label: `${furnace.code} · ${furnace.name}`, value: furnace.id })),
    [furnaces]
  )
  const furnaceById = useMemo(() => new Map((furnaces ?? []).map((furnace) => [furnace.id, furnace])), [furnaces])
  const previousMonth = previousMonthYm(monthYm)

  const { data: previousMonthRecords, isFetching: loadingPrevious } = useQuery({
    queryKey: ['input-gas-monthly-prev-month', previousMonth],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('gas_records')
        .select('*')
        .eq('ym', ymToDate(previousMonth))
        .order('created_at', { ascending: true })

      if (error) throw error
      return (data ?? []) as GasRecord[]
    },
  })

  const columns = useMemo(
    () => [
      createSelectKeyColumn<GasMonthlyGridRow, 'furnace_id'>('furnace_id', '호기 *', furnaceOptions, {
        placeholder: '호기 선택',
        minWidth: 180,
        basis: 180,
      }),
      createNumberKeyColumn<GasMonthlyGridRow, 'charge_weight_kg'>('charge_weight_kg', '장입량(kg)', { integer: true }),
      createNumberKeyColumn<GasMonthlyGridRow, 'gas_usage'>('gas_usage', '가스사용량(Nm3)', { integer: true }),
      createSelectKeyColumn<GasMonthlyGridRow, 'source'>(
        'source',
        '구분',
        [
          { label: '계량기', value: 'meter' },
          { label: '청구서', value: 'bill' },
          { label: '자체검침', value: 'self' },
        ],
        { placeholder: '구분 선택', minWidth: 140, basis: 140 }
      ),
      createTextKeyColumn<GasMonthlyGridRow, 'order_no'>('order_no', '수주번호', {
        placeholder: '선택',
        minWidth: 160,
      }),
      createTextKeyColumn<GasMonthlyGridRow, 'note'>('note', '비고', { placeholder: '메모', minWidth: 220 }),
    ],
    [furnaceOptions]
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

  const parser = useMemo(() => buildGasMonthlyParser(furnaces), [furnaces])

  const rowChecks = useMemo(() => {
    return gridRows.map((row) => {
      if (isBlankGasMonthlyRow(row)) {
        return { row, errors: [] as string[], warnings: [] as string[], blank: true }
      }

      const errors: string[] = []
      const warnings: string[] = []

      if (!row.furnace_id) errors.push('호기는 필수입니다.')
      if (row.gas_usage == null) errors.push('가스사용량을 입력해 주세요.')
      if (row.charge_weight_kg == null || row.charge_weight_kg <= 0) warnings.push('장입량이 없으면 원단위가 계산되지 않습니다.')

      const gasUnit = row.charge_weight_kg != null && row.gas_usage != null ? calcGasUnit(row.gas_usage, row.charge_weight_kg) : null
      if (gasUnit != null && (gasUnit < 100 || gasUnit > 250)) warnings.push(`원단위 ${formatGasUnit(gasUnit)}`)

      return { row, errors, warnings, blank: false, gasUnit }
    })
  }, [gridRows])

  const activeRows = rowChecks.filter((item) => !item.blank)
  const validRows = activeRows.filter((item) => item.errors.length === 0).map((item) => item.row)
  const invalidRows = activeRows.filter((item) => item.errors.length > 0)
  const totalGasUsage = validRows.reduce((sum, row) => sum + (row.gas_usage ?? 0), 0)
  const totalChargeWeight = validRows.reduce((sum, row) => sum + (row.charge_weight_kg ?? 0), 0)
  const gasUnits = validRows
    .map((row) => (row.charge_weight_kg != null && row.gas_usage != null ? calcGasUnit(row.gas_usage, row.charge_weight_kg) : null))
    .filter((value): value is number => value != null)
  const avgGasUnit = gasUnits.length > 0 ? gasUnits.reduce((sum, value) => sum + value, 0) / gasUnits.length : null
  const warningChargeRows = rowChecks.filter((item) => item.warnings.length > 0 && item.row.charge_weight_kg == null)

  const saveRows = async (rowsToSave: GasMonthlyGridRow[]) => {
    const payloads = rowsToSave
      .filter((row) => !isBlankGasMonthlyRow(row))
      .map((row) => normalizeGasMonthlyPayload(row, ymToDate(monthYm)))
      .filter((payload) => payload.furnace_id)

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
        entered_by_name: operatorName,
        entered_by_shift: operatorShift,
      }))

      const { error } = await supabase.from('gas_records').upsert(batch, { onConflict: 'ym,furnace_id' })
      if (error) throw error
      saved += batch.length
    }

    await queryClient.invalidateQueries({ queryKey: ['gas-records'] })
    await queryClient.invalidateQueries({ queryKey: ['dashboard-kpi'] })
    window.localStorage.removeItem(DRAFT_KEY)
    setPreview(null)
    toast.success(`${saved}건을 저장했습니다.`)
  }

  const handleGridSave = async () => {
    if (invalidRows.length > 0) {
      toast.warning(`${invalidRows.length}건의 오류 행은 제외하고 저장합니다.`)
    }
    await saveRows(validRows)
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
    const nextMonthYm = inferredMonth ? inferredMonth.slice(0, 7) : monthYm
    const sourceName = inferredMonth ? `${file.name} (${nextMonthYm})` : file.name
    const result = parser(matrix, sourceName)

    setPreview(result)
    setActiveFileName(file.name)
    setMode('paste')

    if (inferredMonth) setMonthYm(nextMonthYm)

    toast.success(`파일에서 정상 ${result.validRows.length}건을 읽었습니다.`)
  }

  const previewRows = preview?.rows.slice(0, MAX_PREVIEW_ROWS) ?? []

  const applyPreviewToGrid = () => {
    if (!preview) return
    setGridRows([...preview.validRows.map((row) => ({ ...row, id: createInputId('gas-monthly') })), createBlankGasMonthlyRow()])
    setMode('grid')
    toast.success('미리보기를 그리드로 옮겼습니다.')
  }

  const loadPreviousMonth = () => {
    if (!previousMonthRecords || previousMonthRecords.length === 0) {
      toast.info('지난달 데이터가 없습니다.')
      return
    }

    const copied = previousMonthRecords.map((record) => hydrateGasMonthlyRow(record))
    setGridRows(copied.length > 0 ? [...copied, createBlankGasMonthlyRow()] : [createBlankGasMonthlyRow()])
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
      label: '가스 사용량',
      value: `${totalGasUsage.toLocaleString('ko-KR')} Nm3`,
      hint: `${totalChargeWeight.toLocaleString('ko-KR')} kg`,
    },
    {
      label: '평균 원단위',
      value: avgGasUnit != null ? formatGasUnit(avgGasUnit) : '-',
      hint: '실시간 계산',
    },
    {
      label: '장입량 누락',
      value: `${warningChargeRows.length}건`,
      hint: '경고만 표시',
      tone: warningChargeRows.length > 0 ? ('warning' as const) : ('default' as const),
    },
  ]

  return (
    <div className="space-y-6">
      <RouteHero
        eyebrow="월 가스검침"
        title="호기별 월 가스검침 입력"
        description="호기, 장입량, 가스사용량, 수주번호를 한 번에 입력하고, 붙여넣기와 파일 업로드, 단건 폼을 같은 화면에서 사용할 수 있습니다."
        metrics={gridMetrics}
        actions={
          <>
            <Button variant="outline" className="gap-2" onClick={loadPreviousMonth} disabled={loadingPrevious}>
              {loadingPrevious ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowDownToLine className="h-4 w-4" />}
              지난달 불러오기
            </Button>
            <Button variant="outline" className="gap-2" onClick={() => setGridRows([createBlankGasMonthlyRow()])}>
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

      <Tabs value={mode} onValueChange={(value) => setMode(value as GasMonthlyDraft['mode'])} className="space-y-4">
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
                호기와 가스사용량을 빠르게 입력하고, 장입량이 비어 있으면 원단위 경고를 바로 볼 수 있습니다.
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
                  if (isBlankGasMonthlyRow(rowData)) return 'bg-muted/20'
                  return undefined
                }}
              />
            </CardContent>
          </Card>

          <RouteHero
            eyebrow="실시간 계산"
            title="저장 전 요약"
            description="지금 그리드의 합계와 원단위를 즉시 확인한 뒤 저장할 수 있습니다."
            metrics={gridMetrics}
            actions={
              <>
                <Button variant="outline" onClick={() => setGridRows([createBlankGasMonthlyRow()])}>
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
                      <li>장입량이 비어 있으면 원단위가 계산되지 않습니다.</li>
                      <li>호기는 마스터 목록에서 자동으로 찾습니다.</li>
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
                          <TableHead>호기</TableHead>
                          <TableHead className="text-right">장입량</TableHead>
                          <TableHead className="text-right">가스사용량</TableHead>
                          <TableHead>원단위</TableHead>
                          <TableHead>상태</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {previewRows.map((row) => {
                          const furnace = row.value?.furnace_id ? furnaceById.get(row.value.furnace_id) : null
                          const gasUnit = row.value?.charge_weight_kg != null && row.value?.gas_usage != null
                            ? calcGasUnit(row.value.gas_usage, row.value.charge_weight_kg)
                            : null

                          return (
                            <TableRow key={row.rowIndex} className={row.errors.length > 0 ? 'bg-rose-500/10' : ''}>
                              <TableCell className="font-mono text-xs">{row.rowIndex}</TableCell>
                              <TableCell>{furnace ? furnace.code : row.value?.furnace_id ?? '-'}</TableCell>
                              <TableCell className="text-right">
                                {row.value?.charge_weight_kg?.toLocaleString('ko-KR') ?? '-'}
                              </TableCell>
                              <TableCell className="text-right">
                                {row.value?.gas_usage?.toLocaleString('ko-KR') ?? '-'}
                              </TableCell>
                              <TableCell>{gasUnit != null ? formatGasUnit(gasUnit) : '-'}</TableCell>
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
          <GasRecordForm />
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
