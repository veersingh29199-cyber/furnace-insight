-- Ensure line output uniqueness is present and refresh PostgREST schema cache.

do $$
begin
  if not exists (
    select 1
    from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    join pg_namespace n on n.oid = t.relnamespace
    where n.nspname = 'public'
      and t.relname = 'line_output_daily'
      and c.conname = 'line_output_daily_work_date_line_code_key'
  ) then
    alter table if exists public.line_output_daily
      add constraint line_output_daily_work_date_line_code_key unique (work_date, line_code);
  end if;

  if not exists (
    select 1
    from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    join pg_namespace n on n.oid = t.relnamespace
    where n.nspname = 'public'
      and t.relname = 'line_output_monthly'
      and c.conname = 'line_output_monthly_ym_line_code_key'
  ) then
    alter table if exists public.line_output_monthly
      add constraint line_output_monthly_ym_line_code_key unique (ym, line_code);
  end if;
end $$;

notify pgrst, 'reload schema';
