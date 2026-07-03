'use client'

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Info } from 'lucide-react'
import { useAuth } from '@/components/providers/auth-provider'
import MasterDataPanel from '@/components/settings/master-data-panel'
import UsersPanel from '@/components/settings/users-panel'
import TargetsPanel from '@/components/settings/targets-panel'
import OperatorsPanel from '@/components/settings/operators-panel'
import ImportAliasesPanel from '@/components/settings/import-aliases-panel'

export default function SettingsPage() {
  const { profile } = useAuth()
  const roleLabel = profile?.role ?? 'viewer'

  return (
    <div className="space-y-6">
      <Alert className="border-primary/30 bg-primary/5">
        <Info className="h-4 w-4 text-primary" />
        <AlertDescription className="flex flex-col justify-between gap-2 text-sm sm:flex-row sm:items-center">
          <span>
            <strong>설정 모드:</strong> 입력 규칙, 마스터 데이터, 사용자 권한을 한 곳에서 관리합니다.
          </span>
          <span className="rounded border bg-background px-2 py-1 font-mono text-xs">
            현재 권한: {roleLabel}
          </span>
        </AlertDescription>
      </Alert>

      <Tabs defaultValue="operators">
        <TabsList className="grid w-full max-w-3xl grid-cols-5">
          <TabsTrigger value="operators">입력자 관리</TabsTrigger>
          <TabsTrigger value="master">마스터 데이터</TabsTrigger>
          <TabsTrigger value="targets">목표 설정</TabsTrigger>
          <TabsTrigger value="users">사용자 관리</TabsTrigger>
          <TabsTrigger value="import-aliases">임포트 별칭</TabsTrigger>
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

        <TabsContent value="import-aliases" className="mt-4">
          <ImportAliasesPanel />
        </TabsContent>
      </Tabs>
    </div>
  )
}
