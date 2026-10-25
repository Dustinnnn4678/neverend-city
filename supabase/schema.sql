-- Neverend City: Phase 3 backend for Supabase (Postgres).
-- STATUS: written carefully but NOT YET RUN (it needs your Supabase project). Run it in the Supabase SQL editor,
-- then run seed.sql. If anything errors, send me the error text and I will fix it.
--
-- Safety model: the browser can only call the rpc_* functions below. Those functions work out every award
-- from the server clock and the database, so editing the web page cannot create points.
-- Row-level security (RLS) is on for every table; users can only read their own rows.

create extension if not exists pgcrypto;

/* ---------- tables ---------- */
create table if not exists public.settings (key text primary key, value text not null);
create table if not exists public.levels (level int primary key, at_points int not null, unlocks text not null);
create table if not exists public.crate_odds (rarity text primary key, p numeric not null check (p >= 0 and p <= 1), sort int not null);
create table if not exists public.cosmetics (
  id text primary key, name text not null, rarity text not null check (rarity in ('common','rare','epic','legendary')),
  level int not null default 1, cost int, source text not null check (source in ('points','crate')), slot text not null, enabled boolean not null default true
);

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  points int not null default 0 check (points >= 0), streak int not null default 0, best_streak int not null default 0, last_day int not null default -1,
  crates int not null default 0 check (crates >= 0), age_ok boolean not null default false, is_admin boolean not null default false,
  referral_code text unique not null default encode(gen_random_bytes(5), 'hex'), referred_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.claims (
  id bigint generated always as identity primary key,
  user_id uuid not null unique references public.profiles(id) on delete cascade,
  building int not null unique check (building >= 0),
  platform text not null check (platform in ('instagram','youtube')),
  username text not null check (username ~ '^[A-Za-z0-9._]{1,30}$'),
  opt_in boolean not null default false,
  status text not null default 'pending' check (status in ('pending','verified')),
  code text not null, created_at timestamptz not null default now(), verified_at timestamptz
);
create table if not exists public.verified_platforms (user_id uuid references public.profiles(id) on delete cascade, platform text, primary key (user_id, platform));
create table if not exists public.claim_removals (id bigint generated always as identity primary key, building int, username text, removed_by uuid, reason text, at timestamptz default now());

create table if not exists public.point_log (id bigint generated always as identity primary key, user_id uuid references public.profiles(id) on delete cascade, delta int not null, reason text not null, at timestamptz not null default now());
create table if not exists public.owned (user_id uuid references public.profiles(id) on delete cascade, cosmetic_id text references public.cosmetics(id), source text not null, at timestamptz default now(), primary key (user_id, cosmetic_id));
create table if not exists public.equipped (user_id uuid references public.profiles(id) on delete cascade, slot text, cosmetic_id text references public.cosmetics(id), primary key (user_id, slot));

create table if not exists public.golden_days (day int primary key, buildings int[] not null);
create table if not exists public.golden_found (user_id uuid references public.profiles(id) on delete cascade, day int, building int, primary key (user_id, day, building));

create table if not exists public.milestones_reached (milestone int primary key, reached_at timestamptz not null default now());
create table if not exists public.live_events (id bigint generated always as identity primary key, milestone int, started_at timestamptz not null default now());
create table if not exists public.predictions (user_id uuid references public.profiles(id) on delete cascade, milestone int, day int not null, settled boolean not null default false, primary key (user_id, milestone));
create table if not exists public.vote_options (milestone int, option text, primary key (milestone, option));
create table if not exists public.votes (user_id uuid references public.profiles(id) on delete cascade, milestone int, option text, primary key (user_id, milestone), foreign key (milestone, option) references public.vote_options(milestone, option));
create table if not exists public.referral_rewards (invitee uuid primary key references public.profiles(id) on delete cascade, inviter uuid not null references public.profiles(id) on delete cascade, at timestamptz default now());
create table if not exists public.rate_limits (user_id uuid, action text, window_start timestamptz not null, n int not null, primary key (user_id, action));

