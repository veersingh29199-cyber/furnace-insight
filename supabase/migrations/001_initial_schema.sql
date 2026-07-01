-- ================================================================
-- Furnace Insight — Supabase 마이그레이션 SQL
-- 실행 방법: Supabase 대시보드 > SQL Editor에서 전체 붙여넣기 후 실행
-- ================================================================

-- 확장 프로그램 활성화
create extension if not exists "uuid-ossp";

-- ================================================================
-- 1. profiles — 사용자 프로필 및 역할
-- ================================================================
create table if not exists public.profiles (
  id         uuid primary key references auth.users(id) on delete cascade,
  name       text not null,
  role       text not null default 'viewer' check (role in ('admin', 'editor', 'viewer')),
  created_at timestamptz not null default now()
);

comment on table public.profiles is '사용자 프로필 및 역할 (admin/editor/viewer)';

-- 신규 사용자 가입 시 자동으로 profiles 레코드 생성
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.profiles (id, name, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)),
    'viewer'
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ================================================================
-- 2. lines — 라인(프레스) 마스터
-- ================================================================
create table if not exists public.lines (
  id               uuid primary key default uuid_generate_v4(),
  code             text not null unique, -- P5, P8, P15, R/M, ...
  name             text not null,
  capacity_class   text not null check (capacity_class in ('5000', '15000', 'ringmill')),
  active           boolean not null default true,
  created_at       timestamptz not null default now()
);

comment on table public.lines is '단조 라인(프레스) 마스터';

-- ================================================================
-- 3. furnaces — 가열로 마스터
-- ================================================================
create table if not exists public.furnaces (
  id              uuid primary key default uuid_generate_v4(),
  code            text not null unique, -- 1호기 ~ 20호기
  name            text not null,
  group_line_id   uuid references public.lines(id),
  active          boolean not null default true,
  created_at      timestamptz not null default now()
);

comment on table public.furnaces is '가열로 마스터 (1호기~20호기)';

-- ================================================================
-- 4. products — 제품/재질 마스터
-- ================================================================
create table if not exists public.products (
  id                uuid primary key default uuid_generate_v4(),
  name              text not null,
  material          text not null, -- 금형강|크랭크축|쉘|로터|C/S|A/S|SUS
  std_ton_per_hour  numeric,       -- 표준 시간당 생산량 (톤/h)
  std_gas_unit      numeric,       -- 표준 가스원단위
  active            boolean not null default true,
  created_at        timestamptz not null default now()
);

comment on table public.products is '제품/재질 마스터';

-- ================================================================
-- 5. production_records — 월별 생산 실적
-- ================================================================
create table if not exists public.production_records (
  id                  uuid primary key default uuid_generate_v4(),
  work_month          date not null,             -- YYYY-MM-01 형식
  line_id             uuid not null references public.lines(id),
  product_id          uuid references public.products(id),
  shift               text check (shift in ('day', 'night', 'both')),
  plan_ton            numeric not null default 0,
  actual_ton          numeric not null default 0,
  hwangji_ton         numeric not null default 0,
  cogging_ton         numeric not null default 0,
  rework_self_ton     numeric not null default 0,
  rework_quality_ton  numeric not null default 0,
  work_hours          numeric not null default 0,
  work_count          integer not null default 0,
  note                text,
  created_by          uuid not null references auth.users(id),
  created_at          timestamptz not null default now(),
  updated_by          uuid references auth.users(id),
  updated_at          timestamptz,
  -- 같은 달, 같은 라인, 같은 제품, 같은 교대조 중복 방지
  unique (work_month, line_id, product_id, shift)
);

comment on table public.production_records is '월별 생산 실적 (라인·제품·교대조별)';

create index if not exists idx_production_records_work_month on public.production_records(work_month);
create index if not exists idx_production_records_line_id    on public.production_records(line_id);

-- ================================================================
-- 6. gas_records — 가열로 월별 가스 검침
-- ================================================================
create table if not exists public.gas_records (
  id                uuid primary key default uuid_generate_v4(),
  ym                date not null,              -- YYYY-MM-01
  furnace_id        uuid not null references public.furnaces(id),
  charge_weight_kg  numeric not null default 0, -- 장입량 (kg)
  gas_usage         numeric not null default 0, -- 가스 사용량
  -- 원단위 = 가스사용량 / 장입중량(톤) — GENERATED ALWAYS
  gas_unit          numeric generated always as (
                      case when charge_weight_kg > 0
                      then gas_usage / (charge_weight_kg / 1000.0)
                      else null end
                    ) stored,
  source            text not null default 'meter' check (source in ('meter', 'bill', 'self')),
  note              text,
  created_by        uuid not null references auth.users(id),
  created_at        timestamptz not null default now(),
  -- 같은 달, 같은 가열로 중복 방지
  unique (ym, furnace_id)
);

comment on table public.gas_records is '가열로 월별 가스 검침 (원단위 자동 계산)';

create index if not exists idx_gas_records_ym          on public.gas_records(ym);
create index if not exists idx_gas_records_furnace_id  on public.gas_records(furnace_id);

