import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { createNoopSupabaseClient, isSupabaseConfigured } from '@/lib/supabase/noop'

// 서버 컴포넌트 / Server Action 용 Supabase 클라이언트
export async function createClient() {
  if (!isSupabaseConfigured()) {
    const noopClient = createNoopSupabaseClient()
    return noopClient as never
  }

  const cookieStore = await cookies()
  const client = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co',
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'placeholder-anon-key',
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {
            // Server Component에서는 쿠키 수정 불가 — 무시
          }
        },
      },
    }
  )

  return client
}

// Route Handler / Server Action 전용 — service_role 키 사용 (RLS 우회)
export async function createAdminClient() {
  if (!isSupabaseConfigured()) {
    const noopClient = createNoopSupabaseClient()
    return noopClient as never
  }

  const cookieStore = await cookies()
  const client = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co',
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'placeholder-anon-key',
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {}
        },
      },
    }
  )

  return client
}
