'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Plus, Target, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import type { Target as TargetType } from '@/types'
import { useFurnaces, useLines } from '@/hooks/use-dashboard'

const supabase  = createClient()
const METRIC_LABELS = { gas_unit: '가스원단위', ton_per_hour: '시간당 생산량', output: '생산량' }
const SCOPE_LABELS  = { line: '라인', furnace: '가열로', company: '전사' }

export default function TargetsPanel() {
  const qc = useQueryClient()
  const { data: furnaces } = useFurnaces()
  const { data: lines }    = useLines()

  const [year, setYear]     = useState(new Date().getFullYear())
  const [scope, setScope]   = useState<'line' | 'furnace' | 'company'>('company')
  const [refId, setRefId]   = useState<string>('')
  const [metric, setMetric] = useState<'gas_unit' | 'ton_per_hour' | 'output'>('gas_unit')
  const [value, setValue]   = useState('')
  const [note, setNote]     = useState('')

  const { data: targets } = useQuery({
    queryKey: ['targets-admin', year],
    queryFn: async () => {
      const { data, error } = await supabase.from('targets').select('*').eq('year', year).order('scope')
      if (error) throw error; return data as TargetType[]
    },
  })

  const addTarget = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('targets').upsert({
        year, scope, ref_id: refId || null, metric,
        target_value: parseFloat(value), note: note || null,
      }, { onConflict: 'year,scope,ref_id,metric' })
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['targets-admin'] })
      qc.invalidateQueries({ queryKey: ['targets'] })
      toast.success('목표가 저장되었습니다.')
      setValue(''); setNote('')
    },
    onError: (e: Error) => toast.error(e.message),
  })

  return (
    <div className="space-y-4">
      {/* 목표 입력 폼 */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2"><Target className="h-4 w-4" />목표 추가/수정</CardTitle>
          <CardDescription className="text-xs">같은 조건으로 저장하면 자동으로 덮어씁니다.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 items-end">
            <div className="space-y-1.5">
              <Label className="text-xs">연도</Label>
              <Input type="number" value={year} onChange={e => setYear(Number(e.target.value))} className="h-8" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">범위</Label>
              <Select value={scope} onValueChange={v => { setScope(v as typeof scope); setRefId('') }}>
                <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="company">전사</SelectItem>
                  <SelectItem value="line">라인</SelectItem>
                  <SelectItem value="furnace">가열로</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {scope === 'line' && (
              <div className="space-y-1.5">
                <Label className="text-xs">라인</Label>
                <Select value={refId} onValueChange={(v) => setRefId(v || '')}>
                  <SelectTrigger className="h-8"><SelectValue placeholder="선택" /></SelectTrigger>
                  <SelectContent>{lines?.map(l => <SelectItem key={l.id} value={l.id}>{l.code}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            )}
            {scope === 'furnace' && (
              <div className="space-y-1.5">
                <Label className="text-xs">가열로</Label>
                <Select value={refId} onValueChange={(v) => setRefId(v || '')}>
                  <SelectTrigger className="h-8"><SelectValue placeholder="선택" /></SelectTrigger>
                  <SelectContent>{furnaces?.map(f => <SelectItem key={f.id} value={f.id}>{f.code}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            )}
            <div className="space-y-1.5">
              <Label className="text-xs">지표</Label>
              <Select value={metric} onValueChange={v => setMetric(v as typeof metric)}>
                <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="gas_unit">가스원단위</SelectItem>
                  <SelectItem value="ton_per_hour">시간당 생산량</SelectItem>
                  <SelectItem value="output">생산량</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">목표값</Label>
              <Input type="number" step="0.1" value={value} onChange={e => setValue(e.target.value)} className="h-8" placeholder="0" />
            </div>
            <Button size="sm" onClick={() => addTarget.mutate()} disabled={!value || addTarget.isPending}>
              {addTarget.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Plus className="h-4 w-4 mr-1" />저장</>}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* 목표 목록 */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">{year}년 목표 목록</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="rounded-lg border overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>범위</TableHead><TableHead>지표</TableHead>
                  <TableHead className="text-right">목표값</TableHead><TableHead>비고</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {targets?.map(t => (
                  <TableRow key={t.id}>
                    <TableCell><Badge variant="outline" className="text-xs">{SCOPE_LABELS[t.scope]}</Badge></TableCell>
                    <TableCell>{METRIC_LABELS[t.metric]}</TableCell>
                    <TableCell className="text-right font-semibold">{t.target_value.toLocaleString('ko-KR', { minimumFractionDigits: 1 })}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{t.note ?? '-'}</TableCell>
                  </TableRow>
                ))}
                {!targets?.length && (
                  <TableRow><TableCell colSpan={4} className="text-center py-8 text-muted-foreground text-sm">목표가 없습니다</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
