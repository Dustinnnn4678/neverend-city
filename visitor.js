// Visitor engagement (Phase 3): points, claims, wardrobe, crates, treasure hunt, votes, predictions, leaderboards.
// DEMO MODE: everything is saved in this browser. In the real version the same rules run on the server
// (see supabase/schema.sql); the browser only sends actions, never point amounts.
import { POINTS, dayIndex, dailyReward, nextStreak, pointsMultiplier, levelOf, nextLevel, LEVELS, goldenForDay, CRATE_ODDS, COSMETICS, openCrate, cratesForStreak, canBuy, nameOk, makeCode, DAY } from './points.js';
import { MILESTONES } from './city-gen.js';

const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmt = n => Math.round(n).toLocaleString();
const RARITY_COLOR = { common: '#b8c4d6', rare: '#4a9eff', epic: '#b06bff', legendary: '#ffb020' };
export const VOTE_OPTIONS = { // landmarks the owner approves for each milestone vote (edit freely)
  8000: ['Science museum', 'Zoo', 'Observatory'], 15000: ['Opera house', 'Aquarium', 'Space tower'], 30000: ['Giant statue', 'Crystal dome', 'Sky garden'],
};

export class Visitor {
  constructor({ store, notify, getCtx, applyFx, pickBuilding, showCrate, locateGolden }) {
    Object.assign(this, { store, notify, getCtx, applyFx, pickBuilding, showCrate, locateGolden }); this.tab = 'profile'; this.pickMode = false; this._ui();
  }
  get v() { return this.store.v; }
  get level() { return levelOf(this.v.points); }
  mult() { return pointsMultiplier(Date.now(), this.v.eventStart); }
  save() { this.store.save(); }

  /* ----- points ----- */
  add(n, why) { const g = Math.round(n * this.mult()); this.v.points += g; this.save(); this.notify(`+${g} points${this.mult() > 1 ? ' (double points event!)' : ''}: ${why}`); this.refreshBadge(); return g; }
  dailyVisit() {
    const today = dayIndex(Date.now()), r = nextStreak(this.v.lastDay, today, this.v.streak); if (!r.counted) return null;
    this.v.lastDay = today; this.v.streak = r.streak; this.v.bestStreak = Math.max(this.v.bestStreak, r.streak);
    const g = this.add(dailyReward(r.streak), `daily visit, day ${r.streak} streak`);
    if (cratesForStreak(r.streak)) { this.v.crates++; this.save(); this.notify('7-day streak! You earned a mystery crate.'); }
    return g;
  }
  milestoneCrate(m) { if (this.v.seenMilestones.includes(m.at)) return; this.v.seenMilestones.push(m.at); this.v.crates++; this.save(); this.notify(`Milestone: ${m.name}! You earned a mystery crate.`); this.refreshBadge(); }
  startEvent() { this.v.eventStart = Date.now(); this.save(); }

  /* ----- treasure hunt ----- */
  goldenToday(n) { return goldenForDay(dayIndex(Date.now()), n); }
  foundToday() { return (this.v.goldenFound[dayIndex(Date.now())] || []).length; }
  isFound(idx) { return (this.v.goldenFound[dayIndex(Date.now())] || []).includes(idx); }
  findGolden(idx) {
    const d = dayIndex(Date.now()), list = (this.v.goldenFound[d] ||= []); if (list.includes(idx)) { this.notify('You already found that one today.'); return false; }
    list.push(idx); for (const k of Object.keys(this.v.goldenFound)) if (+k < d - 7) delete this.v.goldenFound[k]; this.save(); this.add(POINTS.golden, `golden object ${list.length}/3 found today`); return true;
  }

