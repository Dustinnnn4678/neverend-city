-- Phase 5 server side: homes, furniture and businesses (City Coins tycoon).
-- Run once in the Supabase SQL Editor (safe to run again). The numbers mirror economy.js.
-- Rules enforced here, never in the browser:
--  * The browser sends actions ("upgrade", "collect", "place"), never amounts. Coins are computed from timestamps.
--  * Only the owner of a CLAIMED building can go inside and change it.
--  * Coins can never be bought, sold, cashed out or transferred. There is no trading function.
--  * Nothing here touches follower counts, points, levels or leaderboards.
--  * Random daily events (rush hour etc.) are demo-only for now: the server pays plain income, plus the permanent boosts.

/* ---------- catalogs (what exists and what it costs) ---------- */
create table if not exists public.game_catalog_business (type text primary key, base int not null, unlock_owner int not null);
create table if not exists public.game_catalog_furniture (id text primary key, price int not null);
insert into public.game_catalog_business (type, base, unlock_owner) values
  ('lemonade', 12, 1), ('coffee', 40, 2), ('pizza', 90, 4), ('arcade', 160, 6), ('gym', 260, 8), ('clothing', 420, 10), ('cars', 800, 13), ('tech', 1500, 16)
  on conflict (type) do update set base = excluded.base, unlock_owner = excluded.unlock_owner;
insert into public.game_catalog_furniture (id, price) values
  ('bed', 120), ('sofa', 150), ('tv', 200), ('plant', 25), ('lamp', 40), ('table', 90), ('bookshelf', 80), ('rug', 35), ('art', 30)
  on conflict (id) do update set price = excluded.price;

/* ---------- player data ---------- */
create table if not exists public.game_players (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  coins bigint not null default 250 check (coins >= 0),
  seed int not null default (floor(random() * 1000000) + 1)::int,
  boost2x boolean not null default false, long_offline boolean not null default false,
  created_at timestamptz not null default now()
);
create table if not exists public.game_business (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  building int not null unique, type text not null references public.game_catalog_business(type),
  level int not null default 1 check (level between 1 and 50), workers int not null default 0 check (workers >= 0),
  manager boolean not null default false, last_collect timestamptz not null default now()
);
create table if not exists public.game_furniture (
  uid bigint generated always as identity primary key,
  user_id uuid not null references public.profiles(id) on delete cascade, building int not null,
  item text not null references public.game_catalog_furniture(id), x real not null, z real not null,
  rot int not null default 0 check (rot between 0 and 3), wall text check (wall in ('left', 'back'))
);
create index if not exists game_furniture_user on public.game_furniture (user_id, building);
create table if not exists public.game_starter (user_id uuid not null references public.profiles(id) on delete cascade, building int not null, primary key (user_id, building));
create table if not exists public.game_visits (building int primary key, n int not null default 0);

alter table public.game_catalog_business enable row level security;
alter table public.game_catalog_furniture enable row level security;
alter table public.game_players enable row level security;
alter table public.game_business enable row level security;
alter table public.game_furniture enable row level security;
alter table public.game_starter enable row level security;
alter table public.game_visits enable row level security;
drop policy if exists game_cat_b on public.game_catalog_business; create policy game_cat_b on public.game_catalog_business for select using (true);
drop policy if exists game_cat_f on public.game_catalog_furniture; create policy game_cat_f on public.game_catalog_furniture for select using (true);
drop policy if exists game_players_own on public.game_players; create policy game_players_own on public.game_players for select to authenticated using (user_id = auth.uid());
drop policy if exists game_business_own on public.game_business; create policy game_business_own on public.game_business for select to authenticated using (user_id = auth.uid());
drop policy if exists game_furniture_own on public.game_furniture; create policy game_furniture_own on public.game_furniture for select to authenticated using (user_id = auth.uid());
-- no insert/update/delete policies: only the functions below can change anything

/* ---------- economy math (same formulas as economy.js) ---------- */
create or replace function public.game_income_hr(t text, l int) returns numeric language sql stable set search_path = public as
$$ select (select base from public.game_catalog_business where type = t) * l * power(1.09::numeric, l - 1) $$;
create or replace function public.game_upgrade_cost(t text, l int) returns bigint language sql stable set search_path = public as
$$ select round((select base from public.game_catalog_business where type = t) * 10 * power(1.16::numeric, l - 1))::bigint $$;
create or replace function public.game_worker_cost(t text, hired int) returns bigint language sql stable set search_path = public as
$$ select round((select base from public.game_catalog_business where type = t) * 25 * power(1.5::numeric, hired))::bigint $$;
create or replace function public.game_manager_cost(t text) returns bigint language sql stable set search_path = public as
$$ select ((select base from public.game_catalog_business where type = t) * 400)::bigint $$;

