-- Phases 6 and 7 (database part): daily/weekly quests, 28-day login calendar, streak freeze, news feed + follows,
-- achievements, co-op projects, reports + bans, invite-only beta, admin stats.
-- Run once in the Supabase SQL Editor AFTER schema.sql, seed.sql, payments.sql and tycoon.sql (safe to run again).
-- Same rules as before: the browser only sends actions; every reward is decided in here.

alter table public.profiles add column if not exists banned boolean not null default false;
alter table public.profiles add column if not exists beta boolean not null default false;

create table if not exists public.app_settings (key text primary key, value text not null);
insert into public.app_settings (key, value) values ('beta_mode', 'off') on conflict (key) do nothing;
alter table public.app_settings enable row level security;          -- no policies: only functions read it

/* ---------- ban + invite-only beta gate (every player action already calls check_rate) ---------- */
create or replace function public.check_rate(p_action text, p_max int, p_window interval) returns void language plpgsql security definer set search_path = public as $$
declare r public.rate_limits; prof record; mode text;
begin
  if auth.uid() is null then raise exception 'Sign in first'; end if;
  select banned, beta, is_admin into prof from public.profiles where id = auth.uid();
  if coalesce(prof.banned, false) then raise exception 'This account is suspended.'; end if;
  select value into mode from public.app_settings where key = 'beta_mode';
  if mode = 'on' and not coalesce(prof.beta, false) and not coalesce(prof.is_admin, false) and p_action <> 'redeem' then raise exception 'Invite-only beta: enter your invite code under More.'; end if;
  insert into public.rate_limits as rl (user_id, action, window_start, n) values (auth.uid(), p_action, now(), 1)
  on conflict (user_id, action) do update set
    window_start = case when rl.window_start < now() - p_window then now() else rl.window_start end,
    n = case when rl.window_start < now() - p_window then 1 else rl.n + 1 end
  returning * into r;
  if r.n > p_max then raise exception 'Too many requests, please slow down'; end if;
end $$;

create table if not exists public.invite_codes (code text primary key, max_uses int not null default 1, uses int not null default 0, note text, created_at timestamptz not null default now());
alter table public.invite_codes enable row level security;
create or replace function public.rpc_redeem_invite(p_code text) returns jsonb language plpgsql security definer set search_path = public as $$
declare u uuid := auth.uid(); c public.invite_codes;
begin
  perform public.check_rate('redeem', 10, interval '1 hour');
  if (select beta from public.profiles where id = u) then return jsonb_build_object('ok', true); end if;
  select * into c from public.invite_codes where code = upper(trim(p_code)) for update;
  if c.code is null or c.uses >= c.max_uses then raise exception 'That invite code is not valid.'; end if;
  update public.invite_codes set uses = uses + 1 where code = c.code; update public.profiles set beta = true where id = u;
  return jsonb_build_object('ok', true);
end $$;

/* ---------- quests (3 daily, 5 weekly) ---------- */
create table if not exists public.quest_defs (id text primary key, period text not null check (period in ('daily', 'weekly')), kind text not null, target int not null, coins int not null, points int not null, title text not null);
insert into public.quest_defs (id, period, kind, target, coins, points, title) values
  ('d_upgrade', 'daily', 'upgrade', 1, 60, 20, 'Upgrade your business once'),
  ('d_place', 'daily', 'place', 2, 50, 15, 'Place 2 pieces of furniture'),
  ('d_golden', 'daily', 'golden', 1, 40, 25, 'Find a golden star'),
  ('d_checkin', 'daily', 'checkin', 1, 25, 10, 'Check in today'),
  ('d_collect', 'daily', 'collect', 1, 40, 10, 'Collect your business income'),
  ('d_worker', 'daily', 'worker', 1, 60, 15, 'Hire a worker'),
  ('w_upgrade5', 'weekly', 'upgrade', 5, 300, 100, 'Upgrade your business 5 times'),
  ('w_upgrade10', 'weekly', 'upgrade', 10, 600, 160, 'Upgrade your business 10 times'),
  ('w_place10', 'weekly', 'place', 10, 250, 80, 'Place 10 pieces of furniture'),
  ('w_place20', 'weekly', 'place', 20, 450, 120, 'Place 20 pieces of furniture'),
  ('w_golden5', 'weekly', 'golden', 5, 300, 120, 'Find 5 golden stars'),
  ('w_golden10', 'weekly', 'golden', 10, 500, 200, 'Find 10 golden stars'),
  ('w_checkin5', 'weekly', 'checkin', 5, 200, 100, 'Check in on 5 days'),
  ('w_open', 'weekly', 'open', 1, 150, 60, 'Open a business')
  on conflict (id) do update set period = excluded.period, kind = excluded.kind, target = excluded.target, coins = excluded.coins, points = excluded.points, title = excluded.title;
