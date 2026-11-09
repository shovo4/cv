-- 1) Visitors can read the watched list (only the admin can change it)
drop policy if exists "public read watched" on public.watched;
create policy "public read watched" on public.watched for select to anon, authenticated using (true);
grant select on public.watched to anon, authenticated;

-- 2) Admin-only settings (keeps your OMDb key with your account, on every device)
create table if not exists public.admin_settings (
  key        text primary key,
  value      text,
  updated_at timestamptz not null default now()
);
alter table public.admin_settings enable row level security;
drop policy if exists "admin manages settings" on public.admin_settings;
create policy "admin manages settings" on public.admin_settings
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
revoke all on public.admin_settings from anon, authenticated;
grant select, insert, update, delete on public.admin_settings to authenticated;

select 'ok' as status;
