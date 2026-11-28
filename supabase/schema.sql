-- Eclipse : profils, amis et messages.
-- À coller dans Supabase > SQL Editor > New query, puis « Run ». Ré-exécutable sans risque.
-- Prérequis : Authentication > Sign In / Providers > « Allow anonymous sign-ins » activé.
--
-- Sécurité (RLS) : chacun ne lit que son profil, ses liens d'amitié et ses messages.
-- Les profils des autres ne sont visibles qu'à travers les fonctions ci-dessous (nom, code,
-- et humeur / dernière séance seulement si l'ami a choisi de les partager).

-- --- Profils ------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  code text not null unique check (code ~ '^[0-9]{6}$'),
  name text not null default '' check (char_length(name) <= 40),
  share boolean not null default false,
  mood smallint check (mood between 1 and 5),
  mood_date date,
  last_workout_at timestamptz,
  perfect_date date,
  streak int,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
-- Colonnes ajoutées après la première version (installations existantes)
alter table public.profiles add column if not exists perfect_date date;
alter table public.profiles add column if not exists streak int;
alter table public.profiles enable row level security;
drop policy if exists "profil : lecture de soi" on public.profiles;
create policy "profil : lecture de soi" on public.profiles for select to authenticated using (id = auth.uid());
drop policy if exists "profil : modification de soi" on public.profiles;
create policy "profil : modification de soi" on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());
revoke all on public.profiles from anon, authenticated;
grant select on public.profiles to authenticated;
-- Le code ami n'est pas modifiable par l'app (créé par ensure_profile).
grant update (name, share, mood, mood_date, last_workout_at, perfect_date, streak, updated_at) on public.profiles to authenticated;

