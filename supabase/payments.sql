-- Phase 4: payments. Run once in the Supabase SQL Editor (safe to run again).
-- Stripe tells the stripe-webhook function about a payment; the function calls service_record_payment.
-- A payment only ever gives the cosmetic "supporter" badge. It never changes points, levels, counts or boards.

alter table public.profiles add column if not exists supporter boolean not null default false;

create table if not exists public.payments (
  id bigint generated always as identity primary key,
  stripe_event_id text unique not null,
  user_id uuid references public.profiles(id) on delete set null,
  kind text not null check (kind in ('supporter','tip')),
  amount_cents int not null check (amount_cents >= 0),
  livemode boolean not null default false,
  created_at timestamptz not null default now()
);
alter table public.payments enable row level security;
drop policy if exists payments_own on public.payments;
create policy payments_own on public.payments for select to authenticated using (user_id = auth.uid());
drop policy if exists payments_admin on public.payments;
create policy payments_admin on public.payments for select to authenticated using (public.is_admin());

create or replace function public.service_record_payment(p_event text, p_user uuid, p_kind text, p_amount int, p_live boolean) returns boolean
language plpgsql security definer set search_path = public as $$
begin
  if coalesce(auth.role(), 'service_role') <> 'service_role' then raise exception 'Not allowed'; end if;
  insert into public.payments (stripe_event_id, user_id, kind, amount_cents, livemode)
    values (p_event, (select id from public.profiles where id = p_user), p_kind, p_amount, p_live) on conflict (stripe_event_id) do nothing;
  if not found then return false; end if;                       -- already handled (Stripe retries)
  if p_kind = 'supporter' and p_user is not null then update public.profiles set supporter = true where id = p_user; end if;
  return true;
end $$;
revoke all on function public.service_record_payment(text, uuid, text, int, boolean) from public, anon, authenticated;

-- public view gains a supporter flag (shown as a star on name plates)
create or replace view public.public_claims as
  select c.building, case when c.opt_in then c.username end as display_name, c.status, coalesce(p.supporter, false) as supporter
  from public.claims c left join public.profiles p on p.id = c.user_id;
grant select on public.public_claims to anon, authenticated;