create table if not exists public.giveaways (
  id bigint generated always as identity primary key, title text not null, milestone int, rules_url text not null, closes_at timestamptz not null,
  winner_count int not null default 1 check (winner_count > 0), seed_hash text, seed text, drawn_at timestamptz
);
create table if not exists public.giveaway_secrets (giveaway_id bigint primary key references public.giveaways(id) on delete cascade, seed text not null);
create table if not exists public.giveaway_log (id bigint generated always as identity primary key, giveaway_id bigint references public.giveaways(id), at timestamptz default now(), entrants int, entrants_hash text, seed text, winners jsonb);

/* ---------- helpers ---------- */
create or replace function public.is_admin() returns boolean language sql stable security definer set search_path = public as
$$ select coalesce((select is_admin from public.profiles where id = auth.uid()), false) $$;

create or replace function public.check_rate(p_action text, p_max int, p_window interval) returns void language plpgsql security definer set search_path = public as $$
declare r public.rate_limits;
begin
  if auth.uid() is null then raise exception 'Sign in first'; end if;
  insert into public.rate_limits as rl (user_id, action, window_start, n) values (auth.uid(), p_action, now(), 1)
  on conflict (user_id, action) do update set
    window_start = case when rl.window_start < now() - p_window then now() else rl.window_start end,
    n = case when rl.window_start < now() - p_window then 1 else rl.n + 1 end
  returning * into r;
  if r.n > p_max then raise exception 'Too many requests, please slow down'; end if;
end $$;

create or replace function public.level_of(p int) returns int language sql stable as
$$ select coalesce((select max(level) from public.levels where at_points <= p), 1) $$;

create or replace function public.event_multiplier() returns int language sql stable as
$$ select case when exists (select 1 from public.live_events where now() >= started_at and now() < started_at + interval '10 minutes') then 2 else 1 end $$;

create or replace function public.award(p_user uuid, p_amount int, p_reason text) returns int language plpgsql security definer set search_path = public as $$
declare g int := p_amount * public.event_multiplier();
begin
  update public.profiles set points = points + g where id = p_user;
  insert into public.point_log (user_id, delta, reason) values (p_user, g, p_reason);
  return g;
end $$;
revoke all on function public.award(uuid, int, text) from public, anon, authenticated;

create or replace function public.name_ok(p text) returns boolean language sql immutable as $$
  select p ~ '^[A-Za-z0-9._]{1,30}$' and regexp_replace(translate(lower(p), '013457$', 'oieasts'), '[^a-z]', '', 'g') !~
    '(fuck|shit|bitch|cunt|nigg|fagg|rape|nazi|hitler|porn|sex|dick|cock|pussy|whore|slut|kkk|kill)' $$;

create or replace function public.handle_new_user() returns trigger language plpgsql security definer set search_path = public as $$
begin insert into public.profiles (id) values (new.id) on conflict do nothing; return new; end $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

/* ---------- player actions (the only way points change) ---------- */
create or replace function public.rpc_daily_visit() returns jsonb language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); p public.profiles; today int := floor(extract(epoch from now()) / 86400)::int; ns int; gained int;
begin
  perform public.check_rate('daily', 30, interval '1 hour');
  select * into p from public.profiles where id = uid for update;
  if p.last_day = today then return jsonb_build_object('counted', false, 'streak', p.streak); end if;
  ns := case when p.last_day = today - 1 then p.streak + 1 else 1 end;
  gained := public.award(uid, 10 + least(50, 5 * (ns - 1)), 'daily visit');
  update public.profiles set streak = ns, best_streak = greatest(best_streak, ns), last_day = today, crates = crates + case when ns % 7 = 0 then 1 else 0 end where id = uid;
  return jsonb_build_object('counted', true, 'streak', ns, 'gained', gained, 'crate', ns % 7 = 0);
end $$;

