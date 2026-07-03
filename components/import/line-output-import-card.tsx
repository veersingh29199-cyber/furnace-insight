'use client'

import { useMemo, useRef, useState, type ChangeEvent } from 'react'
import * as XLSX from 'xlsx'
import { createClient } from '@/lib/supabase/client'
import { inspectLineOutput } from '@/lib/importers/lineOutput'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { cn } from '@/lib/utils'
import { DB, DB_CONFLICT_KEYS } from '@/types/db'
import { AlertTriangle, CheckCircle2, Database, FileSpreadsheet, Loader2, Upload } from 'lucide-react'
import { toast } from 'sonner'

type UploadStage = 'idle' | 'reading' | 'parsing' | 'uploading' | 'done' | 'error'

interface UploadSummary {
  stage: UploadStage
  message: string
  rows: number
  dailyRows: number
  monthlyRows: number
  newRows: number
  updatedRows: number
  errorRows: number
  storagePath?: string
}

const MAX_PREVIEW_ROWS = 12
const DEFAULT_SAMPLE_NAME = '라인_생산량집계표_샘플.xlsx'
const DAILY_SHEET_EXAMPLE = '2601월'
const MONTHLY_SHEET_EXAMPLE = '2026년 전체'
const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : '알 수 없는 오류'
}

function buildStoragePath(uploadId: number, fileName: string) {
  const safeName = fileName.replace(/[^a-zA-Z0-9._-]+/g, '_')
  return `line-output/${uploadId}-${Date.now()}-${safeName}`
}

function buildPayload<Row extends { period: string; line_code: string }>(
  rows: Row[],
  sourceUploadId: number,
  mapper: (row: Row) => Record<string, unknown>
) {
  return rows.map((row) => ({
    ...mapper(row),
    source_upload_id: sourceUploadId,
  }))
}

async function upsertWithSummary<Row extends { period: string; line_code: string }>(
  supabase: ReturnType<typeof createClient>,
  table: string,
  periodColumn: string,
  lineColumn: string,
  conflictKey: string,
  sourceUploadId: number,
  rows: Row[],
  mapper: (row: Row) => Record<string, unknown>
) {
  if (rows.length === 0) {
    return { newRows: 0, updatedRows: 0 }
  }

  const periodValues = [...new Set(rows.map((row) => row.period))]
  const { data: existing, error: existingError } = await supabase
    .from(table)
    .select(`${periodColumn}, ${lineColumn}`)
    .in(periodColumn, periodValues)

  if (existingError) throw existingError

  const existingRows = (existing ?? []) as unknown as Array<Record<string, string | number | null>>
  const existingSet = new Set(
    existingRows.map((row) => `${String(row[periodColumn] ?? '')}|${String(row[lineColumn] ?? '')}`)
  )

  const payloads = buildPayload(rows, sourceUploadId, mapper)
  const newRows = rows.filter((row) => !existingSet.has(`${row.period}|${row.line_code}`)).length
  const updatedRows = rows.length - newRows

  const batchSize = 250
  for (let index = 0; index < payloads.length; index += batchSize) {
    const batch = payloads.slice(index, index + batchSize)
    const { error } = await supabase.from(table).upsert(batch, { onConflict: conflictKey })
    if (error) throw error
  }

  return { newRows, updatedRows }
}

