'use client'

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Plus, Trash2, UserCheck, Check, Edit3 } from 'lucide-react'
import { toast } from 'sonner'
import { useOperator, DEFAULT_OPERATORS } from '@/hooks/use-operator'

export default function OperatorsPanel() {
  const { name, setName, operatorList, addOperatorPreset, removeOperatorPreset } = useOperator()
  const [newOp, setNewOp] = useState('')
  const [customName, setCustomName] = useState('')

  const handleAdd = () => {
    if (!newOp.trim()) {
      toast.error('이름과 소속을 입력하세요.')
      return
    }
    addOperatorPreset(newOp.trim())
    toast.success(`'${newOp.trim()}' 현장 실무자가 추가되었습니다.`)
    setNewOp('')
  }

  const handleRemove = (opName: string) => {
    if (DEFAULT_OPERATORS.includes(opName)) {
      toast.error('기본 설정된 실무자 명단은 삭제할 수 없습니다.')
      return
    }
    removeOperatorPreset(opName)
    toast.success(`'${opName}' 명단이 삭제되었습니다.`)
  }

  const handleSelectActive = (targetName: string) => {
    setName(targetName)
    toast.success(`현재 데이터 입력자가 '${targetName}'(으)로 설정되었습니다.`)
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <UserCheck className="h-5 w-5 text-primary" />
          현장 데이터 입력자(Operators) 설정 및 프리셋 관리
        </CardTitle>
        <CardDescription>
          데이터 입력 시 자동으로 기록될 본인의 성명을 설정하거나 현장 실무자 프리셋 목록을 등록·삭제합니다.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* 1. 현재 활성화된 내 입력자 성명 변경 카드 */}
        <div className="p-4 rounded-xl bg-primary/10 border-2 border-primary/30 space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <span className="text-sm font-bold text-primary flex items-center gap-1.5">
                <Edit3 className="w-4 h-4" /> 현재 설정된 내 데이터 입력자 성명
              </span>
              <p className="text-xs text-muted-foreground mt-0.5">
                실적 입력 시 기록되는 실무자 이름입니다. 아래 목록에서 [선택] 버튼을 누르거나 직접 입력하여 변경할 수 있습니다.
              </p>
            </div>
            <Badge className="bg-primary text-primary-foreground text-sm px-3.5 py-1 self-start sm:self-auto font-bold shadow-sm">
              {name || '미설정'}
            </Badge>
          </div>
          <div className="flex gap-2 max-w-md pt-1">
            <Input
              placeholder="직접 성명 변경 입력 (예: 홍길동 (단조3팀))"
              value={customName}
              onChange={(e) => setCustomName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && customName.trim()) {
                  handleSelectActive(customName.trim())
                  setCustomName('')
                }
              }}
              className="text-sm bg-background font-medium"
            />
            <Button
              onClick={() => {
                if (!customName.trim()) {
                  toast.error('변경할 이름을 입력하세요.')
                  return
                }
                handleSelectActive(customName.trim())
                setCustomName('')
              }}
              className="shrink-0 font-semibold"
            >
              내 이름으로 적용
            </Button>
          </div>
        </div>

        {/* 2. 새 실무자 명단 추가 폼 */}
        <div className="space-y-2 pt-2 border-t border-border/60">
          <h4 className="text-sm font-semibold flex items-center gap-1.5">
            <Plus className="w-4 h-4 text-primary" /> 자주 쓰는 실무자 명단(프리셋) 추가
          </h4>
          <div className="flex gap-2 max-w-md">
            <Input
              placeholder="예: 최동훈 (열처리2팀)"
              value={newOp}
              onChange={(e) => setNewOp(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
              className="text-sm"
            />
            <Button onClick={handleAdd} variant="secondary" className="gap-1.5 shrink-0">
              명단에 추가
            </Button>
          </div>
        </div>

        {/* 3. 입력자 목록 테이블 */}
        <div className="rounded-lg border overflow-hidden">
          <Table>
            <TableHeader className="bg-muted/50">
              <TableRow>
                <TableHead className="w-20 text-center">현재 상태</TableHead>
                <TableHead>실무자 성명 및 소속</TableHead>
                <TableHead className="w-20 text-center">구분</TableHead>
                <TableHead className="w-32 text-center">입력자로 선택</TableHead>
                <TableHead className="w-20 text-center">명단 삭제</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(operatorList || []).map((op) => {
                const isDefault = DEFAULT_OPERATORS.includes(op)
                const isCurrent = op === name
                return (
                  <TableRow key={op} className={isCurrent ? 'bg-primary/5 font-medium' : ''}>
                    <TableCell className="text-center">
                      {isCurrent ? (
                        <Badge className="bg-emerald-500 hover:bg-emerald-600 text-white text-[10px] gap-1 px-2 py-0.5">
                          <Check className="w-3 h-3" /> 사용중
                        </Badge>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="font-semibold text-sm">{op}</TableCell>
                    <TableCell className="text-center">
                      {isDefault ? (
                        <Badge variant="secondary" className="text-[10px]">기본</Badge>
                      ) : (
                        <Badge className="bg-primary/10 text-primary border-primary/20 text-[10px]">추가됨</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-center">
                      <Button
                        size="sm"
                        variant={isCurrent ? 'default' : 'outline'}
                        className="h-7 text-xs px-2.5 font-semibold"
                        onClick={() => handleSelectActive(op)}
                      >
                        {isCurrent ? '선택됨' : '이 사람으로 설정'}
                      </Button>
                    </TableCell>
                    <TableCell className="text-center">
                      {!isDefault ? (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-destructive hover:text-destructive hover:bg-destructive/10"
                          onClick={() => handleRemove(op)}
                          title="삭제"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  )
}