create or replace function public.rpc_claim_building(p_building int, p_platform text, p_username text, p_opt_in boolean, p_age_ok boolean) returns jsonb language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); u text := regexp_replace(coalesce(p_username, ''), '^@', ''); v_code text := 'NC-' || upper(substr(translate(encode(gen_random_bytes(6), 'hex'), '01oil', 'xxyzw'), 1, 6)); inviter uuid;
begin
  perform public.check_rate('claim', 10, interval '1 hour');
  if not p_age_ok then raise exception 'You must confirm you are 13 or older'; end if;
  if not public.name_ok(u) then raise exception 'That username is not allowed'; end if;
  if exists (select 1 from public.claims where user_id = uid) then raise exception 'You already claimed a building'; end if;
  if exists (select 1 from public.claims where building = p_building) then raise exception 'That building is already claimed'; end if;
  update public.profiles set age_ok = true where id = uid;
  insert into public.claims (user_id, building, platform, username, opt_in, code) values (uid, p_building, p_platform, u, coalesce(p_opt_in, false), v_code);
  select referred_by into inviter from public.profiles where id = uid;
  if inviter is not null and not exists (select 1 from public.referral_rewards where invitee = uid) then
    insert into public.referral_rewards (invitee, inviter) values (uid, inviter); perform public.award(inviter, 50, 'referral claimed a building');
  end if;
  return jsonb_build_object('code', v_code, 'status', 'pending');
end $$;

create or replace function public.rpc_use_referral(p_code text) returns void language plpgsql security definer set search_path = public as $$
declare inv uuid;
begin
  perform public.check_rate('referral', 5, interval '1 day');
  select id into inv from public.profiles where referral_code = lower(p_code);
  if inv is null or inv = auth.uid() then raise exception 'Invalid invite code'; end if;
  update public.profiles set referred_by = inv where id = auth.uid() and referred_by is null;
end $$;

create or replace function public.rpc_find_golden(p_building int) returns int language plpgsql security definer set search_path = public as $$
declare today int := floor(extract(epoch from now()) / 86400)::int; n int;
begin
  perform public.check_rate('golden', 30, interval '1 hour');
  if not exists (select 1 from public.golden_days where day = today and p_building = any (buildings)) then raise exception 'That is not a golden object today'; end if;
  insert into public.golden_found (user_id, day, building) values (auth.uid(), today, p_building) on conflict do nothing;
  get diagnostics n = row_count; if n = 0 then raise exception 'You already found that one today'; end if;
  return public.award(auth.uid(), 25, 'golden object');
end $$;

create or replace function public.rpc_open_crate() returns jsonb language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); r numeric := random(); rar text; c public.cosmetics; dupe boolean := false; tries int := 0; ladder text[] := array['legendary','epic','rare','common'];
begin
  perform public.check_rate('crate', 30, interval '1 hour');
  update public.profiles set crates = crates - 1 where id = uid and crates > 0; if not found then raise exception 'You have no crates'; end if;
  select rarity into rar from (select rarity, sum(p) over (order by sort) as cum from public.crate_odds) t where r < cum order by cum limit 1;
  rar := coalesce(rar, 'common');
  loop
    select * into c from public.cosmetics where source = 'crate' and rarity = rar and enabled order by random() limit 1;
    exit when found or tries > 4; rar := ladder[least(array_position(ladder, rar) + 1, 4)]; tries := tries + 1;
  end loop;
  if c.id is null then raise exception 'No crate items configured'; end if;
  if exists (select 1 from public.owned where user_id = uid and cosmetic_id = c.id) then dupe := true; perform public.award(uid, 25, 'duplicate crate item');
  else insert into public.owned (user_id, cosmetic_id, source) values (uid, c.id, 'crate'); end if;
  return jsonb_build_object('id', c.id, 'name', c.name, 'rarity', c.rarity, 'dupe', dupe);
end $$;