-- ================================================================
-- 7. gas_daily_readings — 일자별 자체 검침
-- ================================================================
create table if not exists public.gas_daily_readings (
  id          uuid primary key default uuid_generate_v4(),
  date        date not null,
  furnace_id  uuid not null references public.furnaces(id),
  shift       text not null check (shift in ('day', 'night', 'both')),
  value       numeric not null,
  created_by  uuid not null references auth.users(id),
  created_at  timestamptz not null default now(),
  unique (date, furnace_id, shift)
);

comment on table public.gas_daily_readings is '일자별 가스 자체 검침 (주간/야간)';

create index if not exists idx_gas_daily_date       on public.gas_daily_readings(date);
create index if not exists idx_gas_daily_furnace_id on public.gas_daily_readings(furnace_id);

-- ================================================================
-- 8. targets — 목표값 설정
-- ================================================================
create table if not exists public.targets (
  id            uuid primary key default uuid_generate_v4(),
  year          integer not null,
  scope         text not null check (scope in ('line', 'furnace', 'company')),
  ref_id        uuid,  -- line_id 또는 furnace_id (scope에 따라)
  metric        text not null check (metric in ('gas_unit', 'ton_per_hour', 'output')),
  target_value  numeric not null,
  note          text,
  created_at    timestamptz not null default now(),
  unique (year, scope, ref_id, metric)
);

comment on table public.targets is '연도별 목표값 (라인/가열로/전사)';

-- ================================================================
-- 9. benchmarks — 벤치마크 기준값
-- ================================================================
create table if not exists public.benchmarks (
  id               uuid primary key default uuid_generate_v4(),
  org              text not null check (org in ('두산', '태상', '태웅')),
  metric           text not null check (metric in ('gas_unit', 'ton_per_hour', 'output')),
  product_or_scope text not null, -- 금형강, 크랭크축, 전사 등
  value            numeric not null,
  year             integer not null,
  created_at       timestamptz not null default now(),
  unique (org, metric, product_or_scope, year)
);

comment on table public.benchmarks is '벤치마크 기준값 (두산/태상/태웅)';

-- ================================================================
-- 10. audit_log — 변경 이력
-- ================================================================
create table if not exists public.audit_log (
  id          uuid primary key default uuid_generate_v4(),
  table_name  text not null,
  row_id      text not null,
  action      text not null check (action in ('INSERT', 'UPDATE', 'DELETE')),
  before      jsonb,
  after       jsonb,
  actor       uuid references auth.users(id),
  at          timestamptz not null default now()
);

comment on table public.audit_log is '데이터 변경 이력 감사 로그';

create index if not exists idx_audit_log_table_name on public.audit_log(table_name);
create index if not exists idx_audit_log_at         on public.audit_log(at desc);

-- ================================================================
-- RLS (Row Level Security) 정책 설정
-- ================================================================

-- 모든 테이블 RLS 활성화
alter table public.profiles            enable row level security;
alter table public.lines               enable row level security;
alter table public.furnaces            enable row level security;
alter table public.products            enable row level security;
alter table public.production_records  enable row level security;
alter table public.gas_records         enable row level security;
alter table public.gas_daily_readings  enable row level security;
alter table public.targets             enable row level security;
alter table public.benchmarks          enable row level security;
alter table public.audit_log           enable row level security;

-- 역할 조회 헬퍼 함수 (성능 최적화용)
create or replace function public.get_my_role()
returns text language sql security definer stable
as $$
  select role from public.profiles where id = auth.uid()
$$;

-- ──────────────────── profiles ────────────────────
-- 자신의 프로필 조회
create policy "profiles: 자신 조회"
  on public.profiles for select
  using (id = auth.uid());

-- admin은 전체 조회
create policy "profiles: admin 전체 조회"
  on public.profiles for select
  using (public.get_my_role() = 'admin');

-- admin만 역할 변경
create policy "profiles: admin 수정"
  on public.profiles for update
  using (public.get_my_role() = 'admin');

-- ──────────────────── lines ────────────────────
create policy "lines: 로그인 사용자 조회"
  on public.lines for select
  using (auth.uid() is not null);

create policy "lines: admin 수정"
  on public.lines for all
  using (public.get_my_role() = 'admin');

-- ──────────────────── furnaces ────────────────────
create policy "furnaces: 로그인 사용자 조회"
  on public.furnaces for select
  using (auth.uid() is not null);

create policy "furnaces: admin 수정"
  on public.furnaces for all
  using (public.get_my_role() = 'admin');

-- ──────────────────── products ────────────────────
create policy "products: 로그인 사용자 조회"
  on public.products for select
  using (auth.uid() is not null);

create policy "products: admin 수정"
  on public.products for all
  using (public.get_my_role() = 'admin');

-- ──────────────────── production_records ────────────────────
create policy "production_records: 로그인 조회"
  on public.production_records for select
  using (auth.uid() is not null);

create policy "production_records: editor/admin 입력"
  on public.production_records for insert
  with check (public.get_my_role() in ('admin', 'editor'));

