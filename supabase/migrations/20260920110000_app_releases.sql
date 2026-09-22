-- Public release history: students can see every shipped app version, its
-- release notes, and which version is currently supported. Admins manage rows
-- from the admin panel; everyone (even logged-out visitors) can read them.

create table if not exists public.app_releases (
  id uuid primary key default gen_random_uuid(),
  version text not null unique,
  version_code integer,
  title text not null default '',
  notes text not null default '',
  status text not null default 'supported'
    check (status in ('supported', 'deprecated', 'forced_update')),
  is_current boolean not null default false,
  released_at date not null default current_date,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now()
);

comment on table public.app_releases is
  'Public app release history. status: supported = works, deprecated = old but usable, forced_update = blocked until update.';

-- Only one row may be the current release at a time.
create unique index if not exists app_releases_single_current
  on public.app_releases (is_current) where is_current;

grant select on public.app_releases to anon, authenticated;
grant insert, update, delete on public.app_releases to authenticated;
grant all on public.app_releases to service_role;

alter table public.app_releases enable row level security;

create policy "Anyone can read app releases"
  on public.app_releases for select
  to anon, authenticated
  using (true);

create policy "Admins can add releases"
  on public.app_releases for insert
  to authenticated
  with check (public.has_role(auth.uid(), 'admin'));

create policy "Admins can edit releases"
  on public.app_releases for update
  to authenticated
  using (public.has_role(auth.uid(), 'admin'))
  with check (public.has_role(auth.uid(), 'admin'));

create policy "Admins can delete releases"
  on public.app_releases for delete
  to authenticated
  using (public.has_role(auth.uid(), 'admin'));

drop trigger if exists update_app_releases_updated_at on public.app_releases;
create trigger update_app_releases_updated_at
  before update on public.app_releases
  for each row execute function public.update_updated_at_column();

-- Seed the first row from the version CI last published, so the page is never
-- empty right after this migration runs.
--
-- Audit 2026-09-22 (CI migration-drift check): `latest_android_version` and
-- `update_notes` were added to app_config directly on the live project and
-- never captured in a migration or in schema-package.sql, so this seed failed
-- with `column "latest_android_version" does not exist` on every CI replay
-- since 2026-09-20. Converge the CI schema on the live shape first; on the
-- live database these are no-ops.
alter table public.app_config add column if not exists latest_android_version text not null default '0.0.0';
alter table public.app_config add column if not exists latest_ios_version text not null default '0.0.0';
alter table public.app_config add column if not exists update_notes text;
alter table public.app_config add column if not exists force_update boolean not null default false;

insert into public.app_releases (version, title, notes, status, is_current)
select latest_android_version,
       'Current release',
       coalesce(nullif(update_notes, ''), 'Latest stable release.'),
       'supported',
       true
from public.app_config
where id = 1
  and latest_android_version ~ '^\d+(\.\d+){0,3}$'
on conflict (version) do nothing;
