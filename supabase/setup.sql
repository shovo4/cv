-- =====================================================================
-- Portfolio blog + memories backend  (run once in Supabase > SQL Editor)
-- BEFORE running: create your admin login in
--   Authentication > Users > Add user (email + password, "Auto confirm").
-- This script registers the first user in the project as the admin.
-- =====================================================================

-- ---------- Tables ----------
create table if not exists public.admins (
  user_id uuid primary key references auth.users(id) on delete cascade
);

create table if not exists public.posts (
  id          uuid primary key default gen_random_uuid(),
  title       text not null,
  excerpt     text,
  body        text not null default '',
  cover_url   text,
  published   boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table if not exists public.memories (
  id          uuid primary key default gen_random_uuid(),
  caption     text,
  image_url   text not null,
  image_path  text not null,
  taken_on    date,
  created_at  timestamptz not null default now()
);

create table if not exists public.reactions (
  id          bigint generated always as identity primary key,
  target_type text not null check (target_type in ('post','memory')),
  target_id   uuid not null,
  device_id   text not null check (char_length(device_id) between 16 and 64),
  ip_hash     text,
  type        text not null check (type in ('like','love','haha','wow','sad')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (target_type, target_id, device_id)
);
create index if not exists reactions_target_idx on public.reactions (target_type, target_id);

-- ---------- Admin check ----------
create or replace function public.is_admin()
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (select 1 from public.admins where user_id = (select auth.uid()));
$$;

-- first user in the project becomes the admin
insert into public.admins (user_id)
select id from auth.users order by created_at limit 1
on conflict do nothing;

-- ---------- Row level security ----------
alter table public.admins    enable row level security;
alter table public.posts     enable row level security;
alter table public.memories  enable row level security;
alter table public.reactions enable row level security;

-- posts: public reads published; admin does everything
drop policy if exists "public read published posts" on public.posts;
create policy "public read published posts" on public.posts
  for select to anon, authenticated using (published = true);
drop policy if exists "admin manages posts" on public.posts;
create policy "admin manages posts" on public.posts
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- memories: public reads; admin does everything
drop policy if exists "public read memories" on public.memories;
create policy "public read memories" on public.memories
  for select to anon, authenticated using (true);
drop policy if exists "admin manages memories" on public.memories;
create policy "admin manages memories" on public.memories
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- admins + reactions: no direct API access at all (reactions go through functions below)

-- ---------- Table privileges (explicit) ----------
revoke all on public.admins, public.reactions from anon, authenticated;
revoke all on public.posts, public.memories from anon, authenticated;
grant select on public.posts, public.memories to anon, authenticated;
grant insert, update, delete on public.posts, public.memories to authenticated;

-- ---------- Reaction functions (the only way visitors touch reactions) ----------
create or replace function public.get_reaction_counts(p_type text, p_ids uuid[])
returns table (target_id uuid, reaction text, total bigint)
language sql stable security definer
set search_path = ''
as $$
  select r.target_id, r.type, count(*)
  from public.reactions r
  where r.target_type = p_type and r.target_id = any (p_ids)
  group by r.target_id, r.type;
$$;

create or replace function public.get_my_reactions(p_type text, p_ids uuid[], p_device text)
returns table (target_id uuid, reaction text)
language sql stable security definer
set search_path = ''
as $$
  select r.target_id, r.type
  from public.reactions r
  where r.target_type = p_type and r.target_id = any (p_ids) and r.device_id = p_device;
$$;

-- p_reaction = null or '' removes this device's reaction.
create or replace function public.set_reaction(p_type text, p_id uuid, p_device text, p_reaction text)
returns void
language plpgsql security definer
set search_path = ''
as $$
declare
  v_ip   text;
  v_hash text;
begin
  if p_type not in ('post','memory') then raise exception 'bad type'; end if;
  if p_device is null or char_length(p_device) < 16 or char_length(p_device) > 64 then
    raise exception 'bad device';
  end if;

  -- the target must exist (posts must be published)
  if p_type = 'post' then
    if not exists (select 1 from public.posts where id = p_id and published) then
      raise exception 'not found';
    end if;
  else
    if not exists (select 1 from public.memories where id = p_id) then
      raise exception 'not found';
    end if;
  end if;

  -- removing a reaction
  if p_reaction is null or p_reaction = '' then
    delete from public.reactions
    where target_type = p_type and target_id = p_id and device_id = p_device;
    return;
  end if;

  if p_reaction not in ('like','love','haha','wow','sad') then raise exception 'bad reaction'; end if;

  -- anonymised network fingerprint (hashed, never stored raw)
  begin
    v_ip := split_part(coalesce(
      current_setting('request.headers', true)::json ->> 'x-forwarded-for', ''), ',', 1);
  exception when others then
    v_ip := '';
  end;
  v_hash := case when v_ip = '' then null
            else encode(sha256(convert_to(trim(v_ip) || ':portfolio-salt-v1', 'utf8')), 'hex') end;

  -- soft anti-abuse limits
  -- 1) one device cannot change more than 40 reactions in 10 minutes
  if (select count(*) from public.reactions
      where device_id = p_device and updated_at > now() - interval '10 minutes') > 40 then
    raise exception 'slow down';
  end if;
  -- 2) one network cannot create more than 6 different "devices" on the same item
  if v_hash is not null
     and not exists (select 1 from public.reactions
                     where target_type = p_type and target_id = p_id and device_id = p_device)
     and (select count(distinct device_id) from public.reactions
          where target_type = p_type and target_id = p_id and ip_hash = v_hash) >= 6 then
    raise exception 'limit reached';
  end if;

  insert into public.reactions (target_type, target_id, device_id, ip_hash, type)
  values (p_type, p_id, p_device, v_hash, p_reaction)
  on conflict (target_type, target_id, device_id)
  do update set type = excluded.type, updated_at = now();
end;
$$;

revoke execute on function public.get_reaction_counts(text, uuid[])        from public;
revoke execute on function public.get_my_reactions(text, uuid[], text)     from public;
revoke execute on function public.set_reaction(text, uuid, text, text)     from public;
grant  execute on function public.get_reaction_counts(text, uuid[])        to anon, authenticated;
grant  execute on function public.get_my_reactions(text, uuid[], text)     to anon, authenticated;
grant  execute on function public.set_reaction(text, uuid, text, text)     to anon, authenticated;

-- ---------- Image storage (compressed images, 1 MB cap each) ----------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('media', 'media', true, 1048576, array['image/webp','image/jpeg','image/png'])
on conflict (id) do update
  set public = true, file_size_limit = 1048576,
      allowed_mime_types = array['image/webp','image/jpeg','image/png'];

drop policy if exists "admin uploads media" on storage.objects;
create policy "admin uploads media" on storage.objects
  for insert to authenticated with check (bucket_id = 'media' and public.is_admin());
drop policy if exists "admin updates media" on storage.objects;
create policy "admin updates media" on storage.objects
  for update to authenticated using (bucket_id = 'media' and public.is_admin());
drop policy if exists "admin deletes media" on storage.objects;
create policy "admin deletes media" on storage.objects
  for delete to authenticated using (bucket_id = 'media' and public.is_admin());
-- (public bucket: image URLs are readable by everyone without a select policy)

-- Sanity check: should return exactly 1 row (you).
select u.email as admin_email from public.admins a join auth.users u on u.id = a.user_id;