  /* ----- claims ----- */
  claimBuilding(i, platform, username, optIn, ageOk) {
    if (this.v.claim) return 'You already claimed a building.'; if (!ageOk) return 'You must confirm you are 13 or older.';
    const u = String(username || '').replace(/^@/, ''); if (!nameOk(u)) return 'That username is not allowed (letters, numbers, dots and underscores only, and no offensive words).';
    this.v.ageOk = true; this.v.claim = { building: i, platform, username: u, optIn: !!optIn, status: 'pending', code: makeCode(Math.random), at: Date.now() }; this.save(); this.applyFx(); this.refreshBadge(); return null;
  }
  verifyDemo() { const c = this.v.claim; if (!c || c.status === 'verified') return; c.status = 'verified'; if (!this.v.verified[c.platform]) { this.v.verified[c.platform] = true; this.add(POINTS.verify, `verified your ${c.platform}`); } this.save(); this.applyFx(); }
  deleteMyData() { this.store.state.visitor = null; this.store.state.visitor = this.store.state.visitor || (this.store.reset(), this.store.state.visitor); this.applyFx(); this.refreshBadge(); this.notify('Your visitor data was deleted from this browser.'); }

  /* ----- wardrobe ----- */
  buy(id) { const c = COSMETICS.find(x => x.id === id); if (!c || this.v.owned.includes(id)) return; if (!canBuy(c, this.level, this.v.points)) return this.notify('Not enough points or level too low.'); this.v.points -= c.cost; this.v.owned.push(id); this.save(); this.refreshBadge(); this.render(); }
  equip(id) { const c = COSMETICS.find(x => x.id === id); if (!c || !this.v.owned.includes(id)) return; this.v.equipped[c.slot] = this.v.equipped[c.slot] === id ? null : id; this.save(); this.applyFx(); this.render(); }

  /* ----- crates ----- */
  openOne() {
    if (this.v.crates < 1) return null; this.v.crates--; const item = openCrate(Math.random(), Math.random()); let dupe = false;
    if (this.v.owned.includes(item.id)) { dupe = true; this.v.points += 25; } else this.v.owned.push(item.id); this.save(); this.refreshBadge(); return { item, dupe };
  }