create or replace function public.game_ensure(u uuid) returns public.game_players language plpgsql security definer set search_path = public as $$
declare pl public.game_players;
begin
  insert into public.game_players (user_id) values (u) on conflict do nothing;
  select * into pl from public.game_players where user_id = u for update;   -- one action at a time per player
  return pl;
end $$;

create or replace function public.game_pending(bz public.game_business, pl public.game_players, sup boolean) returns bigint language sql stable set search_path = public as $$
  select floor(
    greatest(0, extract(epoch from (least(now(), bz.last_collect + make_interval(hours => case when bz.manager then (case when pl.long_offline then 24 else 8 end) else 1 end)) - bz.last_collect)))
    / 3600.0 * public.game_income_hr(bz.type, bz.level) * (case when pl.boost2x then 2 else 1 end) * (case when sup then 1.1 else 1 end)
  )::bigint $$;

-- pay out what the business has earned so far and restart its clock
create or replace function public.game_settle(u uuid) returns void language plpgsql security definer set search_path = public as $$
declare pl public.game_players; bz public.game_business; sup boolean; g bigint;
begin
  pl := public.game_ensure(u); select * into bz from public.game_business where user_id = u; if bz.user_id is null then return; end if;
  select coalesce(supporter, false) into sup from public.profiles where id = u; g := public.game_pending(bz, pl, sup);
  update public.game_players set coins = coins + g where user_id = u; update public.game_business set last_collect = now() where user_id = u;
end $$;

create or replace function public.game_networth(u uuid) returns bigint language sql stable security definer set search_path = public as $$
  select coalesce((select coins from public.game_players where user_id = u), 0)
    + coalesce((select sum(public.game_upgrade_cost(b.type, l)) from public.game_business b, generate_series(1, 49) l where b.user_id = u and l < b.level), 0)
    + coalesce((select sum(public.game_worker_cost(b.type, k)) from public.game_business b, generate_series(0, 60) k where b.user_id = u and k < b.workers), 0)
    + coalesce((select case when b.manager then public.game_manager_cost(b.type) else 0 end from public.game_business b where b.user_id = u), 0)
    + coalesce((select sum(c.price) from public.game_furniture f join public.game_catalog_furniture c on c.id = f.item where f.user_id = u), 0) $$;
create or replace function public.game_owner_level(u uuid) returns int language sql stable security definer set search_path = public as
$$ select greatest(1, 1 + floor(log(2::numeric, 1 + public.game_networth(u) / 150.0))::int) $$;

create or replace function public.game_require_owner(u uuid, p_building int) returns void language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.claims where user_id = u and building = p_building) then raise exception 'You can only go inside your own claimed building.'; end if;
end $$;

/* ---------- what the browser reads ---------- */
create or replace function public.rpc_game_state() returns jsonb language plpgsql security definer set search_path = public as $$
declare u uuid := auth.uid(); pl public.game_players; bz public.game_business; sup boolean;
begin
  if u is null then raise exception 'Sign in first'; end if;
  pl := public.game_ensure(u); select coalesce(supporter, false) into sup from public.profiles where id = u; select * into bz from public.game_business where user_id = u;
  return jsonb_build_object(
    'coins', pl.coins, 'seed', pl.seed, 'now', (extract(epoch from now()) * 1000)::bigint,
    'player', jsonb_build_object('boost2x', pl.boost2x, 'supporter', sup, 'longOffline', pl.long_offline),
    'business', case when bz.user_id is null then '{}'::jsonb else jsonb_build_object(bz.building::text, jsonb_build_object('type', bz.type, 'level', bz.level, 'workers', bz.workers, 'manager', bz.manager, 'lastCollect', (extract(epoch from bz.last_collect) * 1000)::bigint, 'fixedAt', 0)) end,
    'furniture', coalesce((select jsonb_object_agg(q.building::text, q.arr) from (select f.building, jsonb_agg(jsonb_build_object('uid', f.uid, 'id', f.item, 'x', f.x, 'z', f.z, 'rot', f.rot, 'wall', f.wall) order by f.uid) arr from public.game_furniture f where f.user_id = u group by f.building) q), '{}'::jsonb),
    'starter', coalesce((select jsonb_object_agg(s.building::text, 1) from public.game_starter s where s.user_id = u), '{}'::jsonb),
    'visits', coalesce((select jsonb_object_agg(v.building::text, v.n) from public.game_visits v where v.building in (select c.building from public.claims c where c.user_id = u)), '{}'::jsonb),
    'claim', (select c.building from public.claims c where c.user_id = u)
  );