create policy "production_records: editor/admin 수정"
  on public.production_records for update
  using (public.get_my_role() in ('admin', 'editor'));

create policy "production_records: admin 삭제"
  on public.production_records for delete
  using (public.get_my_role() = 'admin');

-- ──────────────────── gas_records ────────────────────
create policy "gas_records: 로그인 조회"
  on public.gas_records for select
  using (auth.uid() is not null);

create policy "gas_records: editor/admin 입력"
  on public.gas_records for insert
  with check (public.get_my_role() in ('admin', 'editor'));

create policy "gas_records: editor/admin 수정"
  on public.gas_records for update
  using (public.get_my_role() in ('admin', 'editor'));

create policy "gas_records: admin 삭제"
  on public.gas_records for delete
  using (public.get_my_role() = 'admin');

-- ──────────────────── gas_daily_readings ────────────────────
create policy "gas_daily_readings: 로그인 조회"
  on public.gas_daily_readings for select
  using (auth.uid() is not null);

create policy "gas_daily_readings: editor/admin 입력"
  on public.gas_daily_readings for insert
  with check (public.get_my_role() in ('admin', 'editor'));

create policy "gas_daily_readings: editor/admin 수정"
  on public.gas_daily_readings for update
  using (public.get_my_role() in ('admin', 'editor'));

create policy "gas_daily_readings: admin 삭제"
  on public.gas_daily_readings for delete
  using (public.get_my_role() = 'admin');

-- ──────────────────── targets ────────────────────
create policy "targets: 로그인 조회"
  on public.targets for select
  using (auth.uid() is not null);

create policy "targets: admin 관리"
  on public.targets for all
  using (public.get_my_role() = 'admin');

-- ──────────────────── benchmarks ────────────────────
create policy "benchmarks: 로그인 조회"
  on public.benchmarks for select
  using (auth.uid() is not null);

create policy "benchmarks: admin 관리"
  on public.benchmarks for all
  using (public.get_my_role() = 'admin');

-- ──────────────────── audit_log ────────────────────
create policy "audit_log: admin 조회"
  on public.audit_log for select
  using (public.get_my_role() = 'admin');

create policy "audit_log: 시스템 입력 (service_role)"
  on public.audit_log for insert
  with check (true); -- service_role에서만 호출

-- ================================================================
-- 시드 데이터 — 마스터 데이터 초기값
-- ================================================================

-- 라인 초기값
insert into public.lines (code, name, capacity_class) values
  ('P5',  'P5 프레스 (5,000톤)',     '5000'),
  ('P8',  'P8 프레스 (5,000톤)',     '5000'),
  ('P15', 'P15 프레스 (15,000톤)',   '15000'),
  ('R/M', '링밀 (Ring Mill)',        'ringmill')
on conflict (code) do nothing;

-- 가열로 초기값 (1호기~20호기)
insert into public.furnaces (code, name) values
  ('1호기',  '1호 가열로'),  ('2호기',  '2호 가열로'),
  ('3호기',  '3호 가열로'),  ('4호기',  '4호 가열로'),
  ('5호기',  '5호 가열로'),  ('6호기',  '6호 가열로'),
  ('7호기',  '7호 가열로'),  ('8호기',  '8호 가열로'),
  ('9호기',  '9호 가열로'),  ('10호기', '10호 가열로'),
  ('11호기', '11호 가열로'), ('12호기', '12호 가열로'),
  ('13호기', '13호 가열로'), ('14호기', '14호 가열로'),
  ('15호기', '15호 가열로'), ('16호기', '16호 가열로'),
  ('17호기', '17호 가열로'), ('18호기', '18호 가열로'),
  ('19호기', '19호 가열로'), ('20호기', '20호 가열로')
on conflict (code) do nothing;

-- 제품 마스터 초기값 (두산 벤치마크 기준 std_ton_per_hour)
insert into public.products (name, material, std_ton_per_hour, std_gas_unit) values
  ('금형강',   '금형강',   25, 145),
  ('크랭크축', '크랭크축', 26, 140),
  ('쉘',       '쉘',       10, 160),
  ('로터',     '로터',      7, 155),
  ('C/S',      'C/S',      null, null),
  ('A/S',      'A/S',      null, null),
  ('SUS',      'SUS',      null, null)
on conflict do nothing;

-- 벤치마크 초기값
insert into public.benchmarks (org, metric, product_or_scope, value, year) values
  -- 두산 시간당 생산량
  ('두산', 'ton_per_hour', '금형강',   25,  2024),
  ('두산', 'ton_per_hour', '크랭크축', 26,  2024),
  ('두산', 'ton_per_hour', '쉘',       10,  2024),
  ('두산', 'ton_per_hour', '로터',      7,  2024),
  -- 태상 가스원단위
  ('태상', 'gas_unit', '전사', 150, 2024), -- 목표
  ('태상', 'gas_unit', '실적', 139, 2024), -- 실적
  -- 태웅 가스원단위
  ('태웅', 'gas_unit', '전사', 150, 2024), -- 목표
  ('태웅', 'gas_unit', '실적', 172, 2024)  -- 실적
on conflict do nothing;
