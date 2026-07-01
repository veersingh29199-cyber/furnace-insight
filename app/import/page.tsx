'use client'

import { useState, useRef } from 'react'
import * as XLSX from 'xlsx'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Progress } from '@/components/ui/progress'
import { createClient } from '@/lib/supabase/client'
import { useFurnaces, useLines } from '@/hooks/use-dashboard'
import {
  Upload, FileSpreadsheet, CheckCircle2, XCircle,
  AlertTriangle, Info, Loader2, Eye
} from 'lucide-react'
import { toast } from 'sonner'
import { kgToTon } from '@/lib/utils'

// ────────── 타입 ──────────
interface GasRow {
  furnaceCode: string
  ym:          string
  gasUsage:    number
}

interface ParsedData {
  type:    'gas' | 'production'
  rows:    GasRow[]
  errors:  string[]
  sheetName: string
}

export default function ImportPage() {
  const { data: furnaces } = useFurnaces()
  const { data: lines }    = useLines()
  const [parsed, setParsed]    = useState<ParsedData | null>(null)
  const [importing, setImporting] = useState(false)
  const [progress, setProgress]   = useState(0)
  const [importDone, setImportDone] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // ─── 가스 엑셀 파싱 (연도별 시트, 행=호기, 열=1~12월) ───
  const parseGasExcel = (workbook: XLSX.WorkBook, sheetName: string): ParsedData => {
    const ws  = workbook.Sheets[sheetName]
    const raw = XLSX.utils.sheet_to_json<string[]>(ws, { header: 1, defval: '' }) as string[][]

    const rows: GasRow[] = []
    const errors: string[] = []

    // 연도 추출 (시트 이름 또는 A1 셀에서)
    const yearMatch = sheetName.match(/(\d{4})/)
    const year = yearMatch ? parseInt(yearMatch[1]) : new Date().getFullYear()

    raw.forEach((row, rowIdx) => {
      if (rowIdx === 0) return // 헤더 행 스킵
      const furnaceCode = String(row[0] ?? '').trim()
      if (!furnaceCode || !furnaceCode.includes('호기')) return

      // 1~12월 열 (인덱스 1~12)
      for (let month = 1; month <= 12; month++) {
        const cellVal = row[month]
        const numVal  = parseFloat(String(cellVal ?? '').replace(/,/g, ''))
        if (!isNaN(numVal) && numVal > 0) {
          rows.push({
            furnaceCode,
            ym:       `${year}-${String(month).padStart(2, '0')}-01`,
            gasUsage: numVal,
          })
        }
      }
    })

    if (rows.length === 0) {
      errors.push('인식된 데이터 행이 없습니다. 첫 번째 열에 "X호기" 형식이 있는지 확인하세요.')
    }

    return { type: 'gas', rows, errors, sheetName }
  }

  // ─── 파일 선택 핸들러 ───
  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => {
      try {
        const data = new Uint8Array(ev.target?.result as ArrayBuffer)
        const wb   = XLSX.read(data, { type: 'array' })
        const sheetName = wb.SheetNames[0]
        const result = parseGasExcel(wb, sheetName)
        setParsed(result)
        setImportDone(false)
        setProgress(0)
      } catch (err) {
        toast.error('파일 파싱 실패: ' + (err instanceof Error ? err.message : '알 수 없는 오류'))
      }
    }
    reader.readAsArrayBuffer(file)
  }

  // ─── DB 적재 ───
  const handleImport = async () => {
    if (!parsed || !furnaces) return
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    const opName = typeof window !== 'undefined' ? localStorage.getItem('furnace_operator_name') || '김철수 (단조1팀)' : null
    const opShift = typeof window !== 'undefined' ? localStorage.getItem('furnace_operator_shift') || 'day' : null

    setImporting(true)
    setProgress(0)

    const total  = parsed.rows.length
    let success  = 0
    let fail     = 0
    const batchSize = 20

    for (let i = 0; i < total; i += batchSize) {
      const batch = parsed.rows.slice(i, i + batchSize)

      const upsertRows = batch
        .map(row => {
          const furnace = furnaces.find(f =>
            f.code === row.furnaceCode || f.name === row.furnaceCode
          )
          if (!furnace) { fail++; return null }
          return {
            ym:               row.ym,
            furnace_id:       furnace.id,
            gas_usage:        row.gasUsage,
            charge_weight_kg: 0,  // 장입량은 별도 입력 필요
            source:           'bill' as const,
            created_by:       user?.id || null,
            entered_by_name:  opName,
            entered_by_shift: opShift,
          }
        })
        .filter(Boolean)

      if (upsertRows.length > 0) {
        const { error } = await supabase
          .from('gas_records')
          .upsert(upsertRows as never[], { onConflict: 'ym,furnace_id', ignoreDuplicates: false })

        if (error) fail += upsertRows.length
        else success += upsertRows.length
      }

      setProgress(Math.round(((i + batchSize) / total) * 100))
    }

    setImporting(false)
    setImportDone(true)
    toast.success(`적재 완료: 성공 ${success}건, 실패 ${fail}건`)
  }

  return (
    <div className="space-y-6">
      <Alert className="border-primary/30 bg-primary/5">
        <Info className="h-4 w-4 text-primary" />
        <AlertDescription className="text-sm">
          <strong>엑셀 업로드 형식:</strong> 가스 데이터는 첫 열에 <code className="bg-muted px-1 rounded text-xs">1호기</code>,
          두 번째 행부터 데이터 행, 2~13열에 1월~12월 값이 있어야 합니다.
          시트 이름에 연도(예: <code className="bg-muted px-1 rounded text-xs">2024</code>)가 포함되어 있으면 자동 인식합니다.
        </AlertDescription>
      </Alert>

      <Tabs defaultValue="gas">
        <TabsList>
          <TabsTrigger value="gas">가스 검침 업로드</TabsTrigger>
          <TabsTrigger value="production">생산 실적 업로드</TabsTrigger>
        </TabsList>

        <TabsContent value="gas" className="space-y-4 mt-4">
          {/* 파일 업로드 영역 */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">엑셀 파일 선택</CardTitle>
              <CardDescription>
                .xlsx 또는 .xls 파일을 선택하세요. 파싱 결과를 미리보기 후 적재합니다.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div
                className="border-2 border-dashed border-border rounded-xl p-8 text-center cursor-pointer hover:border-primary/50 hover:bg-primary/5 transition-colors"
                onClick={() => fileInputRef.current?.click()}
              >
                <FileSpreadsheet className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
                <p className="text-sm font-medium">파일을 클릭하여 선택하거나 드래그하세요</p>
                <p className="text-xs text-muted-foreground mt-1">지원 형식: .xlsx, .xls</p>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".xlsx,.xls"
                  className="hidden"
                  onChange={handleFile}
                />
              </div>
            </CardContent>
          </Card>

          {/* 파싱 결과 미리보기 */}
          {parsed && (
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-base flex items-center gap-2">
                      <Eye className="h-4 w-4" />
                      파싱 결과 미리보기
                    </CardTitle>
                    <CardDescription className="mt-1">
                      시트: {parsed.sheetName} |{' '}
                      <span className="text-primary font-medium">{parsed.rows.length}건</span> 인식됨
                    </CardDescription>
                  </div>
                  <div className="flex items-center gap-2">
                    {parsed.errors.length > 0 && (
                      <Badge variant="destructive">{parsed.errors.length} 오류</Badge>
                    )}
                    <Badge variant="secondary">{parsed.rows.length} 행</Badge>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* 오류 표시 */}
                {parsed.errors.map((err, i) => (
                  <Alert key={i} className="border-destructive/40 bg-destructive/5">
                    <AlertTriangle className="h-4 w-4 text-destructive" />
                    <AlertDescription className="text-sm">{err}</AlertDescription>
                  </Alert>
                ))}

                {/* 데이터 미리보기 테이블 */}
                {parsed.rows.length > 0 && (
                  <div className="rounded-lg border overflow-hidden">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>가열로</TableHead>
                          <TableHead>년월</TableHead>
                          <TableHead className="text-right">가스사용량 (Nm³)</TableHead>
                          <TableHead>매핑 결과</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {parsed.rows.slice(0, 20).map((row, i) => {
                          const matched = furnaces?.find(
                            f => f.code === row.furnaceCode || f.name === row.furnaceCode
                          )
                          return (
                            <TableRow key={i}>
                              <TableCell className="font-medium">{row.furnaceCode}</TableCell>
                              <TableCell>{row.ym.substring(0, 7)}</TableCell>
                              <TableCell className="text-right">{row.gasUsage.toLocaleString('ko-KR')}</TableCell>
                              <TableCell>
                                {matched ? (
                                  <Badge variant="secondary" className="gap-1">
                                    <CheckCircle2 className="h-3 w-3 text-green-500" />
                                    {matched.name}
                                  </Badge>
                                ) : (
                                  <Badge variant="destructive" className="gap-1">
                                    <XCircle className="h-3 w-3" />
                                    매핑 실패
                                  </Badge>
                                )}
                              </TableCell>
                            </TableRow>
                          )
                        })}
                      </TableBody>
                    </Table>
                    {parsed.rows.length > 20 && (
                      <p className="text-xs text-muted-foreground text-center py-2">
                        ... 외 {parsed.rows.length - 20}건 더 있음
                      </p>
                    )}
                  </div>
                )}

                {/* 진행률 */}
                {importing && (
                  <div className="space-y-2">
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>적재 중...</span>
                      <span>{progress}%</span>
                    </div>
                    <Progress value={progress} />
                  </div>
                )}

                {/* 적재 완료 */}
                {importDone && (
                  <Alert className="border-green-500/40 bg-green-500/5">
                    <CheckCircle2 className="h-4 w-4 text-green-500" />
                    <AlertDescription className="text-sm text-green-700 dark:text-green-400">
                      데이터 적재가 완료되었습니다. 대시보드에서 결과를 확인하세요.
                    </AlertDescription>
                  </Alert>
                )}

                {/* 적재 버튼 */}
                {parsed.rows.length > 0 && !importDone && (
                  <Button
                    onClick={handleImport}
                    disabled={importing}
                    className="w-full sm:w-auto"
                  >
                    {importing ? (
                      <><Loader2 className="mr-2 h-4 w-4 animate-spin" />적재 중 ({progress}%)...</>
                    ) : (
                      <><Upload className="mr-2 h-4 w-4" />DB에 적재 ({parsed.rows.length}건)</>
                    )}
                  </Button>
                )}
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="production" className="mt-4">
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-16 text-center gap-3">
              <FileSpreadsheet className="h-10 w-10 text-muted-foreground/30" />
              <div>
                <p className="font-medium text-muted-foreground">생산 실적 엑셀 임포터</p>
                <p className="text-sm text-muted-foreground mt-1">
                  월별 행, 라인별(P5/P8/P15/R/M) 목표/실적/황지/COGGING 형식을 지원합니다.
                  <br />개발 진행 중입니다. 현재는 <a href="/data-entry" className="text-primary underline">데이터 입력</a> 메뉴를 이용해 주세요.
                </p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
