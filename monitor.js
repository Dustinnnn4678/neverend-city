// Optional monitoring. Both tools stay OFF until you fill in config.js (MONITOR). Nothing is sent to anyone before that.
//  - Plausible: privacy-friendly visit counts (no cookies, no personal data).
//  - Sentry: emails/alerts you when the site throws an error.
import { MONITOR } from './config.js';

if (MONITOR && MONITOR.plausibleDomain) {
  const s = document.createElement('script'); s.defer = true; s.dataset.domain = MONITOR.plausibleDomain; s.src = 'https://plausible.io/js/script.js'; document.head.appendChild(s);
}
if (MONITOR && MONITOR.sentryDsn) {
  const s = document.createElement('script'); s.src = 'https://browser.sentry-cdn.com/8.35.0/bundle.min.js'; s.crossOrigin = 'anonymous';
  s.onload = () => { try { window.Sentry.init({ dsn: MONITOR.sentryDsn, tracesSampleRate: 0, sendDefaultPii: false }); } catch (e) { /* ignore */ } };
  document.head.appendChild(s);
}
