// Visitor engagement (Phase 3): points, claims, wardrobe, crates, treasure hunt, votes, predictions, leaderboards.
// Two modes with the same screens:
//  - REMOTE (your public site): everything is decided by the Supabase database; the browser only sends actions.
//  - LOCAL demo (?demo=1 or localhost): saved only in this browser, for trying things out.
import { POINTS, dayIndex, dailyReward, nextStreak, pointsMultiplier, levelOf, nextLevel, LEVELS, goldenForDay, CRATE_ODDS, COSMETICS, openCrate, cratesForStreak, canBuy, nameOk, makeCode, DAY, VOTE_OPTIONS } from './points.js';
import { visitorDefault } from './store.js';

export { VOTE_OPTIONS };
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmt = n => Math.round(n).toLocaleString();
const RARITY_COLOR = { common: '#b8c4d6', rare: '#4a9eff', epic: '#b06bff', legendary: '#ffb020' };

export class Visitor {
  constructor({ store, remote, notify, getCtx, applyFx, showCrate, locateGolden, onClaims, onEvent }) {
    Object.assign(this, { store, remote, notify, getCtx, applyFx, showCrate, locateGolden, onClaims, onEvent }); this.tab = 'profile'; this.pickMode = false;
    this.rv = visitorDefault(); this.goldenList = []; this.publicClaims = []; this.claimedSet = new Set(); this.voteRows = []; this.boardData = null; this.eventStart = 0; this._ui();
  }
  get v() { return this.remote ? this.rv : this.store.v; }
  get level() { return levelOf(this.v.points); }
  get remoteOn() { return !!this.remote; }
  mult() { return pointsMultiplier(Date.now(), this.remote ? this.eventStart : this.v.eventStart); }
  save() { if (!this.remote) this.store.save(); }
  async run(fn) { try { return await fn(); } catch (e) { this.notify(e.message || String(e)); return undefined; } }

  /* ----- start-up ----- */
  async start() {
    if (!this.remote) { this.dailyVisit(); return; }
    await this.run(async () => { await this.remote.init(); if (this.remote.recovery) { this.open('profile'); } if (this.remote.lastError) this.notify('Sign-in link problem: ' + this.remote.lastError); await this.loadPublic(); if (this.remote.signedIn) await this.afterSignIn(); this.refreshBadge(); });
    setInterval(() => this.run(async () => { await this.loadPublic(); if (this.remote.signedIn) await this.sync(); this.applyFx(); }), 60000);
  }
  async afterSignIn() {
    await this.sync(); const ref = (() => { try { return localStorage.getItem('nc.ref'); } catch (e) { return null; } })();
    if (ref) { await this.run(() => this.remote.rpc('rpc_use_referral', { p_code: ref })); try { localStorage.removeItem('nc.ref'); } catch (e) { /* ignore */ } }
    const r = await this.run(() => this.remote.rpc('rpc_daily_visit')); if (r && r.counted) { this.notify(`+${r.gained} points: daily visit, day ${r.streak} streak${r.crate ? '. A crate for your 7-day streak!' : ''}`); await this.sync(); }
    this.applyFx(); this.refreshBadge();
  }
  async sync() { this.rv = await this.remote.loadState(dayIndex(Date.now())); this.refreshBadge(); }
  async loadPublic() {
    const day = dayIndex(Date.now()), [claims, golden, ev, votes] = await Promise.all([this.remote.publicClaims(), this.remote.goldenToday(day), this.remote.liveEventStart(), this.remote.voteOptions()]);
    this.publicClaims = claims; this.claimedSet = new Set(claims.map(c => c.building)); this.goldenList = golden; this.eventStart = ev; this.voteRows = votes; this.onClaims && this.onClaims(claims); this.onEvent && this.onEvent(ev);
  }

