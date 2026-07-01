import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // Supabase Realtime WebSocket 연결 허용
  experimental: {
    serverActions: {
      bodySizeLimit: '10mb', // 엑셀 업로드 크기 제한
    },
  },
  // 외부 이미지 도메인 허용
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '*.supabase.co',
      },
    ],
  },
}

export default nextConfig