function createSampleWorkbook() {
  const workbook = XLSX.utils.book_new()

  const dailySheet = [
    [''],
    [''],
    [''],
    [''],
    ['일자', '15000TON', '', '', '5000TON', '', '', '8000TON', '', '', '11000RM', '', '', 'TOTAL', '', '', '제품(양품)', 'KO411'],
    ['일자', '생산량', '계획량', '달성률', '생산량', '계획량', '달성률', '생산량', '계획량', '달성률', '생산량', '계획량', '달성률', '생산량', '계획량', '달성률', '양품', 'KO411'],
    ['일자', '생산량', '계획량', '달성률', '재제작', '재제작', '수정', '수정', '황지', 'COGGING', '합계', 'C/S', 'A/S', 'SUS', '합계', '', '', ''],
    ['1', 1200, 1180, 101.7, 860, 850, 98.8, 920, 900, 102.2, 740, 720, 102.8, 3720, 3650, 102.0, 120, 18],
    ['2', 1180, 1210, 97.5, 840, 860, 97.7, 910, 900, 101.1, 730, 725, 100.7, 3660, 3695, 99.1, 118, 17],
  ]

  const monthlySheet = [
    [''],
    [''],
    [''],
    [''],
    ['월', '15000TON', '', '', '5000TON', '', '', '8000TON', '', '', '11000RM', '', '', 'TOTAL', '', '', '제품(양품)', 'KO411'],
    ['월', '생산량', '계획량', '달성률', '생산량', '계획량', '달성률', '생산량', '계획량', '달성률', '생산량', '계획량', '달성률', '생산량', '계획량', '달성률', '양품', 'KO411'],
    ['월', '생산량', '계획량', '달성률', '재제작', '재제작', '수정', '수정', '황지', 'COGGING', '합계', 'C/S', 'A/S', 'SUS', '합계', '', '', ''],
    ['1월', 25100, 24650, 101.8, 17200, 16880, 101.9, 18900, 18720, 100.9, 15300, 14950, 102.3, 66500, 65200, 102.0, 420, 51],
    ['2월', 24200, 24000, 100.8, 16900, 17050, 99.1, 18350, 18100, 101.4, 14950, 15010, 99.6, 64400, 64160, 100.4, 398, 47],
  ]

  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(dailySheet), DAILY_SHEET_EXAMPLE)
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(monthlySheet), MONTHLY_SHEET_EXAMPLE)

  XLSX.writeFile(workbook, DEFAULT_SAMPLE_NAME)
}

