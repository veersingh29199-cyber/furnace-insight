'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Shield, UserCheck } from 'lucide-react'
import { toast } from 'sonner'
import type { Profile } from '@/types'

const supabase = createClient()
const ROLE_LABELS = { admin: '관리자', editor: '편집자', viewer: '조회자' }
const ROLE_VARIANTS: Record<string, 'default' | 'secondary' | 'outline'> = {
  admin: 'default', editor: 'secondary', viewer: 'outline'
}

export default function UsersPanel() {
  const qc = useQueryClient()

  const { data: profiles } = useQuery({
    queryKey: ['profiles-admin'],
    queryFn: async () => {
      const { data, error } = await supabase.from('profiles').select('*').order('created_at')
      if (error) throw error
      return data as Profile[]
    },
  })

  const updateRole = useMutation({
    mutationFn: async ({ id, role }: { id: string; role: string }) => {
      const { error } = await supabase.from('profiles').update({ role }).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['profiles-admin'] })
      toast.success('역할이 변경되었습니다.')
    },
    onError: (e: Error) => toast.error(e.message),
  })

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center gap-2">
          <UserCheck className="h-4 w-4" />
          사용자 목록 및 역할 관리
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="rounded-lg border overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>이름</TableHead>
                <TableHead>현재 역할</TableHead>
                <TableHead>역할 변경</TableHead>
                <TableHead>가입일</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {profiles?.map(p => (
                <TableRow key={p.id}>
                  <TableCell className="font-medium">{p.name}</TableCell>
                  <TableCell>
                    <Badge variant={ROLE_VARIANTS[p.role]}>{ROLE_LABELS[p.role]}</Badge>
                  </TableCell>
                  <TableCell>
                    <Select
                      defaultValue={p.role}
                      onValueChange={(role) => updateRole.mutate({ id: p.id, role: role || p.role })}
                    >
                      <SelectTrigger className="w-28 h-7 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="admin">관리자</SelectItem>
                        <SelectItem value="editor">편집자</SelectItem>
                        <SelectItem value="viewer">조회자</SelectItem>
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {new Date(p.created_at).toLocaleDateString('ko-KR')}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        <p className="text-xs text-muted-foreground mt-3 flex items-center gap-1.5">
          <Shield className="h-3 w-3" />
          역할: 관리자(전체 권한) · 편집자(입력/수정) · 조회자(읽기 전용)
        </p>
      </CardContent>
    </Card>
  )
}