create or replace function public.rpc_buy_cosmetic(p_id text) returns void language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); c public.cosmetics; p public.profiles;
begin
  perform public.check_rate('buy', 60, interval '1 hour');
  select * into c from public.cosmetics where id = p_id and enabled and source = 'points'; if not found then raise exception 'Not for sale'; end if;
  select * into p from public.profiles where id = uid for update;
  if public.level_of(p.points) < c.level then raise exception 'Level too low'; end if; if p.points < c.cost then raise exception 'Not enough points'; end if;
  if exists (select 1 from public.owned where user_id = uid and cosmetic_id = p_id) then raise exception 'You already own that'; end if;
  update public.profiles set points = points - c.cost where id = uid; insert into public.point_log (user_id, delta, reason) values (uid, -c.cost, 'bought ' || c.id);
  insert into public.owned (user_id, cosmetic_id, source) values (uid, p_id, 'points');
end $$;

create or replace function public.rpc_equip(p_slot text, p_id text) returns void language plpgsql security definer set search_path = public as $$
begin
  perform public.check_rate('equip', 120, interval '1 hour');
  if p_id is null then delete from public.equipped where user_id = auth.uid() and slot = p_slot; return; end if;
  if not exists (select 1 from public.owned o join public.cosmetics c on c.id = o.cosmetic_id where o.user_id = auth.uid() and o.cosmetic_id = p_id and c.slot = p_slot) then raise exception 'You do not own that'; end if;
  insert into public.equipped (user_id, slot, cosmetic_id) values (auth.uid(), p_slot, p_id) on conflict (user_id, slot) do update set cosmetic_id = excluded.cosmetic_id;
end $$;

create or replace function public.rpc_predict(p_milestone int, p_day int) returns void language plpgsql security definer set search_path = public as $$
begin
  perform public.check_rate('predict', 30, interval '1 hour');
  if exists (select 1 from public.milestones_reached where milestone = p_milestone) then raise exception 'That milestone is already reached'; end if;
  insert into public.predictions (user_id, milestone, day) values (auth.uid(), p_milestone, p_day) on conflict (user_id, milestone) do update set day = excluded.day;
end $$;

create or replace function public.rpc_vote(p_milestone int, p_option text) returns void language plpgsql security definer set search_path = public as $$
begin
  perform public.check_rate('vote', 30, interval '1 hour');
  insert into public.votes (user_id, milestone, option) values (auth.uid(), p_milestone, p_option) on conflict (user_id, milestone) do update set option = excluded.option;
end $$;

create or replace function public.rpc_delete_account() returns void language plpgsql security definer set search_path = public, auth as $$
begin delete from auth.users where id = auth.uid(); end $$;

/* ---------- admin actions ---------- */
create or replace function public.require_admin() returns void language plpgsql stable security definer set search_path = public as $$
begin if not public.is_admin() then raise exception 'Admins only'; end if; end $$;

create or replace function public.admin_verify_claim(p_id bigint) returns void language plpgsql security definer set search_path = public as $$
declare c public.claims;
begin
  perform public.require_admin(); select * into c from public.claims where id = p_id; if not found then raise exception 'No such claim'; end if;
  update public.claims set status = 'verified', verified_at = now() where id = p_id;
  if not exists (select 1 from public.verified_platforms where user_id = c.user_id and platform = c.platform) then
    insert into public.verified_platforms (user_id, platform) values (c.user_id, c.platform); perform public.award(c.user_id, 100, 'verified ' || c.platform);
  end if;
end $$;

create or replace function public.admin_remove_claim(p_id bigint, p_reason text) returns void language plpgsql security definer set search_path = public as $$
declare c public.claims;
begin
  perform public.require_admin(); select * into c from public.claims where id = p_id; if not found then return; end if;
  insert into public.claim_removals (building, username, removed_by, reason) values (c.building, c.username, auth.uid(), p_reason); delete from public.claims where id = p_id;
end $$;

