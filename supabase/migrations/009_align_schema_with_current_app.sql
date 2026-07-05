-- Align the database schema with the current app code.
-- Safe to run after the earlier migrations; repeated runs should no-op.

create extension if not exists "uuid-ossp";

-- ------------------------------------------------------------
-- 1) Core compatibility columns
-- ------------------------------------------------------------
alter table if exists public.production_records
  alter column created_by drop not null;

alter table if exists public.gas_records
  alter column created_by drop not null;

alter table if exists public.gas_daily_readings
  alter column created_by drop not null;

alter table if exists public.production_records
  add column if not exists work_date date,
  add column if not exists dept_line text,
  add column if not exists order_no text,
  add column if not exists product text,
  add column if not exists material text,
  add column if not exists process text,
  add column if not exists order_size text,
  add column if not exists work_size text,
  add column if not exists order_weight numeric default 0,
  add column if not exists charge_weight numeric default 0,
  add column if not exists furnace_code text,
  add column if not exists entered_by_name text,
  add column if not exists entered_by_shift text,
  add column if not exists ton_per_hour numeric generated always as (
    case when coalesce(work_hours, 0) > 0 then order_weight / nullif(work_hours, 0) end
  ) stored,
  add column if not exists ton_per_run numeric generated always as (
    case when coalesce(work_count, 0) > 0 then order_weight / nullif(work_count, 0) end
  ) stored;

alter table if exists public.production_records
  alter column order_weight set default 0,
  alter column charge_weight set default 0,
  alter column work_hours set default 0,
  alter column work_count set default 0;

alter table if exists public.gas_records
  add column if not exists furnace_code text,
  add column if not exists order_no text,
  add column if not exists entered_by_name text,
  add column if not exists entered_by_shift text;

alter table if exists public.gas_daily_readings
  add column if not exists furnace_code text,
  add column if not exists order_no text,
  add column if not exists entered_by_name text,
  add column if not exists entered_by_shift text;

alter table if exists public.gas_daily_readings
  alter column shift drop not null;

alter table if exists public.furnaces
  add column if not exists dept text;

alter table if exists public.targets
  add column if not exists dept text,
  add column if not exists ref text,
  add column if not exists ref_id uuid;

alter table if exists public.benchmarks
  add column if not exists scope text,
  add column if not exists product_or_scope text,
  add column if not exists year integer;

-- ------------------------------------------------------------
-- 2) Missing tables
-- ------------------------------------------------------------
create table if not exists public.gas_company_monthly (
  id uuid primary key default uuid_generate_v4(),
  ym date not null,
  charge_weight_kg numeric not null default 0,
  gas_usage numeric not null default 0,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create table if not exists public.import_aliases (
  id uuid primary key default uuid_generate_v4(),
  dataset_key text not null,
  canonical_field text not null,
  alias_text text not null,
  active boolean not null default true,
  note text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (dataset_key, canonical_field, alias_text)
);

create table if not exists public.import_templates (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  dataset_key text not null,
  sheet_rules jsonb not null default '{}'::jsonb,
  mapping_json jsonb not null default '{}'::jsonb,
  signature_json jsonb not null default '{}'::jsonb,
  active boolean not null default true,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (dataset_key, name)
);

create table if not exists public.import_uploads (
  id uuid primary key default uuid_generate_v4(),
  dataset_key text not null,
  sheet_name text not null,
  file_name text not null,
  storage_bucket text not null default 'import-files',
  storage_path text not null,
  file_hash text not null,
  file_size bigint not null default 0,
  layout text not null default 'auto',
  row_count integer not null default 0,
  saved_count integer not null default 0,
  failed_count integer not null default 0,
  warning_count integer not null default 0,
  template_name text,
  mapping_json jsonb not null default '{}'::jsonb,
  summary_json jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (dataset_key, sheet_name, file_name)
);

create table if not exists public.work_standards (
  id uuid primary key default uuid_generate_v4(),
  dept text not null,
  product text not null,
  material text not null,
  basis text not null check (basis in ('charge', 'product')),
  min_ton numeric,
  max_ton numeric,
  order_size text,
  std_work_count integer not null default 0,
  note text
);

create table if not exists public.raw_material_specs (
  id uuid primary key default uuid_generate_v4(),
  product text not null,
  material text not null,
  raw_material text not null,
  spec text not null,
  note text
);

create table if not exists public.app_settings (
  key text not null,
  value jsonb not null,
  note text
);

-- ------------------------------------------------------------
-- 3) Backfill legacy rows
-- ------------------------------------------------------------
update public.gas_records
set
  furnace_code = coalesce(furnace_code, (select code from public.furnaces where id = furnace_id limit 1)),
  furnace_id = coalesce(furnace_id, (select id from public.furnaces where code = furnace_code limit 1))
