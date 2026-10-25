# Launch checklist (tick these before going public)

## A. Database (Supabase SQL Editor, in this order, each once)
- [ ] `schema.sql`, `seed.sql` (done earlier)
- [ ] `payments.sql` (done)
- [ ] `tycoon.sql` (homes, furniture, businesses)
- [ ] `community.sql` (quests, calendar, feed, achievements, co-op, reports, beta, admin stats)
- [ ] Authentication → Attack Protection → turn on CAPTCHA
- [ ] Make sure your admin account still shows "admin" at `/admin.html`

## B. Money (test mode until you say otherwise)
- [ ] Paste `STRIPE_WEBHOOK_SECRET` into Supabase Edge Function secrets, make one test payment ($5, card 4242 4242 4242 4242), confirm the ★ Supporter badge appears
- [ ] Lawyer reviews `docs/legal-drafts/*` (terms, privacy, refund policy, giveaway rules) **before** live Stripe
- [ ] Only then: new Stripe live account details (yours to enter), live payment links in `config.js`, set `test: false`

## C. Soft launch (invite-only)
- [ ] Admin → Beta and community → Make codes (e.g. 50), Turn on beta mode
- [ ] Send codes to your first 50 to 100 followers. They enter the code under Quests → More
- [ ] Collect feedback (the Report a bug button and the Help page)
- [ ] Before public launch: "Reset beta data" (type RESET BETA), Turn off beta mode

## D. Test on real devices
- [ ] iPhone Safari, Android Chrome, desktop Chrome, Safari, Firefox, Edge
- [ ] On a slow connection (Chrome DevTools → Network → Slow 4G): the city should be usable in about 5 seconds; quality "Low" should help
- [ ] Install to the home screen (iPhone: Share → Add to Home Screen)
- [ ] Keyboard only: Tab through the buttons; turn on Reduce motion and Color-blind colors in the ⚙ menu

## E. Watching the site
- [ ] Plausible account (privacy-friendly stats): put your domain in `config.js` → `MONITOR.plausibleDomain`
- [ ] Sentry account (error alerts): put the DSN in `config.js` → `MONITOR.sentryDsn`
- [ ] Check Admin → Stats a few days after the beta starts (day 1 / 7 / 30 return rates)

## F. Things a lawyer or professional should look at (flags)
- Under-13 rule: you say 13+, which matches Instagram/YouTube, but if you collect emails, check COPPA/UK Age-Appropriate Design requirements for kids 13 to 17.
- Giveaways: "no purchase necessary", official rules page, "not sponsored by Instagram", local sweepstakes/lottery laws, tax on prizes.
- Crates: they are earned only (never bought) and odds are shown; some countries still regulate loot boxes. Keep it that way.
- Virtual coins: never cashed out or traded (keeps them out of money-transmitter rules). Do not add trading.
- Payments: refund policy text, sales tax/VAT on the supporter pack, a business entity and bank account for Stripe live mode.
- Privacy: you store emails and usernames; you need a real privacy policy, a way to delete data (exists: More → Delete my account) and a contact address.
- Using the names "Instagram" and "YouTube": use their guidelines for logos; do not imply they endorse you.
- Real-name or look-alike content in usernames: the filter blocks obvious bad words only; moderators handle the rest.
