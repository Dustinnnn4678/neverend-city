# Security review (Phase 7)

Reviewed: every SQL file in `supabase/`, the browser code that talks to Supabase, and the files the site serves.
Re-run any time: `node scripts/security-audit.mjs` (it fails if a table has no row level security, a function is callable by the public, an admin function skips `require_admin()`, or a secret key appears in a served file).

## How the protection works
1. **The browser is never trusted.** It only calls `rpc_*` functions with an action name. Points, coins, prices, crates, quests and payments are decided inside the database from timestamps and its own price tables. Editing the page in dev tools cannot create coins or Stars. (Local `?demo=1` is separate and has no server.)
2. **Row level security on every table.** Players can read only their own rows. Nobody can insert, update or delete directly: there are no write policies, only functions.
3. **Locked-down functions.** Every function is revoked from the public and anonymous roles. Only signed-in players can call `rpc_*`; `admin_*` also check `require_admin()` inside.
4. **Owner-only buildings.** Going inside, furniture and businesses require that the caller has claimed that exact building (`game_require_owner`).
5. **Rate limits** on every action (`check_rate`), plus bans and the invite-only beta gate (both enforced in `check_rate`, so they cover every action).
6. **Stripe** purchases unlock only after the webhook verifies Stripe's signature (`supabase/functions/stripe-webhook`). A payment can only give the cosmetic supporter badge.
7. **Secrets.** The website contains only the public keys (Supabase publishable key, Stripe payment-link URLs). The Supabase service key, Stripe secret key, webhook secret and YouTube key live only in Supabase/GitHub secrets. The audit script scans for leaks.

## Findings from this review
| Finding | Status |
|---|---|
| `quest_defs` table had no row level security | Fixed in `community.sql` |
| The YouTube API key had been pasted in chat once | Replaced with a new restricted key; old one deleted |
| Free email sender is small (rate limits password-reset mail) | Brevo SMTP entered in Supabase; reset-email delivery not yet confirmed (send yourself one and check spam) |
| No CAPTCHA on sign-up, so bots could create accounts | OPEN: turn on Supabase **Authentication → Attack Protection** (CAPTCHA) before public launch |
| Account email confirmation is OFF (instant sign-up) | Accepted trade-off; bots are limited by the per-action rate limits and by turning on CAPTCHA |
| Dependencies | The site has no npm dependencies. Three.js is loaded from a pinned CDN version (r170). Nothing to `npm audit`. |
| Daily events (rush hour) are demo-only | Not a risk; the server ignores them |
| Backups | Supabase free plan has no automatic daily backups: see `docs/STAGING-AND-BACKUPS.md` |

## Still to check by a human before launch
- Run the load test against **staging** (`node scripts/load-test.mjs 200 5`).
- Ask a second person to try to read another player's data with their own account (they should get empty results).
- Have a lawyer review the legal drafts.
