"use client"

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { BookOpen, Flame, BarChart3, Calculator, CheckCircle2 } from 'lucide-react'

export default function HelpPage() {
  const glossaries = [
    {
      term: '가스원단위 (Gas Consumption Unit)',
      unit: 'Nm³/톤',
      category: '에너지 절감 지표 (낮을수록 우수)',
      formula: '월간 가스 사용량(Nm³) ÷ [월간 투입 장입량(kg) ÷ 1,000]',
      desc: '단조 제품 1톤을 가열로에서 열처리/가열하는 데 소비된 가스의 부피입니다. 원단위가 낮을수록 가열로 열효율이 좋고 가스 낭비가 적음을 의미합니다.',
      target: '전사 표준 목표치: 150 Nm³/톤 이내 유지 권장',
    },
    {
      term: '시간당 생산량 (Ton Per Hour, TPH)',
      unit: '톤/h',
      category: '생산성 효율 지표 (높을수록 우수)',
      formula: '월간 총 생산 실적 중량(톤) ÷ 월간 실제 가동 시간(h)',
      desc: '가열로 및 단조 라인이 1시간 동안 실질적으로 만들어낸 합격 단조 중량입니다. 금형 교체나 대기 시간이 짧을수록 이 지표가 상승합니다.',
      target: '두산 벤치마크 기준: 금형강 25 t/h, 크랭크축 26 t/h, 쉘 10 t/h, 로터 7 t/h',
    },
    {
      term: '장입량 (Charge Weight)',
      unit: 'kg',
      category: '현장 직접 입력 기초 데이터',
      formula: '해당 월 가열로 내부에 장입(투입)된 소재 중량 합계',
      desc: '가스원단위를 계산하기 위한 분모가 되는 핵심 입력값입니다. 만약 장입량이 0이거나 미입력된 경우 원단위는 연산되지 않고 "— (미입력)"으로 표시됩니다.',
      target: '매월 말일 엑셀 또는 데이터 입력 창에서 정확한 누적 중량 기입 필요',
    },
    {
      term: '목표 달성률 (Achievement Rate)',
      unit: '%',
      category: '종합 성과 지표',
      formula: '(월간 실제 생산 실적 톤 ÷ 월간 목표 생산 톤) × 100',
      desc: '부서 및 라인별 사전에 확정된 월간 목표 생산량 대비 실적의 비율입니다. 100% 이상이면 초과 달성입니다.',
      target: '전사 관리 기준치: 100% 달성 (최소 95% 이상 유지 요구)',
    },
  ]

  return (
    <div className="space-y-6 pb-12">
      {/* 상단 안내문 */}
      <Card className="border-primary/20 bg-gradient-to-r from-primary/5 via-card to-card">
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <BookOpen className="w-5 h-5 text-primary" />
            가열로 인사이트 공식 데이터 가이드 & 계산 공식
          </CardTitle>
          <CardDescription>
            현장 관리자와 비개발자 부서원 누구나 명확히 이해하고 신뢰할 수 있도록 모든 지표의 정의와 산출 로직을 공개합니다.
          </CardDescription>
        </CardHeader>
      </Card>

      {/* 지표 구분 안내 */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card className="border-emerald-500/30 bg-emerald-500/5">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-bold flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400">
              <CheckCircle2 className="w-4 h-4" />
              ✍️ 현장 직접 입력 데이터 (원시 데이터)
            </CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground space-y-1">
            <p>• 장입량(kg), 가스 사용량(Nm³), 목표 중량(톤), 실적 중량(톤), 작업시간(h)</p>
            <p>• 부서원이 엑셀 업로드 또는 입력 창에서 직접 입력하는 사실 데이터입니다.</p>
          </CardContent>
        </Card>

        <Card className="border-amber-500/30 bg-amber-500/5">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-bold flex items-center gap-1.5 text-amber-600 dark:text-amber-400">
              <Calculator className="w-4 h-4" />
              ⚡ 시스템 자동계산 지표 (파생 지표)
            </CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground space-y-1">
            <p>• 가스원단위(Nm³/톤), 시간당 생산량(t/h), 달성률(%)</p>
            <p>• 직접 입력 데이터가 저장되는 즉시 아래 공식에 따라 자동 계산되어 뱃지가 붙습니다.</p>
          </CardContent>
        </Card>
      </div>

      {/* 데이터 구분 및 수주번호 관리 안내 가이드 */}
      <Card className="border-border bg-card">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2 text-foreground">
            <BarChart3 className="w-5 h-5 text-primary" />
            업로드 데이터 vs 화면 직접 입력 데이터 및 수주번호 관리 체계
          </CardTitle>
          <CardDescription>
            시스템에 적재되는 데이터의 성향과 작업 건별(수주번호 기준) 이력 관리 지침입니다.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
          <div className="p-3.5 rounded-lg border bg-muted/30 space-y-2">
            <p className="font-bold text-primary flex items-center gap-1.5">
              <span>📥 엑셀 일괄 업로드 대상 데이터</span>
            </p>
            <ul className="list-disc list-inside text-muted-foreground space-y-1 leading-relaxed">
              <li><strong>월말 생산 계획 및 집계 실적:</strong> ERP 또는 MES 시스템에서 월 단위로 내려받는 대량 실적 파일</li>
              <li><strong>도시가스사 고지서 월 검침량:</strong> 매월 발행되는 공식 가스 요금표의 호기별 사용량 및 장입 중량</li>
              <li><strong>특징:</strong> <code className="bg-muted px-1 rounded">[데이터 업로드]</code> 페이지에서 샘플 양식을 다운로드하여 한 번에 수십~수백 건을 등록합니다.</li>
            </ul>
          </div>
          <div className="p-3.5 rounded-lg border bg-muted/30 space-y-2">
            <p className="font-bold text-primary flex items-center gap-1.5">
              <span>📱 화면 실시간 직접 입력 데이터</span>
            </p>
            <ul className="list-disc list-inside text-muted-foreground space-y-1 leading-relaxed">
              <li><strong>일별 가열로 자체 검침:</strong> 현장 실무자가 작업 전후 미터기를 확인하고 입력하는 당일 사용량</li>
              <li><strong>교대조별 실시간 작업 실적:</strong> 주간조/야간조 작업 종료 시 입력하는 생산 톤수와 가동 시간</li>
              <li><strong>특징:</strong> <code className="bg-muted px-1 rounded">[데이터 입력]</code> 페이지에서 날짜와 라인을 선택해 간편하게 30초 내로 기록합니다.</li>
            </ul>
          </div>
          <div className="p-3.5 rounded-lg border bg-primary/10 bg-gradient-to-br from-primary/5 to-transparent space-y-2">
            <p className="font-bold text-primary flex items-center gap-1.5">
              <span>🏷️ 수주번호(Order No.) 활용 가이드</span>
            </p>
            <ul className="list-disc list-inside text-muted-foreground space-y-1 leading-relaxed">
              <li><strong>수주번호란:</strong> 단조 공장에서 진행하는 작업지시번호 또는 랏(Lot) 번호 (예: ORD-2026-001)</li>
              <li><strong>입력 방법:</strong> 생산 실적 또는 일일 가스검침 입력 시 수주번호를 함께 입력하면 해당 작업 건에 대한 전용 기록이 생성됩니다.</li>
              <li><strong>효과:</strong> 특정 수주 제품 생산 시 가스원단위와 시간당 생산 효율이 어떻게 나왔는지 정밀 분석이 가능해집니다.</li>
            </ul>
          </div>
        </CardContent>
      </Card>

      {/* 용어 정의 목록 */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {glossaries.map((g) => (
          <Card key={g.term} className="flex flex-col justify-between shadow-sm hover:shadow transition-shadow">
            <CardHeader className="pb-3">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <Badge variant="outline" className="mb-1 text-[10px] text-primary border-primary/40 font-semibold">
                    {g.category}
                  </Badge>
                  <CardTitle className="text-base font-bold">{g.term}</CardTitle>
                </div>
                <Badge variant="secondary" className="font-mono text-xs">
                  단위: {g.unit}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-3.5 text-xs">
              <div className="p-2.5 rounded bg-muted/60 border border-border font-mono text-foreground font-medium">
                <span className="text-muted-foreground block text-[10px] mb-0.5">📐 공식</span>
                {g.formula}
              </div>
              <p className="text-muted-foreground leading-relaxed">{g.desc}</p>
              <div className="pt-2 border-t flex items-center gap-1.5 text-[11px] font-semibold text-primary">
                <Flame className="w-3.5 h-3.5 flex-shrink-0" />
                <span>기준: {g.target}</span>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}