end $$;

/* ---------- actions ---------- */
create or replace function public.rpc_game_enter(p_building int, p_kind text) returns jsonb language plpgsql security definer set search_path = public as $$
declare u uuid := auth.uid();
begin
  perform public.check_rate('game_enter', 120, interval '1 hour'); perform public.game_require_owner(u, p_building); perform public.game_ensure(u);
  insert into public.game_visits (building, n) values (p_building, 1) on conflict (building) do update set n = game_visits.n + 1;
  if p_kind = 'home' and not exists (select 1 from public.game_starter where user_id = u and building = p_building) then
    insert into public.game_starter (user_id, building) values (u, p_building);
    insert into public.game_furniture (user_id, building, item, x, z, rot) values (u, p_building, 'bed', -3.8, -3.0, 0), (u, p_building, 'lamp', -4.5, 2.8, 0), (u, p_building, 'plant', 4.4, -3.4, 0);
  end if;
  return public.rpc_game_state();
end $$;

create or replace function public.rpc_game_place(p_building int, p_item text, p_x real, p_z real, p_rot int, p_wall text) returns jsonb language plpgsql security definer set search_path = public as $$
declare u uuid := auth.uid(); pl public.game_players; price int; new_uid bigint;
begin
  perform public.check_rate('game_place', 300, interval '1 hour'); perform public.game_require_owner(u, p_building); pl := public.game_ensure(u);
  select c.price into price from public.game_catalog_furniture c where c.id = p_item; if price is null then raise exception 'Unknown item.'; end if;
  if abs(p_x) > 6 or abs(p_z) > 5 or p_rot not between 0 and 3 or (p_wall is not null and p_wall not in ('left', 'back')) then raise exception 'That spot is outside the room.'; end if;
  if (select count(*) from public.game_furniture where user_id = u and building = p_building) >= 60 then raise exception 'This room is full.'; end if;
  if pl.coins < price then raise exception 'Not enough City Coins.'; end if;
  update public.game_players set coins = coins - price where user_id = u;
  insert into public.game_furniture (user_id, building, item, x, z, rot, wall) values (u, p_building, p_item, p_x, p_z, p_rot, p_wall) returning uid into new_uid;
  return jsonb_build_object('uid', new_uid) || public.rpc_game_state();
end $$;

create or replace function public.rpc_game_move(p_uid bigint, p_x real, p_z real, p_rot int, p_wall text) returns jsonb language plpgsql security definer set search_path = public as $$
declare u uuid := auth.uid();
begin
  perform public.check_rate('game_move', 600, interval '1 hour'); perform public.game_ensure(u);
  if abs(p_x) > 6 or abs(p_z) > 5 or p_rot not between 0 and 3 or (p_wall is not null and p_wall not in ('left', 'back')) then raise exception 'That spot is outside the room.'; end if;
  update public.game_furniture set x = p_x, z = p_z, rot = p_rot, wall = p_wall where uid = p_uid and user_id = u; if not found then raise exception 'Item not found.'; end if;
  return public.rpc_game_state();
end $$;

create or replace function public.rpc_game_sell(p_uid bigint) returns jsonb language plpgsql security definer set search_path = public as $$
declare u uuid := auth.uid(); price int;
begin
  perform public.check_rate('game_sell', 300, interval '1 hour'); perform public.game_ensure(u);
  select c.price into price from public.game_furniture f join public.game_catalog_furniture c on c.id = f.item where f.uid = p_uid and f.user_id = u; if price is null then raise exception 'Item not found.'; end if;
  delete from public.game_furniture where uid = p_uid and user_id = u;
  update public.game_players set coins = coins + floor(price * 0.5) where user_id = u;
  return public.rpc_game_state();
end $$;