-- --- Amitiés ------------------------------------------------------------------
create table if not exists public.friendships (
  requester uuid not null references public.profiles (id) on delete cascade,
  addressee uuid not null references public.profiles (id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted')),
  created_at timestamptz not null default now(),
  accepted_at timestamptz,
  primary key (requester, addressee),
  check (requester <> addressee)
);
create unique index if not exists friendships_pair on public.friendships (least(requester, addressee), greatest(requester, addressee));
create index if not exists friendships_addressee on public.friendships (addressee);
alter table public.friendships enable row level security;
drop policy if exists "amitié : lecture des siennes" on public.friendships;
create policy "amitié : lecture des siennes" on public.friendships for select to authenticated
  using (auth.uid() in (requester, addressee));
revoke all on public.friendships from anon, authenticated;
grant select on public.friendships to authenticated;

create or replace function public.are_friends(a uuid, b uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from friendships
    where status = 'accepted' and ((requester = a and addressee = b) or (requester = b and addressee = a))
  );
$$;

-- --- Messages -----------------------------------------------------------------
create table if not exists public.messages (
  id bigint generated always as identity primary key,
  sender uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  recipient uuid not null references public.profiles (id) on delete cascade,
  body text not null check (char_length(btrim(body)) between 1 and 1000),
  created_at timestamptz not null default now(),
  read_at timestamptz
);
create index if not exists messages_pair on public.messages (sender, recipient, id);
create index if not exists messages_unread on public.messages (recipient) where read_at is null;
alter table public.messages enable row level security;
drop policy if exists "messages : lecture des siens" on public.messages;
create policy "messages : lecture des siens" on public.messages for select to authenticated
  using (auth.uid() in (sender, recipient));
drop policy if exists "messages : envoi entre amis" on public.messages;
create policy "messages : envoi entre amis" on public.messages for insert to authenticated
  with check (sender = auth.uid() and public.are_friends(sender, recipient));
revoke all on public.messages from anon, authenticated;
grant select on public.messages to authenticated;
grant insert (recipient, body) on public.messages to authenticated;

-- --- Fonctions appelées par l'app ---------------------------------------------

-- Crée le profil (avec un code ami unique à 6 chiffres) ou met à jour le prénom.
create or replace function public.ensure_profile(p_name text default null) returns json
language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  new_code text;
begin
  if me is null then raise exception 'Non connecté.'; end if;
  if not exists (select 1 from profiles where id = me) then
    loop
      new_code := lpad(floor(random() * 1000000)::int::text, 6, '0');
      begin
        insert into profiles (id, code, name) values (me, new_code, coalesce(left(btrim(p_name), 40), ''));
        exit;
      exception when unique_violation then
        exit when exists (select 1 from profiles where id = me); -- créé en parallèle
      end;
    end loop;
  elsif p_name is not null then
    update profiles set name = left(btrim(p_name), 40), updated_at = now() where id = me;
  end if;
  return (select json_build_object('id', p.id, 'code', p.code, 'name', p.name, 'share', p.share) from profiles p where p.id = me);
end $$;

-- Demande d'ami par code. Si l'autre m'avait déjà demandé : amitié acceptée directement.
create or replace function public.request_friend(p_code text) returns json
language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  other profiles%rowtype;
  f friendships%rowtype;
  n int;
begin
  if me is null or not exists (select 1 from profiles where id = me) then raise exception 'Profil introuvable, réessaie.'; end if;
  select * into other from profiles where code = regexp_replace(coalesce(p_code, ''), '\D', '', 'g');
  if not found then raise exception 'Aucun profil avec ce code.'; end if;
  if other.id = me then raise exception 'C’est ton propre code !'; end if;
  select * into f from friendships
    where (requester = me and addressee = other.id) or (requester = other.id and addressee = me);
  if found then
    if f.status = 'accepted' then return json_build_object('status', 'already', 'name', other.name, 'id', other.id); end if;
    if f.requester = other.id then
      update friendships set status = 'accepted', accepted_at = now() where requester = other.id and addressee = me;
      return json_build_object('status', 'accepted', 'name', other.name, 'id', other.id);
    end if;
    return json_build_object('status', 'pending', 'name', other.name, 'id', other.id);
  end if;
  select count(*) into n from friendships where requester = me and status = 'pending';
  if n >= 30 then raise exception 'Trop de demandes en attente.'; end if;
  insert into friendships (requester, addressee) values (me, other.id);
  return json_build_object('status', 'requested', 'name', other.name, 'id', other.id);
end $$;

-- Accepter ou refuser une demande reçue.
create or replace function public.respond_friend(p_other uuid, p_accept boolean) returns json
language plpgsql security definer set search_path = public as $$
begin
  if p_accept then
    update friendships set status = 'accepted', accepted_at = now()
      where requester = p_other and addressee = auth.uid() and status = 'pending';
  else
    delete from friendships where requester = p_other and addressee = auth.uid() and status = 'pending';
  end if;
  return json_build_object('ok', true);
end $$;

-- Retirer un ami (ou annuler une demande envoyée).
create or replace function public.remove_friend(p_other uuid) returns json
language sql security definer set search_path = public as $$
  delete from friendships
    where (requester = auth.uid() and addressee = p_other) or (requester = p_other and addressee = auth.uid());
  select json_build_object('ok', true);
$$;

-- Amis et demandes, avec dernier message, messages non lus et statut partagé.
create or replace function public.my_friends() returns json
language sql stable security definer set search_path = public as $$
  select coalesce(json_agg(x order by x.sort_at desc nulls last), '[]'::json) from (
    select
      p.id, p.name, p.code, f.status,
      case when f.requester = auth.uid() then 'out' else 'in' end as direction,
      case when f.status = 'accepted' and p.share then p.mood end as mood,
      case when f.status = 'accepted' and p.share then p.mood_date end as mood_date,
      case when f.status = 'accepted' and p.share then p.last_workout_at end as last_workout_at,
      case when f.status = 'accepted' and p.share then p.perfect_date end as perfect_date,
      case when f.status = 'accepted' and p.share then p.streak end as streak,
      (select count(*) from messages m where m.sender = p.id and m.recipient = auth.uid() and m.read_at is null)::int as unread,
      lm.body as last_body, lm.created_at as last_at, (lm.sender = auth.uid()) as last_mine,
      coalesce(lm.created_at, f.accepted_at, f.created_at) as sort_at
    from friendships f
    join profiles p on p.id = case when f.requester = auth.uid() then f.addressee else f.requester end
    left join lateral (
      select m.body, m.created_at, m.sender from messages m
      where (m.sender = auth.uid() and m.recipient = p.id) or (m.sender = p.id and m.recipient = auth.uid())
      order by m.id desc limit 1
    ) lm on true
    where auth.uid() in (f.requester, f.addressee)
  ) x;
$$;

-- Messages échangés avec un ami (les 200 derniers, ou ceux après p_after).
create or replace function public.conversation(p_other uuid, p_after bigint default 0) returns json
language sql stable security invoker set search_path = public as $$
  select coalesce(json_agg(m order by m.id), '[]'::json) from (
    select id, sender, recipient, body, created_at, read_at from messages
    where ((sender = auth.uid() and recipient = p_other) or (sender = p_other and recipient = auth.uid()))
      and id > coalesce(p_after, 0)
    order by id desc limit 200
  ) m;
$$;

-- Marquer comme lus les messages reçus d'un ami.
create or replace function public.mark_read(p_other uuid) returns json
language sql security definer set search_path = public as $$
  update messages set read_at = now() where recipient = auth.uid() and sender = p_other and read_at is null;
  select json_build_object('ok', true);
$$;

-- Droits d'exécution : uniquement les utilisateurs connectés (comptes anonymes compris).
revoke execute on function public.are_friends(uuid, uuid), public.ensure_profile(text), public.request_friend(text),
  public.respond_friend(uuid, boolean), public.remove_friend(uuid), public.my_friends(),
  public.conversation(uuid, bigint), public.mark_read(uuid) from public, anon;
grant execute on function public.are_friends(uuid, uuid), public.ensure_profile(text), public.request_friend(text),
  public.respond_friend(uuid, boolean), public.remove_friend(uuid), public.my_friends(),
  public.conversation(uuid, bigint), public.mark_read(uuid) to authenticated;

-- --- Notifications push ---------------------------------------------------------
-- Les envois passent par la fonction Edge « push » (supabase/functions/push), avec la clé service.

-- Appareils abonnés (un par téléphone / navigateur). Pas d'accès direct depuis l'app : fonctions ci-dessous.
create table if not exists public.push_subscriptions (
  endpoint text primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now()
);
create index if not exists push_subscriptions_user on public.push_subscriptions (user_id);
alter table public.push_subscriptions enable row level security;
revoke all on public.push_subscriptions from anon, authenticated;

-- Données internes (non exposées par l'API) : clés VAPID et journal anti-doublons.
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
create table if not exists private.push_config (
  id int primary key default 1 check (id = 1),
  public_key text not null,
  private_jwk jsonb not null
);
create table if not exists private.push_log (
  sender uuid not null,
  kind text not null,
  ref text not null,
  created_at timestamptz not null default now(),
  primary key (sender, kind, ref)
);
revoke all on all tables in schema private from public, anon, authenticated;

-- Abonner / désabonner cet appareil (app).
create or replace function public.save_push_subscription(p_endpoint text, p_p256dh text, p_auth text) returns json
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or not exists (select 1 from profiles where id = auth.uid()) then raise exception 'Profil introuvable.'; end if;
  if p_endpoint !~ '^https://' or char_length(p_endpoint) > 1000 then raise exception 'Abonnement invalide.'; end if;
  insert into push_subscriptions (endpoint, user_id, p256dh, auth) values (p_endpoint, auth.uid(), p_p256dh, p_auth)
  on conflict (endpoint) do update set user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth, created_at = now();
  return json_build_object('ok', true);
end $$;

create or replace function public.delete_push_subscription(p_endpoint text) returns json
language sql security definer set search_path = public as $$
  delete from push_subscriptions where endpoint = p_endpoint and user_id = auth.uid();
  select json_build_object('ok', true);
$$;

-- Clés VAPID (fonction Edge uniquement).
create or replace function public.push_config() returns json
language sql stable security definer set search_path = public, private as $$
  select json_build_object('public_key', public_key, 'private_jwk', private_jwk) from private.push_config where id = 1;
$$;
create or replace function public.push_set_config(p_public text, p_private jsonb) returns json
language plpgsql security definer set search_path = public, private as $$
begin
  insert into private.push_config (id, public_key, private_jwk) values (1, p_public, p_private) on conflict (id) do nothing;
  return (select json_build_object('public_key', public_key, 'private_jwk', private_jwk) from private.push_config where id = 1);
end $$;

create or replace function public.push_drop(p_endpoint text) returns json
language sql security definer set search_path = public as $$
  delete from push_subscriptions where endpoint = p_endpoint;
  select json_build_object('ok', true);
$$;

-- Destinataires et texte d'une notification (fonction Edge uniquement).
-- null = rien à envoyer (pas ami, pas partagé, déjà notifié…).
create or replace function public.push_targets(p_sender uuid, p_kind text, p_other uuid default null) returns json
language plpgsql security definer set search_path = public, private as $$
declare
  s profiles%rowtype;
  who text;
  recipients uuid[];
  v_title text;
  v_body text;
  v_url text := './#/friends';
  v_tag text;
  v_ref text;
  m messages%rowtype;
  n int;
begin
  select * into s from profiles where id = p_sender;
  if not found then return null; end if;
  who := coalesce(nullif(btrim(s.name), ''), 'Un ami');
  delete from private.push_log where created_at < now() - interval '60 days';

  if p_kind = 'message' then
    if p_other is null or not are_friends(p_sender, p_other) then return null; end if;
    select * into m from messages where sender = p_sender and recipient = p_other order by id desc limit 1;
    if not found or m.created_at < now() - interval '5 minutes' then return null; end if;
    recipients := array[p_other];
    v_title := who; v_body := left(m.body, 160); v_url := './#/friends/' || p_sender; v_tag := 'msg-' || p_sender; v_ref := m.id::text;
  elsif p_kind = 'friend_request' then
    if p_other is null or not exists (select 1 from friendships where requester = p_sender and addressee = p_other and status = 'pending') then return null; end if;
    recipients := array[p_other];
    v_title := 'Nouvelle demande d’ami'; v_body := who || ' veut t’ajouter en ami.'; v_tag := 'req-' || p_sender; v_ref := p_other::text;
  elsif p_kind = 'friend_accept' then
    if p_other is null or not are_friends(p_sender, p_other) then return null; end if;
    recipients := array[p_other];
    v_title := 'Demande acceptée 🎉'; v_body := who || ' a accepté ta demande. Dis-lui bonjour 👋';
    v_url := './#/friends/' || p_sender; v_tag := 'acc-' || p_sender; v_ref := p_other::text;
  elsif p_kind = 'mood' then
    -- Humeur partagée « pas bien » ou « bof » (1 ou 2 sur 5), du jour (date du téléphone, à un jour près).
    if not s.share or s.mood is null or s.mood > 2 or s.mood_date is null or s.mood_date < current_date - 1 then return null; end if;
    v_title := who || ' ne va pas très fort aujourd’hui'; v_body := 'Un petit message pourrait faire du bien 💬';
    v_url := './#/friends/' || p_sender; v_tag := 'mood-' || p_sender; v_ref := s.mood_date::text;
  elsif p_kind = 'perfect' then
    if not s.share or s.perfect_date is null or s.perfect_date < current_date - 1 then return null; end if;
    v_title := '🔥 ' || who || ' a fait une journée parfaite';
    v_body := case when coalesce(s.streak, 0) > 1 then s.streak || ' jours d’affilée ! Envoie-lui un bravo 👏' else 'Envoie-lui un bravo 👏' end;
    v_url := './#/friends/' || p_sender; v_tag := 'perfect-' || p_sender; v_ref := s.perfect_date::text;
  else
    return null;
  end if;

  if recipients is null then
    recipients := array(
      select case when requester = p_sender then addressee else requester end
      from friendships where status = 'accepted' and p_sender in (requester, addressee)
    );
  end if;
  -- Une seule notification par événement (message, demande, jour…)
  insert into private.push_log (sender, kind, ref) values (p_sender, p_kind, v_ref) on conflict do nothing;
  get diagnostics n = row_count;
  if n = 0 then return null; end if;
  return json_build_object(
    'title', v_title, 'body', v_body, 'url', v_url, 'tag', v_tag,
    'subs', coalesce((
      select json_agg(json_build_object('endpoint', endpoint, 'p256dh', p256dh, 'auth', auth))
      from push_subscriptions where user_id = any(recipients)
    ), '[]'::json)
  );
end $$;

revoke execute on function public.save_push_subscription(text, text, text), public.delete_push_subscription(text) from public, anon;
grant execute on function public.save_push_subscription(text, text, text), public.delete_push_subscription(text) to authenticated;
revoke execute on function public.push_config(), public.push_set_config(text, jsonb), public.push_drop(text),
  public.push_targets(uuid, text, uuid) from public, anon, authenticated;
grant execute on function public.push_config(), public.push_set_config(text, jsonb), public.push_drop(text),
  public.push_targets(uuid, text, uuid) to service_role;

-- --- Rappels du soir (« ta flamme va s'éteindre ») --------------------------------
-- L'app envoie son fuseau horaire, l'heure de rappel choisie, sa flamme et ce qu'il reste à faire.
-- Une tâche planifiée (pg_cron) appelle la fonction Edge « push » toutes les 15 minutes.
alter table public.profiles add column if not exists tz text;
alter table public.profiles add column if not exists remind_hour smallint check (remind_hour between 0 and 23);
alter table public.profiles add column if not exists remind_last date;
alter table public.profiles add column if not exists flame int;
alter table public.profiles add column if not exists flame_date date;
alter table public.profiles add column if not exists todo text check (char_length(todo) <= 200);
alter table public.profiles add column if not exists todo_date date;
grant update (name, share, mood, mood_date, last_workout_at, perfect_date, streak, tz, remind_hour, flame, flame_date, todo, todo_date, updated_at)
  on public.profiles to authenticated;

-- Secret partagé entre la tâche planifiée et la fonction Edge (créé une seule fois).
create table if not exists private.app_secrets (name text primary key, value text not null);
insert into private.app_secrets (name, value) values ('cron', replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''))
  on conflict (name) do nothing;
revoke all on all tables in schema private from public, anon, authenticated;

create or replace function public.cron_secret() returns text
language sql stable security definer set search_path = public, private as $$
  select value from private.app_secrets where name = 'cron';
$$;

-- Rappels à envoyer maintenant : heure locale atteinte, pas encore rappelé aujourd'hui, journée pas encore parfaite.
create or replace function public.push_reminders() returns json
language plpgsql security definer set search_path = public, private as $$
declare
  result json;
begin
  with due as (
    select p.id, p.flame, p.flame_date, p.todo, p.todo_date, (now() at time zone p.tz)::date as local_day
    from profiles p
    where p.remind_hour is not null
      and p.tz in (select name from pg_timezone_names)
      and extract(hour from now() at time zone p.tz) >= p.remind_hour
      and (p.remind_last is null or p.remind_last < (now() at time zone p.tz)::date)
      and (p.perfect_date is null or p.perfect_date < (now() at time zone p.tz)::date)
      and exists (select 1 from push_subscriptions s where s.user_id = p.id)
  ), marked as (
    update profiles p set remind_last = d.local_day from due d where p.id = d.id returning p.id
  )
  select coalesce(json_agg(json_build_object(
    'endpoint', s.endpoint, 'p256dh', s.p256dh, 'auth', s.auth, 'url', './', 'tag', 'rappel',
    'title', case
      when coalesce(d.flame, 0) > 0 and d.flame_date >= d.local_day - 1
        then '🔥 Ta flamme de ' || d.flame || ' jour' || case when d.flame > 1 then 's' else '' end || ' va s’éteindre'
      else 'Ta journée n’est pas encore complète'
    end,
    'body', case
      when d.todo_date = d.local_day and coalesce(d.todo, '') <> '' then 'Il te reste : ' || d.todo || '.'
      else 'Prends une minute pour remplir ta journée 🔥'
    end
  )), '[]'::json) into result
  from due d
  join marked m on m.id = d.id
  join push_subscriptions s on s.user_id = d.id;
  return result;
end $$;

revoke execute on function public.cron_secret(), public.push_reminders() from public, anon, authenticated;
grant execute on function public.cron_secret(), public.push_reminders() to service_role;

-- Tâche planifiée : toutes les 15 minutes (re-planifier avec le même nom met la tâche à jour).
create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;
select cron.schedule(
  'eclipse-rappels',
  '*/15 * * * *',
  $job$
    select net.http_post(
      url := 'https://yrifaarzepdrzympudfe.supabase.co/functions/v1/push',
      headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', (select value from private.app_secrets where name = 'cron')),
      body := '{"event":"reminders"}'::jsonb
    );
  $job$
);

-- --- Coach IA : limite de générations de programme par jour ------------------------
create table if not exists private.ai_usage (
  user_id uuid not null,
  day date not null,
  n int not null default 0,
  primary key (user_id, day)
);
revoke all on all tables in schema private from public, anon, authenticated;

create or replace function public.ai_take(p_user uuid, p_limit int) returns boolean
language plpgsql security definer set search_path = public, private as $$
declare
  used int;
begin
  insert into private.ai_usage (user_id, day, n) values (p_user, current_date, 1)
  on conflict (user_id, day) do update set n = private.ai_usage.n + 1
  returning n into used;
  return used <= p_limit;
end $$;
revoke execute on function public.ai_take(uuid, int) from public, anon, authenticated;
grant execute on function public.ai_take(uuid, int) to service_role;
