-- ================================================================
-- 007_import_uploads.sql - 업로드 원본 파일 저장 및 이력 테이블
-- ================================================================

create table if not exists public.import_uploads (
  id              uuid primary key default uuid_generate_v4(),
  dataset_key     text not null,
  sheet_name      text not null,
  file_name       text not null,
  storage_bucket  text not null default 'import-files',
  storage_path    text not null,
  file_hash       text not null,
  file_size       bigint not null default 0,
  layout          text not null default 'auto',
  row_count       integer not null default 0,
  saved_count     integer not null default 0,
  failed_count    integer not null default 0,
  warning_count   integer not null default 0,
  template_name   text,
  mapping_json    jsonb not null default '{}'::jsonb,
  summary_json    jsonb not null default '{}'::jsonb,
  created_by      uuid references auth.users(id),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (dataset_key, sheet_name, file_name)
);

comment on table public.import_uploads is '스마트 파일 임포트 원본 파일 및 분석 이력';
create index if not exists idx_import_uploads_dataset on public.import_uploads(dataset_key, updated_at desc);
create index if not exists idx_import_uploads_sheet on public.import_uploads(sheet_name, updated_at desc);

insert into storage.buckets (id, name, public)
values ('import-files', 'import-files', false)
on conflict (id) do update
set name = excluded.name,
    public = excluded.public;

alter table public.import_uploads enable row level security;

drop policy if exists "import_uploads: 열람 개방" on public.import_uploads;
drop policy if exists "import_uploads: 누구나 입력 허용" on public.import_uploads;
drop policy if exists "import_uploads: 누구나 수정 허용" on public.import_uploads;
drop policy if exists "import_uploads: admin 삭제" on public.import_uploads;

create policy "import_uploads: 열람 개방"
  on public.import_uploads for select
  using (true);

create policy "import_uploads: 누구나 입력 허용"
  on public.import_uploads for insert
  with check (true);

create policy "import_uploads: 누구나 수정 허용"
  on public.import_uploads for update
  using (true);

create policy "import_uploads: admin 삭제"
  on public.import_uploads for delete
  using (public.get_my_role() = 'admin');
