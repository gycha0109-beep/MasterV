create table if not exists public.masterv_desktop_update_releases (
  id uuid primary key default gen_random_uuid(),
  channel text not null default 'private-test',
  version text not null,
  target text not null,
  arch text not null,
  storage_bucket text not null default 'masterv-private-updates',
  storage_object_path text not null,
  signature text not null,
  artifact_sha256 text not null,
  source_sha text not null,
  notes text,
  published_at timestamptz,
  enabled boolean not null default false,
  created_at timestamptz not null default now(),
  constraint masterv_desktop_update_releases_channel_check check (channel in ('private-test')),
  constraint masterv_desktop_update_releases_version_check check (version ~ '^[0-9]+\.[0-9]+\.[0-9]+(?:[-+][0-9A-Za-z.-]+)?$'),
  constraint masterv_desktop_update_releases_target_check check (length(target) between 1 and 120),
  constraint masterv_desktop_update_releases_arch_check check (length(arch) between 1 and 80),
  constraint masterv_desktop_update_releases_signature_check check (length(signature) > 20),
  constraint masterv_desktop_update_releases_sha_check check (artifact_sha256 ~ '^[0-9a-f]{64}$' and source_sha ~ '^[0-9a-f]{40}$'),
  unique (channel, version, target, arch)
);

alter table public.masterv_desktop_update_releases enable row level security;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'masterv-private-updates',
  'masterv-private-updates',
  false,
  157286400,
  array['application/octet-stream','application/x-msdownload','application/vnd.microsoft.portable-executable']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

alter table storage.objects enable row level security;

-- Intentionally no authenticated-user policies on the release table or bucket.
-- Release metadata and artifacts are served only by the authenticated hosted update boundary.
