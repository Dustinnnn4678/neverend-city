// Supabase connection for the website. The publishable key is meant to be public: it can only do what the
// database rules allow. NEVER put a secret / service_role key in this file.
export const SUPABASE = { url: 'https://pxqjpcmzifwrmbcrlvfo.supabase.co', anonKey: 'sb_publishable_ztUV_rq4dk_rkRJblQwo6Q_BW0gYh55' };

// Monitoring (leave empty until you sign up; see docs/LAUNCH-CHECKLIST.md). plausibleDomain: e.g. 'dustinnnn4678.github.io'. sentryDsn: the "DSN" web address Sentry gives you (safe to be public).
export const MONITOR = { plausibleDomain: '', sentryDsn: '' };

// Stripe Payment Links (public by design). TEST MODE links: no real money moves. Replace with live links only when you decide to go live.
export const STRIPE_LINKS = { supporter: 'https://buy.stripe.com/test_cNicMY3BL9AUdkQdiG9k400', tip: 'https://buy.stripe.com/test_4gMdR2egpbJ2fsY7Ym9k401', test: true };