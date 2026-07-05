import { createBrowserClient } from '@supabase/ssr'
import { createNoopSupabaseClient, isSupabaseConfigured } from '@/lib/supabase/noop'

// 클라이언트 컴포넌트에서 사용하는 Supabase 클라이언트
// anon 키만 사용 — service_role 키는 절대 클라이언트에 노출 금지!
export function createClient() {
  const client = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co',
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'placeholder-anon-key'
  )

  if (!isSupabaseConfigured()) {
    return createNoopSupabaseClient() as unknown as typeof client
  }

  return client
}
