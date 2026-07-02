'use client'

import { useState } from 'react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Info, Shield } from 'lucide-react'
import MasterDataPanel from '@/components/settings/master-data-panel'
import UsersPanel      from '@/components/settings/users-panel'
import TargetsPanel    from '@/components/settings/targets-panel'
import OperatorsPanel  from '@/components/settings/operators-panel'
import { useAuth } from '@/components/providers/auth-provider'

export default function SettingsPage() {
  const { profile } = useAuth()
  const isAdmin   = profile?.role === 'admin'

  return (
    <div className="space-y-6">
      <Alert className="border-primary/30 bg-primary/5">
        <Info className="h-4 w-4 text-primary" />
        <AlertDescription className="text-sm flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <span>
            <strong>현장 개방형 설정 모드:</strong> 데이터 입력자 성명을 자유롭게 변경하거나 프리셋/목표를 조작할 수 있습니다.
          </span>
          <span className="text-xs font-mono bg-background px-2 py-1 rounded border">
            현재 권한: {profile?.role ?? 'viewer (개방 설정 가능)'}
          </span>
        </AlertDescription>
      </Alert>

      <Tabs defaultValue="operators">
        <TabsList className="grid grid-cols-4 w-full max-w-lg">
          <TabsTrigger value="operators">입력자 관리</TabsTrigger>
          <TabsTrigger value="master">마스터 데이터</TabsTrigger>
          <TabsTrigger value="targets">목표 설정</TabsTrigger>
          <TabsTrigger value="users">사용자 관리</TabsTrigger>
        </TabsList>

        <TabsContent value="operators" className="mt-4">
          <OperatorsPanel />
        </TabsContent>

        <TabsContent value="master" className="mt-4">
          <MasterDataPanel />
        </TabsContent>

        <TabsContent value="targets" className="mt-4">
          <TargetsPanel />
        </TabsContent>

        <TabsContent value="users" className="mt-4">
          <UsersPanel />
        </TabsContent>
      </Tabs>
    </div>
  )
}
