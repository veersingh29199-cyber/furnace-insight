'use client'

import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { DB, DB_CONFLICT_KEYS } from '@/types/db'
import type { ImportAliasRecord } from '@/types/import'
import { IMPORT_DATASETS } from '@/lib/import/specs'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Switch } from '@/components/ui/switch'
import { Plus, Pencil, Loader2, Save } from 'lucide-react'
import { toast } from 'sonner'

const datasetOptions = [
  { label: '공통(shared)', value: 'shared' },
  ...Object.values(IMPORT_DATASETS).map((dataset) => ({
    label: dataset.label,
    value: dataset.key,
  })),
]

const canonicalFieldOptions = Array.from(
  new Map(
    Object.values(IMPORT_DATASETS)
      .flatMap((dataset) => dataset.fields)
      .map((field) => [field.key, field.label] as const)
  )
).map(([value, label]) => ({ value, label }))

export default function ImportAliasesPanel() {
  const supabase = useMemo(() => createClient(), [])
  const queryClient = useQueryClient()
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<ImportAliasRecord | null>(null)
  const [datasetKey, setDatasetKey] = useState('shared')
  const [canonicalField, setCanonicalField] = useState('furnace_code')
  const [aliasText, setAliasText] = useState('')
  const [note, setNote] = useState('')

  const { data: aliases, isLoading } = useQuery({
    queryKey: ['import-aliases-admin'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from(DB.tables.importAliases)
        .select('*')
        .order('dataset_key')
        .order('canonical_field')
        .order('alias_text')

      if (error) throw error
      return (data ?? []) as ImportAliasRecord[]
    },
  })

  const resetForm = () => {
    setEditing(null)
    setDatasetKey('shared')
    setCanonicalField('furnace_code')
    setAliasText('')
    setNote('')
  }

  const openCreate = () => {
    resetForm()
    setOpen(true)
  }

  const upsertMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        dataset_key: datasetKey,
        canonical_field: canonicalField,
        alias_text: aliasText.trim(),
        note: note.trim() || null,
        active: true,
      }

      if (editing) {
        const { error } = await supabase
          .from(DB.tables.importAliases)
          .update({
            ...payload,
            updated_at: new Date().toISOString(),
          })
          .eq('id', editing.id)
        if (error) throw error
        return
      }

      const { error } = await supabase.from(DB.tables.importAliases).upsert(payload, {
        onConflict: DB_CONFLICT_KEYS.importAliases,
        ignoreDuplicates: false,
      })
      if (error) throw error
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['import-aliases'] })
      await queryClient.invalidateQueries({ queryKey: ['import-aliases-admin'] })
      toast.success(editing ? '별칭을 수정했습니다.' : '별칭을 저장했습니다.')
      setOpen(false)
      resetForm()
    },
    onError: (error: Error) => toast.error(error.message || '저장에 실패했습니다.'),
  })

  const toggleMutation = useMutation({
    mutationFn: async ({ id, active }: { id: string; active: boolean }) => {
      const { error } = await supabase
        .from(DB.tables.importAliases)
        .update({ active, updated_at: new Date().toISOString() })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['import-aliases'] })
      await queryClient.invalidateQueries({ queryKey: ['import-aliases-admin'] })
    },
    onError: (error: Error) => toast.error(error.message || '상태 변경에 실패했습니다.'),
  })

  const beginEdit = (alias: ImportAliasRecord) => {
    setEditing(alias)
    setDatasetKey(alias.dataset_key)
    setCanonicalField(alias.canonical_field)
    setAliasText(alias.alias_text)
    setNote(alias.note ?? '')
    setOpen(true)
  }

  const submit = () => {
    if (!aliasText.trim()) {
      toast.error('별칭을 입력해주세요.')
      return
    }
    upsertMutation.mutate()
  }

  const aliasCount = aliases?.length ?? 0

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-3">
          <div>
            <CardTitle className="text-base">파일 임포트 별칭</CardTitle>
            <CardDescription>엑셀 열 이름과 앱 필드의 대응 규칙을 등록하고, 다음 업로드부터 자동 매핑에 활용합니다.</CardDescription>
          </div>
          <Dialog open={open} onOpenChange={(next) => { setOpen(next); if (!next) resetForm() }}>
            <DialogTrigger onClick={openCreate} className="inline-flex items-center justify-center rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90">
              <Plus className="mr-2 h-4 w-4" />
              별칭 추가
            </DialogTrigger>
            <DialogContent className="max-w-xl">
              <DialogHeader>
                <DialogTitle>{editing ? '별칭 수정' : '새 별칭 추가'}</DialogTitle>
                <DialogDescription>업로드 파일의 다양한 헤더를 앱 표준 필드와 연결하는 규칙입니다.</DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 pt-2">
                <div className="space-y-2">
                  <Label>대상 데이터셋</Label>
                  <Select value={datasetKey} onValueChange={(value) => setDatasetKey(value ?? 'shared')}>
                    <SelectTrigger>
                      <SelectValue placeholder="선택" />
                    </SelectTrigger>
                    <SelectContent>
                      {datasetOptions.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>표준 필드</Label>
                  <Select value={canonicalField} onValueChange={(value) => setCanonicalField(value ?? 'furnace_code')}>
                    <SelectTrigger>
                      <SelectValue placeholder="선택" />
                    </SelectTrigger>
                    <SelectContent>
                      {canonicalFieldOptions.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>별칭 텍스트</Label>
                  <Input value={aliasText} onChange={(event) => setAliasText(event.target.value)} placeholder="예: 1호, 1호기, #1" />
                </div>
                <div className="space-y-2">
                  <Label>메모</Label>
                  <Input value={note} onChange={(event) => setNote(event.target.value)} placeholder="선택 입력" />
                </div>
                <Button onClick={submit} disabled={upsertMutation.isPending}>
                  {upsertMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                  저장
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            <Badge variant="secondary">총 {aliasCount}개</Badge>
            <span>활성화된 별칭은 파일 임포트의 자동 감지와 매핑 후보에 사용됩니다.</span>
          </div>

          {isLoading ? (
            <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              불러오는 중...
            </div>
          ) : (
            <div className="overflow-hidden rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>데이터셋</TableHead>
                    <TableHead>필드</TableHead>
                    <TableHead>별칭</TableHead>
                    <TableHead>메모</TableHead>
                    <TableHead>상태</TableHead>
                    <TableHead className="text-right">작업</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {aliases?.map((alias) => (
                    <TableRow key={alias.id}>
                      <TableCell>{alias.dataset_key}</TableCell>
                      <TableCell>{alias.canonical_field}</TableCell>
                      <TableCell className="font-medium">{alias.alias_text}</TableCell>
                      <TableCell>{alias.note ?? '-'}</TableCell>
                      <TableCell>
                        <Badge variant={alias.active ? 'default' : 'secondary'}>{alias.active ? '활성' : '비활성'}</Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center justify-end gap-2">
                          <Button variant="outline" size="icon-sm" onClick={() => beginEdit(alias)}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Switch
                            checked={alias.active}
                            onCheckedChange={(checked) => toggleMutation.mutate({ id: alias.id, active: checked })}
                            disabled={toggleMutation.isPending}
                          />
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
