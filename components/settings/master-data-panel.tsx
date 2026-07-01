'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Plus, Pencil, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import type { Line, Furnace, Product } from '@/types'

const supabase = createClient()

function useFurnacesAdmin() {
  return useQuery({ queryKey: ['furnaces-admin'], queryFn: async () => {
    const { data, error } = await supabase.from('furnaces').select('*').order('code')
    if (error) throw error; return data as Furnace[]
  }})
}

function useLinesAdmin() {
  return useQuery({ queryKey: ['lines-admin'], queryFn: async () => {
    const { data, error } = await supabase.from('lines').select('*').order('code')
    if (error) throw error; return data as Line[]
  }})
}

function useProductsAdmin() {
  return useQuery({ queryKey: ['products-admin'], queryFn: async () => {
    const { data, error } = await supabase.from('products').select('*').order('name')
    if (error) throw error; return data as Product[]
  }})
}

// ── 가열로 활성/비활성 토글 ──
function FurnaceRow({ f }: { f: Furnace }) {
  const qc = useQueryClient()
  const toggle = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('furnaces').update({ active: !f.active }).eq('id', f.id)
      if (error) throw error
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['furnaces-admin'] }); qc.invalidateQueries({ queryKey: ['furnaces'] }) },
    onError: (e: Error) => toast.error(e.message),
  })
  return (
    <TableRow key={f.id}>
      <TableCell className="font-medium">{f.code}</TableCell>
      <TableCell>{f.name}</TableCell>
      <TableCell>
        <Switch checked={f.active} onCheckedChange={() => toggle.mutate()} disabled={toggle.isPending} />
      </TableCell>
      <TableCell>
        <Badge variant={f.active ? 'default' : 'secondary'}>{f.active ? '활성' : '비활성'}</Badge>
      </TableCell>
    </TableRow>
  )
}

// ── 제품 행 ──
function ProductRow({ p }: { p: Product }) {
  const qc = useQueryClient()
  const toggle = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('products').update({ active: !p.active }).eq('id', p.id)
      if (error) throw error
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['products-admin'] }); qc.invalidateQueries({ queryKey: ['products'] }) },
    onError: (e: Error) => toast.error(e.message),
  })
  return (
    <TableRow>
      <TableCell className="font-medium">{p.name}</TableCell>
      <TableCell>{p.material}</TableCell>
      <TableCell className="text-right">{p.std_ton_per_hour ?? '-'}</TableCell>
      <TableCell className="text-right">{p.std_gas_unit ?? '-'}</TableCell>
      <TableCell>
        <Switch checked={p.active} onCheckedChange={() => toggle.mutate()} disabled={toggle.isPending} />
      </TableCell>
    </TableRow>
  )
}

// ── 새 제품 추가 다이얼로그 ──
function AddProductDialog() {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [material, setMaterial] = useState('')
  const [tph, setTph] = useState('')
  const [gu, setGu] = useState('')
  const qc = useQueryClient()

  const add = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('products').insert({
        name, material,
        std_ton_per_hour: tph ? parseFloat(tph) : null,
        std_gas_unit:     gu  ? parseFloat(gu)  : null,
      })
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['products-admin'] })
      toast.success('제품이 추가되었습니다.')
      setOpen(false); setName(''); setMaterial(''); setTph(''); setGu('')
    },
    onError: (e: Error) => toast.error(e.message),
  })

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger className="inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium transition-colors bg-primary text-primary-foreground hover:bg-primary/90 h-8 px-3 cursor-pointer">
        <Plus className="h-4 w-4 mr-1" />제품 추가
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>새 제품 추가</DialogTitle></DialogHeader>
        <div className="space-y-4 pt-2">
          <div className="space-y-1.5"><Label>제품명</Label><Input value={name} onChange={e => setName(e.target.value)} /></div>
          <div className="space-y-1.5"><Label>재질</Label><Input value={material} onChange={e => setMaterial(e.target.value)} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5"><Label>표준 톤/h</Label><Input type="number" value={tph} onChange={e => setTph(e.target.value)} /></div>
            <div className="space-y-1.5"><Label>표준 원단위</Label><Input type="number" value={gu} onChange={e => setGu(e.target.value)} /></div>
          </div>
          <Button onClick={() => add.mutate()} disabled={!name || !material || add.isPending} className="w-full">
            {add.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : '추가'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

export default function MasterDataPanel() {
  const { data: furnaces } = useFurnacesAdmin()
  const { data: lines }    = useLinesAdmin()
  const { data: products } = useProductsAdmin()

  return (
    <Tabs defaultValue="furnaces">
      <TabsList>
        <TabsTrigger value="furnaces">가열로</TabsTrigger>
        <TabsTrigger value="lines">라인</TabsTrigger>
        <TabsTrigger value="products">제품</TabsTrigger>
      </TabsList>

      {/* 가열로 관리 */}
      <TabsContent value="furnaces" className="mt-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <CardTitle className="text-sm">가열로 목록 ({furnaces?.length ?? 0}기)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="rounded-lg border overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>코드</TableHead><TableHead>이름</TableHead>
                    <TableHead>활성화</TableHead><TableHead>상태</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {furnaces?.map(f => <FurnaceRow key={f.id} f={f} />)}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </TabsContent>

      {/* 라인 관리 */}
      <TabsContent value="lines" className="mt-4">
        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-sm">라인 목록</CardTitle></CardHeader>
          <CardContent>
            <div className="rounded-lg border overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>코드</TableHead><TableHead>이름</TableHead>
                    <TableHead>분류</TableHead><TableHead>상태</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {lines?.map(l => (
                    <TableRow key={l.id}>
                      <TableCell className="font-medium">{l.code}</TableCell>
                      <TableCell>{l.name}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-xs">
                          {l.capacity_class === 'ringmill' ? '링밀' : `${l.capacity_class}톤`}
                        </Badge>
                      </TableCell>
                      <TableCell><Badge variant={l.active ? 'default' : 'secondary'}>{l.active ? '활성' : '비활성'}</Badge></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </TabsContent>

      {/* 제품 관리 */}
      <TabsContent value="products" className="mt-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <CardTitle className="text-sm">제품 목록</CardTitle>
            <AddProductDialog />
          </CardHeader>
          <CardContent>
            <div className="rounded-lg border overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>제품명</TableHead><TableHead>재질</TableHead>
                    <TableHead className="text-right">표준 톤/h</TableHead>
                    <TableHead className="text-right">표준 원단위</TableHead>
                    <TableHead>활성화</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {products?.map(p => <ProductRow key={p.id} p={p} />)}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </TabsContent>
    </Tabs>
  )
}