create or replace function public.admin_ensure_golden(p_day int, p_total int) returns int[] language plpgsql security definer set search_path = public as $$
declare picks int[] := '{}'; x int;
begin
  perform public.require_admin();
  select buildings into picks from public.golden_days where day = p_day; if found then return picks; end if;
  picks := '{}';
  while coalesce(array_length(picks, 1), 0) < least(3, p_total) loop x := floor(random() * p_total)::int; if not (x = any (picks)) then picks := picks || x; end if; end loop;
  insert into public.golden_days (day, buildings) values (p_day, picks); return picks;
end $$;

-- Call when the city reaches a milestone: records it, starts the 10-minute double-points event, gives every player a crate,
-- and pays +200 to everyone who predicted the right day.
create or replace function public.admin_settle_milestone(p_milestone int) returns void language plpgsql security definer set search_path = public as $$
declare d int := floor(extract(epoch from now()) / 86400)::int; pr record;
begin
  perform public.require_admin();
  insert into public.milestones_reached (milestone) values (p_milestone) on conflict do nothing; insert into public.live_events (milestone) values (p_milestone);
  update public.profiles set crates = crates + 1;
  for pr in select user_id from public.predictions where milestone = p_milestone and day = d and not settled loop perform public.award(pr.user_id, 200, 'correct milestone prediction'); end loop;
  update public.predictions set settled = true where milestone = p_milestone;
end $$;

-- Fair giveaways. Step 1 commit: we publish a fingerprint of a secret seed BEFORE the draw. Step 2 draw: the seed is revealed,
-- anyone can recompute the winners with scripts/verify-giveaway.mjs. Entrants = verified owners who verified before the close time.
create or replace function public.admin_commit_giveaway(p_id bigint) returns text language plpgsql security definer set search_path = public as $$
declare s text := encode(gen_random_bytes(32), 'hex'); h text := encode(digest(s, 'sha256'), 'hex');
begin
  perform public.require_admin();
  if exists (select 1 from public.giveaway_secrets where giveaway_id = p_id) then raise exception 'Already committed'; end if;
  insert into public.giveaway_secrets (giveaway_id, seed) values (p_id, s); update public.giveaways set seed_hash = h where id = p_id; return h;
end $$;

create or replace function public.admin_draw_giveaway(p_id bigint) returns jsonb language plpgsql security definer set search_path = public as $$
declare g public.giveaways; s text; ids uuid[]; n int; i int; j int; d bytea; r bigint; tmp uuid; win uuid[]; names jsonb; eh text;
begin
  perform public.require_admin(); select * into g from public.giveaways where id = p_id; if not found then raise exception 'No such giveaway'; end if;
  if g.drawn_at is not null then raise exception 'Already drawn'; end if; if now() < g.closes_at then raise exception 'Entries are still open'; end if;
  select seed into s from public.giveaway_secrets where giveaway_id = p_id; if s is null then raise exception 'Commit first'; end if;
  ids := array(select user_id from public.claims where status = 'verified' and verified_at <= g.closes_at order by user_id); n := coalesce(array_length(ids, 1), 0); eh := encode(digest(array_to_string(ids, ','), 'sha256'), 'hex');
  for i in reverse n .. 2 loop
    d := digest(s || ':' || i, 'sha256'); r := get_byte(d, 0)::bigint * 16777216 + get_byte(d, 1) * 65536 + get_byte(d, 2) * 256 + get_byte(d, 3); j := 1 + (r % i)::int;
    tmp := ids[i]; ids[i] := ids[j]; ids[j] := tmp;
  end loop;
  win := ids[1:least(g.winner_count, n)];
  select coalesce(jsonb_agg(jsonb_build_object('user_id', c.user_id, 'building', c.building, 'username', c.username, 'platform', c.platform)), '[]'::jsonb) into names from public.claims c where c.user_id = any (win);
  insert into public.giveaway_log (giveaway_id, entrants, entrants_hash, seed, winners) values (p_id, n, eh, s, names);
  update public.giveaways set seed = s, drawn_at = now() where id = p_id; return names;
