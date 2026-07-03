'use client'

import { useMemo } from 'react'
import { ArrowRight, Download, FileSpreadsheet, FileUp, Sparkles, Upload } from 'lucide-react'
import { ImportPanel } from '@/components/import/import-panel'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

type TemplateSpec = {
  key: 'production' | 'gas-daily' | 'gas-monthly' | 'gas-charge-daily'
  title: string
  description: string
  icon: typeof FileSpreadsheet
  fileName: string
  sheetName: string
  headers: string[]
  sampleRow: string[]
  requiredColumns: string[]
  exampleValues: string[]
  help: string
}

const TEMPLATE_SPECS: TemplateSpec[] = [
  {
    key: 'production',
    title: '생산량 집계표',
    description: '전일 생산 실적을 한 번에 올릴 때 사용합니다.',
    icon: FileSpreadsheet,
    fileName: 'production_records_template',
    sheetName: '생산실적',
    headers: ['work_date', 'dept_line', 'shift', 'order_no', 'process', 'work_hours', 'work_count', 'product', 'material', 'order_size', 'work_size', 'order_weight', 'charge_weight', 'furnace_code'],
    sampleRow: ['2026-07-01', 'P5', 'day', 'SO-001', '가열', '2.5', '3', '축', 'S45C', 'Ø45', 'Ø48', '120.5', '130.0', '18호기'],
    requiredColumns: ['work_date', 'dept_line', 'shift', 'order_no', 'process', 'work_hours', 'work_count', 'order_weight', 'charge_weight', 'furnace_code'],
    exampleValues: ['2026-07-01', 'P5', 'day', 'SO-001', '가열', '2.5h', '3회', '120.5t', '130kg', '18호기'],
    help: '작업시간과 작업횟수는 수주번호와 공정 옆에 두면 가장 빨리 확인됩니다.',
  },
  {
    key: 'gas-charge-daily',
    title: '가열로 장입량 / 투입중량',
    description: '일자 × 호기 장입 파일을 월별 호기 장입량으로 집계할 때 사용합니다.',
    icon: FileUp,
    fileName: 'gas_charge_daily_template',
    sheetName: '장입량',
    headers: ['date', 'shift', 'furnace_code', 'charge_weight_kg'],
    sampleRow: ['2026-07-01', 'day', '18호기', '1,250'],
    requiredColumns: ['date', 'shift', 'furnace_code', 'charge_weight_kg'],
    exampleValues: ['2026-07-01', '주간조', '18호기', '1,250kg'],
    help: '이 형식은 월 가스 카드에서 자동 감지되어 월별 장입량으로 저장됩니다.',
  },
  {
    key: 'gas-daily',
    title: '가열로 일일 가스검침',
    description: '일자 × 호기 표를 그대로 올릴 때 사용합니다.',
    icon: Upload,
    fileName: 'gas_daily_readings_template',
    sheetName: '일일검침',
    headers: ['date', 'furnace_code', 'shift', 'value'],
    sampleRow: ['2026-07-01', '18호기', 'day', '1234'],
    requiredColumns: ['date', 'furnace_code', 'value'],
    exampleValues: ['2026-07-01', '18호기', '주간', '1234'],
    help: '합계열, 정압실, 빈칸, 0 값은 자동 제외됩니다.',
  },
  {
    key: 'gas-monthly',
    title: '월 가스 / 장입',
    description: '가열로별 월 집계와 장입량을 함께 넣을 때 사용합니다.',
    icon: FileUp,
    fileName: 'gas_monthly_template',
    sheetName: '월가스',
    headers: ['ym', 'furnace_code', 'charge_weight_kg', 'gas_usage', 'gas_unit', 'source'],
    sampleRow: ['2026-07-01', '18호기', '3450', '512000', '148.6', 'meter'],
    requiredColumns: ['ym', 'furnace_code', 'gas_usage'],
    exampleValues: ['2026-07-01', '18호기', '3450kg', '512000', '148.6'],
    help: '장입량이 없으면 원단위 계산 경고가 표시됩니다.',
  },
]

