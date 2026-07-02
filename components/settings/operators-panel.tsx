'use client'

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Plus, Trash2, UserCheck, Shield } from 'lucide-react'
import { toast } from 'sonner'
import { useOperator, DEFAULT_OPERATORS } from '@/hooks/use-operator'

export default function OperatorsPanel() {
  const { operatorList, addOperatorPreset, removeOperatorPreset } = useOperator()
  const [newOp, setNewOp] = useState('')

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

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <UserCheck className="h-4 w-4 text-primary" />
          현장 데이터 입력자(Operators) 프리셋 관리
        </CardTitle>
        <CardDescription>
          이메일 로그인 없이 접속하는 부서원들이 화면 상단에서 선택할 수 있는 실무자 프리셋 목록을 등록·삭제합니다.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* 새 입력자 추가 폼 */}
        <div className="flex gap-2 max-w-md">
          <Input
            placeholder="예: 홍길동 (열처리1팀)"
            value={newOp}
            onChange={(e) => setNewOp(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
            className="text-sm"
          />
          <Button onClick={handleAdd} className="gap-1.5 shrink-0">
            <Plus className="h-4 w-4" /> 명단 추가
          </Button>
        </div>

        {/* 입력자 목록 테이블 */}
        <div className="rounded-lg border overflow-hidden">
          <Table>
            <TableHeader className="bg-muted/50">
              <TableRow>
                <TableHead className="w-16">구분</TableHead>
                <TableHead>실무자 성명 및 소속</TableHead>
                <TableHead className="w-24 text-center">관리</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(operatorList || []).map((op) => {
                const isDefault = DEFAULT_OPERATORS.includes(op)
                return (
                  <TableRow key={op}>
                    <TableCell>
                      {isDefault ? (
                        <Badge variant="secondary" className="text-[10px]">기본</Badge>
                      ) : (
                        <Badge className="bg-primary/10 text-primary border-primary/20 text-[10px]">추가됨</Badge>
                      )}
                    </TableCell>
                    <TableCell className="font-medium text-sm">{op}</TableCell>
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