where furnace_code is null or furnace_id is null;

update public.gas_daily_readings
set
  furnace_code = coalesce(furnace_code, (select code from public.furnaces where id = furnace_id limit 1)),
  furnace_id = coalesce(furnace_id, (select id from public.furnaces where code = furnace_code limit 1))
where furnace_code is null or furnace_id is null;

update public.furnaces
set dept = coalesce(dept, (select code from public.lines where id = group_line_id limit 1))
where dept is null or btrim(dept) = '';

update public.targets
set
  ref = case
    when scope = 'company' then coalesce(ref, 'company')
    when scope = 'dept' then coalesce(ref, dept, 'company')
    when scope = 'line' then coalesce(ref, (select code from public.lines where id = ref_id limit 1))
    when scope = 'furnace' then coalesce(ref, (select code from public.furnaces where id = ref_id limit 1))
    else coalesce(ref, 'company')
  end,
  dept = case
    when scope = 'company' then coalesce(dept, 'company')
    when scope = 'dept' then coalesce(dept, ref, 'company')
    when scope = 'line' then coalesce(dept, (select code from public.lines where id = ref_id limit 1))
    when scope = 'furnace' then coalesce(
      dept,
      (select dept from public.furnaces where id = ref_id limit 1),
      (select code from public.furnaces where id = ref_id limit 1)
    )
    else coalesce(dept, 'company')
  end,
  ref_id = coalesce(
    ref_id,
    case
      when scope = 'line' then (select id from public.lines where code = ref limit 1)
      when scope = 'furnace' then (select id from public.furnaces where code = ref limit 1)
      else null
    end
  )
where ref is null or dept is null or ref_id is null;

update public.benchmarks
set
  scope = coalesce(scope, product_or_scope, '전사'),
  product_or_scope = coalesce(product_or_scope, scope),
  year = coalesce(year, extract(year from created_at)::int)
where scope is null or product_or_scope is null or year is null;

-- Remove duplicate rows before adding the new conflict keys.
delete from public.targets t
using (
  select ctid,
         row_number() over (
           partition by year, dept, scope, ref, metric
           order by created_at desc, ctid desc
         ) as rn
  from public.targets
) ranked
where t.ctid = ranked.ctid
  and ranked.rn > 1;

delete from public.benchmarks b
using (
  select ctid,
         row_number() over (
           partition by org, metric, scope
           order by coalesce(year, 0) desc, created_at desc, ctid desc
         ) as rn
  from public.benchmarks
) ranked
where b.ctid = ranked.ctid
  and ranked.rn > 1;

-- ------------------------------------------------------------
-- 4) Constraints, keys, and indexes
-- ------------------------------------------------------------
do $$
declare
  r record;
begin
  for r in
    select c.relname as table_name, p.polname
    from pg_policy p
    join pg_class c on c.oid = p.polrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname in (
        'lines',
        'furnaces',
        'products',
        'production_records',
        'gas_records',
        'gas_daily_readings',
        'gas_company_monthly',
        'targets',
        'benchmarks',
        'import_aliases',
        'import_templates',
        'import_uploads',
        'work_standards',
        'raw_material_specs',
        'app_settings'
      )
  loop
    execute format('drop policy if exists %I on public.%I', r.polname, r.table_name);
  end loop;
end $$;

do $$
declare
  r record;
begin
  for r in
    select c.conname, t.relname as table_name
    from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    join pg_namespace n on n.oid = t.relnamespace
    where n.nspname = 'public'
      and t.relname in ('gas_records', 'gas_daily_readings')
      and c.contype = 'f'
      and c.conname like '%furnace_id%'
  loop
    execute format('alter table public.%I drop constraint if exists %I', r.table_name, r.conname);
  end loop;
end $$;

alter table if exists public.targets
  drop constraint if exists targets_scope_check;

alter table if exists public.targets
  drop constraint if exists targets_metric_check;

alter table if exists public.targets
  add constraint targets_scope_check
    check (scope in ('line', 'furnace', 'dept', 'company'));

alter table if exists public.targets
  add constraint targets_metric_check
    check (metric in ('gas_unit', 'ton_per_hour', 'output'));

alter table if exists public.gas_records
  alter column furnace_code set not null;

alter table if exists public.gas_daily_readings
  alter column furnace_code set not null;

alter table if exists public.targets
  alter column year set not null,
  alter column dept set not null,
  alter column scope set not null,
  alter column ref set not null,
  alter column metric set not null,
  alter column target_value set not null;

alter table if exists public.benchmarks
  alter column scope set not null;

