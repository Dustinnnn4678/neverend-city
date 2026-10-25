# Server plan for Phases 3 to 5 (not built yet)

GitHub Pages can only serve files. Accounts, coins, payments and leaderboards must run on a server that the
browser cannot tamper with. This is the plan, and what each piece needs from you.

## What already exists
- `economy.js`: all City Coins rules (income curves, upgrade prices, offline cap, boosts, daily events, net worth). It has no
  browser code, so the **same file runs on the server** and is the source of truth. `node scripts/economy-test.mjs` checks it.
- `interior.js` + `store.js`: the 3D interiors and a demo save in the browser (`?demo=1`). `store.js` is the only file that
  must be replaced to talk to the server.

## Proposed stack (free to start)
| Piece | Choice | Why |
|---|---|---|
| API | Cloudflare Workers | Free tier, no server to maintain, runs JavaScript (so it can import `economy.js`) |
| Database | Cloudflare D1 (SQLite) | Free tier, simple tables |
| Sign-in | "Sign in with Google" (Google Identity) | No passwords for you to store |
| Payments | Stripe Checkout + webhooks | As specified; test mode first |
| Email receipts | Stripe's built-in receipts (turn on in dashboard) | No email service to run |
| Admin | A page protected by your Google account only | Refunds, bans, approvals, CSV |

## Tables (summary)
`users`, `claims` (building index -> user), `homes` (furniture), `businesses`, `purchases`, `sponsors`, `votes`, `seasons`.

## Rules the server enforces (never the browser)
1. Coins are only changed by server code from timestamps. The browser sends actions ("upgrade", "collect"), never amounts.
2. A purchase unlocks something **only after** the Stripe webhook arrives and its signature is verified.
3. Under-18 accounts: the buyer ticks "I am 18+ or have a parent's permission" before checkout, and the server blocks more
   than $20 per rolling 7 days for accounts that said under 18.
4. Coins are never sold, cashed out or transferred. There is no trading endpoint.
5. Nothing purchased changes the follower/subscriber count or the Self-Made board.
6. Paid items never involve random rewards.

## Order of work (each step needs something from you)
1. **Phase 3** (accounts, claiming a building, points, leaderboards, treasure hunt, predictions): I have not received this spec.
2. Create a free **Cloudflare** account (you), I write the Worker and database setup, you run one deploy command I give you.
3. Create a **Stripe** account (you) and stay in **test mode**; I write Checkout + webhook code and test with test cards.
4. Add the Google sign-in client ID (you create it in Google Cloud; I tell you the clicks).
5. Only when you say so: switch Stripe to live mode, after reviewing the legal drafts in `docs/legal-drafts`.

## Stripe test cards to try later
Card `4242 4242 4242 4242`, any future date, any CVC, any ZIP. Declined card: `4000 0000 0000 0002`.
