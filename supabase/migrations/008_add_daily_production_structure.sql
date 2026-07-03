-- Add daily production columns for the new input flow.
-- Existing monthly data is preserved as-is.

alter table public.production_records
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
  add column if not exists ton_per_hour numeric generated always as (case when coalesce(work_hours, 0) > 0 then order_weight / nullif(work_hours, 0) end) stored,
  add column if not exists ton_per_run numeric generated always as (case when coalesce(work_count, 0) > 0 then order_weight / nullif(work_count, 0) end) stored;

alter table public.production_records
  alter column order_weight set default 0,
  alter column charge_weight set default 0,
  alter column work_hours set default 0,
  alter column work_count set default 0;

create unique index if not exists idx_production_records_daily_unique
  on public.production_records (work_date, order_no, process);

create index if not exists idx_production_records_work_date on public.production_records (work_date);
create index if not exists idx_production_records_dept_line on public.production_records (dept_line);
create index if not exists idx_production_records_process on public.production_records (process);
create index if not exists idx_production_records_furnace_code on public.production_records (furnace_code);
