-- ================================================================
-- 샘플 씨드 데이터 — 최근 3개월 (2025-01 ~ 2025-03)
-- 실행 전: profiles에 사용자가 최소 1명 있어야 합니다.
-- ================================================================

-- 임시 변수: 첫 번째 사용자 ID를 사용 (실제 배포 시 본인 UUID로 변경)
do $$
declare
  v_user_id   uuid;
  v_p5_id     uuid;
  v_p8_id     uuid;
  v_p15_id    uuid;
  v_rm_id     uuid;
  v_prod1_id  uuid;
  v_prod2_id  uuid;
  v_furn1_id  uuid;
  v_furn2_id  uuid;
  v_furn3_id  uuid;
begin
  -- 첫 번째 admin 사용자 가져오기
  select id into v_user_id from auth.users limit 1;
  if v_user_id is null then
    raise notice '사용자가 없습니다. 먼저 회원가입 후 이 스크립트를 실행하세요.';
    return;
  end if;

  -- 라인 ID 조회
  select id into v_p5_id  from public.lines where code = 'P5';
  select id into v_p8_id  from public.lines where code = 'P8';
  select id into v_p15_id from public.lines where code = 'P15';
  select id into v_rm_id  from public.lines where code = 'R/M';

  -- 제품 ID 조회
  select id into v_prod1_id from public.products where name = '금형강';
  select id into v_prod2_id from public.products where name = '크랭크축';

  -- 가열로 ID 조회
  select id into v_furn1_id from public.furnaces where code = '1호기';
  select id into v_furn2_id from public.furnaces where code = '2호기';
  select id into v_furn3_id from public.furnaces where code = '3호기';

  -- ────── 생산 실적 씨드 (2025-01 ~ 2025-03) ──────
  -- 2025년 1월
  insert into public.production_records
    (work_month, line_id, product_id, shift, plan_ton, actual_ton, hwangji_ton,
     cogging_ton, rework_self_ton, rework_quality_ton, work_hours, work_count, created_by)
  values
    ('2025-01-01', v_p5_id,  v_prod1_id, 'both', 800, 780,  12, 35, 5, 8,  35.5, 42, v_user_id),
    ('2025-01-01', v_p8_id,  v_prod2_id, 'both', 700, 720,  10, 28, 4, 6,  32.0, 38, v_user_id),
    ('2025-01-01', v_p15_id, null,        'both', 1200, 1150, 18, 60, 8, 12, 48.0, 55, v_user_id),
    ('2025-01-01', v_rm_id,  null,        'both', 500,  490,  8, 20, 3, 5,  28.0, 30, v_user_id)
  on conflict do nothing;

  -- 2025년 2월
  insert into public.production_records
    (work_month, line_id, product_id, shift, plan_ton, actual_ton, hwangji_ton,
     cogging_ton, rework_self_ton, rework_quality_ton, work_hours, work_count, created_by)
  values
    ('2025-02-01', v_p5_id,  v_prod1_id, 'both', 750, 760,  11, 33, 5, 7,  34.0, 40, v_user_id),
    ('2025-02-01', v_p8_id,  v_prod2_id, 'both', 680, 695,  9,  27, 4, 5,  31.0, 36, v_user_id),
    ('2025-02-01', v_p15_id, null,        'both', 1100, 1080, 16, 55, 7, 10, 45.0, 52, v_user_id),
    ('2025-02-01', v_rm_id,  null,        'both', 480,  495,  7, 19, 3, 4,  27.0, 28, v_user_id)
  on conflict do nothing;

  -- 2025년 3월
  insert into public.production_records
    (work_month, line_id, product_id, shift, plan_ton, actual_ton, hwangji_ton,
     cogging_ton, rework_self_ton, rework_quality_ton, work_hours, work_count, created_by)
  values
    ('2025-03-01', v_p5_id,  v_prod1_id, 'both', 820, 830,  13, 36, 6, 9,  36.5, 44, v_user_id),
    ('2025-03-01', v_p8_id,  v_prod2_id, 'both', 720, 710,  10, 29, 5, 7,  33.0, 39, v_user_id),
    ('2025-03-01', v_p15_id, null,        'both', 1250, 1270, 19, 65, 9, 13, 50.0, 58, v_user_id),
    ('2025-03-01', v_rm_id,  null,        'both', 520,  510,  8, 21, 3, 5,  29.0, 32, v_user_id)
  on conflict do nothing;

  -- ────── 가스 검침 씨드 (2025-01 ~ 2025-03) ──────
  -- 1호기
  insert into public.gas_records
    (ym, furnace_id, charge_weight_kg, gas_usage, source, created_by)
  values
    ('2025-01-01', v_furn1_id, 4200000, 595000, 'meter', v_user_id),
    ('2025-02-01', v_furn1_id, 3900000, 558000, 'meter', v_user_id),
    ('2025-03-01', v_furn1_id, 4400000, 630000, 'meter', v_user_id)
  on conflict do nothing;

  -- 2호기
  insert into public.gas_records
    (ym, furnace_id, charge_weight_kg, gas_usage, source, created_by)
  values
    ('2025-01-01', v_furn2_id, 3800000, 546000, 'meter', v_user_id),
    ('2025-02-01', v_furn2_id, 3600000, 522000, 'meter', v_user_id),
    ('2025-03-01', v_furn2_id, 4000000, 588000, 'meter', v_user_id)
  on conflict do nothing;

  -- 3호기
  insert into public.gas_records
    (ym, furnace_id, charge_weight_kg, gas_usage, source, created_by)
  values
    ('2025-01-01', v_furn3_id, 5000000, 740000, 'meter', v_user_id),
    ('2025-02-01', v_furn3_id, 4700000, 705000, 'meter', v_user_id),
    ('2025-03-01', v_furn3_id, 5200000, 780000, 'meter', v_user_id)
  on conflict do nothing;

  -- ────── 목표 씨드 (2025년) ──────
  insert into public.targets (year, scope, ref_id, metric, target_value, note)
  values
    (2025, 'company', null, 'gas_unit',      150, '전사 가스원단위 목표'),
    (2025, 'company', null, 'ton_per_hour',   20, '전사 시간당 생산량 목표'),
    (2025, 'line',    v_p5_id,  'ton_per_hour', 22, 'P5 시간당 생산량 목표'),
    (2025, 'line',    v_p8_id,  'ton_per_hour', 22, 'P8 시간당 생산량 목표'),
    (2025, 'line',    v_p15_id, 'ton_per_hour', 24, 'P15 시간당 생산량 목표'),
    (2025, 'line',    v_rm_id,  'ton_per_hour', 18, 'R/M 시간당 생산량 목표'),
    (2025, 'furnace', v_furn1_id, 'gas_unit',   148, '1호기 원단위 목표'),
    (2025, 'furnace', v_furn2_id, 'gas_unit',   148, '2호기 원단위 목표'),
    (2025, 'furnace', v_furn3_id, 'gas_unit',   150, '3호기 원단위 목표')
  on conflict do nothing;

  raise notice '씨드 데이터 적재 완료!';
end;
$$;