alter table public.quest_defs enable row level security;
drop policy if exists quest_defs_read on public.quest_defs; create policy quest_defs_read on public.quest_defs for select using (true);
create table if not exists public.quest_progress (user_id uuid not null references public.profiles(id) on delete cascade, quest_id text not null references public.quest_defs(id), period_key int not null, progress int not null default 0, claimed boolean not null default false, primary key (user_id, quest_id, period_key));
alter table public.quest_progress enable row level security;
drop policy if exists quest_own on public.quest_progress; create policy quest_own on public.quest_progress for select to authenticated using (user_id = auth.uid());

create or replace function public.quest_key(p_period text) returns int language sql stable as
$$ select case when p_period = 'daily' then floor(extract(epoch from now()) / 86400)::int else floor((floor(extract(epoch from now()) / 86400) + 3) / 7)::int end $$;
create or replace function public.quest_ids(p_period text, p_key int) returns setof text language sql stable set search_path = public as
$$ select id from public.quest_defs where period = p_period order by md5(id || p_key::text) limit (case when p_period = 'daily' then 3 else 5 end) $$;

create or replace function public.quest_bump(u uuid, k text, n int default 1) returns void language plpgsql security definer set search_path = public as $$
declare d record; key int;
begin
  for d in select * from public.quest_defs where kind = k loop
    key := public.quest_key(d.period);
    if d.id in (select q from public.quest_ids(d.period, key) q) then
      insert into public.quest_progress (user_id, quest_id, period_key, progress) values (u, d.id, key, least(d.target, n))
        on conflict (user_id, quest_id, period_key) do update set progress = least(d.target, quest_progress.progress + n) where not quest_progress.claimed;
    end if;
  end loop;
end $$;
create or replace function public.trg_bump() returns trigger language plpgsql security definer set search_path = public as $$
begin perform public.quest_bump(new.user_id, tg_argv[0], 1); return new; end $$;
create or replace function public.trg_bump_profile() returns trigger language plpgsql security definer set search_path = public as $$
begin perform public.quest_bump(new.id, 'checkin', 1); return new; end $$;
drop trigger if exists q_place on public.game_furniture; create trigger q_place after insert on public.game_furniture for each row execute function public.trg_bump('place');
drop trigger if exists q_open on public.game_business; create trigger q_open after insert on public.game_business for each row execute function public.trg_bump('open');
drop trigger if exists q_upgrade on public.game_business; create trigger q_upgrade after update on public.game_business for each row when (new.level > old.level) execute function public.trg_bump('upgrade');
drop trigger if exists q_worker on public.game_business; create trigger q_worker after update on public.game_business for each row when (new.workers > old.workers) execute function public.trg_bump('worker');
drop trigger if exists q_collect on public.game_business; create trigger q_collect after update on public.game_business for each row when (new.last_collect > old.last_collect) execute function public.trg_bump('collect');
drop trigger if exists q_golden on public.golden_found; create trigger q_golden after insert on public.golden_found for each row execute function public.trg_bump('golden');
drop trigger if exists q_checkin on public.profiles; create trigger q_checkin after update on public.profiles for each row when (new.last_day is distinct from old.last_day) execute function public.trg_bump_profile();

create or replace function public.rpc_quests() returns jsonb language plpgsql security definer set search_path = public as $$
declare u uuid := auth.uid(); dk int := public.quest_key('daily'); wk int := public.quest_key('weekly');
begin
  if u is null then raise exception 'Sign in first'; end if;
  return jsonb_build_object(
    'daily', coalesce((select jsonb_agg(jsonb_build_object('id', d.id, 'title', d.title, 'target', d.target, 'progress', coalesce(p.progress, 0), 'claimed', coalesce(p.claimed, false), 'coins', d.coins, 'points', d.points) order by d.id)
      from public.quest_defs d left join public.quest_progress p on p.quest_id = d.id and p.user_id = u and p.period_key = dk where d.id in (select q from public.quest_ids('daily', dk) q)), '[]'::jsonb),
    'weekly', coalesce((select jsonb_agg(jsonb_build_object('id', d.id, 'title', d.title, 'target', d.target, 'progress', coalesce(p.progress, 0), 'claimed', coalesce(p.claimed, false), 'coins', d.coins, 'points', d.points) order by d.id)
      from public.quest_defs d left join public.quest_progress p on p.quest_id = d.id and p.user_id = u and p.period_key = wk where d.id in (select q from public.quest_ids('weekly', wk) q)), '[]'::jsonb),
    'freezeAvailable', not exists (select 1 from public.streak_freeze f where f.user_id = u and f.week = wk and f.used));
