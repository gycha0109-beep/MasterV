create table if not exists public.masterv_background_batch_config (
  id text primary key default 'global' check (id = 'global'),
  provider_precondition_confirmed boolean not null default false,
  live_batch_verified_at timestamptz,
  desktop_submit_enabled boolean not null default false,
  updated_at timestamptz not null default now(),
  check (
    not desktop_submit_enabled
    or (provider_precondition_confirmed and live_batch_verified_at is not null)
  )
);

insert into public.masterv_background_batch_config (id)
values ('global')
on conflict (id) do nothing;

create table if not exists public.background_batch_jobs (
  workspace_id text not null,
  request_id uuid not null,
  source_platform text not null default 'youtube' check (source_platform = 'youtube'),
  source_id text not null check (source_id ~ '^yt:[A-Za-z0-9_-]{11}$'),
  canonical_url text not null check (canonical_url like 'https://www.youtube.com/watch?v=%'),
  model text not null check (char_length(model) between 1 and 120),
  status text not null check (
    status in (
      'RESERVED',
      'SUBMITTING',
      'PENDING',
      'SUCCEEDED',
      'FAILED',
      'CANCELLED',
      'EXPIRED',
      'SUBMISSION_UNCERTAIN'
    )
  ),
  provider_job_name text,
  provider_state text,
  result_text text,
  error jsonb,
  create_attempted_at timestamptz,
  last_checked_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (workspace_id, request_id)
);

create unique index if not exists background_batch_jobs_provider_name_uidx
  on public.background_batch_jobs (provider_job_name)
  where provider_job_name is not null;

create unique index if not exists background_batch_jobs_active_source_uidx
  on public.background_batch_jobs (workspace_id, source_id)
  where status in ('RESERVED', 'SUBMITTING', 'PENDING');

create index if not exists background_batch_jobs_workspace_created_idx
  on public.background_batch_jobs (workspace_id, created_at desc, request_id);

create or replace function public.masterv_background_batch_touch_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists background_batch_jobs_touch_updated_at on public.background_batch_jobs;
create trigger background_batch_jobs_touch_updated_at
before update on public.background_batch_jobs
for each row execute function public.masterv_background_batch_touch_updated_at();

alter table public.masterv_background_batch_config enable row level security;
alter table public.background_batch_jobs enable row level security;

create policy "authenticated users can read background batch config"
on public.masterv_background_batch_config
for select
to authenticated
using (true);

create policy "workspace members can read background batch jobs"
on public.background_batch_jobs
for select
to authenticated
using (public.masterv_is_workspace_member(workspace_id));

create policy "workspace members can insert background batch jobs"
on public.background_batch_jobs
for insert
to authenticated
with check (public.masterv_is_workspace_member(workspace_id));

create policy "workspace members can update background batch jobs"
on public.background_batch_jobs
for update
to authenticated
using (public.masterv_is_workspace_member(workspace_id))
with check (public.masterv_is_workspace_member(workspace_id));

revoke all on table public.masterv_background_batch_config from anon;
revoke all on table public.background_batch_jobs from anon;
grant select on table public.masterv_background_batch_config to authenticated;
grant select, insert, update on table public.background_batch_jobs to authenticated;
