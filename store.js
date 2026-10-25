// DEMO storage for homes, furniture and businesses. Saved only in this browser (localStorage).
// When the real server exists, replace this file with one that talks to the server; the economy rules
// in economy.js already run server-side from timestamps, so the browser can never invent coins.
const KEY = 'neverend.demo.v1';

export function visitorDefault() {
  return { points: 0, streak: 0, lastDay: -1, goldenFound: {}, crates: 0, owned: [], equipped: {}, claim: null, verified: {}, predictions: {}, votes: {}, referrals: 0, ageOk: false, seenMilestones: [], eventStart: 0, bestStreak: 0 };
}
function fresh() {
  return { v: 1, coins: 250, seed: 1 + Math.floor(Math.random() * 1e6), furniture: {}, business: {}, likes: {}, visits: {}, starter: {}, uid: 1, player: { boost2x: false, supporter: false, longOffline: false }, visitor: visitorDefault() };
}
function load() {
  try { const raw = localStorage.getItem(KEY); if (raw) { const s = JSON.parse(raw); if (s && s.v === 1) { if (!s.visitor) s.visitor = visitorDefault(); return s; } } } catch (e) { /* private mode: run in memory */ }
  return fresh();
}
export const store = {
  state: load(),
  save() { try { localStorage.setItem(KEY, JSON.stringify(this.state)); } catch (e) { /* ignore */ } },
  reset() { this.state = fresh(); this.save(); },
  canAfford(n) { return this.state.coins >= n; },
  spend(n) { if (n > this.state.coins) return false; this.state.coins -= n; this.save(); return true; },
  earn(n) { this.state.coins += Math.max(0, Math.floor(n)); this.save(); },
  get v() { return this.state.visitor; },
  furnitureOf(id) { return (this.state.furniture[id] ||= []); },
  nextUid() { return this.state.uid++; },
  snap(v, force) { // remember net worth over time for the stats chart
    const h = (this.state.history ||= []), last = h[h.length - 1];
    if (force || !last || (Date.now() - last.t > 60000 && last.v !== v)) { h.push({ t: Date.now(), v }); if (h.length > 200) h.shift(); this.save(); }
  },
};
