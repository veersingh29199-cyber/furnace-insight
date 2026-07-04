-- ================================================================
-- 006_uploads_and_line_output.sql
-- 생산량집계표 업로드/파싱/저장용 멱등 마이그레이션
-- ================================================================

insert into storage.buckets(id, name, public)
values ('uploads', 'uploads', false)
on conflict (id) do nothing;

drop policy if exists uploads_rw on storage.objects;
create policy uploads_rw on storage.objects
for all
using (bucket_id = 'uploads')
with check (bucket_id = 'uploads');

create table if not exists uploads (
  id bigserial primary key,
  file_name text not null,
  storage_path text not null,
  file_type text,
  size_bytes bigint,
  target text,
  status text default 'stored',
  rows_new int default 0,
  rows_updated int default 0,
  rows_error int default 0,
  template_id bigint,
  uploaded_by text,
  uploaded_at timestamptz default now(),
  note text
);

create table if not exists import_templates (
  id bigserial primary key,
  name text not null,
  target text not null,
  header_signature text,
  mapping jsonb not null,
  created_at timestamptz default now()
);

create table if not exists import_aliases (
  id bigserial primary key,
  target_field text not null,
  alias text not null
);

create table if not exists work_standards (
  id bigserial primary key,
  dept text not null,
  product text not null,
  material text,
  basis text not null default 'charge',
  min_ton numeric,
  max_ton numeric,
  order_size text,
  std_work_count numeric not null,
  note text
);

create table if not exists raw_material_specs (
  id bigserial primary key,
  product text not null,
  material text,
  raw_material text not null,
  spec text,
  note text
);

alter table targets add column if not exists year int;
alter table targets add column if not exists dept text;
alter table furnaces add column if not exists dept text;

create table if not exists app_settings (
  key text primary key,
  value jsonb not null,
  note text
);

insert into app_settings(key, value, note)
values
  ('operating_hours_per_day', '20'::jsonb, '1일 가동시간'),
  ('shifts_per_day', '2'::jsonb, '1일 교대수')
on conflict (key) do nothing;

create table if not exists line_output_daily (
  id bigserial primary key,
  work_date date not null,
  line_code text not null,
  output_kg numeric,
  plan_kg numeric,
  achievement numeric,
  hwangji_kg numeric,
  cogging_kg numeric,
  subtotal_kg numeric,
  remake_self_remake numeric,
  remake_self_fix numeric,
  remake_qc_remake numeric,
  remake_qc_fix numeric,
  mat_cs_kg numeric,
  mat_as_kg numeric,
  mat_sus_kg numeric,
  mat_total_kg numeric,
  source_upload_id bigint,
  unique (work_date, line_code)
);

create table if not exists line_output_monthly (
  id bigserial primary key,
  ym text not null,
  line_code text not null,
  output_kg numeric,
  plan_kg numeric,
  achievement numeric,
  hwangji_kg numeric,
  cogging_kg numeric,
  subtotal_kg numeric,
  remake_self_remake numeric,
  remake_self_fix numeric,
  remake_qc_remake numeric,
  remake_qc_fix numeric,
  mat_cs_kg numeric,
  mat_as_kg numeric,
  mat_sus_kg numeric,
  mat_total_kg numeric,
  source_upload_id bigint,
  unique (ym, line_code)
);

alter table production_records add column if not exists source_upload_id bigint;
alter table gas_records add column if not exists source_upload_id bigint;
alter table gas_daily_readings add column if not exists source_upload_id bigint;

do $$
declare
  t text;
begin
  foreach t in array array[
    'uploads',
    'import_templates',
    'import_aliases',
    'work_standards',
    'raw_material_specs',
    'app_settings',
    'line_output_daily',
    'line_output_monthly'
  ] loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists %I_all on %I', t, t);
    execute format('create policy %I_all on %I for all using(true) with check(true)', t, t);
  end loop;
end $$;

notify pgrst, 'reload schema';
