create table if not exists public.masterv_workspace_members (
  workspace_id text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'member')),
  created_at timestamptz not null default now(),
  primary key (workspace_id, user_id)
);

create table if not exists public.reference_library_entries (
  workspace_id text not null,
  source_platform text not null check (source_platform = 'youtube'),
  source_id text not null,
  native_id text not null,
  canonical_url text not null,
  label text not null check (char_length(label) between 1 and 120),
  analysis jsonb not null,
  analysis_cache_key text not null,
  analysis_provenance text not null check (analysis_provenance in ('cache', 'replay', 'live')),
  schema_version text not null check (schema_version = 'reference-library-v1'),
  revision integer not null default 1 check (revision >= 1),
  first_saved_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (workspace_id, source_id)
);

create index if not exists reference_library_entries_workspace_updated_idx
  on public.reference_library_entries (workspace_id, updated_at desc, source_id asc);

create or replace function public.masterv_is_workspace_member(target_workspace_id text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.masterv_workspace_members member
    where member.workspace_id = target_workspace_id
      and member.user_id = auth.uid()
  );
$$;

revoke all on function public.masterv_is_workspace_member(text) from public;
grant execute on function public.masterv_is_workspace_member(text) to authenticated;

create or replace function public.masterv_reference_library_revision()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    new.revision := 1;
    new.first_saved_at := coalesce(new.first_saved_at, now());
    new.updated_at := coalesce(new.updated_at, new.first_saved_at, now());
  else
    new.revision := old.revision + 1;
    new.first_saved_at := old.first_saved_at;
    new.updated_at := now();
  end if;
  return new;
end;
$$;

drop trigger if exists reference_library_revision_trigger on public.reference_library_entries;
create trigger reference_library_revision_trigger
before insert or update on public.reference_library_entries
for each row execute function public.masterv_reference_library_revision();

alter table public.masterv_workspace_members enable row level security;
alter table public.reference_library_entries enable row level security;

create policy "workspace members can read own membership"
on public.masterv_workspace_members
for select
to authenticated
using (user_id = auth.uid());

create policy "workspace members can read references"
on public.reference_library_entries
for select
to authenticated
using (public.masterv_is_workspace_member(workspace_id));

create policy "workspace members can insert references"
on public.reference_library_entries
for insert
to authenticated
with check (public.masterv_is_workspace_member(workspace_id));

create policy "workspace members can update references"
on public.reference_library_entries
for update
to authenticated
using (public.masterv_is_workspace_member(workspace_id))
with check (public.masterv_is_workspace_member(workspace_id));

create policy "workspace members can delete references"
on public.reference_library_entries
for delete
to authenticated
using (public.masterv_is_workspace_member(workspace_id));

revoke all on table public.masterv_workspace_members from anon;
revoke all on table public.reference_library_entries from anon;
grant select on table public.masterv_workspace_members to authenticated;
grant select, insert, update, delete on table public.reference_library_entries to authenticated;
