-- Let the admin list files in the media bucket (needed for Admin > Files). Visitors are unaffected.
drop policy if exists "admin lists media" on storage.objects;
create policy "admin lists media" on storage.objects
  for select to authenticated using (bucket_id = 'media' and public.is_admin());
select 'ok' as status;
