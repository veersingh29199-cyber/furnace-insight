-- ================================================================
-- 004_reports_views.sql
-- 보고서(PDF/PPT) 자동 출력을 위한 집계 뷰 (Read-Only)
-- ================================================================

-- 1. 생산성 연간/라인별 집계 뷰 (report_productivity_yearly)
create or replace view public.report_productivity_yearly as
select
  substring(pr.work_month from 1 for 4)::integer as year,
  l.code as line_code,
  l.name as line_name,
  sum(pr.plan_ton) as total_plan_ton,
  sum(pr.actual_ton) as total_actual_ton,
  sum(pr.work_hours) as total_work_hours,
  case
    when sum(pr.plan_ton) > 0 then round((sum(pr.actual_ton) / sum(pr.plan_ton)) * 100, 1)
    else 0
  end as achieve_pct,
  case
    when sum(pr.work_hours) > 0 then round(sum(pr.actual_ton) / sum(pr.work_hours), 2)
    else 0
  end as ton_per_hour
from public.production_records pr
left join public.lines l on l.id = pr.line_id
group by substring(pr.work_month from 1 for 4), l.code, l.name
order by year desc, l.code;

comment on view public.report_productivity_yearly is '보고서용 연도·라인별 생산 실적 및 KPI 집계 뷰';

-- 2. 가스원단위 월별 전사 집계 뷰 (report_gas_unit_monthly)
create or replace view public.report_gas_unit_monthly as
select
  gr.ym as work_month,
  sum(gr.gas_usage) as total_gas_usage,
  sum(gr.charge_weight_kg) as total_charge_weight_kg,
  case
    when sum(gr.charge_weight_kg) > 0 then round(sum(gr.gas_usage) / (sum(gr.charge_weight_kg) / 1000.0), 1)
    else 0
  end as actual_gas_unit,
  150.0 as target_gas_unit
from public.gas_records gr
group by gr.ym
order by gr.ym;

comment on view public.report_gas_unit_monthly is '보고서용 월별 전사 가스 소비량 및 원단위 집계 뷰';

-- 3. 비로그인(anon) 및 로그인 사용자 개방 조회 권한 부여
grant select on public.report_productivity_yearly to anon, authenticated, service_role;
grant select on public.report_gas_unit_monthly to anon, authenticated, service_role;
