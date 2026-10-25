# Tests you can run

From the project folder (needs Node.js):

| Command | What it checks |
|---|---|
| `node scripts/economy-test.mjs` | City Coins rules (income, offline cap, upgrade prices, net worth) |
| `node scripts/points-test.mjs` | Stars, streaks, levels, crate odds, name filter |
| `node scripts/giveaway-test.mjs` | The fair, verifiable giveaway draw |
| `node scripts/gen-test.mjs` | The city generator: 100,000 structures, no overlaps, same city every time |
| `node scripts/tycoon-parity-test.mjs` | The prices and rules in `supabase/tycoon.sql` equal `economy.js` |
| `node scripts/security-audit.mjs` | Row level security, locked functions, no leaked secrets |
| `node scripts/load-test.mjs 50 5` | Simulated visitors reading public data (run on staging) |

SQL syntax check (optional): `npm i libpg-query` in a scratch folder and parse each file in `supabase/` (this is how the new SQL was checked, including the bodies of every function).

Not automated yet: Stripe webhook end-to-end (do one test payment with card `4242 4242 4242 4242` after pasting `STRIPE_WEBHOOK_SECRET`), and browser/phone testing (see `docs/LAUNCH-CHECKLIST.md`).
