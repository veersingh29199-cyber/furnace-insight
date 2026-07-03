'use client'

import { useMemo, useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { readImportSheets } from '@/lib/import/common'
import { parseDelimitedText } from '@/lib/input/common'
import { analyzeImportDocument } from '@/lib/import/detect'
import { buildDefaultImportMappingForSheet, buildImportPreview } from '@/lib/import/transform'
import { hydrateImportMappingFromTemplate, matchImportTemplate, buildTemplatePayload } from '@/lib/import/template'
import { IMPORT_DATASETS, getImportDatasetSpec } from '@/lib/import/specs'
import {
  saveGasCompanyMonthlyImports,
  saveGasDailyImports,
  saveGasMonthlyImports,
  saveProductionImports,
  type ImportSaveSummary,
} from '@/lib/import/persistence'
import { DB, DB_CONFLICT_KEYS } from '@/types/db'
import type { Furnace, Line, Product } from '@/types'
import type { ImportLayout } from '@/types'
import type {
  GasCompanyMonthlyImportRow,
  GasDailyImportRow,
  GasMonthlyImportRow,
  ImportAliasRecord,
  ImportDatasetKey,
  ImportMappingState,
  ImportPreviewRow,
  ImportSheetAnalysis,
  ImportTemplateRecord,
  ImportUploadRecord,
  ProductionImportRow,
} from '@/types/import'
import { calcAchievementRate, calcGasUnit, calcTonPerHour, formatGasUnit, formatPercent, formatTonPerHour } from '@/lib/utils'
import { AlertTriangle, BadgeCheck, CheckCircle2, Database, FileSpreadsheet, Loader2, Save, Settings2, Sparkles, Upload, Wand2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'
import { RouteHero } from '@/components/input/route-hero'
import { useFurnaces, useLines, useProducts } from '@/hooks/use-dashboard'
import type { ImportDatasetSpec } from '@/lib/import/specs'

type ImportPreviewRowAny =
  | ImportPreviewRow<GasDailyImportRow>
  | ImportPreviewRow<GasMonthlyImportRow>
  | ImportPreviewRow<ProductionImportRow>
  | ImportPreviewRow<GasCompanyMonthlyImportRow>

const DATASET_TABS: ImportDatasetKey[] = ['gas-daily', 'gas-monthly', 'production', 'gas-company-monthly']

function mergeMapping(base: ImportMappingState, patch: Partial<ImportMappingState>): ImportMappingState {
  return {
    ...base,
    ...patch,
    fieldMap: {
      ...base.fieldMap,
      ...(patch.fieldMap ?? {}),
    },
    staticValues: {
      ...base.staticValues,
      ...(patch.staticValues ?? {}),
    },
    options: {
      ...base.options,
      ...(patch.options ?? {}),
    },
  }
}

function datasetTone(datasetKey: ImportDatasetKey) {
  switch (datasetKey) {
    case 'gas-daily':
      return 'border-cyan-500/20 bg-cyan-500/10 text-cyan-700 dark:text-cyan-300'
    case 'gas-monthly':
      return 'border-amber-500/20 bg-amber-500/10 text-amber-700 dark:text-amber-300'
    case 'production':
      return 'border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
    case 'gas-company-monthly':
      return 'border-violet-500/20 bg-violet-500/10 text-violet-700 dark:text-violet-300'
    default:
      return 'border-border bg-muted/20 text-foreground'
  }
}

const LAYOUT_LABELS: Partial<Record<ImportLayout, string>> = {
  auto: '자동 감지',
  long: '단건 폼',
  'gas-daily-wide': '일일 그리드',
  'gas-monthly-wide': '월별 그리드',
  'production-wide': '생산 월별 그리드',
  'production-detail': '생산 상세',
  'company-wide': '전사 월별 그리드',
}

function layoutLabel(layout: ImportLayout | null | undefined) {
  if (!layout) return '미설정'
  return LAYOUT_LABELS[layout] ?? layout
}

function isWideLayout(layout: ImportLayout | null | undefined) {
  return (
    layout === 'gas-daily-wide' ||
    layout === 'gas-monthly-wide' ||
    layout === 'production-wide' ||
    layout === 'company-wide'
  )
}

function getVisibleFieldKeys(spec: ImportDatasetSpec, layout: ImportLayout) {
  const baseKeys = spec.fields.filter((field) => field.preview || field.required).map((field) => field.key)

  if (spec.key === 'production' && layout === 'production-detail') {
    return ['work_month', 'line_code', 'product_name', 'shift', 'actual_ton', 'work_count', 'order_no']
  }

  return baseKeys
}

function getPreviewColumns(spec: ImportDatasetSpec, layout: ImportLayout) {
  if (spec.key === 'production' && layout === 'production-detail') {
    return [
      { key: 'work_month', label: '작업월' },
      { key: 'line_code', label: '라인' },
      { key: 'product_name', label: '제품' },
      { key: 'shift', label: '교대' },
      { key: 'order_no', label: '수주번호' },
      { key: 'actual_ton', label: '실적', align: 'right' as const },
      { key: 'work_count', label: '작업횟수', align: 'right' as const },
      { key: 'status', label: '검증' },
    ]
  }

  return spec.previewColumns
}

function sheetSummary(sheet: ImportSheetAnalysis) {
  const label = sheet.datasetGuess ? IMPORT_DATASETS[sheet.datasetGuess].label : '미확인'
  return `${sheet.sheetName} · ${label} · ${sheet.confidence}%`
}

function sheetLabel(sheet: ImportSheetAnalysis) {
  const label = sheet.datasetGuess ? IMPORT_DATASETS[sheet.datasetGuess].label : '미확인'
  return `${sheet.sheetName} · ${label} · ${sheet.rowCount}행`
}

function renderStatus(row: ImportPreviewRowAny) {
  if (row.errors.length > 0) return <Badge variant="destructive">오류 {row.errors.length}</Badge>
  if (row.warnings.length > 0) return <Badge variant="secondary">경고 {row.warnings.length}</Badge>
  return <Badge variant="default">정상</Badge>
}

function renderPreviewValue(row: ImportPreviewRowAny, key: string) {
  const value = row.value as Record<string, unknown> | null
  if (!value) {
    return key === 'status' ? renderStatus(row) : '-'
  }

  if (key === 'status') return renderStatus(row)
  if (key === 'gas_unit') {
    const charge = Number(value.charge_weight_kg ?? 0)
    const gasUsage = Number(value.gas_usage ?? 0)
    return charge > 0 && gasUsage > 0 ? formatGasUnit(calcGasUnit(gasUsage, charge) ?? 0) : '-'
  }
  if (key === 'ton_per_hour') {
    const actual = Number(value.actual_ton ?? 0)
    const hours = Number(value.work_hours ?? 0)
    return actual > 0 && hours > 0 ? formatTonPerHour(calcTonPerHour(actual, hours) ?? 0) : '-'
  }
  if (key === 'achieve_pct') {
    const actual = Number(value.actual_ton ?? 0)
    const plan = Number(value.plan_ton ?? 0)
    return actual > 0 && plan > 0 ? formatPercent(calcAchievementRate(actual, plan) ?? 0) : '-'
  }

  const raw = value[key]
  if (raw == null || raw === '') return '-'
  if (typeof raw === 'number') return raw.toLocaleString('ko-KR')
  return String(raw)
}

export function ImportPanel() {
  const supabase = useMemo(() => createClient(), [])
  const queryClient = useQueryClient()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const { data: furnaces } = useFurnaces()
  const { data: lines } = useLines()
  const { data: products } = useProducts()

  const { data: aliases } = useQuery({
    queryKey: ['import-aliases'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from(DB.tables.importAliases)
        .select('*')
        .eq('active', true)
        .order('dataset_key')
        .order('canonical_field')
        .order('alias_text')

      if (error) throw error
      return (data ?? []) as ImportAliasRecord[]
    },
  })

  const { data: templates } = useQuery({
    queryKey: ['import-templates'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from(DB.tables.importTemplates)
        .select('*')
        .eq('active', true)
        .order('dataset_key')
        .order('name')

      if (error) throw error
      return (data ?? []) as ImportTemplateRecord[]
    },
  })

  const { data: recentUploads = [] } = useQuery({
    queryKey: ['import-uploads'],
    queryFn: async () => {
      try {
        const { data, error } = await supabase
          .from(DB.tables.importUploads)
          .select('*')
          .order('updated_at', { ascending: false })
          .limit(5)

        if (error) throw error
        return (data ?? []) as ImportUploadRecord[]
      } catch {
        return [] as ImportUploadRecord[]
      }
    },
  })

  const master = useMemo(
    () => ({
      furnaces: (furnaces ?? []).map((furnace: Furnace) => ({ code: furnace.code, name: furnace.name })),
      lines: (lines ?? []).map((line: Line) => ({ code: line.code, name: line.name })),
      products: (products ?? []).map((product: Product) => ({ name: product.name })),
      aliases: aliases ?? [],
    }),
    [aliases, furnaces, lines, products]
  )

  const [rawSheets, setRawSheets] = useState<Array<{ sheetName: string; matrix: string[][] }> | null>(null)
  const [fileName, setFileName] = useState('')
  const [uploadedFile, setUploadedFile] = useState<File | null>(null)
  const [selectedSheetName, setSelectedSheetName] = useState('')
  const [activeDatasetKey, setActiveDatasetKey] = useState<ImportDatasetKey>('gas-daily')
  const [mappingBySheet, setMappingBySheet] = useState<Record<string, ImportMappingState>>({})
  const [templateName, setTemplateName] = useState('')
  const [pasteSheetName, setPasteSheetName] = useState('')
  const [pasteText, setPasteText] = useState('')
  const [loadingFile, setLoadingFile] = useState(false)
  const [saving, setSaving] = useState(false)
  const [savingTemplate, setSavingTemplate] = useState(false)
  const [fileError, setFileError] = useState<string | null>(null)

  const analyses = useMemo(() => {
    if (!rawSheets) return []
    return analyzeImportDocument(rawSheets, { aliases: master.aliases })
  }, [master.aliases, rawSheets])

  const currentSheet = useMemo(() => {
    if (!analyses.length) return null
    if (selectedSheetName) {
      return analyses.find((sheet) => sheet.sheetName === selectedSheetName) ?? analyses[0] ?? null
    }
    return analyses[0] ?? null
  }, [analyses, selectedSheetName])

  const currentTemplate = useMemo(() => {
    if (!currentSheet || !templates) return null
    return matchImportTemplate(templates, currentSheet)
  }, [currentSheet, templates])

  const currentDatasetKey = activeDatasetKey
  const currentSpec = getImportDatasetSpec(currentDatasetKey)

  const currentMapping = useMemo<ImportMappingState | null>(() => {
    if (!currentSheet) return null
    return (
      mappingBySheet[currentSheet.sheetName] ??
      (currentTemplate
        ? hydrateImportMappingFromTemplate(currentTemplate, currentSheet)
        : buildDefaultImportMappingForSheet(currentSheet, currentSheet.datasetGuess ?? activeDatasetKey))
    )
  }, [activeDatasetKey, currentSheet, currentTemplate, mappingBySheet])

  const currentPreview = useMemo(() => {
    if (!currentSheet || !currentMapping) return null
    return buildImportPreview(currentSheet, currentMapping, {
      datasetKey: currentMapping.datasetKey,
      layout: currentMapping.layout,
      signature: currentSheet.templateSignature,
      columns: currentSheet.columns,
      bindings: {} as never,
      master,
    })
  }, [currentMapping, currentSheet, master])

  const sourceOptions = useMemo(
    () =>
      currentSheet
        ? currentSheet.columns.map((column) => ({
            key: column.key,
            label: column.label,
            description: column.samples.length > 0 ? column.samples.slice(0, 2).join(' / ') : undefined,
          }))
        : [],
    [currentSheet]
  )

  const availableSheetOptions = useMemo(
    () =>
      analyses.map((sheet) => ({
        value: sheet.sheetName,
        label: sheetLabel(sheet),
      })),
    [analyses]
  )

  const previewRows = (currentPreview?.rows ?? []).slice(0, 24) as ImportPreviewRowAny[]
  const previewSummary = currentPreview
    ? `${currentPreview.validRows.length}건 정상 / ${currentPreview.invalidRowCount}건 오류 / ${currentPreview.warningRowCount}건 경고`
    : ''

  const metrics = [
    { label: '업로드 파일', value: fileName || '대기 중', hint: '엑셀/CSV 업로드' },
    { label: '감지 시트', value: currentSheet?.sheetName ?? '없음', hint: currentSheet ? `${currentSheet.confidence}%` : '파일을 올려주세요' },
    { label: '정상행', value: currentPreview?.validRows.length ?? 0, tone: 'success' as const },
    { label: '오류행', value: currentPreview?.invalidRowCount ?? 0, tone: 'warning' as const },
  ]

  const handleFile = async (file: File | null) => {
    if (!file) return
    setLoadingFile(true)
    setFileError(null)

    try {
      const sheets = await readImportSheets(file)
      const detected = analyzeImportDocument(sheets, { aliases: master.aliases })
      const best = [...detected].sort((a, b) => b.confidence - a.confidence)[0] ?? detected[0] ?? null

      setRawSheets(sheets)
      setFileName(file.name)
      setUploadedFile(file)
      setMappingBySheet({})
      setSelectedSheetName(best?.sheetName ?? '')
      setActiveDatasetKey(best?.datasetGuess ?? 'gas-daily')
      setTemplateName(file.name.replace(/\.[^.]+$/, ''))
    } catch (error) {
      setUploadedFile(null)
      setFileError(error instanceof Error ? error.message : '파일을 읽지 못했습니다.')
      toast.error('파일을 불러오지 못했습니다.')
    } finally {
      setLoadingFile(false)
    }
  }

  const handlePasteImport = () => {
    const text = pasteText.trim()
    if (!text) {
      toast.error('붙여넣기할 내용을 입력해주세요.')
      return
    }

    setLoadingFile(true)
    setFileError(null)

    try {
      const sheetName = pasteSheetName.trim() || '붙여넣기'
      const sheets = [{ sheetName, matrix: parseDelimitedText(text) }]
      const detected = analyzeImportDocument(sheets, { aliases: master.aliases })
      const best = [...detected].sort((a, b) => b.confidence - a.confidence)[0] ?? detected[0] ?? null

      setRawSheets(sheets)
      setFileName(sheetName)
      setUploadedFile(null)
      setMappingBySheet({})
      setSelectedSheetName(best?.sheetName ?? sheetName)
      setActiveDatasetKey(best?.datasetGuess ?? 'gas-daily')
      setTemplateName(sheetName.replace(/\.[^.]+$/, ''))
      toast.success('붙여넣기 내용을 불러왔습니다.')
    } catch (error) {
      setFileError(error instanceof Error ? error.message : '붙여넣기 내용을 읽지 못했습니다.')
      toast.error('붙여넣기 내용을 읽지 못했습니다.')
    } finally {
      setLoadingFile(false)
    }
  }

  const updateCurrentMapping = (patch: Partial<ImportMappingState>) => {
    if (!currentSheet) return
    setMappingBySheet((prev) => {
      const base =
        prev[currentSheet.sheetName] ??
        (currentMapping
          ? currentMapping
          : buildDefaultImportMappingForSheet(currentSheet, currentSheet.datasetGuess ?? activeDatasetKey))
      return {
        ...prev,
        [currentSheet.sheetName]: mergeMapping(base, patch),
      }
    })
  }

  const saveTemplate = async () => {
    if (!currentSheet || !currentMapping) return
    const name = templateName.trim()
    if (!name) {
      toast.error('템플릿 이름을 입력해주세요.')
      return
    }

    setSavingTemplate(true)
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser()
      const payload = buildTemplatePayload(name, currentSheet, currentMapping, user?.id ?? null)
      const { error } = await supabase
        .from(DB.tables.importTemplates)
        .upsert(payload, { onConflict: DB_CONFLICT_KEYS.importTemplates, ignoreDuplicates: false })

      if (error) throw error
      await queryClient.invalidateQueries({ queryKey: ['import-templates'] })
      toast.success('템플릿을 저장했습니다.')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '템플릿 저장에 실패했습니다.')
    } finally {
      setSavingTemplate(false)
    }
  }

  const saveCurrentImport = async () => {
    if (!currentSheet || !currentPreview) return
    if (currentPreview.validRows.length === 0) {
      toast.error('저장할 정상 행이 없습니다.')
      return
    }

    const mapping = currentMapping
    if (!mapping) return

    setSaving(true)
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser()
      const enteredByName = typeof window !== 'undefined' ? window.localStorage.getItem('furnace_operator_name') || null : null
      const enteredByShift = typeof window !== 'undefined' ? window.localStorage.getItem('furnace_operator_shift') || null : null

      let summary
      if (mapping.datasetKey === 'gas-daily') {
        summary = await saveGasDailyImports(supabase, currentPreview.validRows as GasDailyImportRow[], {
          userId: user?.id ?? null,
          enteredByName,
          enteredByShift,
        })
      } else if (mapping.datasetKey === 'gas-monthly') {
        summary = await saveGasMonthlyImports(supabase, currentPreview.validRows as GasMonthlyImportRow[], {
          userId: user?.id ?? null,
          enteredByName,
          enteredByShift,
        })
      } else if (mapping.datasetKey === 'production') {
        summary = await saveProductionImports(supabase, currentPreview.validRows as ProductionImportRow[], {
          userId: user?.id ?? null,
          enteredByName,
          enteredByShift,
        })
      } else {
        summary = await saveGasCompanyMonthlyImports(supabase, currentPreview.validRows as GasCompanyMonthlyImportRow[], {
          userId: user?.id ?? null,
        })
      }

      await queryClient.invalidateQueries({ queryKey: ['dashboard-kpi'] })
      await queryClient.invalidateQueries({ queryKey: ['gas-records'] })
      await queryClient.invalidateQueries({ queryKey: ['production-records'] })
      await queryClient.invalidateQueries({ queryKey: ['gas-daily-all'] })
      toast.success(`저장 완료: ${summary.saved}건 / 실패 ${summary.failed}건`)
      if (summary.errors.length > 0) {
        summary.errors.slice(0, 3).forEach((error) => toast.error(error.message))
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '저장에 실패했습니다.')
    } finally {
      setSaving(false)
    }
  }

  const saveCurrentImportWithServerArchive = async () => {
    if (!uploadedFile || !currentSheet || !currentPreview || !currentMapping) {
      await saveCurrentImport()
      return
    }

    if (currentPreview.validRows.length === 0) {
      toast.error('저장할 정상 행이 없습니다.')
      return
    }

    const enteredByName = typeof window !== 'undefined' ? window.localStorage.getItem('furnace_operator_name') || null : null
    const enteredByShift = typeof window !== 'undefined' ? window.localStorage.getItem('furnace_operator_shift') || null : null

    setSaving(true)
    try {
      const formData = new FormData()
      formData.append('file', uploadedFile)
      formData.append('sheetName', currentSheet.sheetName)
      formData.append('templateName', templateName.trim())
      formData.append('mapping', JSON.stringify(currentMapping))
      formData.append('enteredByName', enteredByName ?? '')
      formData.append('enteredByShift', enteredByShift ?? '')

      const response = await fetch('/api/import/ingest', {
        method: 'POST',
        body: formData,
      })

      const payload = (await response.json().catch(() => null)) as
        | { error?: string; summary?: ImportSaveSummary; upload?: ImportUploadRecord }
        | null

      if (!response.ok) {
        throw new Error(payload?.error ?? '서버 저장에 실패했습니다.')
      }

      const summary = payload?.summary ?? {
        total: currentPreview.validRows.length,
        saved: currentPreview.validRows.length,
        failed: 0,
        errors: [],
      }

      if (payload?.upload) {
        queryClient.setQueryData<ImportUploadRecord[]>(['import-uploads'], (current = []) => {
          const next = [payload.upload!, ...current.filter((item) => item.id !== payload.upload!.id)]
          return next.slice(0, 5)
        })
      }

      await queryClient.invalidateQueries({ queryKey: ['dashboard-kpi'] })
      await queryClient.invalidateQueries({ queryKey: ['gas-records'] })
      await queryClient.invalidateQueries({ queryKey: ['production-records'] })
      await queryClient.invalidateQueries({ queryKey: ['gas-daily-all'] })
      if (Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)) {
        await queryClient.invalidateQueries({ queryKey: ['import-uploads'] })
      }

      toast.success(`저장 완료: ${summary.saved}건 / 실패 ${summary.failed}건`)
      if (summary.errors.length > 0) {
        summary.errors.slice(0, 3).forEach((error) => toast.error(error.message))
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '서버 저장에 실패했습니다. 기존 방식으로 다시 시도합니다.')
      await saveCurrentImport()
    } finally {
      setSaving(false)
    }
  }

  const renderFieldRow = (fieldKey: string) => {
    if (!currentMapping || !currentSheet) return null
    const field = currentSpec.fields.find((item) => item.key === fieldKey)
    if (!field) return null

    const selectedSource = currentMapping.fieldMap[fieldKey as keyof typeof currentMapping.fieldMap] ?? 'manual'
    const staticValue = currentMapping.staticValues[fieldKey as keyof typeof currentMapping.staticValues] ?? ''

    return (
      <div key={fieldKey} className="rounded-xl border bg-background p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <p className="text-sm font-medium">{field.label}</p>
              {field.required && <Badge variant="destructive">필수</Badge>}
            </div>
            {field.help && <p className="text-xs text-muted-foreground">{field.help}</p>}
          </div>
          <Badge variant="outline">{field.kind}</Badge>
        </div>

        <div className="mt-3 grid gap-3 md:grid-cols-2">
          <div className="space-y-2">
            <Label>소스 열</Label>
            <Select
              value={String(selectedSource)}
              onValueChange={(value) => updateCurrentMapping({ fieldMap: { [fieldKey]: value && value !== 'manual' ? value : null } as never })}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="직접 입력" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="manual">직접 입력</SelectItem>
                {sourceOptions.map((option) => (
                  <SelectItem key={option.key} value={option.key}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>{field.kind === 'enum' ? '고정값' : '기본값'}</Label>
            {field.kind === 'enum' && field.options ? (
              <Select
                value={String(staticValue || '__blank__')}
                onValueChange={(value) => updateCurrentMapping({ staticValues: { [fieldKey]: value === '__blank__' ? null : value } as never })}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="선택" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__blank__">비움</SelectItem>
                  {field.options.map((option) => (
                    <SelectItem key={option} value={option}>
                      {option}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <Input
                value={String(staticValue ?? '')}
                inputMode={field.kind === 'number' ? 'decimal' : 'text'}
                onChange={(event) => updateCurrentMapping({ staticValues: { [fieldKey]: event.target.value } as never })}
                placeholder={field.help ?? '비워두면 자동 처리'}
              />
            )}
          </div>
        </div>
      </div>
    )
  }

  const renderWideControls = () => {
    if (!currentMapping || !currentSheet) return null

    return (
      <div className="grid gap-3 rounded-xl border bg-muted/20 p-4 md:grid-cols-3">
        <div className="space-y-2">
          <Label>행 기준 열</Label>
          <Select
            value={String(currentMapping.options.rowLabelSourceKey ?? 'manual')}
            onValueChange={(value) => updateCurrentMapping({ options: { rowLabelSourceKey: value && value !== 'manual' ? value : null } as never })}
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder="자동" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="manual">자동</SelectItem>
              {sourceOptions.map((option) => (
                <SelectItem key={option.key} value={option.key}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label>기준 월(YYYY-MM)</Label>
          <Input
            value={String(currentMapping.options.baseYm ?? '')}
            onChange={(event) => updateCurrentMapping({ options: { baseYm: event.target.value } as never })}
            placeholder="2026-07"
          />
        </div>

        <div className="space-y-2">
          <Label>장입량 열</Label>
          <Select
            value={String(currentMapping.options.chargeWeightSourceKey ?? 'manual')}
            onValueChange={(value) => updateCurrentMapping({ options: { chargeWeightSourceKey: value && value !== 'manual' ? value : null } as never })}
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder="없음" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="manual">없음</SelectItem>
              {sourceOptions.map((option) => (
                <SelectItem key={option.key} value={option.key}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
    )
  }

  if (loadingFile && !rawSheets) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-36 w-full rounded-2xl" />
        <Skeleton className="h-64 w-full rounded-2xl" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <RouteHero
        eyebrow="스마트 파일 임포터"
        title="엑셀 양식이 제각각이어도 바로 넣는 업로드 화면"
        description="업로드 → 자동 감지 → 매핑 확인 → 미리보기 → 저장 순서로, 다른 양식의 엑셀/CSV도 표준 테이블로 바꿔 적재합니다."
        metrics={metrics}
        actions={
          <>
            <Button variant="outline" onClick={() => fileInputRef.current?.click()} disabled={loadingFile}>
              {loadingFile ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
              파일 업로드
            </Button>
            <Button variant="secondary" onClick={() => fileInputRef.current?.click()} disabled={loadingFile}>
              <FileSpreadsheet className="mr-2 h-4 w-4" />
              다시 불러오기
            </Button>
          </>
        }
      />

      <input ref={fileInputRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={(event) => handleFile(event.target.files?.[0] ?? null)} />

      {fileError && (
        <Alert className="border-destructive/30 bg-destructive/5">
          <AlertTriangle className="h-4 w-4 text-destructive" />
          <AlertDescription className="text-sm">{fileError}</AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader className="space-y-3">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <CardTitle className="text-base">업로드된 파일</CardTitle>
              <CardDescription>
                {fileName ? `${fileName} · ${analyses.length}개 시트 감지` : '파일을 업로드하면 자동 감지를 시작합니다.'}
              </CardDescription>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline" className={datasetTone(currentDatasetKey)}>
                {currentSpec.label}
              </Badge>
              {currentSheet && (
                <Badge variant="secondary" className="gap-1">
                  <BadgeCheck className="h-3 w-3" />
                  {currentSheet.confidence}% 감지
                </Badge>
              )}
              {currentTemplate && (
                <Badge variant="default" className="gap-1">
                  <Sparkles className="h-3 w-3" />
                  템플릿 적용
                </Badge>
              )}
            </div>
          </div>

          {availableSheetOptions.length > 1 && (
            <div className="space-y-2">
              <Label>시트 선택</Label>
              <Select
                value={selectedSheetName}
                onValueChange={(value) => {
                  const nextSheetName = value ?? ''
                  setSelectedSheetName(nextSheetName)
                  const nextSheet = analyses.find((sheet) => sheet.sheetName === nextSheetName)
                  if (nextSheet?.datasetGuess) {
                    setActiveDatasetKey(nextSheet.datasetGuess)
                  }
                }}
              >
                <SelectTrigger className="w-full md:max-w-2xl">
                  <SelectValue placeholder="시트를 선택하세요" />
                </SelectTrigger>
                <SelectContent>
                  {availableSheetOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </CardHeader>
        <CardContent className="space-y-4">
          {currentSheet ? (
            <Alert className="border-primary/20 bg-primary/5">
              <BadgeCheck className="h-4 w-4 text-primary" />
              <AlertDescription className="text-sm">
                {sheetSummary(currentSheet)}
                {currentTemplate ? ` · 템플릿 "${currentTemplate.name}"이 자동 적용되었습니다.` : ' · 템플릿이 없으면 기본 매핑으로 시작합니다.'}
              </AlertDescription>
            </Alert>
          ) : (
            <Alert className="border-dashed">
              <FileSpreadsheet className="h-4 w-4" />
              <AlertDescription className="text-sm">아직 업로드된 파일이 없습니다. 엑셀 또는 CSV를 올려주세요.</AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="space-y-2">
          <CardTitle className="text-base">붙여넣기로 불러오기</CardTitle>
          <CardDescription>
            엑셀에서 표 범위를 그대로 복사해 붙여넣으면 됩니다. 탭과 줄바꿈을 자동으로 읽어서 표준 형식으로 분석합니다.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 md:grid-cols-[180px_minmax(0,1fr)]">
            <div className="space-y-2">
              <Label>시트명</Label>
              <Input
                value={pasteSheetName}
                onChange={(event) => setPasteSheetName(event.target.value)}
                placeholder="예: 2607월"
              />
            </div>
            <div className="space-y-2">
              <Label>붙여넣기 내용</Label>
              <Textarea
                value={pasteText}
                onChange={(event) => setPasteText(event.target.value)}
                placeholder="엑셀에서 표 범위를 그대로 붙여넣으세요"
                rows={6}
              />
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs text-muted-foreground">
              파일 업로드가 어려운 환경에서도 이 영역에 붙여넣기만 하면 자동 감지를 시작합니다.
            </p>
            <Button onClick={handlePasteImport} disabled={loadingFile || pasteText.trim().length === 0}>
              <Wand2 className="mr-2 h-4 w-4" />
              붙여넣기 분석
            </Button>
          </div>
        </CardContent>
      </Card>

      <Tabs value={currentDatasetKey} onValueChange={(value) => setActiveDatasetKey(value as ImportDatasetKey)}>
        <TabsList className="grid w-full grid-cols-2 gap-2 lg:grid-cols-4">
          {DATASET_TABS.map((datasetKey) => (
            <TabsTrigger key={datasetKey} value={datasetKey}>
              {IMPORT_DATASETS[datasetKey].label}
            </TabsTrigger>
          ))}
        </TabsList>

        {DATASET_TABS.map((datasetKey) => {
          const spec = getImportDatasetSpec(datasetKey)
          const isCurrent = currentDatasetKey === datasetKey
          const selectedLayout = currentMapping?.layout ?? spec.defaultLayout
          const fieldKeys = getVisibleFieldKeys(spec, selectedLayout)
          const previewColumns = getPreviewColumns(spec, selectedLayout)
          const isWide = isWideLayout(selectedLayout)

          return (
            <TabsContent key={datasetKey} value={datasetKey} className="mt-4 space-y-4">
              <Card>
                <CardHeader className="space-y-3">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                    <div>
                      <CardTitle className="text-base">{spec.label} 매핑</CardTitle>
                      <CardDescription>{spec.description}</CardDescription>
                    </div>
                    <Badge variant="outline" className={datasetTone(datasetKey)}>
                      {layoutLabel(selectedLayout)}
                    </Badge>
                  </div>

                  <div className="grid gap-3 md:grid-cols-3">
                    <div className="space-y-2">
                      <Label>레이아웃</Label>
                      <Select
                        value={selectedLayout}
                        onValueChange={(value) =>
                          updateCurrentMapping({ layout: (value ?? spec.defaultLayout) as ImportMappingState['layout'] })
                        }
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="레이아웃 선택" />
                        </SelectTrigger>
                        <SelectContent>
                          {spec.supportedLayouts.map((layout) => (
                            <SelectItem key={layout} value={layout}>
                              {layoutLabel(layout)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label>시트명</Label>
                      <Input value={currentSheet?.sheetName ?? ''} readOnly />
                    </div>

                    <div className="space-y-2">
                      <Label>템플릿 이름</Label>
                      <Input value={templateName} onChange={(event) => setTemplateName(event.target.value)} placeholder="예: 2026-07 생산실적" />
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  {isWide && renderWideControls()}

                  <Separator />

                  {spec.key === 'production' && selectedLayout === 'production-detail' && (
                    <Alert className="border-emerald-500/20 bg-emerald-500/5">
                      <Sparkles className="h-4 w-4 text-emerald-600" />
                      <AlertDescription className="text-sm">
                        상세 원장 파일은 계획·황지·COGGING·작업시간을 0으로 자동 저장하고, 생산중량(양품)과 실적 수량을 집계합니다.
                      </AlertDescription>
                    </Alert>
                  )}

                  <div className="space-y-3">
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <p className="text-sm font-medium">필드 매핑</p>
                        <p className="text-xs text-muted-foreground">소스 열을 고르거나 고정값을 넣어서 표준 테이블 형태로 맞춥니다.</p>
                      </div>
                      <Badge variant="secondary" className="gap-1">
                        <Settings2 className="h-3 w-3" />
                        자동 + 수동
                      </Badge>
                    </div>

                    <div className="space-y-3">
                      {fieldKeys.map((fieldKey) => renderFieldRow(fieldKey))}
                    </div>
                  </div>

                  {isCurrent && !isWide && sourceOptions.length > 0 && (
                    <div className="rounded-xl border bg-muted/20 p-3">
                      <p className="text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground">소스 열</p>
                      <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                        {sourceOptions.map((option) => (
                          <div key={option.key} className="rounded-lg border bg-background p-2">
                            <p className="text-sm font-medium">{option.label}</p>
                            {option.description && <p className="text-xs text-muted-foreground">{option.description}</p>}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">미리보기 및 검증</CardTitle>
                  <CardDescription>{currentPreview ? previewSummary : '파일과 매핑이 준비되면 미리보기가 표시됩니다.'}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {!currentPreview ? (
                    <Alert>
                      <Database className="h-4 w-4" />
                      <AlertDescription className="text-sm">아직 미리보기가 없습니다. 파일을 업로드하고 매핑을 확인해주세요.</AlertDescription>
                    </Alert>
                  ) : (
                    <>
                      <div className="grid gap-3 md:grid-cols-4">
                        <div className="rounded-xl border p-4">
                          <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">정상</p>
                          <div className="mt-2 text-lg font-semibold">{currentPreview.validRows.length}</div>
                        </div>
                        <div className="rounded-xl border p-4">
                          <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">오류</p>
                          <div className="mt-2 text-lg font-semibold">{currentPreview.invalidRowCount}</div>
                        </div>
                        <div className="rounded-xl border p-4">
                          <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">경고</p>
                          <div className="mt-2 text-lg font-semibold">{currentPreview.warningRowCount}</div>
                        </div>
                        <div className="rounded-xl border p-4">
                          <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">레이아웃</p>
                          <div className="mt-2 text-lg font-semibold">{layoutLabel(currentPreview.layout)}</div>
                        </div>
                      </div>

                      <div className="overflow-hidden rounded-xl border">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead className="w-16">#</TableHead>
                              {previewColumns.map((column) => (
                                <TableHead key={column.key} className={column.align === 'right' ? 'text-right' : ''}>
                                  {column.label}
                                </TableHead>
                              ))}
                              <TableHead>메시지</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {previewRows.map((row, index) => (
                              <TableRow
                                key={`${currentPreview.sheetName}-${row.rowIndex}-${index}`}
                                className={row.errors.length > 0 ? 'bg-destructive/5' : row.warnings.length > 0 ? 'bg-amber-500/5' : ''}
                              >
                                <TableCell className="text-xs text-muted-foreground">{row.rowIndex}</TableCell>
                                {previewColumns.map((column) => (
                                  <TableCell
                                    key={column.key}
                                    className={column.align === 'right' ? 'text-right tabular-nums' : ''}
                                  >
                                    {renderPreviewValue(row, column.key)}
                                  </TableCell>
                                ))}
                                <TableCell>
                                  <div className="space-y-1">
                                    {row.errors.length > 0 && (
                                      <div className="flex flex-wrap gap-1">
                                        {row.errors.map((error: string, errorIndex: number) => (
                                          <Badge key={`${row.rowIndex}-error-${errorIndex}`} variant="destructive" className="text-[10px]">
                                            {error}
                                          </Badge>
                                        ))}
                                      </div>
                                    )}
                                    {row.warnings.length > 0 && (
                                      <div className="flex flex-wrap gap-1">
                                        {row.warnings.map((warning: string, warningIndex: number) => (
                                          <Badge key={`${row.rowIndex}-warning-${warningIndex}`} variant="secondary" className="text-[10px]">
                                            {warning}
                                          </Badge>
                                        ))}
                                      </div>
                                    )}
                                    {row.errors.length === 0 && row.warnings.length === 0 && (
                                      <Badge variant="outline" className="text-[10px]">
                                        정상
                                      </Badge>
                                    )}
                                  </div>
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>

                      {currentPreview.rows.length > previewRows.length && (
                        <p className="text-xs text-muted-foreground">... {currentPreview.rows.length - previewRows.length}건 더 있습니다.</p>
                      )}
                    </>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="space-y-3">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                    <div>
                      <CardTitle className="text-base">저장 및 템플릿</CardTitle>
                      <CardDescription>검증이 끝난 행만 upsert하고, 현재 매핑은 템플릿으로 저장할 수 있습니다.</CardDescription>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Button variant="outline" onClick={saveTemplate} disabled={!currentSheet || !currentMapping || savingTemplate}>
                        {savingTemplate ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Wand2 className="mr-2 h-4 w-4" />}
                        템플릿 저장
                      </Button>
                      <Button onClick={saveCurrentImportWithServerArchive} disabled={!currentPreview || currentPreview.validRows.length === 0 || saving}>
                        {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                        저장
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid gap-3 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label>현재 파일</Label>
                      <Input value={fileName} readOnly placeholder="업로드된 파일 없음" />
                    </div>
                    <div className="space-y-2">
                      <Label>현재 시트</Label>
                      <Input value={currentSheet?.sheetName ?? ''} readOnly placeholder="시트를 선택하세요" />
                    </div>
                  </div>

                  {currentPreview && (
                    <Alert
                      className={
                        currentPreview.invalidRowCount > 0
                          ? 'border-amber-500/30 bg-amber-500/5'
                          : 'border-emerald-500/30 bg-emerald-500/5'
                      }
                    >
                      {currentPreview.invalidRowCount > 0 ? (
                        <AlertTriangle className="h-4 w-4 text-amber-500" />
                      ) : (
                        <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                      )}
                      <AlertDescription className="text-sm">
                        {currentPreview.validRows.length}건은 저장 가능하고 {currentPreview.invalidRowCount}건은 오류로 제외됩니다.
                      </AlertDescription>
                    </Alert>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          )
        })}
      </Tabs>

      <Card>
        <CardHeader className="space-y-2">
          <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <CardTitle className="text-base">최근 서버 업로드</CardTitle>
              <CardDescription>
                원본 파일은 서버 저장소에 남고, 같은 파일명과 시트로 다시 올리면 최신 값으로 덮어씁니다.
              </CardDescription>
            </div>
            <Badge variant="outline" className="gap-1">
              <Upload className="h-3 w-3" />
              최신 5건
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {recentUploads.length === 0 ? (
            <Alert>
              <Database className="h-4 w-4" />
              <AlertDescription className="text-sm">아직 서버에 저장된 업로드가 없습니다.</AlertDescription>
            </Alert>
          ) : (
            <div className="overflow-hidden rounded-xl border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>파일</TableHead>
                    <TableHead>시트</TableHead>
                    <TableHead>상태</TableHead>
                    <TableHead className="text-right">저장</TableHead>
                    <TableHead className="text-right">실패</TableHead>
                    <TableHead>갱신</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {recentUploads.map((upload) => (
                    <TableRow key={upload.id}>
                      <TableCell>
                        <div className="space-y-1">
                          <p className="font-medium">{upload.file_name}</p>
                          <p className="text-xs text-muted-foreground">{upload.dataset_key}</p>
                        </div>
                      </TableCell>
                      <TableCell>{upload.sheet_name}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{upload.layout}</Badge>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{upload.saved_count}</TableCell>
                      <TableCell className="text-right tabular-nums">{upload.failed_count}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {new Date(upload.updated_at ?? upload.created_at).toLocaleString('ko-KR')}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
