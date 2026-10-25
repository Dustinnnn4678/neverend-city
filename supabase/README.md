# Setting up the Phase 3 backend (Supabase)

Everything here is written but **not yet run**, because it needs your Supabase account. Free tier is enough to start.
Do these steps in order. Do not paste any key into chat; tell me when a step is done and I will take the next one.

## 1. Create the project (about 3 minutes)
1. Go to **supabase.com**, click **Start your project**, and sign in with GitHub.
2. Click **New project**. Name it `neverend-city`, pick the region closest to you, and make a **database password**. Save it in a password manager. You will not need it again.
3. Wait about two minutes until the project says it is ready.

## 2. Create the tables and rules
1. In the left menu click **SQL Editor**, then **New query**.
2. Open `supabase/schema.sql` from this project, copy everything, paste it, and press **Run**.
3. New query again: do the same with `supabase/seed.sql` (levels, cosmetics, crate odds).
4. If either one shows a red error, copy the error text to me. I will fix the file and you run it again.

## 3. Turn on sign-in (email + password, instant, no emailed link)
1. **Authentication** then **Sign In / Providers**: open **Email**. Keep **Enable Email provider** on and turn **Confirm email OFF**, so a new visitor is signed in the moment they create an account (no email to wait for, so 1,000 people can join in a day).
2. **Authentication** then **URL Configuration**: set **Site URL** to `https://dustinnnn4678.github.io/neverend-city/` and add the same address plus `/**` and `http://localhost:8765/**` to **Redirect URLs** (used by the password-reset link).
3. **Authentication** then **Rate Limits**: sign-ups and sign-ins default to a few dozen per 5 minutes per visitor address, which is fine. Later, turn on **Attack Protection** (CAPTCHA) if bots show up.
4. Emails are now only sent for **forgotten-password resets**. Supabase's built-in sender is tiny; add a free email service (Brevo) before launch.

## 4. Copy two values into `config.js`
**Project Settings** then **API**: copy **Project URL** and the **anon public** key into `config.js`. These two are safe to publish.
The **service_role** key is secret. Never put it in a file in this project.

## 5. Make yourself the admin
Sign in once on the site (or `admin.html`) with your email so your account exists. Then in the SQL Editor run:
```sql
update public.profiles set is_admin = true where id = (select id from auth.users where email = 'YOUR-EMAIL-HERE');
```

## 6. YouTube comment check (optional)
Create an Edge Function named `verify-youtube`, paste `supabase/functions/verify-youtube/index.ts`, add the secrets listed at the top of that file, and schedule it every 5 minutes. The function calls `service_verify_claim`; run this once in the SQL Editor to create it:
```sql
create or replace function public.service_verify_claim(p_id bigint) returns void language plpgsql security definer set search_path = public as $$
declare c public.claims;
begin
  if coalesce(auth.role(), 'service_role') <> 'service_role' then raise exception 'Not allowed'; end if;
  select * into c from public.claims where id = p_id; if not found then return; end if;
  update public.claims set status = 'verified', verified_at = now() where id = p_id;
  if not exists (select 1 from public.verified_platforms where user_id = c.user_id and platform = c.platform) then
    insert into public.verified_platforms (user_id, platform) values (c.user_id, c.platform); perform public.award(c.user_id, 100, 'verified ' || c.platform);
  end if;
end $$;
revoke all on function public.service_verify_claim(bigint) from public, anon, authenticated;
```
Instagram comments cannot be read without the Meta token, so verify those by hand in `admin.html` (the code is on the claim row).

## 7. Keep the daily golden objects fresh
Each day open `admin.html`, **Milestones and events**, and press **Create today's 3**. (A scheduled job can do this later.)

## 8. Later phases (run each file once, in this order, after schema.sql and seed.sql)
1. `payments.sql`: payment records and the supporter badge.
2. `tycoon.sql`: homes, furniture and businesses (City Coins) decided by the database.
3. `community.sql`: quests, 28-day calendar, news feed, friends, achievements, co-op projects, reports, bans, invite-only beta, admin stats.
Open the file, copy everything, paste into **SQL Editor → New query**, press **Run**. See `docs/LAUNCH-CHECKLIST.md` for the full list.

## What the website does once connected
The browser only calls the `rpc_*` functions. Points, crates, golden objects and claims are decided in the database, so editing the page cannot create points. Rate limits are built in. Emails are never shown anywhere public; the public views only expose usernames people chose to show.

## Fair giveaways
In `admin.html` > **Giveaways**: create it with your official rules page, press **Commit** (publishes a fingerprint of a secret seed), announce the fingerprint, and after the close time press **Draw**. Anyone can re-check the winners with `node scripts/verify-giveaway.mjs <seed> <winner_count> <entrant ids...>`. Always run giveaways as "no purchase necessary" and follow Instagram's promotion guidelines (no tagging-for-entry tricks, say it is not sponsored by Instagram).
