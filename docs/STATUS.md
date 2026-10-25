# Where everything stands (phases 1 to 8)

Legend: DONE = built and tested here. NEEDS YOU = built, but waiting for a step only you can do. NOT BUILT = not started.

## Phases 1 to 4
| Piece | State |
|---|---|
| 3D city, 100k structures, milestones, landmarks, hosting, YouTube auto count | DONE |
| Instagram automatic count | NEEDS YOU (Meta developer app; until then tell Claude the number) |
| Accounts, claiming, Stars, levels, quests, crates, treasure hunt, predictions, votes, leaderboards, giveaways, admin page | DONE (live) |
| Game-style hub, welcome carousel, celebrations | DONE |
| Stripe test-mode links + Support tab | DONE (test mode only) |
| Supporter badge after payment | NEEDS YOU: paste `STRIPE_WEBHOOK_SECRET` (the webhook function and Stripe webhook already exist) and run `supabase/payments.sql` (done) |
| Going live with real payments | NOT YET: only after a lawyer reviews `docs/legal-drafts` and you decide |

## Phase 5 (interiors + tycoon), server side
- `supabase/tycoon.sql` + `gamestore.js`: coins, business, furniture and homes decided by the database; the website only sends actions. Only the owner of a claimed building can go inside. **NEEDS YOU: run `supabase/tycoon.sql`.**
- Random daily events (rush hour...) work in the `?demo=1` version only; the live server pays plain income plus permanent boosts.
- Visiting other people's homes and likes: NOT BUILT.

## Phase 6 (retention and community)
| Piece | State |
|---|---|
| 3 daily + 5 weekly quests with weekly chest | DONE in `supabase/community.sql` + hub |
| 28-day login calendar (rare cosmetics on days 7/14/21/28) | DONE |
| Weekly streak freeze | DONE (automatic) |
| City news feed, follow friends, friends' feed | DONE (hub, City tab). The 3D billboard ticker is NOT BUILT |
| 100+ achievements | DONE (106). The 3D trophy room is NOT BUILT (list is in Rewards tab) |
| Co-op community projects with contribution cap | DONE (admin creates, players chip in). The giant 3D landmark that appears is NOT BUILT |
| Reports, bans, admin report queue, name filter | DONE |
| Real estate (buy lots, blueprints, tenants, property value) | NOT BUILT |
| Neighborhoods, mayors, elections, district competitions | NOT BUILT |
| Seasons and City Pass (paid tier) | NOT BUILT |
| Opt-in email/push notifications | NOT BUILT (needs Brevo set up first) |
| NPC citizens with requests | NOT BUILT |
| Collections (furniture sets) | NOT BUILT |

## Phase 7 (get ready to publish)
| Piece | State |
|---|---|
| Security review, automated audit script | DONE: `docs/SECURITY-REVIEW.md`, `node scripts/security-audit.mjs` |
| Tests: economy, points, giveaway, generator (100k), tycoon parity, SQL syntax | DONE (`docs/TESTING.md`) |
| Load test script | DONE (`scripts/load-test.mjs`); run it on staging |
| Test on real iPhone/Android/Safari/Firefox/Edge | NEEDS YOU (checklist in `docs/LAUNCH-CHECKLIST.md`) |
| Staging site + approval flow, daily backups | Written down in `docs/STAGING-AND-BACKUPS.md`; NEEDS YOU to create the second project |
| Loading bar, Low/Medium/High quality (auto-picked), reduce motion, color-blind colors, keyboard focus outlines | DONE |
| Installable app (PWA), icons, offline fallback | DONE |
| Help/FAQ page, in-site bug report with device info | DONE (bug report needs `community.sql`) |
| Share preview image and tags | DONE (static image; automatic per-share snapshots NOT BUILT) |
| Error tracking (Sentry) and analytics (Plausible) | Code ready, OFF until you add them to `config.js` |
| Admin stats (active players, day 1/7/30 retention, revenue) | DONE (needs `community.sql`) |
| Invite-only beta, invite codes, one-click beta reset | DONE (needs `community.sql`) |
| Final legal review | NEEDS YOU (lawyer); flags are in `docs/LAUNCH-CHECKLIST.md` |

## Phase 8 (growth and content tools)
| Piece | State |
|---|---|
| Record clips (flyover, growth time-lapse) in any shape | DONE: open `/?studio=1` (WebM; see `docs/CONTENT-TOOLS.md`) |
| Milestone countdown page | DONE: `/countdown.html` |
| Embeddable widget | DONE: `/?embed=1` in an iframe |
| Weekly recap video, building of the day, spotlight, referral dashboard | NOT BUILT |
