-- Reactions: switch to 3 types (fire, love, wow). Run once in Supabase > SQL Editor.
alter table public.reactions drop constraint if exists reactions_type_check;
update public.reactions set type = 'fire' where type = 'like';   -- old likes become fire
delete from public.reactions where type in ('haha','sad');       -- retired reactions
alter table public.reactions add constraint reactions_type_check check (type in ('fire','love','wow'));

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

  if p_reaction not in ('fire','love','wow') then raise exception 'bad reaction'; end if;

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

select type, count(*) from public.reactions group by type;
