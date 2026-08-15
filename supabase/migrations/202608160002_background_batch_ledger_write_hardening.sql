drop policy if exists "workspace members can insert background batch jobs"
on public.background_batch_jobs;

drop policy if exists "workspace members can update background batch jobs"
on public.background_batch_jobs;

revoke insert, update on table public.background_batch_jobs from authenticated;
grant select on table public.background_batch_jobs to authenticated;