end $$;

create or replace function public.rpc_claim_quest(p_id text) returns jsonb language plpgsql security definer set search_path = public as $$
declare u uuid := auth.uid(); d public.quest_defs; key int; pr public.quest_progress; chest boolean := false;
begin
  perform public.check_rate('quest_claim', 60, interval '1 hour');
  select * into d from public.quest_defs where id = p_id; if d.id is null then raise exception 'Unknown quest.'; end if;
  key := public.quest_key(d.period);
  if p_id not in (select q from public.quest_ids(d.period, key) q) then raise exception 'That quest is not active right now.'; end if;
  select * into pr from public.quest_progress where user_id = u and quest_id = p_id and period_key = key for update;
  if pr.user_id is null or pr.progress < d.target then raise exception 'Not finished yet.'; end if;
  if pr.claimed then raise exception 'Already claimed.'; end if;
  update public.quest_progress set claimed = true where user_id = u and quest_id = p_id and period_key = key;
  perform public.game_ensure(u); update public.game_players set coins = coins + d.coins where user_id = u; perform public.award(u, d.points, 'quest');
  if d.period = 'weekly' and (select count(*) from public.quest_progress qp where qp.user_id = u and qp.period_key = key and qp.claimed and qp.quest_id in (select q from public.quest_ids('weekly', key) q)) = 5 then
    update public.profiles set crates = crates + 1 where id = u; chest := true;
  end if;
  return jsonb_build_object('coins', d.coins, 'points', d.points, 'chest', chest);
end $$;

/* ---------- streak freeze (one free per week) and the 28-day login calendar ---------- */
create table if not exists public.streak_freeze (user_id uuid primary key references public.profiles(id) on delete cascade, week int not null, used boolean not null default false);
alter table public.streak_freeze enable row level security;

create or replace function public.rpc_daily_visit() returns jsonb language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); p public.profiles; today int := floor(extract(epoch from now()) / 86400)::int; wk int := floor((floor(extract(epoch from now()) / 86400) + 3) / 7)::int; ns int; gained int; froze boolean := false;
begin
  perform public.check_rate('daily', 30, interval '1 hour');
  select * into p from public.profiles where id = uid for update;
  if p.last_day = today then return jsonb_build_object('counted', false, 'streak', p.streak); end if;
  if p.last_day = today - 1 then ns := p.streak + 1;
  elsif p.last_day = today - 2 and p.streak > 0 and not exists (select 1 from public.streak_freeze f where f.user_id = uid and f.week = wk and f.used) then   -- missed exactly one day: the weekly freeze saves the streak
    insert into public.streak_freeze (user_id, week, used) values (uid, wk, true) on conflict (user_id) do update set week = wk, used = true; ns := p.streak + 1; froze := true;
  else ns := 1; end if;
  gained := public.award(uid, 10 + least(50, 5 * (ns - 1)), 'daily visit');
  update public.profiles set streak = ns, best_streak = greatest(best_streak, ns), last_day = today, crates = crates + case when ns % 7 = 0 then 1 else 0 end where id = uid;
  return jsonb_build_object('counted', true, 'streak', ns, 'gained', gained, 'crate', ns % 7 = 0, 'freeze', froze);
end $$;

create table if not exists public.login_calendar (user_id uuid primary key references public.profiles(id) on delete cascade, claimed int not null default 0, last_day int not null default -1, total int not null default 0);
alter table public.login_calendar enable row level security;
drop policy if exists cal_own on public.login_calendar; create policy cal_own on public.login_calendar for select to authenticated using (user_id = auth.uid());

create or replace function public.rpc_calendar() returns jsonb language plpgsql security definer set search_path = public as $$
declare u uuid := auth.uid(); c public.login_calendar; today int := floor(extract(epoch from now()) / 86400)::int;
begin
  if u is null then raise exception 'Sign in first'; end if;
  insert into public.login_calendar (user_id) values (u) on conflict do nothing; select * into c from public.login_calendar where user_id = u;
  return jsonb_build_object('claimed', c.claimed, 'canClaim', c.last_day <> today, 'total', c.total);
end $$;

