// Talks to your Supabase database with plain web requests (no extra library).
// Sign-in is an emailed magic link. The browser only ever sends actions (rpc_* functions); the database decides all
// points, crates and claims, so editing this page cannot create points.
import { SUPABASE } from './config.js';

export const remoteConfigured = !!(SUPABASE.url && SUPABASE.anonKey);
const KEY = 'neverend.session.v1';

function b64json(t) { try { return JSON.parse(decodeURIComponent(escape(atob(t.replace(/-/g, '+').replace(/_/g, '/'))))); } catch (e) { return {}; } }

export class Remote {
  constructor() { this.s = null; try { this.s = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { /* private mode */ } }
  get signedIn() { return !!(this.s && this.s.access_token); }
  get email() { return this.s ? this.s.email : ''; }
  _save() { try { if (this.s) localStorage.setItem(KEY, JSON.stringify(this.s)); else localStorage.removeItem(KEY); } catch (e) { /* ignore */ } }

  /* Call once at startup: picks up the session when the visitor comes back from their email link. */
  async init() {
    const h = location.hash.replace(/^#/, '');
    if (h.includes('access_token=')) {
      const p = new URLSearchParams(h), at = p.get('access_token'); if (at) { const c = b64json(at.split('.')[1] || ''); this.s = { access_token: at, refresh_token: p.get('refresh_token'), exp: c.exp || 0, email: c.email || '', uid: c.sub }; this._save(); }
      history.replaceState(null, '', location.pathname + location.search);
    } else if (h.includes('error_description=')) { history.replaceState(null, '', location.pathname + location.search); this.lastError = new URLSearchParams(h).get('error_description'); }
    if (this.s && this.s.exp && this.s.exp * 1000 < Date.now() + 60000) await this._refresh();
  }
  async _refresh() {
    if (!this.s || !this.s.refresh_token) { this.s = null; this._save(); return; }
    const r = await fetch(`${SUPABASE.url}/auth/v1/token?grant_type=refresh_token`, { method: 'POST', headers: { apikey: SUPABASE.anonKey, 'Content-Type': 'application/json' }, body: JSON.stringify({ refresh_token: this.s.refresh_token }) });
    if (!r.ok) { this.s = null; this._save(); return; }
    const j = await r.json(), c = b64json((j.access_token || '').split('.')[1] || ''); this.s = { access_token: j.access_token, refresh_token: j.refresh_token, exp: c.exp || 0, email: c.email || this.s.email, uid: c.sub }; this._save();
  }
  async signInEmail(email) {
    const r = await fetch(`${SUPABASE.url}/auth/v1/otp?redirect_to=${encodeURIComponent(location.origin + location.pathname)}`, { method: 'POST', headers: { apikey: SUPABASE.anonKey, 'Content-Type': 'application/json' }, body: JSON.stringify({ email, create_user: true }) });
    if (!r.ok) { const j = await r.json().catch(() => ({})); throw new Error(j.msg || j.error_description || j.message || 'Could not send the sign-in email'); }
  }
  signOut() { this.s = null; this._save(); }

  async api(path, opts = {}) {
    if (this.s && this.s.exp && this.s.exp * 1000 < Date.now() + 30000) await this._refresh();
    const headers = { apikey: SUPABASE.anonKey, 'Content-Type': 'application/json', ...(this.signedIn ? { Authorization: 'Bearer ' + this.s.access_token } : {}), ...(opts.headers || {}) };
    const r = await fetch(SUPABASE.url + path, { ...opts, headers }); const text = await r.text(); let j = null; try { j = text ? JSON.parse(text) : null; } catch (e) { /* not json */ }
    if (!r.ok) throw new Error((j && (j.message || j.msg || j.error_description)) || `Request failed (${r.status})`);
    return j;
  }
  rpc(fn, args) { return this.api(`/rest/v1/rpc/${fn}`, { method: 'POST', body: JSON.stringify(args || {}) }); }
  select(q) { return this.api(`/rest/v1/${q}`); }

  /* Everything about the signed-in visitor, in the same shape the hub already uses. */
  async loadState(day) {
    const uid = this.s.uid, [p, c, owned, eq, found, pred, votes, ver] = await Promise.all([
      this.select(`profiles?id=eq.${uid}&select=*`), this.select(`claims?user_id=eq.${uid}&select=*`), this.select('owned?select=cosmetic_id'), this.select('equipped?select=slot,cosmetic_id'),
      this.select(`golden_found?day=eq.${day}&select=building`), this.select('predictions?select=milestone,day'), this.select('votes?select=milestone,option'), this.select('verified_platforms?select=platform'),
    ]), pr = p[0] || {}, cl = c[0];
    return {
      points: pr.points || 0, streak: pr.streak || 0, bestStreak: pr.best_streak || 0, lastDay: pr.last_day ?? -1, crates: pr.crates || 0, ageOk: !!pr.age_ok, referralCode: pr.referral_code || '', isAdmin: !!pr.is_admin,
      owned: owned.map(o => o.cosmetic_id), equipped: Object.fromEntries(eq.map(e => [e.slot, e.cosmetic_id])),
      claim: cl ? { building: cl.building, platform: cl.platform, username: cl.username, optIn: cl.opt_in, status: cl.status, code: cl.code } : null,
      goldenFound: { [day]: found.map(f => f.building) }, predictions: Object.fromEntries(pred.map(x => [x.milestone, x.day])), votes: Object.fromEntries(votes.map(x => [x.milestone, x.option])),
      verified: Object.fromEntries(ver.map(x => [x.platform, true])), referrals: 0, seenMilestones: [], eventStart: 0,
    };
  }
  publicClaims() { return this.select('public_claims?select=building,display_name,status'); }
  async goldenToday(day) { const r = await this.select(`golden_days?day=eq.${day}&select=buildings`); return r[0] ? r[0].buildings : []; }
  async liveEventStart() { const r = await this.select('live_events?select=started_at&order=started_at.desc&limit=1'); return r[0] ? Date.parse(r[0].started_at) : 0; }
  voteOptions() { return this.select('vote_options?select=milestone,option'); }
  async boards() { const [a, b, c] = await Promise.all([this.select('board_points?select=*'), this.select('board_streaks?select=*'), this.select('board_referrals?select=*')]); return { points: a, streaks: b, referrals: c }; }
}