end $$;

/* ---------- row-level security ---------- */
alter table public.profiles enable row level security; alter table public.claims enable row level security; alter table public.point_log enable row level security;
alter table public.owned enable row level security; alter table public.equipped enable row level security; alter table public.golden_found enable row level security;
alter table public.predictions enable row level security; alter table public.votes enable row level security; alter table public.referral_rewards enable row level security;
alter table public.rate_limits enable row level security; alter table public.verified_platforms enable row level security; alter table public.claim_removals enable row level security;
alter table public.giveaway_secrets enable row level security; alter table public.giveaway_log enable row level security; alter table public.giveaways enable row level security;
alter table public.settings enable row level security; alter table public.levels enable row level security; alter table public.crate_odds enable row level security; alter table public.cosmetics enable row level security;
alter table public.golden_days enable row level security; alter table public.milestones_reached enable row level security; alter table public.live_events enable row level security; alter table public.vote_options enable row level security;

drop policy if exists own_profile on public.profiles; create policy own_profile on public.profiles for select using (id = auth.uid() or public.is_admin());
drop policy if exists own_claim on public.claims; create policy own_claim on public.claims for select using (user_id = auth.uid() or public.is_admin());
drop policy if exists own_log on public.point_log; create policy own_log on public.point_log for select using (user_id = auth.uid());
drop policy if exists own_owned on public.owned; create policy own_owned on public.owned for select using (user_id = auth.uid());
drop policy if exists own_equipped on public.equipped; create policy own_equipped on public.equipped for select using (user_id = auth.uid());
drop policy if exists own_found on public.golden_found; create policy own_found on public.golden_found for select using (user_id = auth.uid());
drop policy if exists own_pred on public.predictions; create policy own_pred on public.predictions for select using (user_id = auth.uid());
drop policy if exists own_vote on public.votes; create policy own_vote on public.votes for select using (user_id = auth.uid());
drop policy if exists admin_logs on public.giveaway_log; create policy admin_logs on public.giveaway_log for select using (true);          -- the draw log is public on purpose
drop policy if exists pub_giveaways on public.giveaways; create policy pub_giveaways on public.giveaways for select using (true);        -- seed stays null until drawn
drop policy if exists admin_removals on public.claim_removals; create policy admin_removals on public.claim_removals for select using (public.is_admin());
drop policy if exists pub_levels on public.levels; create policy pub_levels on public.levels for select using (true);
drop policy if exists pub_odds on public.crate_odds; create policy pub_odds on public.crate_odds for select using (true);                 -- odds are shown to everyone
drop policy if exists pub_cos on public.cosmetics; create policy pub_cos on public.cosmetics for select using (true);
drop policy if exists pub_golden on public.golden_days; create policy pub_golden on public.golden_days for select using (true);
drop policy if exists pub_ms on public.milestones_reached; create policy pub_ms on public.milestones_reached for select using (true);
drop policy if exists pub_ev on public.live_events; create policy pub_ev on public.live_events for select using (true);
drop policy if exists pub_vo on public.vote_options; create policy pub_vo on public.vote_options for select using (true);
drop policy if exists pub_settings on public.settings; create policy pub_settings on public.settings for select using (true);
-- admin edits odds, cosmetics and vote options from the admin page (through these policies)
drop policy if exists adm_odds on public.crate_odds; create policy adm_odds on public.crate_odds for all using (public.is_admin()) with check (public.is_admin());
drop policy if exists adm_cos on public.cosmetics; create policy adm_cos on public.cosmetics for all using (public.is_admin()) with check (public.is_admin());
drop policy if exists adm_vo on public.vote_options; create policy adm_vo on public.vote_options for all using (public.is_admin()) with check (public.is_admin());
drop policy if exists adm_gw on public.giveaways; create policy adm_gw on public.giveaways for insert with check (public.is_admin());

