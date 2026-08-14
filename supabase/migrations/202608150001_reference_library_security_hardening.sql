alter function public.masterv_is_workspace_member(text) security invoker;

revoke all on function public.masterv_is_workspace_member(text) from public;
revoke execute on function public.masterv_is_workspace_member(text) from anon;
grant execute on function public.masterv_is_workspace_member(text) to authenticated;
