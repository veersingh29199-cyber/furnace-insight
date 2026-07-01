-- ================================================================
-- 003_open_access.sql
-- 로그인 없는(anon) 부서원 개방 모드 대응 멱등 마이그레이션
-- ================================================================

-- 1. created_by 컬럼 Nullable 변경 (로그인 없이 저장 시 auth.users 참조 불가 대응)
alter table public.production_records alter column created_by drop not null;
alter table public.gas_records        alter column created_by drop not null;
alter table public.gas_daily_readings alter column created_by drop not null;

-- 2. 부서원 실명 / 교대조 기록용 컬럼 추가 (entered_by_name, entered_by_shift)
alter table public.production_records
  add column if not exists entered_by_name text,
  add column if not exists entered_by_shift text;

alter table public.gas_records
  add column if not exists entered_by_name text,
  add column if not exists entered_by_shift text;

alter table public.gas_daily_readings
  add column if not exists entered_by_name text,
  add column if not exists entered_by_shift text;

-- 3. audit_log 테이블 개선 (비로그인 입력 주체 기록 가능하도록 actor 컬럼 Nullable 변경 및 actor_name 추가)
alter table public.audit_log alter column actor drop not null;
alter table public.audit_log add column if not exists actor_name text;

-- 4. 역할 조회 헬퍼 함수 보장 (미생성 또는 삭제된 경우 대비)
create or replace function public.get_my_role()
returns text language sql security definer stable
as $$
  select role from public.profiles where id = auth.uid()
$$;

-- 5. 기존 RLS 정책 일괄 삭제 (멱등성 보장)
drop policy if exists "profiles: 자신 조회" on public.profiles;
drop policy if exists "profiles: admin 전체 조회" on public.profiles;
drop policy if exists "profiles: admin 수정" on public.profiles;

drop policy if exists "lines: 로그인 사용자 조회" on public.lines;
drop policy if exists "lines: admin 수정" on public.lines;

drop policy if exists "furnaces: 로그인 사용자 조회" on public.furnaces;
drop policy if exists "furnaces: admin 수정" on public.furnaces;

drop policy if exists "products: 로그인 사용자 조회" on public.products;
drop policy if exists "products: admin 수정" on public.products;

drop policy if exists "production_records: 로그인 조회" on public.production_records;
drop policy if exists "production_records: editor/admin 입력" on public.production_records;
drop policy if exists "production_records: editor/admin 수정" on public.production_records;
drop policy if exists "production_records: admin 삭제" on public.production_records;

drop policy if exists "gas_records: 로그인 조회" on public.gas_records;
drop policy if exists "gas_records: editor/admin 입력" on public.gas_records;
drop policy if exists "gas_records: editor/admin 수정" on public.gas_records;
drop policy if exists "gas_records: admin 삭제" on public.gas_records;

drop policy if exists "gas_daily_readings: 로그인 조회" on public.gas_daily_readings;
drop policy if exists "gas_daily_readings: editor/admin 입력" on public.gas_daily_readings;
drop policy if exists "gas_daily_readings: editor/admin 수정" on public.gas_daily_readings;
drop policy if exists "gas_daily_readings: admin 삭제" on public.gas_daily_readings;

drop policy if exists "targets: 로그인 조회" on public.targets;
drop policy if exists "targets: admin 관리" on public.targets;

drop policy if exists "benchmarks: 로그인 조회" on public.benchmarks;
drop policy if exists "benchmarks: admin 관리" on public.benchmarks;

drop policy if exists "audit_log: admin 조회" on public.audit_log;
drop policy if exists "audit_log: 시스템 입력 (service_role)" on public.audit_log;

-- 5. 새로운 RLS 정책 설정 (anon / authenticated 모두 열람 허용)

-- ── profiles ──
create policy "profiles: 전체 조회" on public.profiles for select using (true);
create policy "profiles: admin 수정" on public.profiles for update using (public.get_my_role() = 'admin');

-- ── lines ──
create policy "lines: 열람 개방" on public.lines for select using (true);
create policy "lines: admin 수정" on public.lines for all using (public.get_my_role() = 'admin');

-- ── furnaces ──
create policy "furnaces: 열람 개방" on public.furnaces for select using (true);
create policy "furnaces: admin 수정" on public.furnaces for all using (public.get_my_role() = 'admin');

-- ── products ──
create policy "products: 열람 개방" on public.products for select using (true);
create policy "products: admin 수정" on public.products for all using (public.get_my_role() = 'admin');

-- ── targets ──
create policy "targets: 열람 개방" on public.targets for select using (true);
create policy "targets: admin 관리" on public.targets for all using (public.get_my_role() = 'admin');

-- ── benchmarks ──
create policy "benchmarks: 열람 개방" on public.benchmarks for select using (true);
create policy "benchmarks: admin 관리" on public.benchmarks for all using (public.get_my_role() = 'admin');

-- ── audit_log ──
create policy "audit_log: 열람 개방" on public.audit_log for select using (true);
create policy "audit_log: 모두 입력 허용" on public.audit_log for insert with check (true);

-- 6. 데이터 입력 테이블 (production_records, gas_records, gas_daily_readings)
-- 부서원 누구나(anon 포함) 조회 / 입력(INSERT) / 수정(UPDATE) 가능토록 개방
-- 단, 삭제(DELETE)는 클라이언트(anon)에서 불가하며 서버 service_role 또는 admin만 가능

create policy "production_records: 열람 개방" on public.production_records for select using (true);
create policy "production_records: 누구나 입력 허용" on public.production_records for insert with check (true);
create policy "production_records: 누구나 수정 허용" on public.production_records for update using (true);
create policy "production_records: admin 삭제" on public.production_records for delete using (public.get_my_role() = 'admin');

create policy "gas_records: 열람 개방" on public.gas_records for select using (true);
create policy "gas_records: 누구나 입력 허용" on public.gas_records for insert with check (true);
create policy "gas_records: 누구나 수정 허용" on public.gas_records for update using (true);
create policy "gas_records: admin 삭제" on public.gas_records for delete using (public.get_my_role() = 'admin');

create policy "gas_daily_readings: 열람 개방" on public.gas_daily_readings for select using (true);
create policy "gas_daily_readings: 누구나 입력 허용" on public.gas_daily_readings for insert with check (true);
create policy "gas_daily_readings: 누구나 수정 허용" on public.gas_daily_readings for update using (true);
create policy "gas_daily_readings: admin 삭제" on public.gas_daily_readings for delete using (public.get_my_role() = 'admin');
