-- Ensure targets upserts have a stable conflict key and refresh schema cache.

create unique index if not exists idx_targets_unique
  on public.targets (year, dept, scope, ref, metric);

notify pgrst, 'reload schema';