alter table if exists public.work_standards
  alter column dept set not null,
  alter column product set not null,
  alter column material set not null,
  alter column basis set not null,
  alter column std_work_count set not null;

alter table if exists public.raw_material_specs
  alter column product set not null,
  alter column material set not null,
  alter column raw_material set not null,
  alter column spec set not null;

alter table if exists public.app_settings
  alter column key set not null,
  alter column value set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    join pg_namespace n on n.oid = t.relnamespace
    where n.nspname = 'public'
      and t.relname = 'gas_records'
      and c.conname = 'gas_records_furnace_code_fkey'
  ) then
    alter table public.gas_records
      add constraint gas_records_furnace_code_fkey
      foreign key (furnace_code) references public.furnaces(code);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    join pg_namespace n on n.oid = t.relnamespace
    where n.nspname = 'public'
      and t.relname = 'gas_daily_readings'
      and c.conname = 'gas_daily_readings_furnace_code_fkey'
  ) then
    alter table public.gas_daily_readings
      add constraint gas_daily_readings_furnace_code_fkey
      foreign key (furnace_code) references public.furnaces(code);
  end if;
end $$;

create unique index if not exists idx_production_records_daily_unique
  on public.production_records (work_date, order_no, process);

create unique index if not exists idx_gas_records_unique
  on public.gas_records (ym, furnace_code);

create unique index if not exists idx_gas_daily_readings_unique
  on public.gas_daily_readings (date, furnace_code, shift) nulls not distinct;

create unique index if not exists idx_gas_company_monthly_ym
  on public.gas_company_monthly (ym);

create unique index if not exists idx_targets_unique
  on public.targets (year, dept, scope, ref, metric);

create unique index if not exists idx_benchmarks_unique
  on public.benchmarks (org, metric, scope);

create unique index if not exists idx_work_standards_unique
  on public.work_standards (dept, product, material, basis, min_ton, max_ton, order_size) nulls not distinct;

create unique index if not exists idx_raw_material_specs_unique
  on public.raw_material_specs (product, material, raw_material);

create unique index if not exists idx_app_settings_unique
  on public.app_settings (key);

create unique index if not exists idx_import_aliases_unique
  on public.import_aliases (dataset_key, canonical_field, alias_text);

create unique index if not exists idx_import_templates_unique
  on public.import_templates (dataset_key, name);

create unique index if not exists idx_import_uploads_unique
  on public.import_uploads (dataset_key, sheet_name, file_name);

create index if not exists idx_production_records_work_date
  on public.production_records (work_date);

create index if not exists idx_production_records_dept_line
  on public.production_records (dept_line);

create index if not exists idx_production_records_process
  on public.production_records (process);

create index if not exists idx_production_records_furnace_code
  on public.production_records (furnace_code);

create index if not exists idx_production_records_order_no
  on public.production_records (order_no);

create index if not exists idx_gas_records_ym
  on public.gas_records (ym);

create index if not exists idx_gas_records_furnace_code
  on public.gas_records (furnace_code);

create index if not exists idx_gas_records_order_no
  on public.gas_records (order_no);

create index if not exists idx_gas_daily_date
  on public.gas_daily_readings (date);

create index if not exists idx_gas_daily_readings_furnace_code
  on public.gas_daily_readings (furnace_code);

create index if not exists idx_gas_daily_readings_order_no
  on public.gas_daily_readings (order_no);

create index if not exists idx_furnaces_dept
  on public.furnaces (dept);

create index if not exists idx_benchmarks_year
  on public.benchmarks (year);

create index if not exists idx_import_aliases_dataset
  on public.import_aliases (dataset_key, active);

create index if not exists idx_import_aliases_field
  on public.import_aliases (canonical_field);

create index if not exists idx_import_templates_dataset
  on public.import_templates (dataset_key, active);

create index if not exists idx_import_templates_signature
  on public.import_templates using gin (signature_json);

create index if not exists idx_import_uploads_dataset
  on public.import_uploads (dataset_key, updated_at desc);

create index if not exists idx_import_uploads_sheet
  on public.import_uploads (sheet_name, updated_at desc);

-- ------------------------------------------------------------
-- 5) RLS policies
-- ------------------------------------------------------------
create or replace function public.get_my_role()
returns text language sql security definer stable
as $$
  select role from public.profiles where id = auth.uid()
$$;

alter table if exists public.lines enable row level security;
alter table if exists public.furnaces enable row level security;
alter table if exists public.products enable row level security;
alter table if exists public.production_records enable row level security;
alter table if exists public.gas_records enable row level security;
alter table if exists public.gas_daily_readings enable row level security;
alter table if exists public.gas_company_monthly enable row level security;
alter table if exists public.targets enable row level security;
alter table if exists public.benchmarks enable row level security;
alter table if exists public.import_aliases enable row level security;
alter table if exists public.import_templates enable row level security;
alter table if exists public.import_uploads enable row level security;
alter table if exists public.work_standards enable row level security;
alter table if exists public.raw_material_specs enable row level security;
alter table if exists public.app_settings enable row level security;

