-- Let visitors read the watched list (admin still the only one who can write)
drop policy if exists "public read watched" on public.watched;
create policy "public read watched" on public.watched for select to anon, authenticated using (true);
grant select on public.watched to anon;
select 'ok' as status;