create or replace function public.rpc_calendar_claim() returns jsonb language plpgsql security definer set search_path = public as $$
declare u uuid := auth.uid(); c public.login_calendar; today int := floor(extract(epoch from now()) / 86400)::int; n int; gain_c int; gain_p int; cos text := null; got text := null;
begin
  perform public.check_rate('calendar', 20, interval '1 hour');
  insert into public.login_calendar (user_id) values (u) on conflict do nothing; select * into c from public.login_calendar where user_id = u for update;
  if c.last_day = today then raise exception 'You already claimed today.'; end if;
  n := case when c.claimed >= 28 then 1 else c.claimed + 1 end; gain_c := 20 + n * 10; gain_p := 5 + n;
  if n in (7, 14, 21, 28) then cos := (array['roof-helipad', 'plate-neon', 'neon-pink', 'neon-cyan'])[n / 7]; end if;
  perform public.game_ensure(u); update public.game_players set coins = coins + gain_c where user_id = u;
  perform public.award(u, gain_p, 'calendar day ' || n);
  if cos is not null then
    if exists (select 1 from public.owned where user_id = u and cosmetic_id = cos) then update public.game_players set coins = coins + 100 where user_id = u;
    else insert into public.owned (user_id, cosmetic_id, source) values (u, cos, 'calendar'); got := cos; end if;
  end if;
  update public.login_calendar set claimed = n, last_day = today, total = total + 1 where user_id = u;
  return jsonb_build_object('day', n, 'coins', gain_c, 'points', gain_p, 'cosmetic', got);
end $$;

/* ---------- city news feed and follows ---------- */
create table if not exists public.feed_events (id bigint generated always as identity primary key, at timestamptz not null default now(), kind text not null, text text not null, building int, user_id uuid references public.profiles(id) on delete set null);
create index if not exists feed_events_at on public.feed_events (at desc);
alter table public.feed_events enable row level security;
create or replace view public.public_feed as select at, kind, text, building from public.feed_events order by at desc limit 60;
grant select on public.public_feed to anon, authenticated;

create table if not exists public.follows (follower uuid not null references public.profiles(id) on delete cascade, followee uuid not null references public.profiles(id) on delete cascade, primary key (follower, followee), check (follower <> followee));
alter table public.follows enable row level security;
drop policy if exists follows_own on public.follows; create policy follows_own on public.follows for select to authenticated using (follower = auth.uid());

create or replace function public.feed_name(u uuid) returns text language sql stable security definer set search_path = public as
$$ select coalesce((select '@' || username from public.claims where user_id = u and opt_in), 'A builder') $$;
create or replace function public.biz_label(t text) returns text language sql immutable as
$$ select case t when 'lemonade' then 'a lemonade stand' when 'coffee' then 'a coffee shop' when 'pizza' then 'a pizza place' when 'arcade' then 'an arcade' when 'gym' then 'a gym' when 'clothing' then 'a clothing store' when 'cars' then 'a car dealership' else 'a tech startup' end $$;

