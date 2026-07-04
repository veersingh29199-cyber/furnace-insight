-- ================================================================
-- 006_import_meta.sql — 스마트 파일 임포터 메타/전사 월별 테이블
-- ================================================================

-- 1. 전사 월별 가스 테이블
create table if not exists public.gas_company_monthly (
  id                uuid primary key default uuid_generate_v4(),
  ym                date not null, -- YYYY-MM-01
  charge_weight_kg  numeric not null default 0,
  gas_usage         numeric not null default 0,
  created_by        uuid references auth.users(id),
  created_at        timestamptz not null default now(),
  unique (ym)
);

comment on table public.gas_company_monthly is '전사 월별 가스/장입 요약';
create index if not exists idx_gas_company_monthly_ym on public.gas_company_monthly(ym);

-- 2. 임포트 별칭 사전
create table if not exists public.import_aliases (
  id              uuid primary key default uuid_generate_v4(),
  dataset_key     text not null,
  canonical_field text not null,
  alias_text      text not null,
  active          boolean not null default true,
  note            text,
  created_by      uuid references auth.users(id),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (dataset_key, canonical_field, alias_text)
);

comment on table public.import_aliases is '파일 임포트용 헤더/값 별칭 사전';
create index if not exists idx_import_aliases_dataset on public.import_aliases(dataset_key, active);
create index if not exists idx_import_aliases_field on public.import_aliases(canonical_field);

-- 3. 임포트 템플릿
create table if not exists public.import_templates (
  id              uuid primary key default uuid_generate_v4(),
  name            text not null,
  dataset_key     text not null,
  sheet_rules     jsonb not null default '{}'::jsonb,
  mapping_json    jsonb not null default '{}'::jsonb,
  signature_json  jsonb not null default '{}'::jsonb,
  active          boolean not null default true,
  created_by      uuid references auth.users(id),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (dataset_key, name)
);

comment on table public.import_templates is '파일 임포트용 시트/헤더/매핑 템플릿';
create index if not exists idx_import_templates_dataset on public.import_templates(dataset_key, active);
create index if not exists idx_import_templates_signature on public.import_templates using gin (signature_json);

-- 4. RLS 활성화
alter table public.gas_company_monthly enable row level security;
alter table public.import_aliases enable row level security;
alter table public.import_templates enable row level security;

-- 5. 정책 정리
drop policy if exists "gas_company_monthly: 열람 개방" on public.gas_company_monthly;
drop policy if exists "gas_company_monthly: 누구나 입력 허용" on public.gas_company_monthly;
drop policy if exists "gas_company_monthly: 누구나 수정 허용" on public.gas_company_monthly;
drop policy if exists "gas_company_monthly: admin 삭제" on public.gas_company_monthly;

drop policy if exists "import_aliases: 열람 개방" on public.import_aliases;
drop policy if exists "import_aliases: 누구나 입력 허용" on public.import_aliases;
drop policy if exists "import_aliases: 누구나 수정 허용" on public.import_aliases;
drop policy if exists "import_aliases: admin 삭제" on public.import_aliases;

drop policy if exists "import_templates: 열람 개방" on public.import_templates;
drop policy if exists "import_templates: 누구나 입력 허용" on public.import_templates;
drop policy if exists "import_templates: 누구나 수정 허용" on public.import_templates;
drop policy if exists "import_templates: admin 삭제" on public.import_templates;

-- 6. 정책 추가
create policy "gas_company_monthly: 열람 개방"
  on public.gas_company_monthly for select
  using (true);

create policy "gas_company_monthly: 누구나 입력 허용"
  on public.gas_company_monthly for insert
  with check (true);

create policy "gas_company_monthly: 누구나 수정 허용"
  on public.gas_company_monthly for update
  using (true);

create policy "gas_company_monthly: admin 삭제"
  on public.gas_company_monthly for delete
  using (public.get_my_role() = 'admin');

create policy "import_aliases: 열람 개방"
  on public.import_aliases for select
  using (true);

create policy "import_aliases: 누구나 입력 허용"
  on public.import_aliases for insert
  with check (true);

create policy "import_aliases: 누구나 수정 허용"
  on public.import_aliases for update
  using (true);

create policy "import_aliases: admin 삭제"
  on public.import_aliases for delete
  using (public.get_my_role() = 'admin');

create policy "import_templates: 열람 개방"
  on public.import_templates for select
  using (true);

create policy "import_templates: 누구나 입력 허용"
  on public.import_templates for insert
  with check (true);

create policy "import_templates: 누구나 수정 허용"
  on public.import_templates for update
  using (true);

create policy "import_templates: admin 삭제"
  on public.import_templates for delete
  using (public.get_my_role() = 'admin');

-- 7. 기본 별칭 데이터
insert into public.import_aliases (dataset_key, canonical_field, alias_text) values
  ('shared', 'shift', '주간'),
  ('shared', 'shift', '주'),
  ('shared', 'shift', 'day'),
  ('shared', 'shift', '야간'),
  ('shared', 'shift', '야'),
  ('shared', 'shift', 'night'),
  ('shared', 'shift', '주야'),
  ('shared', 'shift', 'both'),
  ('shared', 'furnace_code', '가열로'),
  ('shared', 'furnace_code', '호기'),
  ('shared', 'furnace_code', 'furnace'),
  ('shared', 'furnace_code', '#1'),
  ('shared', 'furnace_code', '#2'),
  ('shared', 'line_code', '라인'),
  ('shared', 'line_code', 'line'),
  ('shared', 'line_code', '프레스'),
  ('shared', 'product_name', '제품'),
  ('shared', 'product_name', 'product'),
  ('shared', 'ym', '작업년월'),
  ('shared', 'ym', '월'),
  ('shared', 'work_month', '작업년월'),
  ('shared', 'work_month', '월'),
  ('gas-daily', 'date', '일자'),
  ('gas-daily', 'date', '날짜'),
  ('gas-daily', 'value', '검침값'),
  ('gas-daily', 'value', '사용량'),
  ('gas-monthly', 'ym', '작업년월'),
  ('gas-monthly', 'gas_usage', '가스량'),
  ('gas-monthly', 'gas_usage', '검침값'),
  ('gas-monthly', 'charge_weight_kg', '장입량'),
  ('gas-monthly', 'charge_weight_kg', '투입중량'),
  ('production', 'work_month', '단조작업일'),
  ('production', 'line_code', '프레스별'),
  ('production', 'line_code', '작업장'),
  ('production', 'product_name', '소재품명'),
  ('production', 'product_name', '품명'),
  ('production', 'product_name', '제품형상'),
  ('production', 'plan_ton', '목표'),
  ('production', 'plan_ton', '계획'),
  ('production', 'actual_ton', '실적'),
  ('production', 'actual_ton', '달성'),
  ('production', 'actual_ton', '생산중량(양품)'),
  ('production', 'actual_ton', '생산중량'),
  ('production', 'hwangji_ton', '황지'),
  ('production', 'cogging_ton', 'COGGING'),
  ('production', 'shift', '작업조'),
  ('production', 'work_hours', '작업시간'),
  ('production', 'work_count', '작업횟수'),
  ('production', 'work_count', '양품'),
  ('production', 'order_no', '수주번호'),
  ('gas-company-monthly', 'charge_weight_kg', '장입량'),
  ('gas-company-monthly', 'gas_usage', '가스사용량')
on conflict (dataset_key, canonical_field, alias_text) do nothing;
