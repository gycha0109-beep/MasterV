create policy "users can bootstrap own personal workspace"
on public.masterv_workspace_members
for insert
to authenticated
with check (
  user_id = (select auth.uid())
  and workspace_id = ('user:' || (select auth.uid())::text)
  and role = 'owner'
);

grant insert on table public.masterv_workspace_members to authenticated;
