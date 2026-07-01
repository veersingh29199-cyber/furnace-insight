# 🔥 가열로 인사이트 (Furnace Insight)

> 단조 공장의 **생산성·가스원단위 통합 분석 플랫폼**
> — 비개발자 현장 관리자도 쉽게 운영 가능한 프로덕션 웹 애플리케이션

---

## 📋 목차

1. [기능 개요](#기능-개요)
2. [기술 스택](#기술-스택)
3. [빠른 시작 (로컬 개발)](#빠른-시작)
4. [환경변수 설정](#환경변수-설정)
5. [Supabase 설정 (DB/인증)](#supabase-설정)
6. [엑셀 업로드 방법](#엑셀-업로드-방법)
7. [Vercel 배포](#vercel-배포)
8. [역할별 권한](#역할별-권한)
9. [도메인 규칙](#도메인-규칙)

---

## 기능 개요

| 메뉴 | 기능 |
|------|------|
| **대시보드** | 이번달 KPI 카드, 벤치마크 비교, 이상치 알림, 가열로 원단위 추이 |
| **생산성 분석** | 라인별 3년 추이, 시간당 생산량 분포, 달성률 히트맵, 현실적 목표 제안 |
| **가스원단위 분석** | 호기별 월별 추이, 태상·태웅 비교, 산점도 이상치, 제품Mix 시뮬레이터 |
| **데이터 입력** | 생산 실적(월별), 가스 월 검침, 가스 일 검침 |
| **엑셀 임포터** | .xlsx 업로드, 컬럼 매핑 미리보기, DB upsert |
| **관리/설정** | 가열로·라인·제품·목표 마스터 CRUD, 사용자 역할 관리 |

---

## 기술 스택

- **프론트**: Next.js 16 (App Router) + TypeScript + Tailwind CSS v4 + shadcn/ui
- **차트**: Recharts (반응형)
- **백엔드/DB**: Supabase (PostgreSQL + Row Level Security)
- **인증**: Supabase Auth (이메일/패스워드)
- **상태관리**: TanStack Query v5
- **폼 검증**: React Hook Form + Zod
- **엑셀 처리**: SheetJS (xlsx)
- **배포**: Vercel (프론트) + Supabase Cloud (DB)

---

## 빠른 시작

### 사전 요구사항
- Node.js 18 이상
- Supabase 계정 및 프로젝트 (supabase.com 에서 무료 생성)

### 1. 패키지 설치

```bash
npm install
```

### 2. 환경변수 설정

```bash
cp .env.example .env.local
```

텍스트 편집기로 `.env.local`을 열어 실제 값 입력

### 3. Supabase DB 스키마 적용

Supabase 대시보드 > SQL Editor에서 순서대로 실행:
1. `supabase/migrations/001_initial_schema.sql`
2. `supabase/migrations/002_seed_data.sql` (회원가입 후)

### 4. 로컬 개발 서버 실행

```bash
npm run dev
```

브라우저에서 http://localhost:3000 접속

### 5. 첫 사용자 등록

1. `/signup` 페이지에서 회원가입
2. Supabase 대시보드 > `profiles` 테이블에서 `role`을 `admin`으로 변경
3. 로그인 후 관리/설정에서 다른 사용자 역할 관리

---

## 환경변수 설정

| 변수명 | 설명 | 노출 여부 |
|--------|------|-----------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase 프로젝트 URL | 클라이언트 OK |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | 익명 키 (RLS 적용됨) | 클라이언트 OK |
| `SUPABASE_SERVICE_ROLE_KEY` | 서버 전용 관리자 키 | **절대 클라이언트 노출 금지** |
| `NEXT_PUBLIC_APP_URL` | 앱 URL | 클라이언트 OK |

### Supabase 키 찾는 방법

1. supabase.com > 프로젝트 선택
2. Settings > API 메뉴
3. **Project URL** → `NEXT_PUBLIC_SUPABASE_URL`
4. **anon public** → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
5. **service_role** → `SUPABASE_SERVICE_ROLE_KEY`

---

## Supabase 설정

### 인증(Auth) 설정

1. Supabase 대시보드 > Authentication > Settings
2. **Site URL**: `http://localhost:3000` (개발) 또는 Vercel 도메인
3. **Redirect URLs**에 `http://localhost:3000/**` 추가

### 이메일 확인 비활성화 (개발 편의)

Authentication > Settings > Email auth > `Confirm email` 토글 OFF

---

## 엑셀 업로드 방법

### 가스 검침 엑셀 형식

```
A열(가열로) | B열(1월) | C열(2월) | ... | M열(12월)
1호기       | 595000   | 558000   | ... | 620000
2호기       | 546000   | 522000   | ... | 580000
```

- 시트 이름에 연도 포함 필수 (예: `2024년`, `2024`)
- A열: `X호기` 형식 (예: `1호기`, `10호기`)
- B~M열: 1월~12월 가스사용량(Nm³)

### 업로드 절차

1. 엑셀 임포터 메뉴 이동
2. 파일 선택 (.xlsx 또는 .xls)
3. 파싱 결과 미리보기 확인 (매핑 성공/실패 표시)
4. "DB에 적재" 버튼 클릭
5. 진행률 표시 후 완료

---

## Vercel 배포

```bash
npx vercel --prod
```

또는 vercel.com > New Project > GitHub 저장소 연결

### 환경변수

Vercel 대시보드 > Settings > Environment Variables에 `.env.local` 내용 동일하게 입력

### Supabase Auth URL 업데이트

Authentication > Settings > Site URL을 Vercel 도메인으로 변경

---

## 역할별 권한

| 기능 | viewer | editor | admin |
|------|:------:|:------:|:-----:|
| 대시보드/분석 조회 | O | O | O |
| 데이터 입력 | X | O | O |
| 엑셀 임포터 | X | O | O |
| 마스터 데이터 수정 | X | X | O |
| 사용자 역할 관리 | X | X | O |
| 데이터 삭제 | X | X | O |

신규 가입자는 기본 viewer 권한. admin이 관리/설정에서 변경.

---

## 도메인 규칙

```
가스원단위 (Nm³/톤)  = 가스사용량 ÷ 장입중량(톤)    # 낮을수록 좋음
시간당 생산량 (톤/h) = 생산중량(톤) ÷ 작업시간(h)   # 높을수록 좋음
달성률 (%)           = 실적 ÷ 목표 × 100
```

### 벤치마크 기준값

| 구분 | 항목 | 기준값 |
|------|------|--------|
| 두산 시간당 생산량 | 금형강 | 25 톤/h |
| 두산 시간당 생산량 | 크랭크축 | 26 톤/h |
| 두산 시간당 생산량 | 쉘 | 10 톤/h |
| 두산 시간당 생산량 | 로터 | 7 톤/h |
| 태상 가스원단위 | 목표/실적 | 150 / 139 Nm³/톤 |
| 태웅 가스원단위 | 목표/실적 | 150 / 172 Nm³/톤 |

---

## 🔓 로그인 없이 운영 (부서원 개방 모드 가이드)

현장 관리자나 부서원이 이메일/비밀번호 가입 절차 없이 **접속 즉시 대시보드와 데이터 입력**을 사용할 수 있도록 구성되어 있습니다.

### 1. 운영 모드 (`NEXT_PUBLIC_ACCESS_MODE`)
- **기본 A안 (`open`)**: 링크를 아는 사내 인원은 누구나 즉시 대시보드 및 통계를 조회하고 데이터를 입력할 수 있습니다. 입력 시 우측 상단의 '현장 실무자 선택(이름/교대조)' 정보가 데이터베이스에 함께 기록됩니다(`entered_by_name`, `entered_by_shift`).
- **보안 B안 (`passcode`)**: 사내 공용 패스코드 1개(`ACCESS_PASSCODE`)를 설정하여, 최초 접속 시 패스코드를 입력한 부서원만 열람 및 입력이 가능토록 제한할 수 있습니다.

### 2. 데이터 무결성 및 동시 입력 보호
- 모든 데이터 저장은 **Upsert(유니크 기준 덮어쓰기)** 방식으로 작동합니다.
- 여러 부서원이 동시에 같은 셀을 수정할 경우 마지막 저장된 값이 반영되며, 완료 즉시 화면이 최신 상태로 동기화됩니다.
- 마스터 데이터(라인, 가열로, 목표치 등) 수정 및 데이터 삭제 기능은 클라이언트에서 차단되며 관리자 권한(`service_role` 또는 admin 계정)으로만 가능합니다.

### 3. 사내 데이터 외부 노출 방지 (보안 가이드)
- **검색엔진 크롤링 차단**: 모든 응답 헤더에 `X-Robots-Tag: noindex, nofollow` 및 메타 태그가 적용되어 구글, 네이버 등 검색엔진에 노출되지 않습니다.
- **추가 보안 권장**: 사내 중요 제조 데이터의 외부 유출이 우려되는 경우 **Vercel Project Settings > Deployment Protection > Password Protection** 기능을 켜서 사이트 전체에 비밀번호를 걸어두는 것을 강력히 권장합니다.

### 4. 다시 이메일 로그인 방식으로 되돌리는 방법
만약 완전 개방 모드에서 다시 엄격한 회원 로그인 방식으로 되돌리고 싶다면:
1. `proxy.ts`에서 미들웨어 리디렉션 주석을 풀고 비로그인 사용자의 `/login` 이동을 활성화합니다.
2. Supabase SQL 에디터에서 `supabase/migrations/001_initial_schema.sql`의 RLS 정책을 다시 실행하여 `authenticated` 전용 정책으로 복구합니다.
