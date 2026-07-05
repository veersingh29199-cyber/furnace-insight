'use client'

import { useState } from 'react'
import type { LucideIcon } from 'lucide-react'
import {
  ArrowRight,
  ClipboardList,
  Download,
  BarChart3,
  FileSpreadsheet,
  Flame,
  Sparkles,
  Target,
  Upload,
} from 'lucide-react'
import { ImportPanel } from '@/components/import/import-panel'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { RouteHero } from '@/components/input/route-hero'
import type { ImportDatasetKey } from '@/types'

type TemplateSpec = {
  label: string
  datasetKey: ImportDatasetKey
  fileName: string
  sheetName: string
  headers: string[]
  sampleRow: string[]
}

type GuideSpec = {
  key: string
  title: string
  description: string
  icon: LucideIcon
  badge: string
  note: string
  templates: TemplateSpec[]
}

const UPLOAD_GUIDES: GuideSpec[] = [
  {
    key: 'production',
    title: '생산 실적',
    description: '전일 생산 실적을 수주번호와 공정 기준으로 바로 올립니다.',
    icon: ClipboardList,
    badge: 'production_records',
    note: '작업시간·작업횟수는 수주번호와 공정 옆에서 함께 입력하면 됩니다.',
    templates: [
      {
        label: '생산량 집계표 템플릿',
        datasetKey: 'production',
        fileName: 'production_records_template',
        sheetName: '생산실적',
        headers: ['일자', '작업부서', '작업조', '수주번호', '공정', '작업시간', '작업횟수', '제품', '재질', '수주치수', '작업치수', '수주중량', '투입중량', '가열로'],
        sampleRow: ['2026-07-01', 'P5', '주간', 'SO-001', '가열', '2.5', '3', '봉강', 'S45C', '50', '48', '120.5', '130.0', '18호기'],
      },
    ],
  },
  {
    key: 'gas',
    title: '가열로 가스',
    description: '월별 가스사용량과 일일 검침값을 같은 화면에서 처리합니다.',
    icon: Flame,
    badge: 'gas_records',
    note: '월 자료는 장입중량과 가스사용량, 일 자료는 일자·호기·조·검침값을 사용합니다.',
    templates: [
      {
        label: '월별 가스 템플릿',
        datasetKey: 'gas-monthly',
        fileName: 'gas_monthly_template',
        sheetName: '월별가스',
        headers: ['월', '호기', '장입중량', '가스사용량', '출처'],
        sampleRow: ['2026-07-01', '18호기', '3450', '512000', 'meter'],
      },
      {
        label: '일일 가스 템플릿',
        datasetKey: 'gas-daily',
        fileName: 'gas_daily_template',
        sheetName: '일일가스',
        headers: ['일자', '호기', '조', '검침값'],
        sampleRow: ['2026-07-01', '18호기', '주간', '1234'],
      },
    ],
  },
  {
    key: 'line-output',
    title: '생산량집계표',
    description: '일일/월별 라인×재질 집계표 원본을 그대로 올리면 자동으로 인식해 저장합니다.',
    icon: BarChart3,
    badge: 'line_output',
    note: '파일 안에 2601월 같은 일일 시트와 2024년 전체 같은 연간 시트가 함께 있어도 됩니다. 사용자가 앱 양식으로 바꿀 필요가 없습니다.',
    templates: [
      {
        label: '생산량집계표 일일 샘플',
        datasetKey: 'line-output',
        fileName: 'production_summary_daily_template',
        sheetName: '2601월',
        headers: ['작성일자', '15000TON', '5000TON', '11000 R/M', 'TOTAL'],
        sampleRow: ['2026-01-01', '28797', '0', '251318', '429773'],
      },
      {
        label: '생산량집계표 연간 샘플',
        datasetKey: 'line-output',
        fileName: 'production_summary_yearly_template',
        sheetName: '2024년 전체',
        headers: ['작업월', '15000TON', '5000TON', '8000TON', '9500 R/M', 'TOTAL'],
        sampleRow: ['2024-01-01', '2567480', '1754090', '7489', '7166807', '7550617'],
      },
    ],
  },
  {
    key: 'work-standards',
    title: '표준작업수 마스터',
    description: '부서·제품·재질·기준별 표준작업수를 등록합니다.',
    icon: Target,
    badge: 'work_standards',
    note: '기준은 장입 기준과 제품 기준 두 가지를 모두 지원합니다.',
    templates: [
      {
        label: '표준작업수 템플릿',
        datasetKey: 'work-standards',
        fileName: 'work_standards_template',
        sheetName: '표준작업수',
        headers: ['부서', '제품', '재질', '기준', '최소투입중량', '최대투입중량', '수주치수', '표준작업수'],
        sampleRow: ['P5', '봉강', 'S45C', 'charge', '0', '5', '50', '3'],
      },
    ],
  },
  {
    key: 'targets',
    title: '연간 목표',
    description: '부서와 연도를 기준으로 목표값을 한 번에 올립니다.',
    icon: Sparkles,
    badge: 'targets',
    note: '연도와 부서가 정확해야 대시보드와 분석에서 바로 연결됩니다.',
    templates: [
      {
        label: '연간 목표 템플릿',
        datasetKey: 'targets',
        fileName: 'targets_template',
        sheetName: '연간목표',
        headers: ['연도', '부서', 'scope', '지표', '목표값', '기준'],
        sampleRow: ['2026', 'P5', 'company', 'ton_per_hour', '20', '회사 기준'],
      },
    ],
  },
  {
    key: 'raw-material-specs',
    title: '원소재 규격',
    description: '제품·재질별 원소재와 규격을 정리합니다.',
    icon: FileSpreadsheet,
    badge: 'raw_material_specs',
    note: '제품과 재질 조합이 같아야 나중에 원소재 규격을 안정적으로 조회할 수 있습니다.',
    templates: [
      {
        label: '원소재 규격 템플릿',
        datasetKey: 'raw-material-specs',
        fileName: 'raw_material_specs_template',
        sheetName: '원소재규격',
        headers: ['제품', '재질', '원소재', '규격'],
        sampleRow: ['봉강', 'S45C', 'SCM', 'φ50-φ80'],
      },
    ],
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

function TemplateBlock({
  template,
  onOpen,
}: {
  template: TemplateSpec
  onOpen: (datasetKey: ImportDatasetKey) => void
}) {
  return (
    <div className="rounded-2xl border border-border/70 bg-background/80 p-4 shadow-sm">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1">
          <p className="text-sm font-semibold">{template.label}</p>
          <p className="text-xs text-muted-foreground">
            헤더: {template.headers.join(' · ')}
          </p>
          <p className="text-xs text-muted-foreground">
            예시: {template.sampleRow.join(' · ')}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" className="gap-2" onClick={() => void downloadTemplate(template)}>
            <Download className="h-4 w-4" />
            템플릿 다운로드
          </Button>
          <Button size="sm" className="gap-2" onClick={() => onOpen(template.datasetKey)}>
            <ArrowRight className="h-4 w-4" />
            입력 시작
          </Button>
        </div>
      </div>
    </div>
  )
}

function GuideCard({
  guide,
  onOpen,
}: {
  guide: GuideSpec
  onOpen: (datasetKey: ImportDatasetKey) => void
}) {
  const Icon = guide.icon

  return (
    <Card className="border-border/70 bg-card/90 shadow-sm">
      <CardHeader className="space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="rounded-2xl bg-primary/10 p-3 text-primary">
              <Icon className="h-5 w-5" />
            </div>
            <div className="space-y-1">
              <CardTitle className="text-lg">{guide.title}</CardTitle>
              <CardDescription className="text-sm leading-6">{guide.description}</CardDescription>
            </div>
          </div>
          <Badge variant="outline" className="shrink-0 border-primary/20 bg-primary/5 text-primary">
            {guide.badge}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground leading-6">{guide.note}</p>
        <div className="space-y-3">
          {guide.templates.map((template) => (
            <TemplateBlock key={template.fileName} template={template} onOpen={onOpen} />
          ))}
        </div>
      </CardContent>
    </Card>
  )
}

export default function UploadPage() {
  const [preferredDatasetKey, setPreferredDatasetKey] = useState<ImportDatasetKey>('production')

  const openImporter = (datasetKey: ImportDatasetKey) => {
    setPreferredDatasetKey(datasetKey)
    document.getElementById('import-panel')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  return (
    <div className="space-y-6 pb-12">
      <RouteHero
        eyebrow="업로드"
        title="무엇을 올려야 하는지 한눈에 보이는 업로드 화면"
        description="생산, 가스, 표준작업수, 목표, 원소재 규격을 각각 카드로 안내하고, 템플릿을 내려받아 바로 업로드할 수 있게 구성했습니다."
        metrics={[
          {
            label: '지원 카드',
            value: '5종',
            hint: '업로드 종류별 카드',
            tone: 'success',
          },
          {
            label: '스마트 임포터',
            value: '자동 매핑',
            hint: '붙여넣기 / 파일 업로드',
            tone: 'default',
          },
          {
            label: '저장 방식',
            value: 'upsert',
            hint: '중복은 수정',
            tone: 'success',
          },
          {
            label: '저장 위치',
            value: 'Supabase',
            hint: '서버 영속 저장',
            tone: 'default',
          },
        ]}
        actions={(
          <>
            <Button className="gap-2" onClick={() => openImporter('production')}>
              <Upload className="h-4 w-4" />
              생산 실적 열기
            </Button>
            <Button variant="outline" className="gap-2" onClick={() => openImporter('gas-monthly')}>
              <FileSpreadsheet className="h-4 w-4" />
              가스 임포터 열기
            </Button>
          </>
        )}
      />

      <div className="grid gap-4 xl:grid-cols-2">
        {UPLOAD_GUIDES.map((guide) => (
          <GuideCard key={guide.key} guide={guide} onOpen={openImporter} />
        ))}
      </div>

      <section id="import-panel" className="space-y-3">
        <div className="space-y-1">
          <h2 className="text-lg font-semibold">스마트 임포터</h2>
          <p className="text-sm text-muted-foreground">
            업로드한 파일을 분석해 컬럼을 자동 매핑하고, 미리보기에서 검증한 뒤 정상 행만 서버에 저장합니다.
          </p>
        </div>
        <ImportPanel preferredDatasetKey={preferredDatasetKey} />
      </section>
    </div>
  )
}
