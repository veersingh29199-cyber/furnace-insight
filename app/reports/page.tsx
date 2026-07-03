"use client"

import { useMemo, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import {
  FileText,
  Download,
  Printer,
  Presentation,
  CheckCircle2,
  ArrowRight,
} from 'lucide-react'
import { toast } from 'sonner'
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  CartesianGrid,
} from 'recharts'
import { generatePptxReport, type ReportDataPayload } from '@/lib/reports/pptx-generator'
import jsPDF from 'jspdf'
import html2canvas from 'html2canvas'
import { useTargets } from '@/hooks/use-dashboard'
import { DB } from '@/types/db'
import {
  getProductionDeptLine,
  getProductionOrderWeight,
  getProductionProduct,
  getProductionTonPerHour,
  getProductionWorkHours,
} from '@/lib/production/records'

const supabase = createClient()

function yearRange(year: string) {
  return {
    from: `${year}-01-01`,
    to: `${year}-12-31`,
  }
}

function safeNumber(value: unknown) {
  const parsed = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

export default function ReportsPage() {
  const [reportType, setReportType] = useState<'productivity' | 'gas'>('productivity')
  const [selectedYear, setSelectedYear] = useState<string>('2026')
  const [selectedLine, setSelectedLine] = useState<string>('all')
  const [generatingPpt, setGeneratingPpt] = useState(false)
  const [generatingPdf, setGeneratingPdf] = useState(false)
  const reportContainerRef = useRef<HTMLDivElement>(null)

  const { from: yearStart, to: yearEnd } = yearRange(selectedYear)

  const { data: lines } = useQuery({
    queryKey: ['report-lines'],
    queryFn: async () => {
      const { data, error } = await supabase.from(DB.tables.lines).select('code, name').order('code')
      if (error) throw error
      return data ?? []
    },
  })

  const { data: furnaces } = useQuery({
    queryKey: ['report-furnaces'],
    queryFn: async () => {
      const { data, error } = await supabase.from(DB.tables.furnaces).select('code, name').order('code')
      if (error) throw error
      return data ?? []
    },
  })

  const { data: targets } = useTargets(Number(selectedYear))

  const lineNameMap = useMemo(
    () => new Map((lines ?? []).map((line) => [line.code, line.name])),
    [lines]
  )

  const furnaceNameMap = useMemo(
    () => new Map((furnaces ?? []).map((furnace) => [furnace.code, furnace.name])),
    [furnaces]
  )

  const targetTph = targets?.find((row) => row.metric === 'ton_per_hour' && row.scope === 'company' && row.year === Number(selectedYear))?.target_value ?? 20
  const gasTarget = targets?.find((row) => row.metric === 'gas_unit' && row.scope === 'company' && row.year === Number(selectedYear))?.target_value ?? 150

  const { data: prodRecords = [], isLoading: prodLoading } = useQuery({
    queryKey: ['report-prod', selectedYear, selectedLine],
    queryFn: async () => {
      let query = supabase
        .from(DB.tables.productionRecords)
        .select('*')
        .gte(DB.productionRecords.workDate, yearStart)
        .lte(DB.productionRecords.workDate, yearEnd)

      if (selectedLine !== 'all') {
        query = query.eq(DB.productionRecords.deptLine, selectedLine)
      }

      const { data, error } = await query
      if (error) throw error
      return data ?? []
    },
  })

  const { data: gasRecords = [], isLoading: gasLoading } = useQuery({
    queryKey: ['report-gas', selectedYear],
    queryFn: async () => {
      const { data, error } = await supabase
        .from(DB.tables.gasRecords)
        .select('*, furnace:furnaces(code, name)')
        .gte(DB.gasRecords.ym, `${selectedYear}-01-01`)
        .lte(DB.gasRecords.ym, `${selectedYear}-12-31`)

      if (error) throw error
      return data ?? []
    },
  })

  const { data: companyGas = [] } = useQuery({
    queryKey: ['report-company-gas', selectedYear],
    queryFn: async () => {
      const { data, error } = await supabase
        .from(DB.tables.gasCompanyMonthly)
        .select('*')
        .gte(DB.gasCompanyMonthly.ym, `${selectedYear}-01-01`)
        .lte(DB.gasCompanyMonthly.ym, `${selectedYear}-12-31`)
        .order(DB.gasCompanyMonthly.ym)

      if (error) throw error
      return data ?? []
    },
  })

  const productivityStats = useMemo(() => {
    const lineBuckets = new Map<string, { lineCode: string; lineName: string; actualTon: number; hours: number; targetTon: number }>()
    const productBuckets = new Map<string, { productName: string; totalTph: number; count: number }>()

    for (const record of prodRecords) {
      const lineCode = getProductionDeptLine(record) || '미상'
      const lineName = lineNameMap.get(lineCode) || lineCode
      const actualTon = getProductionOrderWeight(record)
      const hours = getProductionWorkHours(record)
      const bucket = lineBuckets.get(lineCode) ?? { lineCode, lineName, actualTon: 0, hours: 0, targetTon: 0 }
      bucket.actualTon += actualTon
      bucket.hours += hours
      bucket.targetTon += hours * targetTph
      lineBuckets.set(lineCode, bucket)

      const productName = getProductionProduct(record) || '미상'
      const productTph = getProductionTonPerHour(record) ?? 0
      const productBucket = productBuckets.get(productName) ?? { productName, totalTph: 0, count: 0 }
      productBucket.totalTph += productTph
      productBucket.count += 1
      productBuckets.set(productName, productBucket)
    }

    const yearly = Array.from(lineBuckets.values())
      .map((item) => {
        const achievePct = item.targetTon > 0 ? (item.actualTon / item.targetTon) * 100 : 0
        const tonPerHour = item.hours > 0 ? item.actualTon / item.hours : 0
        return {
          year: Number(selectedYear),
          lineCode: item.lineCode,
          lineName: item.lineName,
          planTon: item.targetTon,
          actualTon: item.actualTon,
          achievePct,
          tonPerHour,
        }
      })
      .sort((a, b) => b.actualTon - a.actualTon || a.lineCode.localeCompare(b.lineCode))

    const productBenchmarks = Array.from(productBuckets.values())
      .map((item) => ({
        productName: item.productName,
        actualTph: item.count > 0 ? item.totalTph / item.count : 0,
        benchmarkTph: targetTph,
        gap: item.count > 0 ? item.totalTph / item.count - targetTph : -targetTph,
        count: item.count,
      }))
      .filter((item) => item.count > 0)
      .sort((a, b) => a.actualTph - b.actualTph)
      .slice(0, 8)

    const realisticTargets = yearly.map((line) => {
      const proposedTarget = Math.max(line.tonPerHour * 1.15, targetTph)
      return {
        lineCode: line.lineCode,
        currentAvg: line.tonPerHour,
        benchmark: targetTph,
        proposedTarget,
        reason: `현재 평균 시간당 생산량의 115%와 회사 기준 ${targetTph.toFixed(1)} t/h 중 높은 값을 제안했습니다.`,
      }
    })

    const totalActualTon = yearly.reduce((sum, row) => sum + row.actualTon, 0)
    const totalTargetTon = yearly.reduce((sum, row) => sum + row.planTon, 0)
    const totalHours = yearly.reduce((sum, row) => sum + (row.tonPerHour > 0 ? row.actualTon / row.tonPerHour : 0), 0)
    const achievementRate = totalTargetTon > 0 ? (totalActualTon / totalTargetTon) * 100 : 0
    const avgTph = totalHours > 0 ? totalActualTon / totalHours : 0
    const under = yearly.filter((row) => row.achievePct < 95)
    const comments = [
      `생산 라인 ${yearly.length}개 중 ${under.length}개 라인이 시간당 목표 대비 95% 미만입니다.`,
      yearly.length > 0
        ? `전체 실적은 ${totalActualTon.toLocaleString()}t, 달성률은 ${achievementRate.toFixed(1)}%입니다.`
        : '선택한 기간의 생산 실적이 아직 없습니다.',
      `현재 평균 시간당 생산량은 ${avgTph.toFixed(1)} t/h이며, 회사 기준은 ${targetTph.toFixed(1)} t/h입니다.`,
    ]

    return {
      yearly,
      productBenchmarks,
      realisticTargets,
      comments,
      totals: {
        actualTon: totalActualTon,
        targetTon: totalTargetTon,
        hours: totalHours,
        avgTph,
        achievementRate,
      },
    }
  }, [lineNameMap, prodRecords, selectedYear, targetTph])

  const gasStats = useMemo(() => {
    type FurnaceStatus = NonNullable<ReportDataPayload['furnaceGasStats']>[number]['status']

    const monthly = companyGas
      .map((item) => {
        const chargeWeight = safeNumber(item.charge_weight_kg)
        const gasUsage = safeNumber(item.gas_usage)
        if (chargeWeight <= 0) return null
        return {
          ym: item.ym,
          actualUnit: gasUsage / (chargeWeight / 1000),
          targetUnit: gasTarget,
          gasUsage,
          chargeWeight,
        }
      })
      .filter((item): item is { ym: string; actualUnit: number; targetUnit: number; gasUsage: number; chargeWeight: number } => item !== null)

    const furnaceBuckets = new Map<string, { furnaceCode: string; usage: number; weightKg: number }>()
    for (const record of gasRecords) {
      const furnaceCode = record.furnace_code || record.furnace?.code || '미상'
      const bucket = furnaceBuckets.get(furnaceCode) ?? { furnaceCode, usage: 0, weightKg: 0 }
      bucket.usage += safeNumber(record.gas_usage)
      bucket.weightKg += safeNumber(record.charge_weight_kg)
      furnaceBuckets.set(furnaceCode, bucket)
    }

    const furnaceStats: Array<{
      furnaceCode: string
      avgUnit: number
      targetUnit: number
      status: FurnaceStatus
    }> = Array.from(furnaceBuckets.values())
      .map((item) => {
        const avgUnit = item.weightKg > 0 ? item.usage / (item.weightKg / 1000) : 0
        return {
          furnaceCode: item.furnaceCode,
          avgUnit,
          targetUnit: gasTarget,
          status: (avgUnit > gasTarget * 1.2 ? '경고' : avgUnit > gasTarget * 1.05 ? '주의' : '정상') as FurnaceStatus,
        }
      })
      .sort((a, b) => b.avgUnit - a.avgUnit)

    const comments = [
      `월별 가스원단위는 총 ${monthly.length}개월 데이터를 기준으로 계산했습니다.`,
      furnaceStats.length > 0
        ? `호기별 평균 원단위가 높은 순으로 정렬했습니다.`
        : '선택한 기간의 가스 데이터가 아직 없습니다.',
      `회사 기준 원단위는 ${gasTarget.toFixed(1)} Nm³/t 입니다.`,
    ]

    return {
      monthly,
      furnaceStats,
      comments,
    }
  }, [companyGas, gasRecords, gasTarget])

  const productivitySummary = [
    { label: '총 생산량', value: `${productivityStats.totals.actualTon.toLocaleString()} t`, helper: `목표 ${productivityStats.totals.targetTon.toLocaleString()} t` },
    { label: '평균 TPH', value: productivityStats.totals.avgTph.toFixed(1), helper: `기준 ${targetTph.toFixed(1)} t/h` },
    { label: '달성률', value: `${productivityStats.totals.achievementRate.toFixed(1)}%`, helper: '시간당 목표 기준' },
    { label: '라인 수', value: `${productivityStats.yearly.length}`, helper: '분석 대상 라인' },
  ]

  const gasSummary = [
    {
      label: '평균 원단위',
      value:
        gasStats.monthly.length > 0
          ? `${(
              gasStats.monthly.reduce((sum, row) => sum + row.actualUnit, 0) / gasStats.monthly.length
            ).toFixed(1)} Nm³/t`
          : '-',
      helper: `기준 ${gasTarget.toFixed(1)} Nm³/t`,
    },
    {
      label: '월 데이터',
      value: `${gasStats.monthly.length}`,
      helper: '전사 월별 집계',
    },
    {
      label: '가스 사용량',
      value:
        gasStats.monthly.length > 0
          ? `${gasStats.monthly.reduce((sum, row) => sum + row.gasUsage, 0).toLocaleString()}`
          : '-',
      helper: 'Nm³',
    },
    {
      label: '가열로 수',
      value: `${gasStats.furnaceStats.length}`,
      helper: '분석 대상 호기',
    },
  ]

  const handleDownloadPpt = async () => {
    try {
      setGeneratingPpt(true)
      toast.info('PPT 보고서를 생성 중입니다...')

      const payload: ReportDataPayload = {
        type: reportType,
        periodLabel: `${selectedYear}년`,
        createdDateKst: new Date().toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' }),
        lines: lines?.map((line) => ({ code: line.code, name: line.name })) ?? [],
        furnaces: furnaces?.map((furnace) => ({ code: furnace.code, name: furnace.name })) ?? [],
        yearlyProductivity: productivityStats.yearly,
        productBenchmarks: productivityStats.productBenchmarks,
        realisticTargets: productivityStats.realisticTargets,
        monthlyGas: gasStats.monthly,
        furnaceGasStats: gasStats.furnaceStats,
        summaryComments: reportType === 'productivity' ? productivityStats.comments : gasStats.comments,
      }

      await generatePptxReport(payload)
      toast.success('PPT 파일을 저장했습니다.')
    } catch (error: any) {
      toast.error(`PPT 생성 실패: ${error?.message ?? '알 수 없는 오류'}`)
    } finally {
      setGeneratingPpt(false)
    }
  }

  const handleDownloadPdfCanvas = async () => {
    if (!reportContainerRef.current) return

    try {
      setGeneratingPdf(true)
      toast.info('PDF를 생성 중입니다...')

      const canvas = await html2canvas(reportContainerRef.current, { scale: 2, useCORS: true } as any)
      const imgData = canvas.toDataURL('image/png')

      const pdf = new jsPDF('p', 'mm', 'a4')
      const pdfWidth = pdf.internal.pageSize.getWidth()
      const pdfHeight = (canvas.height * pdfWidth) / canvas.width

      pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight)
      pdf.save(`가열로인사이트_${reportType === 'productivity' ? '생산성보고서' : '가스원단위보고서'}_${selectedYear}.pdf`)
      toast.success('PDF를 저장했습니다.')
    } catch (error: any) {
      toast.error(`PDF 생성 실패: ${error?.message ?? '알 수 없는 오류'}`)
    } finally {
      setGeneratingPdf(false)
    }
  }

  const selectedSummaryComments = reportType === 'productivity' ? productivityStats.comments : gasStats.comments

  return (
    <div className="space-y-6 pb-12">
      <Card className="print:hidden border-primary/20 bg-muted/30">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <FileText className="w-5 h-5 text-primary" />
            보고서 자동 생성 및 PDF/PPT 출력 설정
          </CardTitle>
          <CardDescription>
            새 입력 구조를 기준으로 생산성과 가스원단위를 바로 비교하고, 버튼 한 번으로 보고서를 출력합니다.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex bg-background border rounded-lg p-1">
                <Button
                  size="sm"
                  variant={reportType === 'productivity' ? 'default' : 'ghost'}
                  onClick={() => setReportType('productivity')}
                  className="text-xs px-3"
                >
                  생산성 보고서
                </Button>
                <Button
                  size="sm"
                  variant={reportType === 'gas' ? 'default' : 'ghost'}
                  onClick={() => setReportType('gas')}
                  className="text-xs px-3"
                >
                  가스원단위 보고서
                </Button>
              </div>

              <Select value={selectedYear} onValueChange={(value) => setSelectedYear(value || '2026')}>
                <SelectTrigger className="w-28 h-8 text-xs bg-background">
                  <SelectValue placeholder="연도 선택" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="2026">2026년</SelectItem>
                  <SelectItem value="2025">2025년</SelectItem>
                  <SelectItem value="2024">2024년</SelectItem>
                </SelectContent>
              </Select>

              {reportType === 'productivity' && (
                <Select value={selectedLine} onValueChange={(value) => setSelectedLine(value || 'all')}>
                  <SelectTrigger className="w-44 h-8 text-xs bg-background">
                    <SelectValue placeholder="모든 라인" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">전체 라인</SelectItem>
                    {lines?.map((line) => (
                      <SelectItem key={line.code} value={line.code}>
                        {line.code} · {line.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>

            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => window.print()}
                className="gap-1.5 text-xs h-9 bg-background font-medium"
              >
                <Printer className="w-4 h-4 text-primary" />
                인쇄 모드
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleDownloadPdfCanvas}
                disabled={generatingPdf}
                className="gap-1.5 text-xs h-9 bg-background font-medium"
              >
                <Download className="w-4 h-4 text-emerald-600" />
                PDF 저장
              </Button>
              <Button
                size="sm"
                onClick={handleDownloadPpt}
                disabled={generatingPpt}
                className="gap-1.5 text-xs h-9 font-semibold bg-amber-600 hover:bg-amber-700 text-white"
              >
                <Presentation className="w-4 h-4" />
                PPT 저장(.pptx)
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <div
        ref={reportContainerRef}
        className="bg-card text-card-foreground border rounded-xl p-8 space-y-8 shadow-sm print:border-none print:shadow-none print:p-0"
      >
        <div className="border-b pb-6 flex flex-col md:flex-row justify-between items-start md:items-end gap-4">
          <div>
            <Badge variant="outline" className="mb-2 text-primary border-primary/40 font-semibold">
              단조 공장 생산/가스 분석 리포트
            </Badge>
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
              {reportType === 'productivity' ? '생산성 종합 보고서' : '가스원단위 종합 보고서'}
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              분석 기간: {selectedYear}년 | 생성 시각: {new Date().toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul' })} (KST)
            </p>
          </div>
          <div className="text-right hidden md:block">
            <span className="text-xs font-bold text-muted-foreground block">APPROVED BY</span>
            <span className="text-sm font-semibold">공장 관리 / 에너지 TF</span>
          </div>
        </div>

        <div className="bg-muted/40 rounded-lg p-5 border border-border/80 space-y-2">
          <h2 className="text-sm font-bold text-foreground flex items-center gap-1.5">
            <CheckCircle2 className="w-4 h-4 text-primary" />
            자동 요약
          </h2>
          <div className="space-y-1.5 text-xs text-muted-foreground leading-relaxed">
            {selectedSummaryComments.map((comment, idx) => (
              <p key={idx} className="flex items-start gap-1.5">
                <span className="font-semibold text-foreground">[{idx + 1}]</span>
                {comment}
              </p>
            ))}
          </div>
        </div>

        {reportType === 'productivity' ? (
          <div className="space-y-8">
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
              {productivitySummary.map((item) => (
                <Card key={item.label} className="border-border/70">
                  <CardHeader className="pb-2">
                    <CardDescription className="text-xs">{item.label}</CardDescription>
                    <CardTitle className="text-2xl">{item.value}</CardTitle>
                  </CardHeader>
                  <CardContent className="pt-0 text-xs text-muted-foreground">{item.helper}</CardContent>
                </Card>
              ))}
            </div>

            <div className="space-y-4">
              <h3 className="text-base font-bold border-l-4 border-primary pl-2">1. 라인별 목표 대비 실적</h3>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
                <div className="border rounded-lg overflow-hidden">
                  <Table>
                    <TableHeader className="bg-muted/50">
                      <TableRow>
                        <TableHead className="text-xs font-bold">라인</TableHead>
                        <TableHead className="text-xs font-bold text-right">목표(추정)</TableHead>
                        <TableHead className="text-xs font-bold text-right">실적</TableHead>
                        <TableHead className="text-xs font-bold text-right">달성률</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {productivityStats.yearly.length > 0 ? (
                        productivityStats.yearly.map((row) => (
                          <TableRow key={row.lineCode}>
                            <TableCell className="text-xs font-medium">{row.lineName}</TableCell>
                            <TableCell className="text-xs text-right">{row.planTon.toLocaleString()}</TableCell>
                            <TableCell className="text-xs text-right font-semibold">{row.actualTon.toLocaleString()}</TableCell>
                            <TableCell className="text-xs text-right">
                              <Badge variant={row.achievePct >= 100 ? 'default' : 'secondary'} className="text-[10px]">
                                {row.achievePct.toFixed(1)}%
                              </Badge>
                            </TableCell>
                          </TableRow>
                        ))
                      ) : (
                        <TableRow>
                          <TableCell colSpan={4} className="text-center py-6 text-xs text-muted-foreground">
                            선택한 기간에 생산 데이터가 없습니다.
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>

                <div className="h-72 w-full border rounded-lg p-4">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={productivityStats.yearly}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} />
                      <XAxis dataKey="lineCode" textAnchor="middle" fontSize={11} />
                      <YAxis fontSize={11} />
                      <Tooltip formatter={(value: any) => `${Number(value).toLocaleString()} t`} />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                      <Bar dataKey="planTon" name="목표 생산량" fill="#94A3B8" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="actualTon" name="실적 생산량" fill="#1D4ED8" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <h3 className="text-base font-bold border-l-4 border-primary pl-2">2. 제품별 시간당 생산량 비교</h3>
              <div className="border rounded-lg p-4 h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={productivityStats.productBenchmarks}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="productName" fontSize={11} />
                    <YAxis fontSize={11} />
                    <Tooltip formatter={(value: any) => `${Number(value).toFixed(1)} t/h`} />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Bar dataKey="actualTph" name="실제 평균 (t/h)" fill="#1D4ED8" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="benchmarkTph" name="회사 기준 (t/h)" fill="#EF4444" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="space-y-4">
              <h3 className="text-base font-bold border-l-4 border-primary pl-2">3. 라인별 현실 목표 제안</h3>
              <div className="border rounded-lg overflow-hidden">
                <Table>
                  <TableHeader className="bg-muted/50">
                    <TableRow>
                      <TableHead className="text-xs font-bold">라인</TableHead>
                      <TableHead className="text-xs font-bold text-right">현재 평균</TableHead>
                      <TableHead className="text-xs font-bold text-right">기준</TableHead>
                      <TableHead className="text-xs font-bold text-right text-primary">제안 목표</TableHead>
                      <TableHead className="text-xs font-bold">설명</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {productivityStats.realisticTargets.map((row) => (
                      <TableRow key={row.lineCode}>
                        <TableCell className="text-xs font-bold">{row.lineCode}</TableCell>
                        <TableCell className="text-xs text-right">{row.currentAvg.toFixed(1)}</TableCell>
                        <TableCell className="text-xs text-right">{row.benchmark.toFixed(1)}</TableCell>
                        <TableCell className="text-xs text-right font-extrabold text-primary">{row.proposedTarget.toFixed(1)}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{row.reason}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-8">
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
              {gasSummary.map((item) => (
                <Card key={item.label} className="border-border/70">
                  <CardHeader className="pb-2">
                    <CardDescription className="text-xs">{item.label}</CardDescription>
                    <CardTitle className="text-2xl">{item.value}</CardTitle>
                  </CardHeader>
                  <CardContent className="pt-0 text-xs text-muted-foreground">{item.helper}</CardContent>
                </Card>
              ))}
            </div>

            <div className="space-y-4">
              <h3 className="text-base font-bold border-l-4 border-primary pl-2">1. 전사 월별 원단위 추이</h3>
              <div className="border rounded-lg p-4 h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={gasStats.monthly}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="ym" fontSize={11} />
                    <YAxis fontSize={11} />
                    <Tooltip formatter={(value: any) => `${Number(value).toFixed(1)} Nm³/t`} />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Line type="monotone" dataKey="actualUnit" name="실적 원단위" stroke="#1D4ED8" strokeWidth={3} dot={{ r: 4 }} />
                    <Line type="step" dataKey="targetUnit" name="목표 원단위" stroke="#10B981" strokeWidth={2} strokeDasharray="5 5" />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="space-y-4">
              <h3 className="text-base font-bold border-l-4 border-primary pl-2">2. 호기별 평균 원단위</h3>
              <div className="border rounded-lg overflow-hidden">
                <Table>
                  <TableHeader className="bg-muted/50">
                    <TableRow>
                      <TableHead className="text-xs font-bold">호기</TableHead>
                      <TableHead className="text-xs font-bold text-right">평균 원단위</TableHead>
                      <TableHead className="text-xs font-bold text-right">기준</TableHead>
                      <TableHead className="text-xs font-bold text-center">상태</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {gasStats.furnaceStats.length > 0 ? (
                      gasStats.furnaceStats.map((row) => (
                        <TableRow key={row.furnaceCode} className={row.status === '경고' ? 'bg-red-500/10' : ''}>
                          <TableCell className="text-xs font-medium">
                            {furnaceNameMap.get(row.furnaceCode) ?? row.furnaceCode}
                          </TableCell>
                          <TableCell className="text-xs text-right font-bold">{row.avgUnit.toFixed(1)}</TableCell>
                          <TableCell className="text-xs text-right">{row.targetUnit.toFixed(1)}</TableCell>
                          <TableCell className="text-xs text-center">
                            <Badge
                              variant={row.status === '경고' ? 'destructive' : row.status === '주의' ? 'secondary' : 'default'}
                              className="text-[10px]"
                            >
                              {row.status}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))
                    ) : (
                      <TableRow>
                        <TableCell colSpan={4} className="text-center py-6 text-xs text-muted-foreground">
                          선택한 기간에 가스 데이터가 없습니다.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </div>
          </div>
        )}

        <div className="border-t pt-4 flex justify-between items-center text-[11px] text-muted-foreground">
          <span>가열로 인사이트 자동 보고서</span>
          <span className="inline-flex items-center gap-1">
            새 입력 구조 반영 <ArrowRight className="w-3 h-3" />
          </span>
        </div>
      </div>
    </div>
  )
}
