-- Recorder Phase 1 migration
-- 2026-04-24
--
-- Context:
--   public.fb_scripts and public.fb_recordings already exist (pre-provisioned).
--   This migration fills the gaps required by record.digicollabo.com Phase 1:
--     1. fb_recordings: add status / error_message / updated_at columns
--     2. user_id NOT NULL on both tables (tables empty, safe to enforce)
--     3. RLS policies: owner-access (RLS already enabled but NO policies exist → currently non-service-role rows unreachable)
--     4. updated_at trigger on both tables
--     5. Composite index idx_fb_recordings_user_created for owner-listing queries

-- 1. Columns on fb_recordings -------------------------------------------------

alter table public.fb_recordings
  add column if not exists status text not null default 'uploading';

alter table public.fb_recordings
  drop constraint if exists fb_recordings_status_check;
alter table public.fb_recordings
  add constraint fb_recordings_status_check
    check (status in ('uploading', 'processing', 'ready', 'error'));

alter table public.fb_recordings
  add column if not exists error_message text;

alter table public.fb_recordings
  add column if not exists updated_at timestamptz not null default now();

-- 2. user_id NOT NULL ---------------------------------------------------------

alter table public.fb_scripts    alter column user_id set not null;
alter table public.fb_recordings alter column user_id set not null;

-- 3. RLS policies (owner access) ----------------------------------------------

drop policy if exists "users manage own scripts" on public.fb_scripts;
create policy "users manage own scripts" on public.fb_scripts
  for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "users manage own recordings" on public.fb_recordings;
create policy "users manage own recordings" on public.fb_recordings
  for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- 4. updated_at trigger -------------------------------------------------------

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists fb_scripts_set_updated_at on public.fb_scripts;
create trigger fb_scripts_set_updated_at
  before update on public.fb_scripts
  for each row execute function public.set_updated_at();

drop trigger if exists fb_recordings_set_updated_at on public.fb_recordings;
create trigger fb_recordings_set_updated_at
  before update on public.fb_recordings
  for each row execute function public.set_updated_at();

-- 5. Index --------------------------------------------------------------------

create index if not exists idx_fb_recordings_user_created
  on public.fb_recordings (user_id, created_at desc);