export function LineOutputImportCard() {
  const supabase = useMemo(() => createClient(), [])
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [stage, setStage] = useState<UploadStage>('idle')
  const [progress, setProgress] = useState(0)
  const [inspection, setInspection] = useState<ReturnType<typeof inspectLineOutput> | null>(null)
  const [summary, setSummary] = useState<UploadSummary | null>(null)

  const previewRows = inspection?.rows.slice(0, MAX_PREVIEW_ROWS) ?? []
  const dailyRows = inspection?.dailyCount ?? 0
  const monthlyRows = inspection?.monthlyCount ?? 0
  const totalRows = inspection?.rows.length ?? 0

  const statusLabel = useMemo(() => {
    switch (stage) {
      case 'reading':
        return '파일 읽는 중'
      case 'parsing':
        return '시트 파싱 중'
      case 'uploading':
        return 'storage/DB 적재 중'
      case 'done':
        return '처리 완료'
      case 'error':
        return '처리 실패'
      default:
        return '대기 중'
    }
  }, [stage])

  const handleFile = async (file: File) => {
    setStage('reading')
    setProgress(5)
    setSummary(null)

    let uploadId: number | null = null

    try {
      const buffer = await file.arrayBuffer()
      setStage('parsing')
      setProgress(25)

      const parsed = inspectLineOutput(buffer, { excludeTotal: false })
      setInspection(parsed)

      if (parsed.rows.length === 0) {
        throw new Error('인식된 생산량집계표 행이 없습니다. 시트명과 5~7행 헤더를 확인해 주세요.')
      }

      const {
        data: { user },
      } = await supabase.auth.getUser()

      const { data: uploadRow, error: createError } = await supabase
        .from(DB.tables.importUploads)
        .insert({
          file_name: file.name,
          storage_path: '',
          file_type: file.type || XLSX_MIME,
          size_bytes: file.size,
          target: 'line_output',
          status: 'stored',
          rows_new: 0,
          rows_updated: 0,
          rows_error: 0,
          uploaded_by: user?.id ?? user?.email ?? 'anonymous',
          note: '생산량집계표 업로드',
        })
        .select('id')
        .single()

      if (createError) throw createError
      uploadId = Number(uploadRow?.id)
      if (!Number.isFinite(uploadId)) {
        throw new Error('업로드 이력 ID를 생성하지 못했습니다.')
      }

      setStage('uploading')
      setProgress(40)

      const storagePath = buildStoragePath(uploadId, file.name)
      const { error: storageError } = await supabase.storage.from(DB.storage.importFiles).upload(storagePath, file, {
        contentType: file.type || XLSX_MIME,
        upsert: false,
      })
      if (storageError) throw storageError

      await supabase
        .from(DB.tables.importUploads)
        .update({ storage_path: storagePath, status: 'parsed', note: '원본 저장 완료' })
        .eq('id', uploadId)

      const dailyRowsToSave = parsed.rows.filter((row) => row.ptype === 'daily')
      const monthlyRowsToSave = parsed.rows.filter((row) => row.ptype === 'monthly')

      const dailySummary = await upsertWithSummary(
        supabase,
        DB.tables.lineOutputDaily,
        DB.lineOutputDaily.workDate,
        DB.lineOutputDaily.lineCode,
        DB_CONFLICT_KEYS.lineOutputDaily,
        uploadId,
        dailyRowsToSave,
        (row) => ({
          work_date: row.period,
          line_code: row.line_code,
          output_kg: row.output_kg,
          plan_kg: row.plan_kg,
          achievement: row.achievement,
          hwangji_kg: row.hwangji_kg,
          cogging_kg: row.cogging_kg,
          subtotal_kg: row.subtotal_kg,
          remake_self_remake: row.remake_self_remake,
          remake_self_fix: row.remake_self_fix,
          remake_qc_remake: row.remake_qc_remake,
          remake_qc_fix: row.remake_qc_fix,
          mat_cs_kg: row.mat_cs_kg,
          mat_as_kg: row.mat_as_kg,
          mat_sus_kg: row.mat_sus_kg,
          mat_total_kg: row.mat_total_kg,
        })
      )

      const monthlySummary = await upsertWithSummary(
        supabase,
        DB.tables.lineOutputMonthly,
        DB.lineOutputMonthly.ym,
        DB.lineOutputMonthly.lineCode,
        DB_CONFLICT_KEYS.lineOutputMonthly,
        uploadId,
        monthlyRowsToSave,
        (row) => ({
          ym: row.period,
          line_code: row.line_code,
          output_kg: row.output_kg,
          plan_kg: row.plan_kg,
          achievement: row.achievement,
          hwangji_kg: row.hwangji_kg,
          cogging_kg: row.cogging_kg,
          subtotal_kg: row.subtotal_kg,
          remake_self_remake: row.remake_self_remake,
          remake_self_fix: row.remake_self_fix,
          remake_qc_remake: row.remake_qc_remake,
          remake_qc_fix: row.remake_qc_fix,
          mat_cs_kg: row.mat_cs_kg,
          mat_as_kg: row.mat_as_kg,
          mat_sus_kg: row.mat_sus_kg,
          mat_total_kg: row.mat_total_kg,
        })
      )

      const newRows = dailySummary.newRows + monthlySummary.newRows
      const updatedRows = dailySummary.updatedRows + monthlySummary.updatedRows
      const errorRows = Math.max(totalRows - dailyRowsToSave.length - monthlyRowsToSave.length, 0)

      await supabase
        .from(DB.tables.importUploads)
        .update({
          storage_path: storagePath,
          status: 'completed',
          rows_new: newRows,
          rows_updated: updatedRows,
          rows_error: errorRows,
          note: `일일 ${dailyRowsToSave.length}건 / 월별 ${monthlyRowsToSave.length}건 처리 완료`,
        })
        .eq('id', uploadId)

      setSummary({
        stage: 'done',
        message: '원본 저장, 파싱, 업서트까지 완료했습니다.',
        rows: totalRows,
        dailyRows,
        monthlyRows,
        newRows,
        updatedRows,
        errorRows,
        storagePath,
      })
      setStage('done')
      setProgress(100)
      toast.success(`생산량집계표 처리 완료: 신규 ${newRows}건, 갱신 ${updatedRows}건`)
    } catch (error) {
      const message = getErrorMessage(error)
      setStage('error')
      setProgress(100)

      if (uploadId != null) {
        await supabase
          .from(DB.tables.importUploads)
          .update({
            status: 'failed',
            rows_error: totalRows || 0,
            note: message,
          })
          .eq('id', uploadId)
      }

      setSummary({
        stage: 'error',
        message,
        rows: totalRows,
        dailyRows,
        monthlyRows,
        newRows: 0,
        updatedRows: 0,
        errorRows: totalRows,
      })
      toast.error(message)
    }
  }

  const handleInputChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    await handleFile(file)
    event.target.value = ''
  }

  return (
    <Card className="border-primary/20 bg-gradient-to-br from-slate-950 via-slate-900 to-slate-800 text-slate-50 shadow-xl shadow-slate-950/10">
      <CardHeader className="space-y-3 border-b border-white/10 bg-white/5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 rounded-full border border-emerald-400/30 bg-emerald-400/10 px-3 py-1 text-xs font-medium text-emerald-200">
              <Database className="h-3.5 w-3.5" />
              신규: `uploads` 버킷 + `line_output_daily/monthly`
            </div>
            <CardTitle className="text-lg font-semibold tracking-tight">생산량집계표</CardTitle>
            <CardDescription className="max-w-3xl text-sm text-slate-300">
              시트명 예시: <span className="font-mono text-slate-100">{DAILY_SHEET_EXAMPLE}</span>,
              <span className="font-mono text-slate-100"> {MONTHLY_SHEET_EXAMPLE}</span>.
              5~7행 헤더를 동적 매핑해서 원본은 storage에 보관하고, 파싱 결과를 일일/월별 테이블에 업서트합니다.
            </CardDescription>
          </div>
          <Button
            variant="outline"
            onClick={() => createSampleWorkbook()}
            className="shrink-0 border-white/20 bg-white/10 text-slate-50 hover:bg-white/20 hover:text-white"
          >
            <FileSpreadsheet className="mr-2 h-4 w-4" />
            예시 파일 다운로드
          </Button>
        </div>
      </CardHeader>

      <CardContent className="space-y-5 pt-6">
        <div className="grid gap-3 md:grid-cols-3">
          <div className="rounded-xl border border-white/10 bg-white/5 p-4">
            <p className="text-xs uppercase tracking-[0.2em] text-slate-400">일일</p>
            <p className="mt-2 text-2xl font-semibold">{dailyRows}</p>
            <p className="mt-1 text-xs text-slate-300">시트명 `YYMM월` 기준, 일자별 행을 work_date로 저장</p>
          </div>
          <div className="rounded-xl border border-white/10 bg-white/5 p-4">
            <p className="text-xs uppercase tracking-[0.2em] text-slate-400">월별</p>
            <p className="mt-2 text-2xl font-semibold">{monthlyRows}</p>
            <p className="mt-1 text-xs text-slate-300">시트명 `YYYY년 전체` 기준, 월별 행을 ym으로 저장</p>
          </div>
          <div className="rounded-xl border border-white/10 bg-white/5 p-4">
            <p className="text-xs uppercase tracking-[0.2em] text-slate-400">상태</p>
            <p className="mt-2 text-2xl font-semibold">{statusLabel}</p>
            <p className="mt-1 text-xs text-slate-300">
              {summary?.message ?? '파일을 끌어다 놓거나 선택하면 바로 처리합니다.'}
            </p>
          </div>
        </div>

        <div
          className={cn(
            'group relative cursor-pointer rounded-2xl border-2 border-dashed p-6 transition-colors',
            isDragging
              ? 'border-emerald-400 bg-emerald-400/10'
              : 'border-white/15 bg-white/5 hover:border-white/30 hover:bg-white/10'
          )}
          onClick={() => fileInputRef.current?.click()}
          onDragEnter={(event) => {
            event.preventDefault()
            setIsDragging(true)
          }}
          onDragOver={(event) => {
            event.preventDefault()
            setIsDragging(true)
          }}
          onDragLeave={(event) => {
            event.preventDefault()
            setIsDragging(false)
          }}
          onDrop={async (event) => {
            event.preventDefault()
            setIsDragging(false)
            const file = event.dataTransfer.files?.[0]
            if (file) await handleFile(file)
          }}
        >
          <div className="flex flex-col items-center gap-3 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-emerald-400/30 bg-emerald-400/10 text-emerald-200">
              {stage === 'uploading' ? (
                <Loader2 className="h-6 w-6 animate-spin" />
              ) : (
                <Upload className="h-6 w-6" />
              )}
            </div>
            <div className="space-y-1">
              <p className="text-sm font-medium text-white">파일을 클릭하거나 드래그해서 업로드</p>
              <p className="text-xs text-slate-300">
                `.xlsx` / `.xls` 지원. 원본은 그대로 `uploads` 버킷에 저장하고, 파싱 후 업서트합니다.
              </p>
            </div>
            <div className="flex flex-wrap items-center justify-center gap-2 text-xs text-slate-300">
              <span>밴드: 15000TON / 5000TON / 8000TON / 11000RM / TOTAL</span>
            </div>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls"
            className="hidden"
            onChange={handleInputChange}
          />
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs text-slate-300">
            <span>{statusLabel}</span>
            <span>{progress}%</span>
          </div>
          <Progress value={progress} className="h-2 bg-white/10 [&>div]:bg-emerald-400" />
        </div>

        {summary && (
          <Alert
            className={cn(
              'border',
              summary.stage === 'error'
                ? 'border-rose-500/40 bg-rose-500/10 text-rose-50'
                : 'border-emerald-500/40 bg-emerald-500/10 text-emerald-50'
            )}
          >
            {summary.stage === 'error' ? (
              <AlertTriangle className="h-4 w-4 text-rose-300" />
            ) : (
              <CheckCircle2 className="h-4 w-4 text-emerald-300" />
            )}
            <AlertDescription className="space-y-2 text-sm">
              <div>{summary.message}</div>
              <div className="flex flex-wrap gap-2 text-xs">
                <Badge variant="secondary" className="bg-white/10 text-slate-100">
                  총 {summary.rows}행
                </Badge>
                <Badge variant="secondary" className="bg-white/10 text-slate-100">
                  신규 {summary.newRows}건
                </Badge>
                <Badge variant="secondary" className="bg-white/10 text-slate-100">
                  갱신 {summary.updatedRows}건
                </Badge>
                <Badge variant="secondary" className="bg-white/10 text-slate-100">
                  오류 {summary.errorRows}건
                </Badge>
                {summary.storagePath && (
                  <Badge variant="secondary" className="bg-white/10 text-slate-100">
                    저장 경로 {summary.storagePath}
                  </Badge>
                )}
              </div>
            </AlertDescription>
          </Alert>
        )}

        {previewRows.length > 0 && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold text-white">미리보기</h3>
                <p className="text-xs text-slate-300">파싱된 행의 앞부분만 보여줍니다.</p>
              </div>
              <Badge variant="outline" className="border-white/20 bg-white/5 text-slate-100">
                {totalRows}행
              </Badge>
            </div>
            <div className="overflow-hidden rounded-xl border border-white/10">
              <Table>
                <TableHeader className="bg-white/5">
                  <TableRow className="border-white/10 hover:bg-transparent">
                    <TableHead className="text-[11px] text-slate-300">기간</TableHead>
                    <TableHead className="text-[11px] text-slate-300">구분</TableHead>
                    <TableHead className="text-[11px] text-slate-300">라인</TableHead>
                    <TableHead className="text-[11px] text-right text-slate-300">생산량</TableHead>
                    <TableHead className="text-[11px] text-right text-slate-300">계획</TableHead>
                    <TableHead className="text-[11px] text-right text-slate-300">달성률</TableHead>
                    <TableHead className="text-[11px] text-right text-slate-300">합계</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {previewRows.map((row) => (
                    <TableRow key={`${row.ptype}-${row.period}-${row.line_code}`} className="border-white/10 hover:bg-white/5">
                      <TableCell className="font-mono text-[11px] text-slate-200">{row.period}</TableCell>
                      <TableCell className="text-[11px] text-slate-300">
                        <Badge variant="outline" className="border-white/20 bg-white/5 text-[10px] text-slate-100">
                          {row.ptype}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-[11px] font-medium text-slate-100">{row.line_code}</TableCell>
                      <TableCell className="text-right font-mono text-[11px] text-slate-200">
                        {row.output_kg != null ? row.output_kg.toLocaleString('ko-KR') : '-'}
                      </TableCell>
                      <TableCell className="text-right font-mono text-[11px] text-slate-200">
                        {row.plan_kg != null ? row.plan_kg.toLocaleString('ko-KR') : '-'}
                      </TableCell>
                      <TableCell className="text-right font-mono text-[11px] text-slate-200">
                        {row.achievement != null ? row.achievement.toLocaleString('ko-KR') : '-'}
                      </TableCell>
                      <TableCell className="text-right font-mono text-[11px] text-slate-200">
                        {row.mat_total_kg != null ? row.mat_total_kg.toLocaleString('ko-KR') : '-'}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
