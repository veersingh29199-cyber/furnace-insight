"use client"

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { BookOpen, Flame, BarChart3, Calculator, HelpCircle, CheckCircle2, AlertTriangle } from 'lucide-react'

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
