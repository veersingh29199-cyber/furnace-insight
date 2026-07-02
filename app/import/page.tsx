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
import { DB, DB_CONFLICT_KEYS } from '@/types/db'
import {
  Upload, FileSpreadsheet, CheckCircle2, XCircle,
  AlertTriangle, Info, Loader2, Eye, Download
} from 'lucide-react'
import { toast } from 'sonner'

// ────────── 타입 ──────────
interface GasRow {
  furnaceCode: string
  ym:          string
  gasUsage:    number
  chargeWeightKg?: number
}

interface ProdRow {
  lineCode:  string
  ym:        string
  planTon:   number
  actualTon: number
  orderNo?:  string
}

interface ParsedData {
  type:    'gas' | 'production'
  rows:    GasRow[] | ProdRow[]
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

  const downloadGasSampleExcel = () => {
    const wsData = [
      ['가열로호기', '1월', '2월', '3월', '4월', '5월', '6월', '7월', '8월', '9월', '10월', '11월', '12월', '1월_장입중량', '2월_장입중량'],
      ['1호기', 45000, 48000, 52000, 49000, 51000, 53000, 50000, 49000, 54000, 56000, 58000, 55000, 250000, 260000],
      ['2호기', 38000, 41000, 43000, 40000, 42000, 44000, 41000, 40000, 45000, 47000, 49000, 46000, 210000, 220000],
    ]
    const wb = XLSX.utils.book_new()
    const ws = XLSX.utils.aoa_to_sheet(wsData)
    XLSX.utils.book_append_sheet(wb, ws, `${new Date().getFullYear()}`)
    XLSX.writeFile(wb, '가스검침_및_장입량_샘플양식.xlsx')
  }

  const downloadProdSampleExcel = () => {
    const wsData = [
      ['작업년월', '라인코드', '수주번호', '목표(톤)', '실적(톤)'],
      [`${new Date().getFullYear()}-06`, 'P5', 'ORD-202606-001', 1400, 1420],
      [`${new Date().getFullYear()}-06`, 'P8', 'ORD-202606-002', 1000, 990],
      [`${new Date().getFullYear()}-06`, 'P15', 'ORD-202606-003', 1200, 1180],
    ]
    const wb = XLSX.utils.book_new()
    const ws = XLSX.utils.aoa_to_sheet(wsData)
    XLSX.utils.book_append_sheet(wb, ws, '생산실적_수주목록')
    XLSX.writeFile(wb, '생산실적_수주번호포함_샘플양식.xlsx')
  }

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

