create index if not exists masterv_workspace_members_user_id_idx
  on public.masterv_workspace_members (user_id);

drop policy if exists "workspace members can read own membership"
  on public.masterv_workspace_members;

create policy "workspace members can read own membership"
on public.masterv_workspace_members
for select
to authenticated
using (user_id = (select auth.uid()));