  /* ----- points (local demo only; the server does this in remote mode) ----- */
  add(n, why) { if (this.remote) return 0; const g = Math.round(n * this.mult()); this.v.points += g; this.save(); this.notify(`+${g} points${this.mult() > 1 ? ' (double points event!)' : ''}: ${why}`); this.refreshBadge(); return g; }
  dailyVisit() {
    if (this.remote) return null; const today = dayIndex(Date.now()), r = nextStreak(this.v.lastDay, today, this.v.streak); if (!r.counted) return null;
    this.v.lastDay = today; this.v.streak = r.streak; this.v.bestStreak = Math.max(this.v.bestStreak, r.streak);
    const g = this.add(dailyReward(r.streak), `daily visit, day ${r.streak} streak`);
    if (cratesForStreak(r.streak)) { this.v.crates++; this.save(); this.notify('7-day streak! You earned a mystery crate.'); } return g;
  }
  milestoneCrate(m) { if (this.remote || this.v.seenMilestones.includes(m.at)) return; this.v.seenMilestones.push(m.at); this.v.crates++; this.save(); this.notify(`Milestone: ${m.name}! You earned a mystery crate.`); this.refreshBadge(); }
  startEvent() { if (!this.remote) { this.v.eventStart = Date.now(); this.save(); } }

  /* ----- treasure hunt ----- */
  goldenToday(n) { return this.remote ? this.goldenList : goldenForDay(dayIndex(Date.now()), n); }
  foundToday() { return (this.v.goldenFound[dayIndex(Date.now())] || []).length; }
  isFound(idx) { return (this.v.goldenFound[dayIndex(Date.now())] || []).includes(idx); }
  async findGolden(idx) {
    if (this.remote) {
      if (!this.remote.signedIn) { this.notify('Sign in (My hub) to collect golden stars.'); this.open('profile'); return false; }
      const g = await this.run(() => this.remote.rpc('rpc_find_golden', { p_building: idx })); if (g === undefined) return false; this.notify(`+${g} points: golden object found`); await this.sync(); return true;
    }
    const d = dayIndex(Date.now()), list = (this.v.goldenFound[d] ||= []); if (list.includes(idx)) { this.notify('You already found that one today.'); return false; }
    list.push(idx); for (const k of Object.keys(this.v.goldenFound)) if (+k < d - 7) delete this.v.goldenFound[k]; this.save(); this.add(POINTS.golden, `golden object ${list.length}/3 found today`); return true;
  }

  /* ----- claims ----- */
  async claimBuilding(i, platform, username, optIn, ageOk) {
    if (this.v.claim) return 'You already claimed a building.'; if (!ageOk) return 'You must confirm you are 13 or older.';
    const u = String(username || '').replace(/^@/, ''); if (!nameOk(u)) return 'That username is not allowed (letters, numbers, dots and underscores only, and no offensive words).';
    if (this.remote) { try { await this.remote.rpc('rpc_claim_building', { p_building: i, p_platform: platform, p_username: u, p_opt_in: !!optIn, p_age_ok: true }); } catch (e) { return e.message; } await this.sync(); await this.loadPublic(); this.applyFx(); return null; }
    this.v.ageOk = true; this.v.claim = { building: i, platform, username: u, optIn: !!optIn, status: 'pending', code: makeCode(Math.random), at: Date.now() }; this.save(); this.applyFx(); this.refreshBadge(); return null;
  }
  verifyDemo() { const c = this.v.claim; if (!c || c.status === 'verified') return; c.status = 'verified'; if (!this.v.verified[c.platform]) { this.v.verified[c.platform] = true; this.add(POINTS.verify, `verified your ${c.platform}`); } this.save(); this.applyFx(); }

  /* ----- wardrobe ----- */
  async buy(id) {
    const c = COSMETICS.find(x => x.id === id); if (!c || this.v.owned.includes(id)) return;
    if (this.remote) { if (await this.run(async () => { await this.remote.rpc('rpc_buy_cosmetic', { p_id: id }); return true; })) { await this.sync(); this.render(); } return; }
    if (!canBuy(c, this.level, this.v.points)) return this.notify('Not enough points or level too low.'); this.v.points -= c.cost; this.v.owned.push(id); this.save(); this.refreshBadge(); this.render();
  }
  async equip(id) {
    const c = COSMETICS.find(x => x.id === id); if (!c || !this.v.owned.includes(id)) return; const off = this.v.equipped[c.slot] === id;
    if (this.remote) { await this.run(() => this.remote.rpc('rpc_equip', { p_slot: c.slot, p_id: off ? null : id })); await this.sync(); this.applyFx(); this.render(); return; }
    this.v.equipped[c.slot] = off ? null : id; this.save(); this.applyFx(); this.render();
  }