/* ---------- public views: only what is safe to show (never emails, never opted-out usernames) ---------- */
create or replace view public.public_claims as select building, case when opt_in then username end as display_name, status from public.claims;
create or replace view public.board_points as select coalesce(case when c.opt_in then c.username end, 'Anonymous builder') as name, p.points from public.profiles p left join public.claims c on c.user_id = p.id order by p.points desc limit 50;
create or replace view public.board_streaks as select coalesce(case when c.opt_in then c.username end, 'Anonymous builder') as name, p.best_streak as streak from public.profiles p left join public.claims c on c.user_id = p.id order by p.best_streak desc limit 50;
create or replace view public.board_referrals as select coalesce(case when c.opt_in then c.username end, 'Anonymous builder') as name, count(*) as referrals from public.referral_rewards r join public.profiles p on p.id = r.inviter left join public.claims c on c.user_id = p.id group by 1 order by 2 desc limit 50;
grant select on public.public_claims, public.board_points, public.board_streaks, public.board_referrals to anon, authenticated;

/* ---------- who can call what ---------- */
revoke all on all functions in schema public from public, anon;
grant execute on function public.rpc_daily_visit(), public.rpc_claim_building(int, text, text, boolean, boolean), public.rpc_use_referral(text), public.rpc_find_golden(int), public.rpc_open_crate(),
  public.rpc_buy_cosmetic(text), public.rpc_equip(text, text), public.rpc_predict(int, int), public.rpc_vote(int, text), public.rpc_delete_account(), public.is_admin(), public.level_of(int), public.name_ok(text) to authenticated;
grant execute on function public.admin_verify_claim(bigint), public.admin_remove_claim(bigint, text), public.admin_ensure_golden(int, int), public.admin_settle_milestone(int), public.admin_commit_giveaway(bigint), public.admin_draw_giveaway(bigint) to authenticated; -- each checks is_admin() inside
revoke all on function public.award(uuid, int, text) from public, anon, authenticated;
revoke all on function public.check_rate(text, int, interval) from public, anon;
grant execute on function public.check_rate(text, int, interval) to authenticated;

/* ---------- street naming (level 5, needs your approval) ---------- */
create table if not exists public.street_requests (
  id bigint generated always as identity primary key, user_id uuid not null references public.profiles(id) on delete cascade,
  street_name text not null check (char_length(street_name) between 3 and 30), status text not null default 'pending' check (status in ('pending','approved','rejected')),
  created_at timestamptz not null default now(), unique (user_id)
);
alter table public.street_requests enable row level security;
drop policy if exists own_street on public.street_requests; create policy own_street on public.street_requests for select using (user_id = auth.uid() or public.is_admin());
create or replace view public.public_streets as select street_name from public.street_requests where status = 'approved';
grant select on public.public_streets to anon, authenticated;

create or replace function public.rpc_request_street(p_name text) returns void language plpgsql security definer set search_path = public as $$
declare p public.profiles;
begin
  perform public.check_rate('street', 5, interval '1 day'); select * into p from public.profiles where id = auth.uid();
  if public.level_of(p.points) < 5 then raise exception 'Level 5 needed'; end if; if not public.name_ok(replace(p_name, ' ', '')) then raise exception 'That name is not allowed'; end if;
  insert into public.street_requests (user_id, street_name) values (auth.uid(), trim(p_name)) on conflict (user_id) do update set street_name = excluded.street_name, status = 'pending';
end $$;
create or replace function public.admin_review_street(p_id bigint, p_approve boolean) returns void language plpgsql security definer set search_path = public as $$
begin perform public.require_admin(); update public.street_requests set status = case when p_approve then 'approved' else 'rejected' end where id = p_id; end $$;
revoke all on function public.rpc_request_street(text), public.admin_review_street(bigint, boolean) from public, anon;
grant execute on function public.rpc_request_street(text), public.admin_review_street(bigint, boolean) to authenticated;
