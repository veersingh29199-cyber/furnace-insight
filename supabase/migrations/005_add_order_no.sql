-- ================================================================
-- 005_add_order_no.sql — 수주번호(Order Number / Lot No.) 관리 컬럼 추가
-- ================================================================

-- 1. production_records에 수주번호 컬럼 추가
alter table public.production_records
  add column if not exists order_no text;

comment on column public.production_records.order_no is '수주번호 / 작업지시번호 (예: ORD-202607-001, 26-HS-0142)';

create index if not exists idx_production_records_order_no on public.production_records(order_no);

-- 2. gas_daily_readings에 수주번호 컬럼 추가 (특정 일별 검침 시 작업 중인 수주 기입 가능)
alter table public.gas_daily_readings
  add column if not exists order_no text;

comment on column public.gas_daily_readings.order_no is '당일 가동 가열로 주요 수주번호 / 작업번호';

create index if not exists idx_gas_daily_readings_order_no on public.gas_daily_readings(order_no);

-- 3. gas_records(월별 가스)에 주요 수주내역 또는 참고번호 컬럼 추가
alter table public.gas_records
  add column if not exists order_no text;

comment on column public.gas_records.order_no is '주요 수주내역 / 랏번호 참고값';
