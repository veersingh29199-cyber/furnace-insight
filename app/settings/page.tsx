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
        <AlertDescription className="text-sm">
          <strong>관리/설정</strong> 메뉴는 <strong>admin</strong> 권한이 필요합니다.
          현재 권한: <strong>{profile?.role ?? '로딩중'}</strong>
        </AlertDescription>
      </Alert>

      {!isAdmin ? (
        <Alert className="border-destructive/40 bg-destructive/5">
          <Shield className="h-4 w-4 text-destructive" />
          <AlertDescription className="text-sm text-destructive">
            관리자 권한이 없습니다. 관리자에게 권한 요청을 해주세요.
          </AlertDescription>
        </Alert>
      ) : (
        <Tabs defaultValue="master">
          <TabsList className="grid grid-cols-4 w-full max-w-lg">
            <TabsTrigger value="master">마스터 데이터</TabsTrigger>
            <TabsTrigger value="targets">목표 설정</TabsTrigger>
            <TabsTrigger value="operators">입력자 관리</TabsTrigger>
            <TabsTrigger value="users">사용자 관리</TabsTrigger>
          </TabsList>

          <TabsContent value="master" className="mt-4">
            <MasterDataPanel />
          </TabsContent>

          <TabsContent value="targets" className="mt-4">
            <TargetsPanel />
          </TabsContent>

          <TabsContent value="operators" className="mt-4">
            <OperatorsPanel />
          </TabsContent>

          <TabsContent value="users" className="mt-4">
            <UsersPanel />
          </TabsContent>
        </Tabs>
      )}
    </div>
  )
}