create policy "lines: public read" on public.lines
  for select using (true);
create policy "lines: admin manage" on public.lines
  for all using (public.get_my_role() = 'admin');

create policy "furnaces: public read" on public.furnaces
  for select using (true);
create policy "furnaces: admin manage" on public.furnaces
  for all using (public.get_my_role() = 'admin');

create policy "products: public read" on public.products
  for select using (true);
create policy "products: admin manage" on public.products
  for all using (public.get_my_role() = 'admin');

create policy "production_records: public read" on public.production_records
  for select using (true);
create policy "production_records: public insert" on public.production_records
  for insert with check (true);
create policy "production_records: public update" on public.production_records
  for update using (true);
create policy "production_records: admin delete" on public.production_records
  for delete using (public.get_my_role() = 'admin');

create policy "gas_records: public read" on public.gas_records
  for select using (true);
create policy "gas_records: public insert" on public.gas_records
  for insert with check (true);
create policy "gas_records: public update" on public.gas_records
  for update using (true);
create policy "gas_records: admin delete" on public.gas_records
  for delete using (public.get_my_role() = 'admin');

create policy "gas_daily_readings: public read" on public.gas_daily_readings
  for select using (true);
create policy "gas_daily_readings: public insert" on public.gas_daily_readings
  for insert with check (true);
create policy "gas_daily_readings: public update" on public.gas_daily_readings
  for update using (true);
create policy "gas_daily_readings: admin delete" on public.gas_daily_readings
  for delete using (public.get_my_role() = 'admin');

create policy "gas_company_monthly: public read" on public.gas_company_monthly
  for select using (true);
create policy "gas_company_monthly: public insert" on public.gas_company_monthly
  for insert with check (true);
create policy "gas_company_monthly: public update" on public.gas_company_monthly
  for update using (true);
create policy "gas_company_monthly: admin delete" on public.gas_company_monthly
  for delete using (public.get_my_role() = 'admin');

create policy "targets: public read" on public.targets
  for select using (true);
create policy "targets: admin manage" on public.targets
  for all using (public.get_my_role() = 'admin');

create policy "benchmarks: public read" on public.benchmarks
  for select using (true);
create policy "benchmarks: admin manage" on public.benchmarks
  for all using (public.get_my_role() = 'admin');

create policy "import_aliases: public read" on public.import_aliases
  for select using (true);
create policy "import_aliases: public insert" on public.import_aliases
  for insert with check (true);
create policy "import_aliases: public update" on public.import_aliases
  for update using (true);
create policy "import_aliases: admin delete" on public.import_aliases
  for delete using (public.get_my_role() = 'admin');

create policy "import_templates: public read" on public.import_templates
  for select using (true);
create policy "import_templates: public insert" on public.import_templates
  for insert with check (true);
create policy "import_templates: public update" on public.import_templates
  for update using (true);
create policy "import_templates: admin delete" on public.import_templates
  for delete using (public.get_my_role() = 'admin');

create policy "import_uploads: public read" on public.import_uploads
  for select using (true);
create policy "import_uploads: public insert" on public.import_uploads
  for insert with check (true);
create policy "import_uploads: public update" on public.import_uploads
  for update using (true);
create policy "import_uploads: admin delete" on public.import_uploads
  for delete using (public.get_my_role() = 'admin');

create policy "work_standards: public read" on public.work_standards
  for select using (true);
create policy "work_standards: admin manage" on public.work_standards
  for all using (public.get_my_role() = 'admin');

create policy "raw_material_specs: public read" on public.raw_material_specs
  for select using (true);
create policy "raw_material_specs: admin manage" on public.raw_material_specs
  for all using (public.get_my_role() = 'admin');

create policy "app_settings: public read" on public.app_settings
  for select using (true);
create policy "app_settings: admin manage" on public.app_settings
  for all using (public.get_my_role() = 'admin');

-- ------------------------------------------------------------
-- 6) Seed settings and storage
-- ------------------------------------------------------------
insert into public.app_settings (key, value, note)
values
  ('operating_hours_per_day', to_jsonb(24), 'Default operating hours per day'),
  ('shifts_per_day', to_jsonb(2), 'Default shifts per day')
on conflict (key) do nothing;

insert into storage.buckets (id, name, public)
values ('import-files', 'import-files', false)
on conflict (id) do update
set name = excluded.name,
    public = excluded.public;

