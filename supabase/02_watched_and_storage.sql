-- =====================================================================
-- Watched list (movies & series) + storage insight functions
-- Run once in Supabase > SQL Editor (after setup.sql)
-- =====================================================================

create table if not exists public.watched (
  id           uuid primary key default gen_random_uuid(),
  imdb_id      text not null unique,                  -- e.g. tt0111161 -> https://www.imdb.com/title/tt0111161/
  title        text not null,
  year         smallint,                              -- release year
  kind         text not null check (kind in ('movie','series')),
  genres       text[] not null default '{}',
  runtime_min  smallint,                              -- per movie / per episode
  imdb_rating  numeric(3,1),
  poster_url   text,                                  -- URL only, never the image (0 storage)
  my_rating    smallint check (my_rating between 1 and 10),
  comment      text check (char_length(comment) <= 600),
  watched_on   date not null default current_date,
  created_at   timestamptz not null default now()
);
create index if not exists watched_on_idx on public.watched (watched_on desc);

alter table public.watched enable row level security;
drop policy if exists "admin manages watched" on public.watched;
create policy "admin manages watched" on public.watched
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
revoke all on public.watched from anon, authenticated;
grant select, insert, update, delete on public.watched to authenticated;
-- public can read the list (see watched.html)
drop policy if exists "public read watched" on public.watched;
create policy "public read watched" on public.watched for select to anon, authenticated using (true);
grant select on public.watched to anon;

-- ---------- storage insight (admin only) ----------
create or replace function public.admin_storage_report()
returns json
language plpgsql security definer
set search_path = ''
as $$
declare r json;
begin
  if not public.is_admin() then raise exception 'not allowed'; end if;
  select json_build_object(
    'db_bytes',       pg_database_size(current_database()),
    'tables', (select json_agg(json_build_object(
                 'name', c.relname,
                 'rows', c.reltuples::bigint,
                 'bytes', pg_total_relation_size(c.oid)))
               from pg_class c join pg_namespace n on n.oid = c.relnamespace
               where n.nspname = 'public' and c.relkind = 'r'),
    'files', (select json_build_object(
                 'count', count(*),
                 'bytes', coalesce(sum((o.metadata->>'size')::bigint), 0),
                 'by_folder', (select json_agg(json_build_object('folder', f.folder, 'count', f.n, 'bytes', f.b))
                               from (select split_part(name, '/', 1) as folder, count(*) n, sum((metadata->>'size')::bigint) b
                                     from storage.objects where bucket_id = 'media' group by 1) f),
                 'largest', (select json_agg(json_build_object('name', l.name, 'bytes', l.b))
                             from (select name, (metadata->>'size')::bigint b from storage.objects
                                   where bucket_id = 'media' order by b desc nulls last limit 8) l))
              from storage.objects o where o.bucket_id = 'media'),
    'counts', json_build_object(
                 'posts',    (select count(*) from public.posts),
                 'memories', (select count(*) from public.memories),
                 'watched',  (select count(*) from public.watched),
                 'reactions',(select count(*) from public.reactions))
  ) into r;
  return r;
end;
$$;
revoke execute on function public.admin_storage_report() from public;
grant execute on function public.admin_storage_report() to authenticated;

select 'ok' as status, (select count(*) from public.watched) as watched_rows;
