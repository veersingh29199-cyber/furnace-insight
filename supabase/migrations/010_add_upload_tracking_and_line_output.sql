-- Add upload tracking fields and line output tables for the smart importer.

create extension if not exists "uuid-ossp";

-- ------------------------------------------------------------
-- 1) Rename legacy upload table if needed
-- ------------------------------------------------------------
do $$
begin
  if exists (
    select 1
    from information_schema.tables
    where table_schema = 'public'
      and table_name = 'import_uploads'
  ) and not exists (
    select 1
    from information_schema.tables
    where table_schema = 'public'
      and table_name = 'uploads'
  ) then
    alter table public.import_uploads rename to uploads;
  end if;
end $$;

-- ------------------------------------------------------------
-- 2) Upload history table
-- ------------------------------------------------------------
create table if not exists public.uploads (
  id uuid primary key default uuid_generate_v4(),
  dataset_key text not null,
  sheet_name text not null,
  file_name text not null,
  storage_bucket text not null default 'uploads',
  storage_path text not null,
  file_hash text not null,
  file_size bigint not null default 0,
  layout text not null default 'auto',
  row_count integer not null default 0,
  saved_count integer not null default 0,
  failed_count integer not null default 0,
  warning_count integer not null default 0,
  template_name text,
  template_id uuid,
  status text not null default 'stored',
  parsed_at timestamptz,
  error_message text,
  mapping_json jsonb not null default '{}'::jsonb,
  summary_json jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (dataset_key, sheet_name, file_name)
);

alter table if exists public.uploads
  add column if not exists template_id uuid,
  add column if not exists status text not null default 'stored',
  add column if not exists parsed_at timestamptz,
  add column if not exists error_message text;

create index if not exists idx_uploads_dataset on public.uploads(dataset_key, updated_at desc);
create index if not exists idx_uploads_sheet on public.uploads(sheet_name, updated_at desc);

alter table if exists public.uploads enable row level security;

drop policy if exists "uploads: public read" on public.uploads;
drop policy if exists "uploads: public insert" on public.uploads;
drop policy if exists "uploads: public update" on public.uploads;
drop policy if exists "uploads: admin delete" on public.uploads;

create policy "uploads: public read"
  on public.uploads for select
  using (true);

create policy "uploads: public insert"
  on public.uploads for insert
  with check (true);

create policy "uploads: public update"
  on public.uploads for update
  using (true);

create policy "uploads: admin delete"
  on public.uploads for delete
  using (public.get_my_role() = 'admin');

-- ------------------------------------------------------------
-- 3) Original file storage bucket
-- ------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('uploads', 'uploads', false)
on conflict (id) do update
set name = excluded.name,
    public = excluded.public;

-- ------------------------------------------------------------
-- 4) Add source upload tracking columns to analysis tables
-- ------------------------------------------------------------
alter table if exists public.production_records
  add column if not exists source_upload_id uuid references public.uploads(id);

alter table if exists public.gas_records
  add column if not exists source_upload_id uuid references public.uploads(id);

alter table if exists public.gas_daily_readings
  add column if not exists source_upload_id uuid references public.uploads(id);

alter table if exists public.gas_company_monthly
  add column if not exists source_upload_id uuid references public.uploads(id);

alter table if exists public.targets
  add column if not exists source_upload_id uuid references public.uploads(id);

alter table if exists public.work_standards
  add column if not exists source_upload_id uuid references public.uploads(id);

alter table if exists public.raw_material_specs
  add column if not exists source_upload_id uuid references public.uploads(id);

-- ------------------------------------------------------------
-- 5) Line output tables
-- ------------------------------------------------------------
create table if not exists public.line_output_daily (
  id uuid primary key default uuid_generate_v4(),
  work_date date not null,
  line_code text not null,
  line_label text,
  plan_ton numeric not null default 0,
  actual_ton numeric not null default 0,
  achievement_pct numeric,
  hwangji_ton numeric not null default 0,
  cogging_ton numeric not null default 0,
  rework_self_ton numeric not null default 0,
  rework_quality_ton numeric not null default 0,
  cs_ton numeric not null default 0,
  as_ton numeric not null default 0,
  sus_ton numeric not null default 0,
  total_ton numeric not null default 0,
  work_count integer not null default 0,
  note text,
  source_upload_id uuid references public.uploads(id),
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (work_date, line_code)
);

create table if not exists public.line_output_monthly (
  id uuid primary key default uuid_generate_v4(),
  ym date not null,
  line_code text not null,
  line_label text,
  plan_ton numeric not null default 0,
  actual_ton numeric not null default 0,
  achievement_pct numeric,
  hwangji_ton numeric not null default 0,
  cogging_ton numeric not null default 0,
  rework_self_ton numeric not null default 0,
  rework_quality_ton numeric not null default 0,
  cs_ton numeric not null default 0,
  as_ton numeric not null default 0,
  sus_ton numeric not null default 0,
  total_ton numeric not null default 0,
  work_count integer not null default 0,
  note text,
  source_upload_id uuid references public.uploads(id),
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (ym, line_code)
);

create index if not exists idx_line_output_daily_work_date on public.line_output_daily(work_date, line_code);
create index if not exists idx_line_output_monthly_ym on public.line_output_monthly(ym, line_code);

alter table if exists public.line_output_daily enable row level security;
alter table if exists public.line_output_monthly enable row level security;

drop policy if exists "line_output_daily: public read" on public.line_output_daily;
drop policy if exists "line_output_daily: public insert" on public.line_output_daily;
drop policy if exists "line_output_daily: public update" on public.line_output_daily;
drop policy if exists "line_output_daily: admin delete" on public.line_output_daily;

drop policy if exists "line_output_monthly: public read" on public.line_output_monthly;
drop policy if exists "line_output_monthly: public insert" on public.line_output_monthly;
drop policy if exists "line_output_monthly: public update" on public.line_output_monthly;
drop policy if exists "line_output_monthly: admin delete" on public.line_output_monthly;

create policy "line_output_daily: public read"
  on public.line_output_daily for select
  using (true);

create policy "line_output_daily: public insert"
  on public.line_output_daily for insert
  with check (true);

create policy "line_output_daily: public update"
  on public.line_output_daily for update
  using (true);

create policy "line_output_daily: admin delete"
  on public.line_output_daily for delete
  using (public.get_my_role() = 'admin');

create policy "line_output_monthly: public read"
  on public.line_output_monthly for select
  using (true);

create policy "line_output_monthly: public insert"
  on public.line_output_monthly for insert
  with check (true);

create policy "line_output_monthly: public update"
  on public.line_output_monthly for update
  using (true);

create policy "line_output_monthly: admin delete"
  on public.line_output_monthly for delete
  using (public.get_my_role() = 'admin');