      // 1~12월 열 (인덱스 1~12: 가스사용량, 인덱스 13~24: 장입중량 선택적 파싱)
      for (let month = 1; month <= 12; month++) {
        const cellVal = row[month]
        const numVal  = parseFloat(String(cellVal ?? '').replace(/,/g, ''))
        const weightCell = row[month + 12]
        const numWeight = parseFloat(String(weightCell ?? '').replace(/,/g, ''))
        if (!isNaN(numVal) && numVal > 0) {
          rows.push({
            furnaceCode,
            ym:       `${year}-${String(month).padStart(2, '0')}-01`,
            gasUsage: numVal,
            chargeWeightKg: !isNaN(numWeight) && numWeight > 0 ? numWeight : 0,
          })
        }
      }
    })

    if (rows.length === 0) {
      errors.push('인식된 데이터 행이 없습니다. 첫 번째 열에 "X호기" 형식이 있는지 확인하세요.')
    }

    return { type: 'gas', rows, errors, sheetName }
  }

  // ─── 생산 실적 엑셀 파싱 (연도별 시트, 행=라인, 열=1~12월) ───
  // 지원 포맷:
  //   1열: 라인 코드 (P5, P8, P15, R/M 등) + " 목표"/"실적" suffix 또는 2행으로 분리
  //   2~13열: 1월~12월 값 (톤)
  const parseProdExcel = (workbook: XLSX.WorkBook, sheetName: string): ParsedData => {
    const ws  = workbook.Sheets[sheetName]
    const raw = XLSX.utils.sheet_to_json<string[]>(ws, { header: 1, defval: '' }) as string[][]

    const rows: ProdRow[] = []
    const errors: string[] = []

    const yearMatch = sheetName.match(/(\d{4})/)
    const year = yearMatch ? parseInt(yearMatch[1]) : new Date().getFullYear()

    // 1. 리스트형 포맷 판별 (첫 행에 작업년월, 라인코드, 수주번호 등이 있는 경우)
    const headerStr = (raw[0] || []).join(' ').trim()
    if (headerStr.includes('작업년월') || headerStr.includes('수주번호') || headerStr.includes('라인코드')) {
      raw.forEach((row, rowIdx) => {
        if (rowIdx === 0) return
        const ymStr = String(row[0] ?? '').trim()
        const lineStr = String(row[1] ?? '').trim()
        if (!ymStr || !lineStr) return

        const orderStr = String(row[2] ?? '').trim()
        const planVal = parseFloat(String(row[3] ?? '0').replace(/,/g, '')) || 0
        const actualVal = parseFloat(String(row[4] ?? '0').replace(/,/g, '')) || 0

        rows.push({
          lineCode: lineStr,
          ym: ymStr.length === 7 ? `${ymStr}-01` : ymStr,
          planTon: planVal,
          actualTon: actualVal,
          orderNo: orderStr || undefined,
        })
      })
      if (rows.length === 0) errors.push('리스트 데이터 행을 찾을 수 없습니다.')
      return { type: 'production', rows, errors, sheetName }
    }

    // 2. 월간 목표·실적 매트릭스 쌍 파싱: "P5 목표", "P5 실적"
    const planMap: Record<string, Record<number, number>> = {}
    const actualMap: Record<string, Record<number, number>> = {}

    raw.forEach((row, rowIdx) => {
      if (rowIdx === 0) return
      const cell = String(row[0] ?? '').trim()
      if (!cell) return

      // 라인 코드 추출 (P5, P8, P15, R/M, 링밀 등)
      const lineCodes = ['P5', 'P8', 'P15', 'R/M', 'RM', '링밀']
      const matchedCode = lineCodes.find(c => cell.includes(c))
      if (!matchedCode) return

      const lineCode = matchedCode === 'RM' ? 'R/M' : matchedCode
      const isPlan = cell.includes('목표') || cell.includes('PLAN') || cell.includes('plan')
      const isActual = cell.includes('실적') || cell.includes('ACTUAL') || cell.includes('actual')

      for (let month = 1; month <= 12; month++) {
        const cellVal = row[month]
        const numVal  = parseFloat(String(cellVal ?? '').replace(/,/g, ''))
        if (isNaN(numVal) || numVal <= 0) continue

        if (isPlan) {
          if (!planMap[lineCode]) planMap[lineCode] = {}
          planMap[lineCode][month] = numVal
        } else if (isActual) {
          if (!actualMap[lineCode]) actualMap[lineCode] = {}
          actualMap[lineCode][month] = numVal
        } else {
          // suffix 없으면 실적으로 간주
          if (!actualMap[lineCode]) actualMap[lineCode] = {}
          actualMap[lineCode][month] = numVal
        }
      }
    })

    // planMap과 actualMap을 합쳐 ProdRow 생성
    const allLineCodes = new Set([...Object.keys(planMap), ...Object.keys(actualMap)])
    allLineCodes.forEach(code => {
      for (let month = 1; month <= 12; month++) {
        const plan   = planMap[code]?.[month] ?? 0
        const actual = actualMap[code]?.[month] ?? 0
        if (plan > 0 || actual > 0) {
          rows.push({
            lineCode:  code,
            ym:        `${year}-${String(month).padStart(2, '0')}-01`,
            planTon:   plan,
            actualTon: actual,
          })
        }
      }
    })

    if (rows.length === 0) {
      errors.push(
        '인식된 데이터 행이 없습니다. 첫 번째 열에 "P5 목표", "P5 실적" 또는 "P5" 형식이 있는지 확인하세요.'
      )
    }

    return { type: 'production', rows, errors, sheetName }
  }

  // ─── 파일 선택 핸들러 (가스) ───
  const handleGasFile = (e: React.ChangeEvent<HTMLInputElement>) => {
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

  // ─── 파일 선택 핸들러 (생산 실적) ───
  const prodFileRef = useRef<HTMLInputElement>(null)
  const [parsedProd, setParsedProd] = useState<ParsedData | null>(null)
  const [importingProd, setImportingProd] = useState(false)
  const [progressProd, setProgressProd]   = useState(0)
  const [importDoneProd, setImportDoneProd] = useState(false)

  const handleProdFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => {
      try {
        const data = new Uint8Array(ev.target?.result as ArrayBuffer)
        const wb   = XLSX.read(data, { type: 'array' })
        const sheetName = wb.SheetNames[0]
        const result = parseProdExcel(wb, sheetName)
        setParsedProd(result)
        setImportDoneProd(false)
        setProgressProd(0)
      } catch (err) {
        toast.error('파일 파싱 실패: ' + (err instanceof Error ? err.message : '알 수 없는 오류'))
      }
    }
    reader.readAsArrayBuffer(file)
  }

  // ─── 생산 실적 DB 적재 ───
  const handleImportProd = async () => {
    if (!parsedProd || !lines) return
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()

    setImportingProd(true)
    setProgressProd(0)

    const prodRows = parsedProd.rows as ProdRow[]
    const total  = prodRows.length
    let success  = 0
    let fail     = 0
    const batchSize = 20

    for (let i = 0; i < total; i += batchSize) {
      const batch = prodRows.slice(i, i + batchSize)

      const upsertRows = batch
        .map(row => {
          const line = lines.find(l => l.code === row.lineCode)
          if (!line) { fail++; return null }
          return {
            work_month:  row.ym,
            line_code:   line.code,
            product_name: null,
            shift:       'both' as const,
            plan_ton:    row.planTon,
            actual_ton:  row.actualTon,
            hwangji_ton: 0,
            cogging_ton: 0,
            rework_self_ton: 0,
            rework_quality_ton: 0,
            work_hours:  0,
            work_count:  0,
            created_by:  user?.id || null,
          }
        })
        .filter(Boolean)

      if (upsertRows.length > 0) {
        const { error } = await supabase
          .from(DB.tables.productionRecords)
          .upsert(upsertRows as never[], { onConflict: DB_CONFLICT_KEYS.productionRecords, ignoreDuplicates: false })

        if (error) fail += upsertRows.length
        else success += upsertRows.length
      }

      setProgressProd(Math.round(((i + batchSize) / total) * 100))
    }

    setImportingProd(false)
    setImportDoneProd(true)
    toast.success(`생산 실적 적재 완료: 성공 ${success}건, 실패 ${fail}건`)
  }

  // ─── 파일 선택 핸들러 (가스 — 구 handleFile) ───
  const handleFile = handleGasFile

  // ─── DB 적재 ───
  const handleImport = async () => {
    if (!parsed || !furnaces) return
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    const opName = typeof window !== 'undefined' ? localStorage.getItem('furnace_operator_name') || '김철수 (단조1팀)' : null
    const opShift = typeof window !== 'undefined' ? localStorage.getItem('furnace_operator_shift') || 'day' : null

    setImporting(true)
    setProgress(0)

    const gasRows = parsed.rows as GasRow[]
    const total  = gasRows.length
    let success  = 0
    let fail     = 0
    const batchSize = 20

    for (let i = 0; i < total; i += batchSize) {
      const batch = gasRows.slice(i, i + batchSize)

      const upsertRows = batch
        .map(row => {
          const furnace = furnaces.find(f =>
            f.code === row.furnaceCode || f.name === row.furnaceCode
          )
          if (!furnace) { fail++; return null }
          return {
            ym:               row.ym,
            furnace_code:     furnace.code,
            gas_usage:        row.gasUsage,
            charge_weight_kg: row.chargeWeightKg ?? 0,
            source:           'bill' as const,
            created_by:       user?.id || null,
            entered_by_name:  opName,
            entered_by_shift: opShift,
          }
        })
        .filter(Boolean)

      if (upsertRows.length > 0) {
        const { error } = await supabase
          .from(DB.tables.gasRecords)
          .upsert(upsertRows as never[], { onConflict: DB_CONFLICT_KEYS.gasRecords, ignoreDuplicates: false })

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
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
              <div>
                <CardTitle className="text-base">엑셀 파일 선택</CardTitle>
                <CardDescription className="mt-1">
                  .xlsx 또는 .xls 파일을 선택하세요. 파싱 결과를 미리보기 후 적재합니다.
                </CardDescription>
              </div>
              <Button variant="outline" size="sm" onClick={downloadGasSampleExcel} className="shrink-0 gap-1.5 text-xs">
                <Download className="h-3.5 w-3.5" /> 가스 샘플 양식 다운로드
              </Button>
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
                          <TableHead className="text-right">장입량 (kg)</TableHead>
                          <TableHead>매핑 결과</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {(parsed.rows as GasRow[]).slice(0, 20).map((row, i) => {
                          const matched = furnaces?.find(
                            f => f.code === row.furnaceCode || f.name === row.furnaceCode
                          )
                          return (
                            <TableRow key={i}>
                              <TableCell className="font-medium">{row.furnaceCode}</TableCell>
                              <TableCell>{row.ym.substring(0, 7)}</TableCell>
                              <TableCell className="text-right">{row.gasUsage.toLocaleString('ko-KR')}</TableCell>
                              <TableCell className="text-right">{row.chargeWeightKg && row.chargeWeightKg > 0 ? row.chargeWeightKg.toLocaleString('ko-KR') : '-'}</TableCell>
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

        <TabsContent value="production" className="space-y-4 mt-4">
          <Alert className="border-primary/30 bg-primary/5">
            <Info className="h-4 w-4 text-primary" />
            <AlertDescription className="text-sm space-y-1">
              <div>
                <strong>생산 실적 엑셀 2가지 지원 포맷:</strong>
              </div>
              <ul className="list-disc list-inside text-xs space-y-0.5 text-muted-foreground">
                <li><strong>포맷 A (수주 목록형 - 권장):</strong> 첫 행에 <code className="bg-muted px-1 rounded">작업년월, 라인코드, 수주번호, 목표(톤), 실적(톤)</code> 열을 배치하고 수주 건별로 작성</li>
                <li><strong>포맷 B (월간 매트릭스형):</strong> 첫 열에 <code className="bg-muted px-1 rounded">P5 목표</code>, <code className="bg-muted px-1 rounded">P5 실적</code> 입력 후 2~13열에 1~12월 중량 입력</li>
              </ul>
            </AlertDescription>
          </Alert>

          {/* 파일 업로드 */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
              <div>
                <CardTitle className="text-base">생산 실적 엑셀 파일 선택</CardTitle>
                <CardDescription className="mt-1">
                  .xlsx 또는 .xls 파일을 선택하세요. 수주번호 포함 리스트 양식을 자동 지원합니다.
                </CardDescription>
              </div>
              <Button variant="outline" size="sm" onClick={downloadProdSampleExcel} className="shrink-0 gap-1.5 text-xs">
                <Download className="h-3.5 w-3.5" /> 생산 실적 샘플 양식 다운로드
              </Button>
            </CardHeader>
            <CardContent>
              <div
                className="border-2 border-dashed border-border rounded-xl p-8 text-center cursor-pointer hover:border-primary/50 hover:bg-primary/5 transition-colors"
                onClick={() => prodFileRef.current?.click()}
              >
                <FileSpreadsheet className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
                <p className="text-sm font-medium">파일을 클릭하여 선택하거나 드래그하세요</p>
                <p className="text-xs text-muted-foreground mt-1">지원 형식: .xlsx, .xls</p>
                <input
                  ref={prodFileRef}
                  type="file"
                  accept=".xlsx,.xls"
                  className="hidden"
                  onChange={handleProdFile}
                />
              </div>
            </CardContent>
          </Card>

          {/* 파싱 결과 미리보기 */}
          {parsedProd && (
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-base flex items-center gap-2">
                      <Eye className="h-4 w-4" /> 파싱 결과 미리보기
                    </CardTitle>
                    <CardDescription className="mt-1">
                      시트: {parsedProd.sheetName} |{' '}
                      <span className="text-primary font-medium">{parsedProd.rows.length}건</span> 인식됨
                    </CardDescription>
                  </div>
                  <div className="flex items-center gap-2">
                    {parsedProd.errors.length > 0 && (
                      <Badge variant="destructive">{parsedProd.errors.length} 오류</Badge>
                    )}
                    <Badge variant="secondary">{parsedProd.rows.length} 행</Badge>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {parsedProd.errors.map((err, i) => (
                  <Alert key={i} className="border-destructive/40 bg-destructive/5">
                    <AlertTriangle className="h-4 w-4 text-destructive" />
                    <AlertDescription className="text-sm">{err}</AlertDescription>
                  </Alert>
                ))}

                {parsedProd.rows.length > 0 && (
                  <div className="rounded-lg border overflow-hidden">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>라인</TableHead>
                          <TableHead>년월</TableHead>
                          <TableHead>수주번호</TableHead>
                          <TableHead className="text-right">목표 (톤)</TableHead>
                          <TableHead className="text-right">실적 (톤)</TableHead>
                          <TableHead>매핑 결과</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {(parsedProd.rows as ProdRow[]).slice(0, 20).map((row, i) => {
                          const matched = lines?.find(l => l.code === row.lineCode)
                          return (
                            <TableRow key={i}>
                              <TableCell className="font-medium">{row.lineCode}</TableCell>
                              <TableCell>{row.ym.substring(0, 7)}</TableCell>
                              <TableCell className="text-xs text-muted-foreground">{row.orderNo || '-'}</TableCell>
                              <TableCell className="text-right">{row.planTon.toLocaleString('ko-KR')}</TableCell>
                              <TableCell className="text-right">{row.actualTon.toLocaleString('ko-KR')}</TableCell>
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
                    {parsedProd.rows.length > 20 && (
                      <p className="text-xs text-muted-foreground text-center py-2">
                        ... 외 {parsedProd.rows.length - 20}건 더 있음
                      </p>
                    )}
                  </div>
                )}

                {importingProd && (
                  <div className="space-y-2">
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>적재 중...</span>
                      <span>{progressProd}%</span>
                    </div>
                    <Progress value={progressProd} />
                  </div>
                )}

                {importDoneProd && (
                  <Alert className="border-green-500/40 bg-green-500/5">
                    <CheckCircle2 className="h-4 w-4 text-green-500" />
                    <AlertDescription className="text-sm text-green-700 dark:text-green-400">
                      생산 실적 적재가 완료되었습니다. 생산성 분석 화면에서 결과를 확인하세요.
                    </AlertDescription>
                  </Alert>
                )}

                {parsedProd.rows.length > 0 && !importDoneProd && (
                  <Button onClick={handleImportProd} disabled={importingProd} className="w-full sm:w-auto">
                    {importingProd ? (
                      <><Loader2 className="mr-2 h-4 w-4 animate-spin" />적재 중 ({progressProd}%)...</>
                    ) : (
                      <><Upload className="mr-2 h-4 w-4" />DB에 적재 ({parsedProd.rows.length}건)</>
                    )}
                  </Button>
                )}
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  )
}