async function downloadTemplate(spec: TemplateSpec) {
  const XLSX = await import('xlsx')
  const workbook = XLSX.utils.book_new()
  const worksheet = XLSX.utils.aoa_to_sheet([spec.headers, spec.sampleRow])
  XLSX.utils.book_append_sheet(workbook, worksheet, spec.sheetName)
  const buffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' })
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = `${spec.fileName}.xlsx`
  anchor.style.display = 'none'
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

function TemplateCard({ spec, onDownload, onJump }: { spec: TemplateSpec; onDownload: () => void; onJump: () => void }) {
  const Icon = spec.icon

  return (
    <Card className="border-border/70 bg-card/80 shadow-sm">
      <CardHeader className="space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-primary/10 p-2.5 text-primary">
              <Icon className="h-5 w-5" />
            </div>
            <div className="space-y-1">
              <CardTitle className="text-base">{spec.title}</CardTitle>
              <CardDescription className="text-sm">{spec.description}</CardDescription>
            </div>
          </div>
          <Badge variant="outline" className="shrink-0 border-primary/20 bg-primary/5 text-primary">
            .xlsx / .csv
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">필수 열</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {spec.requiredColumns.map((column) => (
              <Badge key={column} variant="secondary" className="text-[11px]">
                {column}
              </Badge>
            ))}
          </div>
        </div>

        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">예시 값</p>
          <p className="mt-2 text-sm text-muted-foreground leading-6">
            {spec.exampleValues.join(' · ')}
          </p>
        </div>

        <p className="text-xs text-muted-foreground">{spec.help}</p>

        <div className="flex flex-col gap-2 sm:flex-row">
          <Button variant="outline" className="flex-1 gap-2" onClick={onDownload}>
            <Download className="h-4 w-4" />
            예시 템플릿 다운로드
          </Button>
          <Button className="flex-1 gap-2" onClick={onJump}>
            <ArrowRight className="h-4 w-4" />
            아래 임포터로 이동
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

export default function UploadPage() {
  const cards = useMemo(() => TEMPLATE_SPECS, [])

  const scrollToImporter = () => {
    document.getElementById('import-panel')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  return (
    <div className="space-y-6 pb-12">
      <Card className="border-primary/20 bg-gradient-to-br from-primary/10 via-card to-card shadow-sm">
        <CardHeader className="space-y-3">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-primary">
            <Sparkles className="h-4 w-4" />
            무엇을 올려야 하는지 먼저 확인
          </div>
          <CardTitle className="text-2xl sm:text-3xl font-bold tracking-tight">
            파일 종류를 고르고, 템플릿을 내려받아, 바로 임포터에 넣으세요
          </CardTitle>
          <CardDescription className="max-w-3xl text-sm leading-6">
            생산 실적, 가열로 일일 가스검침, 월 가스/장입 파일을 각각의 카드에서 안내합니다.
            아래 임포터는 카드에서 고른 형식과 같은 데이터도 그대로 읽어 들입니다.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-2">
          <Badge variant="outline" className="border-primary/20 bg-primary/5 text-primary">엑셀 붙여넣기</Badge>
          <Badge variant="outline" className="border-primary/20 bg-primary/5 text-primary">드래그 앤 드롭</Badge>
          <Badge variant="outline" className="border-primary/20 bg-primary/5 text-primary">자동 매핑</Badge>
          <Badge variant="outline" className="border-primary/20 bg-primary/5 text-primary">정상 건만 upsert</Badge>
        </CardContent>
      </Card>

      <div className="grid gap-4 xl:grid-cols-4">
        {cards.map((spec) => (
          <TemplateCard
            key={spec.key}
            spec={spec}
            onDownload={() => void downloadTemplate(spec)}
            onJump={scrollToImporter}
          />
        ))}
      </div>

      <section id="import-panel" className="space-y-3">
        <div className="space-y-1">
          <h2 className="text-base font-semibold">스마트 임포터</h2>
          <p className="text-sm text-muted-foreground">
            업로드한 파일을 분석해 컬럼을 매핑하고, 미리보기 후 정상 건만 서버에 저장합니다.
          </p>
        </div>
        <ImportPanel />
      </section>
    </div>
  )
}