create or replace function public.trg_feed_claim() returns trigger language plpgsql security definer set search_path = public as $$
begin insert into public.feed_events (kind, text, building, user_id) values ('claim', public.feed_name(new.user_id) || ' claimed building #' || (new.building + 1), new.building, new.user_id); return new; end $$;
create or replace function public.trg_feed_business() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then insert into public.feed_events (kind, text, building, user_id) values ('business', public.feed_name(new.user_id) || ' opened ' || public.biz_label(new.type), new.building, new.user_id);
  elsif new.level > old.level and new.level % 10 = 0 then insert into public.feed_events (kind, text, building, user_id) values ('level', public.feed_name(new.user_id) || '''s business reached level ' || new.level, new.building, new.user_id); end if;
  return new;
end $$;
drop trigger if exists feed_claim on public.claims; create trigger feed_claim after insert on public.claims for each row execute function public.trg_feed_claim();
drop trigger if exists feed_business_ins on public.game_business; create trigger feed_business_ins after insert on public.game_business for each row execute function public.trg_feed_business();
drop trigger if exists feed_business_upd on public.game_business; create trigger feed_business_upd after update on public.game_business for each row when (new.level > old.level) execute function public.trg_feed_business();

create or replace function public.admin_post_news(p_text text) returns void language plpgsql security definer set search_path = public as $$
begin perform public.require_admin(); insert into public.feed_events (kind, text) values ('news', left(p_text, 200)); end $$;

create or replace function public.rpc_follow(p_username text) returns jsonb language plpgsql security definer set search_path = public as $$
declare u uuid := auth.uid(); target uuid;
begin
  perform public.check_rate('follow', 60, interval '1 hour');
  select user_id into target from public.claims where lower(username) = lower(regexp_replace(p_username, '^@', '')) and opt_in;
  if target is null then raise exception 'No player with that name.'; end if; if target = u then raise exception 'That is you!'; end if;
  if (select count(*) from public.follows where follower = u) >= 200 then raise exception 'You follow too many people.'; end if;
  insert into public.follows (follower, followee) values (u, target) on conflict do nothing;  return jsonb_build_object('ok', true);
end $$;
create or replace function public.rpc_unfollow(p_username text) returns void language plpgsql security definer set search_path = public as $$
begin perform public.check_rate('follow', 60, interval '1 hour'); delete from public.follows where follower = auth.uid() and followee = (select user_id from public.claims where lower(username) = lower(regexp_replace(p_username, '^@', '')) and opt_in); end $$;
create or replace function public.rpc_friend_feed() returns jsonb language plpgsql security definer set search_path = public as $$
declare u uuid := auth.uid();
begin
  if u is null then raise exception 'Sign in first'; end if;
  return jsonb_build_object(
    'following', coalesce((select jsonb_agg(c.username order by c.username) from public.follows f join public.claims c on c.user_id = f.followee where f.follower = u), '[]'::jsonb),
    'feed', coalesce((select jsonb_agg(jsonb_build_object('at', e.at, 'text', e.text) order by e.at desc) from (select * from public.feed_events where user_id in (select followee from public.follows where follower = u) order by at desc limit 30) e), '[]'::jsonb));
end $$;

/* ---------- achievements (100+) ---------- */
create table if not exists public.achievement_defs (id text primary key, stat text not null, threshold numeric not null, title text not null);
create table if not exists public.user_achievements (user_id uuid not null references public.profiles(id) on delete cascade, achievement_id text not null references public.achievement_defs(id), at timestamptz not null default now(), primary key (user_id, achievement_id));
alter table public.achievement_defs enable row level security; alter table public.user_achievements enable row level security;
drop policy if exists ach_defs on public.achievement_defs; create policy ach_defs on public.achievement_defs for select using (true);
drop policy if exists ach_own on public.user_achievements; create policy ach_own on public.user_achievements for select to authenticated using (user_id = auth.uid());
do $$
declare s record; t numeric;
begin
  for s in select * from (values
    ('golden', 'Golden stars found', array[1,3,5,10,25,50,100,250,500,1000]),
    ('streak', 'Day streak', array[2,3,5,7,14,21,30,60,100,365]),
    ('biz_level', 'Business level', array[1,2,5,10,15,20,25,30,40,50]),
    ('furniture', 'Furniture in your homes', array[1,3,5,10,15,20,30,40,50,60]),
    ('networth', 'Net worth in City Coins', array[500,1000,5000,10000,50000,100000,500000,1000000,5000000,10000000]),
    ('points', 'Stars earned', array[100,250,500,1000,2500,5000,10000,25000,50000,100000]),
    ('friends', 'Friends followed', array[1,3,5,10,25,50,100]),
    ('invites', 'Friends invited', array[1,3,5,10,25,50,100]),
    ('quests', 'Quests completed', array[1,5,10,25,50,100,250,500]),
    ('calendar', 'Calendar days claimed', array[1,7,14,21,28,56,84]),
    ('owned', 'Cosmetics owned', array[1,3,5,10,15,20]),
    ('predictions', 'Predictions made', array[1,5,10,25]),
    ('votes', 'Votes cast', array[1,5,10,25]),
    ('claim', 'Claimed a building', array[1]), ('verified', 'Verified your account', array[1]), ('supporter', 'Became a supporter', array[1])
  ) as v(stat, label, th) loop
    foreach t in array s.th loop
      insert into public.achievement_defs (id, stat, threshold, title) values (s.stat || '_' || t::bigint, s.stat, t, s.label || ': ' || trim(to_char(t, '999,999,999,999')))
        on conflict (id) do update set title = excluded.title, threshold = excluded.threshold;
    end loop;
  end loop;
end $$;

create or replace function public.ach_stat(u uuid, st text) returns numeric language sql stable security definer set search_path = public as $$
  select case st
    when 'golden' then (select count(*) from public.golden_found where user_id = u)
    when 'streak' then (select best_streak from public.profiles where id = u)
    when 'biz_level' then coalesce((select level from public.game_business where user_id = u), 0)
    when 'furniture' then (select count(*) from public.game_furniture where user_id = u)
    when 'networth' then public.game_networth(u)
    when 'points' then (select points from public.profiles where id = u)
    when 'friends' then (select count(*) from public.follows where follower = u)
    when 'invites' then (select count(*) from public.referral_rewards where inviter = u)
    when 'quests' then (select count(*) from public.quest_progress where user_id = u and claimed)
    when 'calendar' then coalesce((select total from public.login_calendar where user_id = u), 0)
    when 'owned' then (select count(*) from public.owned where user_id = u)
    when 'predictions' then (select count(*) from public.predictions where user_id = u)
    when 'votes' then (select count(*) from public.votes where user_id = u)
    when 'claim' then (select count(*) from public.claims where user_id = u)
    when 'verified' then (select count(*) from public.verified_platforms where user_id = u)
    when 'supporter' then (select case when supporter then 1 else 0 end from public.profiles where id = u)
    else 0 end $$;

create or replace function public.rpc_achievements() returns jsonb language plpgsql security definer set search_path = public as $$
declare u uuid := auth.uid(); d record; v numeric; fresh int := 0;
begin
  perform public.check_rate('ach', 120, interval '1 hour');
  for d in select * from public.achievement_defs where id not in (select achievement_id from public.user_achievements where user_id = u) loop
    v := public.ach_stat(u, d.stat);
    if v >= d.threshold then insert into public.user_achievements (user_id, achievement_id) values (u, d.id) on conflict do nothing; fresh := fresh + 1; end if;
  end loop;
  if fresh > 0 then perform public.award(u, 10 * fresh, 'achievements'); end if;
  return jsonb_build_object('new', fresh, 'total', (select count(*) from public.achievement_defs),
    'earned', coalesce((select jsonb_agg(a.achievement_id order by a.at) from public.user_achievements a where a.user_id = u), '[]'::jsonb),
    'defs', (select jsonb_agg(jsonb_build_object('id', x.id, 'title', x.title, 'stat', x.stat, 'threshold', x.threshold) order by x.stat, x.threshold) from public.achievement_defs x));
end $$;

/* ---------- co-op community projects ---------- */
create table if not exists public.coop_projects (id bigint generated always as identity primary key, name text not null, goal bigint not null check (goal > 0), funded bigint not null default 0, per_player_cap bigint not null default 5000, reward_coins int not null default 500, status text not null default 'open' check (status in ('open', 'done')), created_at timestamptz not null default now(), done_at timestamptz);
create table if not exists public.coop_contrib (project_id bigint not null references public.coop_projects(id) on delete cascade, user_id uuid not null references public.profiles(id) on delete cascade, amount bigint not null default 0, primary key (project_id, user_id));
alter table public.coop_projects enable row level security; alter table public.coop_contrib enable row level security;
drop policy if exists coop_read on public.coop_projects; create policy coop_read on public.coop_projects for select using (true);
drop policy if exists coop_own on public.coop_contrib; create policy coop_own on public.coop_contrib for select to authenticated using (user_id = auth.uid());
create or replace view public.coop_wall as select c.project_id, coalesce(case when k.opt_in then k.username end, 'Anonymous builder') as name, c.amount from public.coop_contrib c left join public.claims k on k.user_id = c.user_id;
grant select on public.coop_wall to anon, authenticated;

create or replace function public.admin_create_coop(p_name text, p_goal bigint, p_cap bigint, p_reward int) returns void language plpgsql security definer set search_path = public as $$
begin perform public.require_admin(); insert into public.coop_projects (name, goal, per_player_cap, reward_coins) values (left(p_name, 60), p_goal, p_cap, p_reward); end $$;

create or replace function public.rpc_coop_contribute(p_project bigint, p_amount bigint) returns jsonb language plpgsql security definer set search_path = public as $$
declare u uuid := auth.uid(); pr public.coop_projects; pl public.game_players; mine bigint; amt bigint;
begin
  perform public.check_rate('coop', 60, interval '1 hour'); pl := public.game_ensure(u);
  select * into pr from public.coop_projects where id = p_project for update; if pr.id is null or pr.status <> 'open' then raise exception 'This project is not open.'; end if;
  select coalesce(amount, 0) into mine from public.coop_contrib where project_id = p_project and user_id = u; mine := coalesce(mine, 0);
  amt := least(p_amount, pr.per_player_cap - mine, pr.goal - pr.funded); if amt <= 0 then raise exception 'You have given the most you can to this project.'; end if;
  if pl.coins < amt then raise exception 'Not enough City Coins.'; end if;
  update public.game_players set coins = coins - amt where user_id = u;
  insert into public.coop_contrib (project_id, user_id, amount) values (p_project, u, amt) on conflict (project_id, user_id) do update set amount = coop_contrib.amount + amt;
  update public.coop_projects set funded = funded + amt where id = p_project returning * into pr;
  if pr.funded >= pr.goal then
    update public.coop_projects set status = 'done', done_at = now() where id = p_project;
    update public.game_players set coins = coins + pr.reward_coins where user_id in (select user_id from public.coop_contrib where project_id = p_project);
    insert into public.feed_events (kind, text) values ('coop', 'Community project finished: ' || pr.name || '!');
  end if;
  return jsonb_build_object('given', amt, 'funded', pr.funded, 'goal', pr.goal, 'done', pr.funded >= pr.goal);
end $$;

create or replace function public.rpc_coop_list() returns jsonb language plpgsql security definer set search_path = public as $$
declare u uuid := auth.uid();
begin
  return coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'name', p.name, 'goal', p.goal, 'funded', p.funded, 'cap', p.per_player_cap, 'reward', p.reward_coins, 'status', p.status,
    'mine', coalesce((select amount from public.coop_contrib c where c.project_id = p.id and c.user_id = u), 0)) order by p.status, p.id desc) from public.coop_projects p), '[]'::jsonb);
end $$;

/* ---------- reports and moderation ---------- */
create table if not exists public.reports (id bigint generated always as identity primary key, reporter uuid references public.profiles(id) on delete set null, kind text not null check (kind in ('user', 'home', 'pitch', 'district', 'other')), building int, target_user uuid references public.profiles(id) on delete set null, reason text not null, status text not null default 'open' check (status in ('open', 'dismissed', 'actioned')), created_at timestamptz not null default now());
alter table public.reports add column if not exists device jsonb;
alter table public.reports drop constraint if exists reports_kind_check;
alter table public.reports add constraint reports_kind_check check (kind in ('user', 'home', 'pitch', 'district', 'other', 'bug'));
alter table public.reports enable row level security;                         -- no policies: only admin functions read it
create or replace function public.rpc_bug_report(p_text text, p_device jsonb) returns void language plpgsql security definer set search_path = public as $$
begin
  perform public.check_rate('bug', 10, interval '1 day');
  if length(coalesce(trim(p_text), '')) < 5 then raise exception 'Please describe the problem.'; end if;
  insert into public.reports (reporter, kind, reason, device) values (auth.uid(), 'bug', left(p_text, 500), case when length(p_device::text) < 1500 then p_device else null end);
end $$;
revoke all on function public.rpc_bug_report(text, jsonb) from public, anon; grant execute on function public.rpc_bug_report(text, jsonb) to authenticated;
create or replace function public.rpc_report(p_kind text, p_building int, p_reason text) returns void language plpgsql security definer set search_path = public as $$
declare tu uuid;
begin
  perform public.check_rate('report', 20, interval '1 day');
  if length(coalesce(trim(p_reason), '')) < 3 then raise exception 'Tell us briefly what is wrong.'; end if;
  if p_building is not null then select user_id into tu from public.claims where building = p_building; end if;
  insert into public.reports (reporter, kind, building, target_user, reason) values (auth.uid(), p_kind, p_building, tu, left(p_reason, 300));
end $$;
create or replace function public.admin_reports() returns jsonb language plpgsql security definer set search_path = public as $$
begin
  perform public.require_admin();
  return coalesce((select jsonb_agg(jsonb_build_object('id', r.id, 'kind', r.kind, 'building', r.building, 'reason', r.reason, 'device', r.device, 'at', r.created_at, 'status', r.status, 'target', (select username from public.claims where user_id = r.target_user), 'target_id', r.target_user) order by r.created_at desc) from (select * from public.reports where status = 'open' order by created_at desc limit 100) r), '[]'::jsonb);
end $$;
create or replace function public.admin_resolve_report(p_id bigint, p_action text) returns void language plpgsql security definer set search_path = public as $$
declare r public.reports;
begin
  perform public.require_admin(); select * into r from public.reports where id = p_id; if r.id is null then return; end if;
  if p_action = 'ban' and r.target_user is not null then update public.profiles set banned = true where id = r.target_user; end if;
  if p_action = 'remove' and r.target_user is not null then delete from public.claims where user_id = r.target_user; end if;
  update public.reports set status = case when p_action = 'dismiss' then 'dismissed' else 'actioned' end where id = p_id;
end $$;
create or replace function public.admin_set_ban(p_user uuid, p_on boolean) returns void language plpgsql security definer set search_path = public as $$
begin perform public.require_admin(); update public.profiles set banned = p_on where id = p_user and not is_admin; end $$;

/* ---------- admin: beta, invite codes, stats ---------- */
create or replace function public.admin_set_beta(p_on boolean) returns void language plpgsql security definer set search_path = public as $$
begin perform public.require_admin(); update public.app_settings set value = case when p_on then 'on' else 'off' end where key = 'beta_mode'; end $$;
create or replace function public.admin_make_invites(p_count int, p_max_uses int, p_note text) returns text[] language plpgsql security definer set search_path = public as $$
declare codes text[] := '{}'; c text; i int;
begin
  perform public.require_admin();
  for i in 1 .. least(greatest(p_count, 1), 200) loop c := 'NC-' || upper(substr(translate(encode(gen_random_bytes(6), 'hex'), '01oil', 'xxyzw'), 1, 6)); insert into public.invite_codes (code, max_uses, note) values (c, greatest(p_max_uses, 1), left(p_note, 60)); codes := codes || c; end loop;
  return codes;
end $$;
-- wipes every non-admin account and its data. Only works while beta mode is ON and you type the exact confirmation.
create or replace function public.admin_reset_beta(p_confirm text) returns void language plpgsql security definer set search_path = public, auth as $$
begin
  perform public.require_admin();
  if p_confirm <> 'RESET BETA' then raise exception 'Type RESET BETA to confirm.'; end if;
  if coalesce((select value from public.app_settings where key = 'beta_mode'), 'off') <> 'on' then raise exception 'Reset only works while beta mode is on.'; end if;
  delete from auth.users where id in (select id from public.profiles where not is_admin);
  delete from public.feed_events; delete from public.reports; delete from public.golden_found; delete from public.game_visits; update public.invite_codes set uses = 0;
end $$;

create or replace function public.admin_stats() returns jsonb language plpgsql security definer set search_path = public as $$
declare today int := floor(extract(epoch from now()) / 86400)::int; ret jsonb; rev bigint := 0;
begin
  perform public.require_admin();
  if to_regclass('public.payments') is not null then execute 'select coalesce(sum(amount_cents), 0) from public.payments where livemode' into rev; end if;
  with visits as (select distinct user_id, (at at time zone 'utc')::date as d from public.point_log where reason = 'daily visit'),
  coh as (select id, (created_at at time zone 'utc')::date as d from public.profiles)
  select jsonb_build_object(
    'players', (select count(*) from public.profiles),
    'claims', (select count(*) from public.claims),
    'dau', (select count(*) from public.profiles where last_day = today),
    'wau', (select count(distinct user_id) from visits where d >= (now() at time zone 'utc')::date - 6),
    'mau', (select count(distinct user_id) from visits where d >= (now() at time zone 'utc')::date - 29),
    'd1', (select round(100.0 * count(*) filter (where exists (select 1 from visits v where v.user_id = coh.id and v.d = coh.d + 1)) / nullif(count(*), 0)) from coh where coh.d <= (now() at time zone 'utc')::date - 1),
    'd7', (select round(100.0 * count(*) filter (where exists (select 1 from visits v where v.user_id = coh.id and v.d = coh.d + 7)) / nullif(count(*), 0)) from coh where coh.d <= (now() at time zone 'utc')::date - 7),
    'd30', (select round(100.0 * count(*) filter (where exists (select 1 from visits v where v.user_id = coh.id and v.d = coh.d + 30)) / nullif(count(*), 0)) from coh where coh.d <= (now() at time zone 'utc')::date - 30),
    'revenue_cents_live', rev,
    'open_reports', (select count(*) from public.reports where status = 'open'),
    'beta_mode', (select value from public.app_settings where key = 'beta_mode')) into ret;
  return ret;
end $$;

/* ---------- who can call what ---------- */
revoke all on function public.quest_bump(uuid, text, int), public.feed_name(uuid), public.ach_stat(uuid, text), public.trg_bump(), public.trg_bump_profile(), public.trg_feed_claim(), public.trg_feed_business() from public, anon, authenticated;
revoke all on function public.rpc_redeem_invite(text), public.rpc_quests(), public.rpc_claim_quest(text), public.rpc_calendar(), public.rpc_calendar_claim(), public.rpc_follow(text), public.rpc_unfollow(text), public.rpc_friend_feed(),
  public.rpc_achievements(), public.rpc_coop_contribute(bigint, bigint), public.rpc_coop_list(), public.rpc_report(text, int, text), public.rpc_daily_visit(),
  public.admin_post_news(text), public.admin_create_coop(text, bigint, bigint, int), public.admin_reports(), public.admin_resolve_report(bigint, text), public.admin_set_ban(uuid, boolean),
  public.admin_set_beta(boolean), public.admin_make_invites(int, int, text), public.admin_reset_beta(text), public.admin_stats() from public, anon;
grant execute on function public.rpc_redeem_invite(text), public.rpc_quests(), public.rpc_claim_quest(text), public.rpc_calendar(), public.rpc_calendar_claim(), public.rpc_follow(text), public.rpc_unfollow(text), public.rpc_friend_feed(),
  public.rpc_achievements(), public.rpc_coop_contribute(bigint, bigint), public.rpc_coop_list(), public.rpc_report(text, int, text), public.rpc_daily_visit(),
  public.admin_post_news(text), public.admin_create_coop(text, bigint, bigint, int), public.admin_reports(), public.admin_resolve_report(bigint, text), public.admin_set_ban(uuid, boolean),
  public.admin_set_beta(boolean), public.admin_make_invites(int, int, text), public.admin_reset_beta(text), public.admin_stats() to authenticated;   -- admin_* check require_admin() inside
revoke all on function public.check_rate(text, int, interval) from public, anon; grant execute on function public.check_rate(text, int, interval) to authenticated;