  /* ----- interface ----- */
  _ui() {
    const css = document.createElement('style');
    css.textContent = `#vhub{position:fixed;inset:0;display:none;z-index:30;font-family:system-ui,-apple-system,"Segoe UI",sans-serif;color:#f4f7ff;background:rgba(3,6,14,.55);backdrop-filter:blur(4px)}
#vhub .card{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);width:min(560px,calc(100vw - 20px));max-height:calc(100vh - 24px);display:flex;flex-direction:column;background:rgba(12,16,28,.94);border:1px solid rgba(255,255,255,.18);border-radius:16px;overflow:hidden}
#vhub .head{display:flex;justify-content:space-between;align-items:center;padding:12px 14px;border-bottom:1px solid rgba(255,255,255,.12)}#vhub h2{margin:0;font-size:16px;font-weight:600}
#vhub .tabs{display:flex;gap:4px;padding:8px 10px;overflow-x:auto;border-bottom:1px solid rgba(255,255,255,.1)}#vhub .tabs button.on{background:#2f6aa8;border-color:#5b95d6}
#vhub .body{padding:14px;overflow:auto;display:flex;flex-direction:column;gap:9px;font-size:13px;line-height:1.5}
#vhub button{appearance:none;border:1px solid rgba(255,255,255,.18);background:rgba(255,255,255,.08);color:inherit;font:inherit;font-size:13px;padding:8px 12px;border-radius:9px;cursor:pointer;white-space:nowrap}#vhub button:hover{background:rgba(255,255,255,.16)}#vhub button:disabled{opacity:.4;cursor:not-allowed}#vhub button.pri{background:#2f6aa8;border-color:#5b95d6}
#vhub input[type=text],#vhub input[type=date],#vhub select{width:100%;padding:9px;border-radius:9px;border:1px solid rgba(255,255,255,.2);background:rgba(0,0,0,.35);color:inherit;font:inherit}
#vhub .row{display:flex;justify-content:space-between;gap:10px;align-items:center;padding:8px 10px;border-radius:10px;background:rgba(255,255,255,.06)}#vhub .dim{opacity:.65;font-size:12px}
#vhub .pill{padding:2px 8px;border-radius:99px;font-size:11px;border:1px solid currentColor}#vhub .banner{padding:9px 11px;border-radius:10px;background:rgba(255,200,60,.12);border:1px solid rgba(255,200,60,.4)}
#vbtn{position:static}`;
    document.head.appendChild(css);
    const root = this.root = document.createElement('div'); root.id = 'vhub'; root.innerHTML = `<div class="card"><div class="head"><h2>Visitor hub <span class="dim">(demo)</span></h2><button id="vclose">Close</button></div><div class="tabs" id="vtabs"></div><div class="body" id="vbody"></div></div>`;
    document.body.appendChild(root); root.addEventListener('pointerdown', e => { if (e.target === root) this.close(); });
    root.querySelector('#vclose').addEventListener('click', () => this.close());
    this.body = root.querySelector('#vbody'); this.tabsEl = root.querySelector('#vtabs');
  }
  refreshBadge() { const b = document.getElementById('hubbtn'); if (b) b.textContent = `My hub · ${fmt(this.v.points)} pts${this.v.crates ? ' · ' + this.v.crates + ' crate' + (this.v.crates > 1 ? 's' : '') : ''}`; }
  open(tab) { if (tab) this.tab = tab; this.root.style.display = 'block'; this.render(); }
  close() { this.root.style.display = 'none'; }
  render() {
    const TABS = [['profile', 'Profile'], ['claim', 'My building'], ['wardrobe', 'Wardrobe'], ['crates', 'Crates'], ['hunt', 'Treasure hunt'], ['vote', 'Vote'], ['predict', 'Predict'], ['boards', 'Boards'], ['privacy', 'Privacy']];
    this.tabsEl.innerHTML = TABS.map(([id, n]) => `<button data-t="${id}" class="${this.tab === id ? 'on' : ''}">${n}</button>`).join(''); this.tabsEl.querySelectorAll('[data-t]').forEach(b => b.addEventListener('click', () => { this.tab = b.dataset.t; this.render(); }));
    const el = this.body, v = this.v, lv = this.level, nl = nextLevel(v.points); const bind = (sel, fn) => el.querySelectorAll(sel).forEach(e => e.addEventListener('click', () => fn(e)));
    const { W, count, next } = this.getCtx();
    if (this.tab === 'profile') {
      el.innerHTML = `<div class="banner">Level <b>${lv}</b> · <b>${fmt(v.points)}</b> points${nl ? ` · ${fmt(nl.at - v.points)} to level ${nl.level}` : ' · max level'}</div>
<div class="row"><span>Daily streak</span><b>${v.streak} day${v.streak === 1 ? '' : 's'} (best ${v.bestStreak})</b></div><div class="row"><span>Next daily visit is worth</span><b>+${dailyReward(Math.max(1, v.streak) + (v.lastDay === dayIndex(Date.now()) ? 1 : 0))}</b></div>
<div class="dim">Ways to earn</div>${[['Daily visit', '+10, plus +5 per streak day (max +50 bonus)'], ['Golden object', `+${POINTS.golden} (3 hidden per day)`], ['Verify Instagram or YouTube', `+${POINTS.verify} each`], ['Friend claims after your invite', `+${POINTS.referral}`], ['Correct milestone prediction', `+${POINTS.prediction}`]].map(([a, b]) => `<div class="row"><span>${a}</span><span class="dim">${b}</span></div>`).join('')}
<div class="dim">Levels</div>${LEVELS.map(l => `<div class="row" style="${lv >= l.level ? '' : 'opacity:.55'}"><span><b>Level ${l.level}</b> · ${fmt(l.at)} pts</span><span class="dim">${l.unlocks.join(', ')}</span></div>`).join('')}`;
    }
    if (this.tab === 'claim') {
      const c = v.claim;
      if (!c) el.innerHTML = `<div class="dim">Follow on Instagram or subscribe on YouTube, then claim one unclaimed building with your @username.</div>
<select id="cplat"><option value="instagram">Instagram follower</option><option value="youtube">YouTube subscriber</option></select><input type="text" id="cuser" placeholder="@yourusername" maxlength="31">
<div class="row"><span>${this.pending ? 'Building #' + (this.pending.i + 1) + ' (' + esc(this.pending.type) + ')' : 'No building picked yet'}</span><button id="cpick">${this.pending ? 'Pick a different one' : 'Pick my building'}</button></div>
<label><input type="checkbox" id="cage"> I confirm I am 13 or older</label><label><input type="checkbox" id="copt" checked> Show my username on my name plate (otherwise it says "Verified owner")</label><button class="pri" id="csub">Claim building</button><div class="dim" id="cerr" style="color:#ff8a8a"></div>`;
      else el.innerHTML = `<div class="banner">Building #${c.building + 1} · <b>${c.status === 'verified' ? '✓ Verified' : 'Pending verification'}</b></div><div class="row"><span>${esc(c.platform)}</span><b>${c.optIn ? '@' + esc(c.username) : 'hidden (opted out)'}</b></div>
${c.status === 'verified' ? '<div class="dim">Your name plate shows a verified badge.</div>' : `<div class="row"><span>Comment this code on my latest ${c.platform === 'youtube' ? 'video' : 'post'}:</span><b style="letter-spacing:.1em">${c.code}</b></div><div class="dim">The server checks the comment and verifies you (+${POINTS.verify} points). Until then your plate says "pending".</div><button class="pri" id="cver">Demo: simulate verification</button>`}
<button id="cfly">Show my building</button><button id="cshare">Make a share card</button><button id="cdrop">Remove my claim</button>`;
      bind('#cpick', () => { this.pickMode = true; this.close(); this.notify('Click an unclaimed building to pick it.'); });
      bind('#csub', () => { if (!this.pending) { el.querySelector('#cerr').textContent = 'Pick a building first.'; return; } const err = this.claimBuilding(this.pending.i, el.querySelector('#cplat').value, el.querySelector('#cuser').value, el.querySelector('#copt').checked, el.querySelector('#cage').checked); if (err) el.querySelector('#cerr').textContent = err; else { this.pending = null; this.render(); } });
      bind('#cver', () => { this.verifyDemo(); this.render(); }); bind('#cdrop', () => { this.v.claim = null; this.save(); this.applyFx(); this.render(); });
      bind('#cfly', () => { this.close(); this.getCtx().fly(v.claim.building); }); bind('#cshare', () => { this.close(); this.getCtx().share(v.claim.building); });
    }
    if (this.tab === 'wardrobe') {
      el.innerHTML = `<div class="dim">Spend points on cosmetics for your building. Rarer items only come from crates and events. Cosmetics are visual only.</div>` + COSMETICS.map(c => {
        const own = v.owned.includes(c.id), eq = v.equipped[c.slot] === c.id, lock = lv < c.level;
        return `<div class="row"><span><span class="pill" style="color:${RARITY_COLOR[c.rarity]}">${c.rarity}</span> ${esc(c.name)}<br><span class="dim">${c.source === 'crate' ? 'From crates and events' : `Level ${c.level} · ${fmt(c.cost)} pts`}</span></span>${own ? `<button data-eq="${c.id}" class="${eq ? 'pri' : ''}">${eq ? 'Equipped' : 'Equip'}</button>` : c.source === 'crate' ? '<span class="dim">crate only</span>' : `<button data-buy="${c.id}" ${lock || v.points < c.cost ? 'disabled' : ''}>${lock ? 'Level ' + c.level : 'Buy'}</button>`}</div>`;
      }).join('');
      bind('[data-buy]', b => this.buy(b.dataset.buy)); bind('[data-eq]', b => this.equip(b.dataset.eq));
    }
    if (this.tab === 'crates') {
      el.innerHTML = `<div class="banner">You have <b>${v.crates}</b> mystery crate${v.crates === 1 ? '' : 's'}</div><button class="pri" id="copen" ${v.crates ? '' : 'disabled'}>Open a crate (3D)</button><div class="dim">Earn one crate for every 7-day streak and at every city milestone. Crates are never sold for money.</div>
<div class="dim">Odds (shown to everyone)</div>${Object.entries(CRATE_ODDS).map(([k, p]) => `<div class="row"><span class="pill" style="color:${RARITY_COLOR[k]}">${k}</span><b>${Math.round(p * 100)}%</b></div>`).join('')}<div class="dim">Duplicates turn into 25 points.</div>`;
      bind('#copen', () => { const r = this.openOne(); if (r) { this.close(); this.showCrate(r); } });
    }
    if (this.tab === 'hunt') {
      const n = W ? W.S.length : 0, today = this.goldenToday(Math.max(1, n));
      el.innerHTML = `<div class="banner">Found today: <b>${this.foundToday()}/3</b> · +${POINTS.golden} points each</div><div class="dim">Three golden stars are hidden on rooftops each day, the same for everybody. Look for spinning gold stars floating above buildings, and click them.</div>${n < 5 ? '<div class="dim">The city is still tiny, so the stars are easy to spot.</div>' : ''}<button id="hshow">Point me to one I have not found</button><div class="dim">Global "found today" counter needs the server.</div>`;
      bind('#hshow', () => { const t = today.find(i => !this.isFound(i)); if (t === undefined) this.notify('You found all three today. Come back tomorrow!'); else { this.close(); this.locateGolden(t); } });
    }
    if (this.tab === 'vote') {
      const opts = next && VOTE_OPTIONS[next.at];
      el.innerHTML = opts ? `<div class="banner">Vote for the next landmark at <b>${esc(next.name)}</b> (${fmt(next.at)} buildings)</div>${opts.map(o => `<button data-vote="${esc(o)}" class="${v.votes[next.at] === o ? 'pri' : ''}">${esc(o)}${v.votes[next.at] === o ? ' ✓' : ''}</button>`).join('')}<div class="dim">Options are approved by the owner. Votes are counted on the server; in this demo yours is saved locally.</div>` : `<div class="dim">No vote is open right now. Votes open ahead of the bigger milestones (${Object.keys(VOTE_OPTIONS).map(fmt).join(', ')}).</div>`;
      bind('[data-vote]', b => { v.votes[next.at] = b.dataset.vote; this.save(); this.render(); });
    }
    if (this.tab === 'predict') {
      const m = next, cur = m && v.predictions[m.at];
      el.innerHTML = m ? `<div class="banner">Guess the day the city reaches <b>${fmt(m.at)}</b> buildings (${esc(m.name)})</div><input type="date" id="pdate" value="${cur ? new Date(cur * DAY).toISOString().slice(0, 10) : ''}"><button class="pri" id="psave">Save my guess</button><div class="dim">Correct guess: +${POINTS.prediction} points. The server settles it on that day. Right now the city has ${fmt(count)} buildings.</div>` : '<div class="dim">Every milestone has been reached.</div>';
      bind('#psave', () => { const d = el.querySelector('#pdate').value; if (!d) return; v.predictions[m.at] = Math.floor(Date.parse(d + 'T00:00:00Z') / DAY); this.save(); this.notify('Prediction saved.'); this.render(); });
    }
    if (this.tab === 'boards') {
      el.innerHTML = `<div class="dim">Leaderboards need the server. Demo view shows only you.</div>${[['Top points', fmt(v.points) + ' pts'], ['Longest streak', v.bestStreak + ' days'], ['Most referrals', v.referrals]].map(([a, b]) => `<div class="dim">${a}</div><div class="row"><span>#1 ${v.claim && v.claim.optIn ? '@' + esc(v.claim.username) : 'You'}</span><b>${b}</b></div>`).join('')}`;
    }
    if (this.tab === 'privacy') {
      el.innerHTML = `<div class="banner">Your data stays in this browser in demo mode. In the real version emails are never shown publicly.</div><div class="row"><span>Show my username publicly</span><button id="vopt">${v.claim && v.claim.optIn ? 'On' : 'Off'}</button></div><button id="vdel">Delete my account and data</button><a href="privacy.html" target="_blank" style="color:#8fc4ff">Read the privacy page (draft)</a>`;
      bind('#vopt', () => { if (v.claim) { v.claim.optIn = !v.claim.optIn; this.save(); this.applyFx(); this.render(); } }); bind('#vdel', () => { if (confirm('Delete your visitor data from this browser?')) { this.store.reset(); this.applyFx(); this.refreshBadge(); this.render(); } });
    }
  }
}