  /* ----- crates ----- */
  async openOne() {
    if (this.v.crates < 1) return null;
    if (this.remote) { const r = await this.run(() => this.remote.rpc('rpc_open_crate')); if (!r) return null; await this.sync(); return { item: COSMETICS.find(c => c.id === r.id) || { id: r.id, name: r.name, rarity: r.rarity, slot: 'skin' }, dupe: r.dupe }; }
    this.v.crates--; const item = openCrate(Math.random(), Math.random()); let dupe = false; if (this.v.owned.includes(item.id)) { dupe = true; this.v.points += 25; } else this.v.owned.push(item.id); this.save(); this.refreshBadge(); return { item, dupe };
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
#vhub input[type=text],#vhub input[type=email],#vhub input[type=password],#vhub input[type=date],#vhub select{width:100%;padding:9px;border-radius:9px;border:1px solid rgba(255,255,255,.2);background:rgba(0,0,0,.35);color:inherit;font:inherit}
#vhub .row{display:flex;justify-content:space-between;gap:10px;align-items:center;padding:8px 10px;border-radius:10px;background:rgba(255,255,255,.06)}#vhub .dim{opacity:.65;font-size:12px}
#vhub .pill{padding:2px 8px;border-radius:99px;font-size:11px;border:1px solid currentColor}#vhub .banner{padding:9px 11px;border-radius:10px;background:rgba(255,200,60,.12);border:1px solid rgba(255,200,60,.4)}`;
    document.head.appendChild(css);
    const root = this.root = document.createElement('div'); root.id = 'vhub'; root.innerHTML = `<div class="card"><div class="head"><h2>My hub${this.remote ? '' : ' <span class="dim">(demo)</span>'}</h2><button id="vclose">Close</button></div><div class="tabs" id="vtabs"></div><div class="body" id="vbody"></div></div>`;
    document.body.appendChild(root); root.addEventListener('pointerdown', e => { if (e.target === root) this.close(); });
    root.querySelector('#vclose').addEventListener('click', () => this.close()); this.body = root.querySelector('#vbody'); this.tabsEl = root.querySelector('#vtabs');
  }
  refreshBadge() { const b = document.getElementById('hubbtn'); if (!b) return; if (this.remote && !this.remote.signedIn) { b.textContent = 'Sign in'; return; } b.textContent = `My hub · ${fmt(this.v.points)} pts${this.v.crates ? ' · ' + this.v.crates + ' crate' + (this.v.crates > 1 ? 's' : '') : ''}`; }
  open(tab) { if (tab) this.tab = tab; this.root.style.display = 'block'; this.render(); if (this.remote && this.remote.signedIn) this.run(async () => { await this.sync(); await this.loadPublic(); if (this.root.style.display === 'block') this.render(); }); }
  close() { this.root.style.display = 'none'; }
  renderSignIn() {
    this.tabsEl.innerHTML = ''; const el = this.body, mode = this.authMode || 'create';
    if (this.remote.recovery) {
      el.innerHTML = `<div class="banner">Choose a new password</div><input type="password" id="np" placeholder="New password (8+ characters)" autocomplete="new-password"><button class="pri" id="npgo">Save new password</button><div id="smsg" class="dim"></div>`;
      el.querySelector('#npgo').addEventListener('click', async () => { const msg = el.querySelector('#smsg'), pw = el.querySelector('#np').value; if (pw.length < 8) { msg.textContent = 'Use at least 8 characters.'; return; } try { await this.remote.updatePassword(pw); this.remote.recovery = false; this.notify('Password saved. You are signed in.'); await this.afterSignIn(); this.render(); } catch (e) { msg.textContent = e.message; } });
      return;
    }
    el.innerHTML = `<div class="banner">Claim your building</div><div class="dim">Join to earn points, claim a building, find golden stars and open crates. Free, and no email to wait for.</div>
<div style="display:flex;gap:6px"><button data-m="create" class="${mode === 'create' ? 'pri' : ''}" style="flex:1">Create account</button><button data-m="login" class="${mode === 'login' ? 'pri' : ''}" style="flex:1">Log in</button></div>
<input type="email" id="semail" placeholder="Email" autocomplete="email"><input type="password" id="spass" placeholder="Password (8+ characters)" autocomplete="${mode === 'create' ? 'new-password' : 'current-password'}">
${mode === 'create' ? '<label><input type="checkbox" id="sage"> I am 13 or older</label>' : ''}<button class="pri" id="sgo">${mode === 'create' ? 'Create account' : 'Log in'}</button><div id="smsg" class="dim"></div>
<div class="dim">Your email is only used for your account and is never shown to anyone. ${mode === 'login' ? 'Forgot your password? <a href="#" id="sforgot" style="color:#8fc4ff">Send me a reset link</a>' : ''}</div><a href="privacy.html" target="_blank" style="color:#8fc4ff">Privacy (draft)</a>`;
    el.querySelectorAll('[data-m]').forEach(b => b.addEventListener('click', () => { this.authMode = b.dataset.m; this.renderSignIn(); }));
    const msg = el.querySelector('#smsg'), go = el.querySelector('#sgo');
    go.addEventListener('click', async () => {
      const em = el.querySelector('#semail').value.trim(), pw = el.querySelector('#spass').value;
      if (!/^\S+@\S+\.\S+$/.test(em)) { msg.textContent = 'Enter a valid email.'; return; } if (pw.length < 8) { msg.textContent = 'Use a password with at least 8 characters.'; return; }
      if (mode === 'create' && !el.querySelector('#sage').checked) { msg.textContent = 'Please confirm you are 13 or older.'; return; }
      go.disabled = true; msg.textContent = 'One moment…';
      try {
        if (mode === 'create') { const r = await this.remote.signUp(em, pw); if (!r.signedIn) { msg.textContent = 'Almost done: check your email and click the confirmation link.'; go.disabled = false; return; } }
        else await this.remote.signInPassword(em, pw);
        await this.afterSignIn(); this.render();
      } catch (e) { msg.textContent = e.message; go.disabled = false; }
    });
    const fg = el.querySelector('#sforgot'); if (fg) fg.addEventListener('click', async e => { e.preventDefault(); const em = el.querySelector('#semail').value.trim(); if (!/^\S+@\S+\.\S+$/.test(em)) { msg.textContent = 'Type your email above first.'; return; } try { await this.remote.resetPassword(em); msg.textContent = 'If that email has an account, a reset link is on its way.'; } catch (err) { msg.textContent = err.message; } });
  }  render() {
    if (this.remote && !this.remote.signedIn) { this.renderSignIn(); return; }
    const TABS = [['profile', 'Profile'], ['claim', 'My building'], ['wardrobe', 'Wardrobe'], ['crates', 'Crates'], ['hunt', 'Treasure hunt'], ['vote', 'Vote'], ['predict', 'Predict'], ['boards', 'Boards'], ['privacy', 'Privacy']];
    this.tabsEl.innerHTML = TABS.map(([id, n]) => `<button data-t="${id}" class="${this.tab === id ? 'on' : ''}">${n}</button>`).join(''); this.tabsEl.querySelectorAll('[data-t]').forEach(b => b.addEventListener('click', () => { this.tab = b.dataset.t; this.render(); }));
    const el = this.body, v = this.v, lv = this.level, nl = nextLevel(v.points); const bind = (sel, fn) => el.querySelectorAll(sel).forEach(e => e.addEventListener('click', () => fn(e)));
    const { W, count, next } = this.getCtx();
    if (this.tab === 'profile') {
      const invite = this.remote && v.referralCode ? `${location.origin}${location.pathname}?ref=${v.referralCode}` : '';
      el.innerHTML = `<div class="banner">Level <b>${lv}</b> · <b>${fmt(v.points)}</b> points${nl ? ` · ${fmt(nl.at - v.points)} to level ${nl.level}` : ' · max level'}</div>
${this.remote ? `<div class="dim">Signed in as ${esc(this.remote.email)}</div>` : ''}<div class="row"><span>Daily streak</span><b>${v.streak} day${v.streak === 1 ? '' : 's'} (best ${v.bestStreak})</b></div>
${invite ? `<div class="row"><span>Your invite link<br><span class="dim">+${POINTS.referral} when a friend claims a building</span></span><button id="icopy">Copy</button></div>` : ''}
<div class="dim">Ways to earn</div>${[['Daily visit', '+10, plus +5 per streak day (max +50 bonus)'], ['Golden object', `+${POINTS.golden} (3 hidden per day)`], ['Verify Instagram or YouTube', `+${POINTS.verify} each`], ['Friend claims after your invite', `+${POINTS.referral}`], ['Correct milestone prediction', `+${POINTS.prediction}`]].map(([a, b]) => `<div class="row"><span>${a}</span><span class="dim">${b}</span></div>`).join('')}
<div class="dim">Levels</div>${LEVELS.map(l => `<div class="row" style="${lv >= l.level ? '' : 'opacity:.55'}"><span><b>Level ${l.level}</b> · ${fmt(l.at)} pts</span><span class="dim">${l.unlocks.join(', ')}</span></div>`).join('')}${this.remote ? '<button id="sout">Sign out</button>' : ''}`;
      bind('#icopy', () => { navigator.clipboard && navigator.clipboard.writeText(invite); this.notify('Invite link copied.'); }); bind('#sout', () => { this.remote.signOut(); this.rv = visitorDefault(); this.applyFx(); this.refreshBadge(); this.render(); });
    }
    if (this.tab === 'claim') {
      const c = v.claim;
      if (!c) el.innerHTML = `<div class="dim">Follow on Instagram or subscribe on YouTube, then claim one unclaimed building with your @username.</div>
<select id="cplat"><option value="instagram">Instagram follower</option><option value="youtube">YouTube subscriber</option></select><input type="text" id="cuser" placeholder="@yourusername" maxlength="31">
<div class="row"><span>${this.pending ? 'Building #' + (this.pending.i + 1) + ' (' + esc(this.pending.type) + ')' : 'No building picked yet'}</span><button id="cpick">${this.pending ? 'Pick a different one' : 'Pick my building'}</button></div>
<label><input type="checkbox" id="cage"> I confirm I am 13 or older</label><label><input type="checkbox" id="copt" checked> Show my username on my name plate (otherwise it says "Builder")</label><button class="pri" id="csub">Claim building</button><div class="dim" id="cerr" style="color:#ff8a8a"></div>`;
      else el.innerHTML = `<div class="banner">Building #${c.building + 1} · <b>${c.status === 'verified' ? '✓ Verified' : 'Pending verification'}</b></div><div class="row"><span>${esc(c.platform)}</span><b>${c.optIn ? '@' + esc(c.username) : 'hidden (opted out)'}</b></div>
${c.status === 'verified' ? '<div class="dim">Your name plate shows a verified badge.</div>' : `<div class="row"><span>Comment this code on my latest ${c.platform === 'youtube' ? 'video' : 'post'}:</span><b style="letter-spacing:.1em">${esc(c.code)}</b></div><div class="dim">${this.remote ? 'YouTube comments are checked automatically within minutes. Instagram ones are checked by hand. ' : ''}Verified accounts earn +${POINTS.verify} points. Until then your plate says "pending".</div>${this.remote ? '<button id="crefresh">Check status</button>' : '<button class="pri" id="cver">Demo: simulate verification</button>'}`}
<button id="cfly">Show my building</button><button id="cshare">Make a share card</button>${this.remote ? '' : '<button id="cdrop">Remove my claim</button>'}`;
      bind('#cpick', () => { this.pickMode = true; this.close(); this.notify('Click an unclaimed building to pick it.'); });
      bind('#csub', async () => { if (!this.pending) { el.querySelector('#cerr').textContent = 'Pick a building first.'; return; } const err = await this.claimBuilding(this.pending.i, el.querySelector('#cplat').value, el.querySelector('#cuser').value, el.querySelector('#copt').checked, el.querySelector('#cage').checked); if (err) el.querySelector('#cerr').textContent = err; else { this.pending = null; this.render(); } });
      bind('#cver', () => { this.verifyDemo(); this.render(); }); bind('#cdrop', () => { this.v.claim = null; this.save(); this.applyFx(); this.render(); }); bind('#crefresh', async () => { await this.run(() => this.sync()); this.applyFx(); this.render(); });
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
      bind('#copen', async () => { const r = await this.openOne(); if (r) { this.close(); this.showCrate(r); } });
    }
    if (this.tab === 'hunt') {
      const n = W ? W.S.length : 0, today = this.goldenToday(Math.max(1, n));
      el.innerHTML = `<div class="banner">Found today: <b>${this.foundToday()}/3</b> · +${POINTS.golden} points each</div><div class="dim">Three golden stars are hidden on rooftops each day, the same for everybody. Look for spinning gold stars floating above buildings, and click them.</div>${this.remote && !today.length ? '<div class="dim">Today\'s stars have not been hidden yet. Check back soon.</div>' : ''}<button id="hshow">Point me to one I have not found</button>`;
      bind('#hshow', () => { const t = today.find(i => !this.isFound(i)); if (t === undefined) this.notify(today.length ? 'You found all three today. Come back tomorrow!' : 'No stars today yet.'); else { this.close(); this.locateGolden(t); } });
    }
    if (this.tab === 'vote') {
      const opts = next && (this.remote ? this.voteRows.filter(r => r.milestone === next.at).map(r => r.option) : VOTE_OPTIONS[next.at]);
      el.innerHTML = opts && opts.length ? `<div class="banner">Vote for the next landmark at <b>${esc(next.name)}</b> (${fmt(next.at)} buildings)</div>${opts.map(o => `<button data-vote="${esc(o)}" class="${v.votes[next.at] === o ? 'pri' : ''}">${esc(o)}${v.votes[next.at] === o ? ' ✓' : ''}</button>`).join('')}<div class="dim">Options are approved by the owner.</div>` : `<div class="dim">No vote is open right now. Votes open ahead of the bigger milestones.</div>`;
      bind('[data-vote]', async b => { if (this.remote) { await this.run(() => this.remote.rpc('rpc_vote', { p_milestone: next.at, p_option: b.dataset.vote })); await this.run(() => this.sync()); } else { v.votes[next.at] = b.dataset.vote; this.save(); } this.render(); });
    }
    if (this.tab === 'predict') {
      const m = next, cur = m && v.predictions[m.at];
      el.innerHTML = m ? `<div class="banner">Guess the day the city reaches <b>${fmt(m.at)}</b> buildings (${esc(m.name)})</div><input type="date" id="pdate" value="${cur ? new Date(cur * DAY).toISOString().slice(0, 10) : ''}"><button class="pri" id="psave">Save my guess</button><div class="dim">Correct guess: +${POINTS.prediction} points. Right now the city has ${fmt(count)} buildings.</div>` : '<div class="dim">Every milestone has been reached.</div>';
      bind('#psave', async () => { const d = el.querySelector('#pdate').value; if (!d) return; const day = Math.floor(Date.parse(d + 'T00:00:00Z') / DAY); if (this.remote) { await this.run(() => this.remote.rpc('rpc_predict', { p_milestone: m.at, p_day: day })); await this.run(() => this.sync()); } else { v.predictions[m.at] = day; this.save(); } this.notify('Prediction saved.'); this.render(); });
    }
    if (this.tab === 'boards') {
      if (this.remote) {
        el.innerHTML = '<div class="dim">Loading…</div>'; this.run(async () => { const b = await this.remote.boards(); const tbl = (title, rows, k, unit) => `<div class="dim">${title}</div>${rows.length ? rows.slice(0, 10).map((r, i) => `<div class="row"><span>#${i + 1} ${esc(r.name)}</span><b>${fmt(r[k])} ${unit}</b></div>`).join('') : '<div class="dim">Nobody yet.</div>'}`; if (this.tab === 'boards') el.innerHTML = tbl('Top points', b.points, 'points', 'pts') + tbl('Longest streaks', b.streaks, 'streak', 'days') + tbl('Most referrals', b.referrals, 'referrals', ''); });
      } else el.innerHTML = `<div class="dim">Demo view shows only you.</div>${[['Top points', fmt(v.points) + ' pts'], ['Longest streak', v.bestStreak + ' days'], ['Most referrals', v.referrals]].map(([a, b]) => `<div class="dim">${a}</div><div class="row"><span>#1 ${v.claim && v.claim.optIn ? '@' + esc(v.claim.username) : 'You'}</span><b>${b}</b></div>`).join('')}`;
    }
    if (this.tab === 'privacy') {
      el.innerHTML = `<div class="banner">${this.remote ? 'Your email is used only to sign you in and is never shown to anyone.' : 'Your data stays in this browser in demo mode.'}</div>${this.remote ? '' : `<div class="row"><span>Show my username publicly</span><button id="vopt">${v.claim && v.claim.optIn ? 'On' : 'Off'}</button></div>`}<button id="vdel">Delete my account and data</button><a href="privacy.html" target="_blank" style="color:#8fc4ff">Read the privacy page (draft)</a>`;
      bind('#vopt', () => { if (v.claim) { v.claim.optIn = !v.claim.optIn; this.save(); this.applyFx(); this.render(); } });
      bind('#vdel', async () => { if (!confirm('Delete your account and all your data? This cannot be undone.')) return; if (this.remote) { await this.run(() => this.remote.rpc('rpc_delete_account')); this.remote.signOut(); this.rv = visitorDefault(); await this.run(() => this.loadPublic()); this.notify('Your account and data were deleted.'); } else this.store.reset(); this.applyFx(); this.refreshBadge(); this.render(); });
    }
  }
}
