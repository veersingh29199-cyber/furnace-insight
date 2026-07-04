-- Supplemental 3-year seed for Furnace Insight.
-- Run after the base schema/master seed. This file backfills:
-- - 40 months of gas records (2023-02 through 2026-05)
-- - company monthly gas summaries
-- - 2024-2026 target rows for company/line/furnace scopes

delete from public.gas_records
where ym < date '2023-02-01'
   or ym > date '2026-05-01';

with months as (
  select
    gs::date as ym,
    row_number() over (order by gs) - 1 as month_idx
  from generate_series(date '2023-02-01', date '2026-05-01', interval '1 month') as gs
),
furnaces as (
  select
    gs as furnace_idx,
    gs::text || '호기' as furnace_code
  from generate_series(1, 20) as gs
),
gas_seed as (
  select
    m.ym,
    f.furnace_code,
    (220000 + (m.month_idx * 6000) + (f.furnace_idx * 3000))::numeric as charge_weight_kg,
    round(
      (
        (220000 + (m.month_idx * 6000) + (f.furnace_idx * 3000)) / 1000.0
      ) * (140 + ((m.month_idx + f.furnace_idx) % 15)),
      0
    )::numeric as gas_usage,
    'meter'::text as source
  from months m
  cross join furnaces f
)
insert into public.gas_records (
  ym,
  furnace_code,
  charge_weight_kg,
  gas_usage,
  source
)
select
  ym,
  furnace_code,
  charge_weight_kg,
  gas_usage,
  source
from gas_seed
on conflict (ym, furnace_code) do update
set
  charge_weight_kg = excluded.charge_weight_kg,
  gas_usage = excluded.gas_usage,
  source = excluded.source;

insert into public.gas_company_monthly (
  ym,
  charge_weight_kg,
  gas_usage
)
select
  date_trunc('month', ym)::date as ym,
  sum(charge_weight_kg) as charge_weight_kg,
  sum(gas_usage) as gas_usage
from public.gas_records
where ym between date '2024-01-01' and date '2025-09-01'
group by 1
on conflict (ym) do update
set
  charge_weight_kg = excluded.charge_weight_kg,
  gas_usage = excluded.gas_usage;

delete from public.targets
where year is null;

insert into public.targets (
  year,
  dept,
  scope,
  ref,
  metric,
  target_value,
  note
)
values
  (2024, 'company', 'company', 'company', 'gas_unit', 150, '전사 가스원단위 목표'),
  (2024, 'company', 'company', 'company', 'ton_per_hour', 20, '전사 시간당 생산량 목표'),
  (2024, 'P5', 'line', 'P5', 'ton_per_hour', 22, 'P5 시간당 생산량 목표'),
  (2024, 'P8', 'line', 'P8', 'ton_per_hour', 22, 'P8 시간당 생산량 목표'),
  (2024, 'P15', 'line', 'P15', 'ton_per_hour', 24, 'P15 시간당 생산량 목표'),
  (2024, 'R/M', 'line', 'R/M', 'ton_per_hour', 18, 'R/M 시간당 생산량 목표'),
  (2024, '1호기', 'furnace', '1호기', 'gas_unit', 148, '1호기 원단위 목표'),
  (2024, '2호기', 'furnace', '2호기', 'gas_unit', 148, '2호기 원단위 목표'),
  (2024, '3호기', 'furnace', '3호기', 'gas_unit', 150, '3호기 원단위 목표'),

  (2025, 'company', 'company', 'company', 'gas_unit', 150, '전사 가스원단위 목표'),
  (2025, 'company', 'company', 'company', 'ton_per_hour', 20, '전사 시간당 생산량 목표'),
  (2025, 'P5', 'line', 'P5', 'ton_per_hour', 22, 'P5 시간당 생산량 목표'),
  (2025, 'P8', 'line', 'P8', 'ton_per_hour', 22, 'P8 시간당 생산량 목표'),
  (2025, 'P15', 'line', 'P15', 'ton_per_hour', 24, 'P15 시간당 생산량 목표'),
  (2025, 'R/M', 'line', 'R/M', 'ton_per_hour', 18, 'R/M 시간당 생산량 목표'),
  (2025, '1호기', 'furnace', '1호기', 'gas_unit', 148, '1호기 원단위 목표'),
  (2025, '2호기', 'furnace', '2호기', 'gas_unit', 148, '2호기 원단위 목표'),
  (2025, '3호기', 'furnace', '3호기', 'gas_unit', 150, '3호기 원단위 목표'),

  (2026, 'company', 'company', 'company', 'gas_unit', 150, '전사 가스원단위 목표'),
  (2026, 'company', 'company', 'company', 'ton_per_hour', 20, '전사 시간당 생산량 목표'),
  (2026, 'P5', 'line', 'P5', 'ton_per_hour', 22, 'P5 시간당 생산량 목표'),
  (2026, 'P8', 'line', 'P8', 'ton_per_hour', 22, 'P8 시간당 생산량 목표'),
  (2026, 'P15', 'line', 'P15', 'ton_per_hour', 24, 'P15 시간당 생산량 목표'),
  (2026, 'R/M', 'line', 'R/M', 'ton_per_hour', 18, 'R/M 시간당 생산량 목표'),
  (2026, '1호기', 'furnace', '1호기', 'gas_unit', 148, '1호기 원단위 목표'),
  (2026, '2호기', 'furnace', '2호기', 'gas_unit', 148, '2호기 원단위 목표'),
  (2026, '3호기', 'furnace', '3호기', 'gas_unit', 150, '3호기 원단위 목표')
on conflict (year, dept, scope, ref, metric) do update
set
  target_value = excluded.target_value,
  note = excluded.note;
