import PptxGenJS from 'pptxgenjs'
import { format } from 'date-fns'

export interface ReportDataPayload {
  type: 'productivity' | 'gas'
  periodLabel: string
  createdDateKst: string
  lines?: { code: string; name: string }[]
  furnaces?: { code: string; name: string }[]
  yearlyProductivity?: {
    year: number
    lineCode: string
    planTon: number
    actualTon: number
    achievePct: number
    tonPerHour: number
  }[]
  productBenchmarks?: {
    productName: string
    actualTph: number
    benchmarkTph: number
    gap: number
  }[]
  realisticTargets?: {
    lineCode: string
    currentAvg: number
    benchmark: number
    proposedTarget: number
    reason: string
  }[]
  monthlyGas?: {
    ym: string
    actualUnit: number
    targetUnit: number
    gasUsage: number
    chargeWeight: number
  }[]
  furnaceGasStats?: {
    furnaceCode: string
    avgUnit: number
    targetUnit: number
    status: '정상' | '주의' | '경고'
  }[]
  summaryComments: string[]
}

export async function generatePptxReport(data: ReportDataPayload) {
  const pptx = new PptxGenJS()
  pptx.layout = 'LAYOUT_16x9'

  // 테마 색상 설정 (태웅 블루 / 짙은 네이비)
  const COLOR_PRIMARY = '1D4ED8'
  const COLOR_DARK    = '0F172A'
  const COLOR_LIGHT   = 'F8FAFC'
  const COLOR_ACCENT  = 'F59E0B'
  const COLOR_MUTED   = '64748B'

  const FONT_TITLE  = '맑은 고딕'
  const FONT_BODY   = '맑은 고딕'

  // 슬라이드 1: 표지
  const coverSlide = pptx.addSlide()
  coverSlide.background = { color: COLOR_DARK }

  coverSlide.addText(
    data.type === 'productivity'
      ? '단조 생산성 향상 종합 분석 보고서'
      : '가열로 가스원단위 종합 절감 보고서',
    {
      x: 0.8,
      y: 2.2,
      w: 8.4,
      h: 1.2,
      fontSize: 32,
      fontFace: FONT_TITLE,
      bold: true,
      color: 'FFFFFF',
    }
  )

  coverSlide.addText(`분석 대상 기간: ${data.periodLabel}\n생성일시(KST): ${data.createdDateKst}`, {
    x: 0.8,
    y: 3.6,
    w: 8.0,
    h: 0.8,
    fontSize: 16,
    fontFace: FONT_BODY,
    color: '94A3B8',
  })

  coverSlide.addText('(주)태웅 — 단조/에너지 스마트 분석 시스템', {
    x: 0.8,
    y: 5.8,
    w: 8.0,
    h: 0.5,
    fontSize: 14,
    fontFace: FONT_BODY,
    bold: true,
    color: COLOR_ACCENT,
  })

  // 공통 마스터 레이아웃 헬퍼
  const addSlideHeader = (slide: PptxGenJS.Slide, title: string, subtitle?: string) => {
    slide.addText(title, {
      x: 0.6,
      y: 0.4,
      w: 8.8,
      h: 0.5,
      fontSize: 22,
      fontFace: FONT_TITLE,
      bold: true,
      color: COLOR_DARK,
    })
    if (subtitle) {
      slide.addText(subtitle, {
        x: 0.6,
        y: 0.9,
        w: 8.8,
        h: 0.3,
        fontSize: 12,
        fontFace: FONT_BODY,
        color: COLOR_MUTED,
      })
    }
    // 하단 바닥글
    slide.addText(`가열로 인사이트 보고서 (${data.periodLabel}) | 출력일: ${data.createdDateKst}`, {
      x: 0.6,
      y: 7.1,
      w: 8.8,
      h: 0.3,
      fontSize: 10,
      fontFace: FONT_BODY,
      color: '94A3B8',
    })
  }

  // 보고서 종류에 따른 슬라이드 구성
  if (data.type === 'productivity') {
    // 슬라이드 2: 종합 의견 및 개선 우선순위
    const summarySlide = pptx.addSlide()
    addSlideHeader(summarySlide, '1. 경영진 보고 요약 및 개선 우선순위', '데이터 실적 기반 자동 분석 결과')

    let yOffset = 1.5
    data.summaryComments.forEach((comment, idx) => {
      summarySlide.addText(`• [분석 ${idx + 1}] ${comment}`, {
        x: 0.8,
        y: yOffset,
        w: 8.4,
        h: 0.6,
        fontSize: 14,
        fontFace: FONT_BODY,
        color: COLOR_DARK,
        fill: { color: COLOR_LIGHT },
      })
      yOffset += 0.8
    })

    // 슬라이드 3: 라인별 목표 대비 실적 및 달성률
    const lineSlide = pptx.addSlide()
    addSlideHeader(lineSlide, '2. 주요 라인별 생산 목표 vs 실적 비교', 'P5, P8, P15, R/M 연도별 실적')

    if (data.yearlyProductivity && data.yearlyProductivity.length > 0) {
      // 테이블 생성
      const tableHeaders = ['연도', '라인', '목표 생산량(톤)', '실적 생산량(톤)', '달성률(%)', '시간당생산량(t/h)']
      const tableRows = data.yearlyProductivity.slice(0, 8).map((r) => [
        r.year.toString(),
        r.lineCode,
        r.planTon.toLocaleString(),
        r.actualTon.toLocaleString(),
        `${r.achievePct.toFixed(1)}%`,
        r.tonPerHour.toFixed(1),
      ])

      lineSlide.addTable([tableHeaders, ...tableRows] as any, {
        x: 0.6,
        y: 1.5,
        w: 4.6,
        h: 4.8,
        fontSize: 11,
        fontFace: FONT_BODY,
        border: { pt: 1, color: 'E2E8F0' },
        fill: { color: COLOR_LIGHT },
        color: COLOR_DARK,
        autoPage: false,
      })

      // 네이티브 편집 가능 차트 (막대)
      const chartYears = Array.from(new Set(data.yearlyProductivity.map((p) => p.year.toString())))
      const chartPlanData = chartYears.map((y) => {
        const sum = data.yearlyProductivity!
          .filter((p) => p.year.toString() === y)
          .reduce((acc, curr) => acc + curr.planTon, 0)
        return sum
      })
      const chartActualData = chartYears.map((y) => {
        const sum = data.yearlyProductivity!
          .filter((p) => p.year.toString() === y)
          .reduce((acc, curr) => acc + curr.actualTon, 0)
        return sum
      })

      lineSlide.addChart(
        pptx.ChartType.bar,
        [
          { name: '목표 생산량', labels: chartYears, values: chartPlanData },
          { name: '실적 생산량', labels: chartYears, values: chartActualData },
        ],
        {
          x: 5.4,
          y: 1.5,
          w: 4.2,
          h: 4.8,
          chartColors: ['94A3B8', COLOR_PRIMARY],
          showLegend: true,
          legendPos: 't',
          valGridLine: { color: 'E2E8F0', size: 1 },
        }
      )
    } else {
      lineSlide.addText('선택한 기간의 생산 실적 데이터가 없습니다.', { x: 0.8, y: 3.0, fontSize: 14 })
    }

    // 슬라이드 4: 제품별 시간당 생산량 vs 두산 벤치마크
    const bmSlide = pptx.addSlide()
    addSlideHeader(bmSlide, '3. 제품/재질별 시간당 생산량 (t/h) 및 벤치마크 비교', '두산 기준값(금형강 25, 크랭크축 26 등) 대비')

    if (data.productBenchmarks && data.productBenchmarks.length > 0) {
      const labels = data.productBenchmarks.map((b) => b.productName)
      const actualVals = data.productBenchmarks.map((b) => Number(b.actualTph.toFixed(1)))
      const bmVals = data.productBenchmarks.map((b) => Number(b.benchmarkTph.toFixed(1)))

      bmSlide.addChart(
        pptx.ChartType.bar,
        [
          { name: '당사 실측 (t/h)', labels, values: actualVals },
          { name: '벤치마크 (t/h)', labels, values: bmVals },
        ],
        {
          x: 0.6,
          y: 1.5,
          w: 8.8,
          h: 4.8,
          chartColors: [COLOR_PRIMARY, 'EF4444'],
          showLegend: true,
          legendPos: 't',
        }
      )
    }
  } else {
    // 가스원단위 보고서
    const summarySlide = pptx.addSlide()
    addSlideHeader(summarySlide, '1. 가스원단위 절감 분석 요약', '호기별 낭비 요인 및 목표선 격차')

    let yOffset = 1.5
    data.summaryComments.forEach((comment, idx) => {
      summarySlide.addText(`• [분석 ${idx + 1}] ${comment}`, {
        x: 0.8,
        y: yOffset,
        w: 8.4,
        h: 0.6,
        fontSize: 14,
        fontFace: FONT_BODY,
        color: COLOR_DARK,
        fill: { color: COLOR_LIGHT },
      })
      yOffset += 0.8
    })

    // 월별 추이 슬라이드
    const trendSlide = pptx.addSlide()
    addSlideHeader(trendSlide, '2. 전사 가스원단위 월별 추이 vs 목표선(150)', '낮을수록 우수 (단위: Nm³/톤)')

    if (data.monthlyGas && data.monthlyGas.length > 0) {
      const labels = data.monthlyGas.map((m) => m.ym)
      const actuals = data.monthlyGas.map((m) => Number(m.actualUnit.toFixed(1)))
      const targets = data.monthlyGas.map((m) => Number(m.targetUnit.toFixed(1)))

      trendSlide.addChart(
        pptx.ChartType.line,
        [
          { name: '실적 원단위', labels, values: actuals },
          { name: '목표 원단위 (150)', labels, values: targets },
        ],
        {
          x: 0.6,
          y: 1.5,
          w: 8.8,
          h: 4.8,
          chartColors: [COLOR_PRIMARY, '10B981'],
          lineSize: 3,
          showLegend: true,
          legendPos: 't',
        }
      )
    }
  }

  // 파일 다운로드 트리거
  const fileName = `가열로인사이트_${data.type === 'productivity' ? '생산성보고서' : '가스원단위보고서'}_${data.periodLabel.replace(/[^0-9-]/g, '')}.pptx`
  await pptx.writeFile({ fileName })
}