create or replace function public.rpc_game_open_business(p_building int, p_type text) returns jsonb language plpgsql security definer set search_path = public as $$
declare u uuid := auth.uid(); pl public.game_players; cat public.game_catalog_business; cost bigint;
begin
  perform public.check_rate('game_open', 30, interval '1 hour'); perform public.game_require_owner(u, p_building); pl := public.game_ensure(u);
  select * into cat from public.game_catalog_business where type = p_type; if cat.type is null then raise exception 'Unknown business.'; end if;
  if exists (select 1 from public.game_business where user_id = u) then raise exception 'You already run a business.'; end if;
  if public.game_owner_level(u) < cat.unlock_owner then raise exception 'Your owner level is too low for that business.'; end if;
  cost := case when p_type = 'lemonade' then 0 else cat.base * 5 end; if pl.coins < cost then raise exception 'Not enough City Coins.'; end if;
  update public.game_players set coins = coins - cost where user_id = u;
  insert into public.game_business (user_id, building, type) values (u, p_building, p_type);
  return public.rpc_game_state();
end $$;

create or replace function public.rpc_game_collect() returns jsonb language plpgsql security definer set search_path = public as $$
declare u uuid := auth.uid();
begin perform public.check_rate('game_collect', 600, interval '1 hour'); perform public.game_settle(u); return public.rpc_game_state(); end $$;

create or replace function public.rpc_game_upgrade() returns jsonb language plpgsql security definer set search_path = public as $$
declare u uuid := auth.uid(); bz public.game_business; cost bigint; pl public.game_players;
begin
  perform public.check_rate('game_upgrade', 300, interval '1 hour'); perform public.game_settle(u); pl := public.game_ensure(u);
  select * into bz from public.game_business where user_id = u; if bz.user_id is null then raise exception 'You have no business.'; end if;
  if bz.level >= 50 then raise exception 'Already at the top level.'; end if;
  cost := public.game_upgrade_cost(bz.type, bz.level); if pl.coins < cost then raise exception 'Not enough City Coins.'; end if;
  update public.game_players set coins = coins - cost where user_id = u; update public.game_business set level = level + 1 where user_id = u;
  return public.rpc_game_state();
end $$;

create or replace function public.rpc_game_worker() returns jsonb language plpgsql security definer set search_path = public as $$
declare u uuid := auth.uid(); bz public.game_business; cost bigint; pl public.game_players;
begin
  perform public.check_rate('game_worker', 120, interval '1 hour'); pl := public.game_ensure(u); select * into bz from public.game_business where user_id = u; if bz.user_id is null then raise exception 'You have no business.'; end if;
  if bz.workers >= 1 + floor(bz.level / 5) then raise exception 'No free worker slots. Upgrade the business first.'; end if;
  cost := public.game_worker_cost(bz.type, bz.workers); if pl.coins < cost then raise exception 'Not enough City Coins.'; end if;
  update public.game_players set coins = coins - cost where user_id = u; update public.game_business set workers = workers + 1 where user_id = u;
  return public.rpc_game_state();
end $$;

create or replace function public.rpc_game_manager() returns jsonb language plpgsql security definer set search_path = public as $$
declare u uuid := auth.uid(); bz public.game_business; cost bigint; pl public.game_players;
begin
  perform public.check_rate('game_manager', 60, interval '1 hour'); perform public.game_settle(u); pl := public.game_ensure(u); select * into bz from public.game_business where user_id = u; if bz.user_id is null then raise exception 'You have no business.'; end if;
  if bz.manager then raise exception 'You already have a manager.'; end if;
  cost := public.game_manager_cost(bz.type); if pl.coins < cost then raise exception 'Not enough City Coins.'; end if;
  update public.game_players set coins = coins - cost where user_id = u; update public.game_business set manager = true where user_id = u;
  return public.rpc_game_state();
end $$;

/* ---------- who can call what ---------- */
revoke all on function public.game_ensure(uuid), public.game_settle(uuid), public.game_networth(uuid), public.game_owner_level(uuid), public.game_require_owner(uuid, int), public.game_pending(public.game_business, public.game_players, boolean) from public, anon, authenticated;
revoke all on function public.rpc_game_state(), public.rpc_game_enter(int, text), public.rpc_game_place(int, text, real, real, int, text), public.rpc_game_move(bigint, real, real, int, text), public.rpc_game_sell(bigint),
  public.rpc_game_open_business(int, text), public.rpc_game_collect(), public.rpc_game_upgrade(), public.rpc_game_worker(), public.rpc_game_manager() from public, anon;
grant execute on function public.rpc_game_state(), public.rpc_game_enter(int, text), public.rpc_game_place(int, text, real, real, int, text), public.rpc_game_move(bigint, real, real, int, text), public.rpc_game_sell(bigint),
  public.rpc_game_open_business(int, text), public.rpc_game_collect(), public.rpc_game_upgrade(), public.rpc_game_worker(), public.rpc_game_manager() to authenticated;
