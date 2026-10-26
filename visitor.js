// Visitor engagement (Phase 3), game style: Stars, levels, quests, claiming, style shop, crates, treasure hunt.
// Two modes with the same screens:
//  - REMOTE (your public site): everything is decided by the Supabase database; the browser only sends actions.
//  - LOCAL demo (?demo=1 or localhost): saved only in this browser, for trying things out.
import { POINTS, dayIndex, dailyReward, nextStreak, pointsMultiplier, levelOf, nextLevel, LEVELS, goldenForDay, CRATE_ODDS, COSMETICS, openCrate, cratesForStreak, canBuy, nameOk, makeCode, DAY, VOTE_OPTIONS } from './points.js';
import { visitorDefault } from './store.js';
import * as G from './gameui.js';
import { STRIPE_LINKS } from './config.js';

export { VOTE_OPTIONS };
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmt = n => Math.round(n).toLocaleString();
const RC = { common: '#b8c4d6', rare: '#4a9eff', epic: '#b06bff', legendary: '#ffb020' };
const SLOT_ICON = { color: '🎨', glow: '💡', roof: '📡', plate: '🏷️', neon: '✨', fx: '🎆', skin: '💎' };

export class Visitor {
  constructor({ store, remote, notify, getCtx, applyFx, showCrate, locateGolden, onClaims, onEvent, onClaimed }) {
    Object.assign(this, { store, remote, notify, getCtx, applyFx, showCrate, locateGolden, onClaims, onEvent, onClaimed }); this.tab = 'quests'; this.pickMode = false;
    this.rv = visitorDefault(); this.goldenList = []; this.publicClaims = []; this.claimedSet = new Set(); this.voteRows = []; this.eventStart = 0; this._lastPts = null; this._lastLevel = null; G.injectStyles(); this._ui();
  }
  get v() { return this.remote ? this.rv : this.store.v; }
  get level() { return levelOf(this.v.points); }
  mult() { return pointsMultiplier(Date.now(), this.remote ? this.eventStart : this.v.eventStart); }
  save() { if (!this.remote) this.store.save(); }
  async run(fn) { try { return await fn(); } catch (e) { this.notify(e.message || String(e)); return undefined; } }
  get name() { const c = this.v.claim; return c && c.optIn ? '@' + c.username : 'Builder'; }

  /* ----- start-up ----- */
  async start() {
    if (!this.remote) { this.dailyVisit(); this.refreshBadge(true); return; }
    await this.run(async () => { await this.remote.init(); if (this.remote.recovery) this.open('quests'); if (this.remote.lastError) this.notify(this.remote.lastError); await this.loadPublic(); if (this.remote.signedIn) await this.afterSignIn(); this.refreshBadge(true); });
    setInterval(() => this.run(async () => { await this.loadPublic(); if (this.remote.signedIn) await this.sync(); this.applyFx(); }), 60000);
  }
  async afterSignIn() {
    await this.sync(true); const ref = (() => { try { return localStorage.getItem('nc.ref'); } catch (e) { return null; } })();
    if (ref) { await this.run(() => this.remote.rpc('rpc_use_referral', { p_code: ref })); try { localStorage.removeItem('nc.ref'); } catch (e) { /* ignore */ } }
    const r = await this.run(() => this.remote.rpc('rpc_daily_visit'));
    if (r && r.counted) { await this.sync(true); this.refreshBadge(true); G.welcomeBack({ name: this.name === 'Builder' ? 'builder' : this.name, streak: r.streak, gained: r.gained, crate: r.crate }); }
    this.applyFx(); this.refreshBadge(true);
  }
  async sync(quiet) { this.rv = await this.remote.loadState(dayIndex(Date.now())); this.refreshBadge(!!quiet); }
  async loadPublic() {
    const day = dayIndex(Date.now()), [claims, golden, ev, votes] = await Promise.all([this.remote.publicClaims(), this.remote.goldenToday(day), this.remote.liveEventStart(), this.remote.voteOptions()]);
    this.publicClaims = claims; this.claimedSet = new Set(claims.map(c => c.building)); this.goldenList = golden; this.eventStart = ev; this.voteRows = votes; this.onClaims && this.onClaims(claims); this.onEvent && this.onEvent(ev);
  }

  /* ----- stars (local demo only; the server does this in remote mode) ----- */
  add(n, why) { if (this.remote) return 0; const g = Math.round(n * this.mult()); this.v.points += g; this.save(); this.refreshBadge(); this.notify(`+${g} ★ ${why}${this.mult() > 1 ? ' (double stars event!)' : ''}`); return g; }
  dailyVisit() {
    if (this.remote) return null; const today = dayIndex(Date.now()), r = nextStreak(this.v.lastDay, today, this.v.streak); if (!r.counted) return null;
    this.v.lastDay = today; this.v.streak = r.streak; this.v.bestStreak = Math.max(this.v.bestStreak, r.streak); const crate = cratesForStreak(r.streak); if (crate) this.v.crates++;
    const g = Math.round(dailyReward(r.streak) * this.mult()); this.v.points += g; this.save(); this.refreshBadge(true); G.welcomeBack({ name: 'builder', streak: r.streak, gained: g, crate: !!crate }); return g;
  }
  milestoneCrate(m) { if (this.remote || this.v.seenMilestones.includes(m.at)) return; this.v.seenMilestones.push(m.at); this.v.crates++; this.save(); this.notify(`Milestone: ${m.name}! You earned a mystery crate.`); this.refreshBadge(); }
  startEvent() { if (!this.remote) { this.v.eventStart = Date.now(); this.save(); } }

  /* ----- treasure hunt ----- */
  goldenToday(n) { return this.remote ? this.goldenList : goldenForDay(dayIndex(Date.now()), n); }
  foundToday() { return (this.v.goldenFound[dayIndex(Date.now())] || []).length; }
  isFound(idx) { return (this.v.goldenFound[dayIndex(Date.now())] || []).includes(idx); }
  async findGolden(idx) {
    if (this.remote) {
      if (!this.remote.signedIn) { this.notify('Create an account to collect golden stars!'); this.open('quests'); return false; }
      const g = await this.run(() => this.remote.rpc('rpc_find_golden', { p_building: idx })); if (g === undefined) return false; await this.sync(); return true;
    }
    const d = dayIndex(Date.now()), list = (this.v.goldenFound[d] ||= []); if (list.includes(idx)) { this.notify('You already found that one today.'); return false; }
    list.push(idx); for (const k of Object.keys(this.v.goldenFound)) if (+k < d - 7) delete this.v.goldenFound[k]; this.save(); this.add(POINTS.golden, 'golden star found'); return true;
  }

  /* ----- claims ----- */
  async claimBuilding(i, platform, username, optIn, ageOk) {
    if (this.v.claim) return 'You already claimed a building.'; if (!ageOk) return 'Please confirm you are 13 or older.';
    const u = String(username || '').replace(/^@/, ''); if (!nameOk(u)) return 'That username is not allowed (letters, numbers, dots and underscores only, and no offensive words).';
    if (this.remote) { try { await this.remote.rpc('rpc_claim_building', { p_building: i, p_platform: platform, p_username: u, p_opt_in: !!optIn, p_age_ok: true }); } catch (e) { return e.message; } await this.sync(); await this.loadPublic(); this.applyFx(); this.onClaimed && this.onClaimed(i); return null; }
    this.v.ageOk = true; this.v.claim = { building: i, platform, username: u, optIn: !!optIn, status: 'pending', code: makeCode(Math.random), at: Date.now() }; this.save(); this.applyFx(); this.refreshBadge(); this.onClaimed && this.onClaimed(i); return null;
  }
  verifyDemo() { const c = this.v.claim; if (!c || c.status === 'verified') return; c.status = 'verified'; if (!this.v.verified[c.platform]) { this.v.verified[c.platform] = true; this.add(POINTS.verify, `verified ${c.platform}`); } this.save(); this.applyFx(); }

  /* ----- style shop ----- */
  async buy(id) {
    const c = COSMETICS.find(x => x.id === id); if (!c || this.v.owned.includes(id)) return;
    if (this.remote) { if (await this.run(async () => { await this.remote.rpc('rpc_buy_cosmetic', { p_id: id }); return true; })) { G.sfx('coin'); await this.sync(); this.render(); } return; }
    if (!canBuy(c, this.level, this.v.points)) return this.notify('Not enough stars or level too low.'); this.v.points -= c.cost; this.v.owned.push(id); this.save(); this.refreshBadge(); G.sfx('coin'); this.render();
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
    css.textContent = `#vhub{position:fixed;inset:0;display:none;z-index:30;font-family:system-ui,-apple-system,"Segoe UI",sans-serif;color:#f4f7ff;background:radial-gradient(circle at 50% 30%,rgba(30,40,100,.55),rgba(3,6,18,.85));animation:gfadein .25s}
#vhub .card{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);width:min(580px,calc(100vw - 16px));max-height:calc(100vh - 16px);display:flex;flex-direction:column;background:linear-gradient(#1b2557,#0e1436);border:4px solid #fff;border-radius:28px;overflow:hidden;box-shadow:0 8px 0 #060a24,0 28px 70px rgba(0,0,0,.65);animation:gpopc .4s cubic-bezier(.2,1.5,.4,1)}
@keyframes gpopc{0%{transform:translate(-50%,-50%) scale(.6);opacity:0}100%{transform:translate(-50%,-50%) scale(1);opacity:1}}
#vhub .head{display:flex;justify-content:space-between;align-items:center;padding:10px 14px}#vhub h2{margin:0;font:400 22px var(--game-font);letter-spacing:.02em}
#vhub .tabs{display:flex;gap:6px;padding:0 12px 10px;overflow-x:auto}
#vhub .tabs button{font:400 14px var(--game-font);padding:7px 14px;border-radius:999px;border:2px solid rgba(255,255,255,.35);background:rgba(255,255,255,.08);color:#dfe6ff;cursor:pointer;white-space:nowrap}#vhub .tabs button.on{background:linear-gradient(#4b8bff,#1f4fd8);border-color:#fff;color:#fff;box-shadow:0 3px 0 #0d2a8a}
#vhub .body{padding:6px 14px 16px;overflow:auto;display:flex;flex-direction:column;gap:10px;font-size:14px;line-height:1.5}
#vhub button{appearance:none;font:inherit;color:inherit;cursor:pointer}#vhub button:disabled{opacity:.45;cursor:not-allowed}
#vhub .gbtn{font-family:var(--game-font)}
#vhub input[type=text],#vhub input[type=email],#vhub input[type=password],#vhub input[type=date]{width:100%;padding:11px 12px;border-radius:14px;border:2px solid rgba(255,255,255,.35);background:rgba(0,0,0,.35);color:inherit;font:inherit;font-size:15px}
#vhub .q{display:flex;gap:12px;align-items:center;padding:12px;border-radius:18px;background:rgba(255,255,255,.07);border:2px solid rgba(255,255,255,.14)}#vhub .q.done{border-color:#58e08a;background:rgba(88,224,138,.1)}
#vhub .qi{flex:none;width:46px;height:46px;border-radius:14px;display:grid;place-items:center;font-size:25px;background:linear-gradient(#35407a,#232c5c);border:2px solid rgba(255,255,255,.3)}
#vhub .qb{flex:1;min-width:0}#vhub .qt{font:400 17px var(--game-font)}#vhub .dim{opacity:.7;font-size:12px}
#vhub .rw{flex:none;padding:5px 11px;border-radius:999px;background:linear-gradient(#ffd23a,#e0820a);border:2px solid #fff;font:400 14px var(--game-font);color:#fff;text-shadow:0 1px 0 rgba(0,0,0,.4)}
#vhub .xp{height:12px;border-radius:99px;background:rgba(255,255,255,.15);overflow:hidden;border:2px solid rgba(255,255,255,.4)}#vhub .xp i{display:block;height:100%;background:linear-gradient(90deg,#ffd23a,#ff8a00);transition:width .8s}
#vhub .qhead{display:flex;gap:12px;align-items:center;padding:12px;border-radius:18px;background:linear-gradient(#2b3a8a,#1c2762);border:2px solid #fff}
#vhub .av{flex:none;width:58px;height:58px;border-radius:50%;display:grid;place-items:center;font:400 26px var(--game-font);background:linear-gradient(#ff6bc4,#7a4fd0);border:3px solid #fff}
#vhub .steps{display:flex;gap:8px;justify-content:center;margin:2px 0}#vhub .steps i{flex:1;height:8px;border-radius:99px;background:rgba(255,255,255,.2)}#vhub .steps i.on{background:linear-gradient(90deg,#34e0a0,#4ae0ff)}
#vhub .sc{padding:12px;border-radius:18px;background:rgba(255,255,255,.07);border:2px solid rgba(255,255,255,.14);display:flex;flex-direction:column;gap:8px}#vhub .sn{display:inline-grid;place-items:center;width:28px;height:28px;border-radius:50%;background:#4b8bff;border:2px solid #fff;font:400 15px var(--game-font);margin-right:8px}
#vhub .seg{display:flex;gap:8px}#vhub .seg button{flex:1;padding:10px;border-radius:14px;border:2px solid rgba(255,255,255,.35);background:rgba(255,255,255,.08);font:400 15px var(--game-font)}#vhub .seg button.on{background:linear-gradient(#34e0a0,#0e9a6a);border-color:#fff}
#vhub .grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:10px}#vhub .item{padding:10px;border-radius:16px;background:rgba(255,255,255,.07);border:3px solid var(--rc,#b8c4d6);text-align:center;display:flex;flex-direction:column;gap:6px;position:relative}#vhub .item.eq{box-shadow:0 0 0 3px #58e08a,0 0 18px rgba(88,224,138,.6)}
#vhub .item .ic{font-size:34px}#vhub .item .rn{font-size:10px;letter-spacing:.14em;text-transform:uppercase;color:var(--rc)}
#vhub .crate{font-size:92px;text-align:center;animation:gbob 2s ease-in-out infinite}#vhub .crate.shake{animation:gshake .5s infinite}@keyframes gshake{0%,100%{transform:rotate(-6deg)}50%{transform:rotate(6deg)}}
#vhub .rank{display:flex;gap:10px;align-items:center;padding:9px 12px;border-radius:14px;background:rgba(255,255,255,.07)}#vhub .rank b{font:400 17px var(--game-font)}
#vhub .code{font:400 30px var(--game-font);letter-spacing:.14em;text-align:center;padding:10px;border-radius:16px;background:rgba(0,0,0,.35);border:3px dashed #ffd23a;color:#ffe066}
#vhub a{color:#8fc4ff}#vhub .err{color:#ff9a9a;font-size:13px;min-height:16px}`;
    document.head.appendChild(css);
    const root = this.root = document.createElement('div'); root.id = 'vhub'; root.innerHTML = `<div class="card"><div class="head"><h2>${this.remote ? 'My city' : 'My city (demo)'}</h2><button class="gbtn dark" id="vclose" style="padding:6px 14px">✕</button></div><div class="tabs" id="vtabs"></div><div class="body" id="vbody"></div></div>`;
    document.body.appendChild(root); root.addEventListener('pointerdown', e => { if (e.target === root) this.close(); });
    root.querySelector('#vclose').addEventListener('click', () => this.close()); this.body = root.querySelector('#vbody'); this.tabsEl = root.querySelector('#vtabs');
  }
  refreshBadge(quiet) {
    const v = this.v, pts = v.points, lv = levelOf(pts); G.renderBar(document.getElementById('gamebar'), this, tab => this.open(tab));
    if (!quiet && this._lastPts !== null) { if (pts > this._lastPts) G.floatGain(`+${fmt(pts - this._lastPts)} ★`); if (lv > this._lastLevel) G.levelUp(lv, LEVELS.find(l => l.level === lv).unlocks); }
    this._lastPts = pts; this._lastLevel = lv;
  }
  open(tab) { if (tab) this.tab = tab; clearTimeout(this._ct); this.root.classList.remove('closing'); if (this.root.style.display !== 'block') { G.sfx('open'); this._opens = (this._opens || 0) + 1; } this.root.style.display = 'block'; this.render(); if (this.remote && this.remote.signedIn) this.run(async () => { await this.sync(true); await this.loadPublic(); if (this.root.style.display === 'block') this.render(); }); }
  close() { if (this.root.style.display !== 'block') return; this.root.classList.add('closing'); clearTimeout(this._ct); this._ct = setTimeout(() => { this.root.style.display = 'none'; this.root.classList.remove('closing'); }, 200); }

  /* ----- live-site extras: daily and weekly quests, calendar, achievements, news, friends, community projects ----- */
  async _dailyQuests(box) {
    const q = await this.run(() => this.remote.rpc('rpc_quests')); if (!q || this.tab !== 'quests' || !box.isConnected) return;
    const row = x => `<div class="q ${x.claimed ? 'done' : ''}"><div class="qi">${x.claimed ? '✅' : '🎯'}</div><div class="qb"><div class="qt">${esc(x.title)}</div><div class="dim">${x.progress}/${x.target} · +${x.coins} 🪙 +${x.points} ★</div></div>${x.progress >= x.target && !x.claimed ? `<button class="gbtn gold pulse" data-claimq="${x.id}">Claim</button>` : ''}</div>`;
    box.innerHTML = `<div class="dim" style="margin:2px 0 6px">TODAY'S QUESTS ${q.freezeAvailable ? '· ❄️ streak freeze ready' : ''}</div>${q.daily.map(row).join('')}<div class="dim" style="margin:10px 0 6px">THIS WEEK (finish all 5 for a weekly chest 🎁)</div>${q.weekly.map(row).join('')}<div style="height:6px"></div>`;
    box.querySelectorAll('[data-claimq]').forEach(b => b.addEventListener('click', async () => {
      const r = await this.run(() => this.remote.rpc('rpc_claim_quest', { p_id: b.dataset.claimq })); if (!r) return; G.confetti(80); G.sfx('coin'); this.notify(`+${r.coins} coins, +${r.points} stars${r.chest ? ' and a weekly chest!' : ''}`); await this.run(() => this.sync()); this.render();
    }));
  }
  async _rewards(el) {
    el.innerHTML = '<div class="dim">Loading…</div>';
    const [cal, ach] = await Promise.all([this.run(() => this.remote.rpc('rpc_calendar')), this.run(() => this.remote.rpc('rpc_achievements'))]); if (!cal || this.tab !== 'rewards') return;
    if (ach && ach.new) { G.confetti(100); G.sfx('level'); G.banner(ach.new > 1 ? ach.new + ' ACHIEVEMENTS!' : 'ACHIEVEMENT!', 'Check your trophies below', '🏆'); this.notify(`${ach.new} new achievement${ach.new > 1 ? 's' : ''}!`); await this.run(() => this.sync()); }
    const next = cal.claimed >= 28 ? 1 : cal.claimed + 1, cells = Array.from({ length: 28 }, (_, i) => { const d = i + 1, done = d <= cal.claimed, big = d % 7 === 0; return `<div class="q ${done ? 'done' : ''}" style="padding:6px;flex-direction:column;gap:2px;justify-content:center;text-align:center;${d === next && cal.canClaim ? 'border-color:#ffd23a;box-shadow:0 0 12px #ffd23a' : ''}"><b style="font-family:var(--game-font)">${d}</b><span>${done ? '✅' : big ? '🎁' : '🪙'}</span></div>`; }).join('');
    const earned = new Set(ach ? ach.earned : []), defs = ach ? ach.defs : [];
    el.innerHTML = `<div class="sc"><div style="font:400 20px var(--game-font)">📅 28-day login calendar</div><div class="dim">Claim once a day. Days 7, 14, 21 and 28 give a rare cosmetic. Missing a day never resets it.</div><div style="display:grid;grid-template-columns:repeat(7,1fr);gap:6px">${cells}</div><button class="gbtn gold big" id="calgo" ${cal.canClaim ? '' : 'disabled'}>${cal.canClaim ? `Claim day ${next}` : 'Come back tomorrow'}</button></div>
<div class="sc"><div style="font:400 20px var(--game-font)">🏆 Achievements ${earned.size}/${ach ? ach.total : 0}</div><div class="dim">Each new one gives +10 ★. Your trophies:</div><div style="display:flex;flex-wrap:wrap;gap:6px">${defs.filter(d => earned.has(d.id)).map(d => `<span class="gpill" style="font-size:11px">${esc(d.title)}</span>`).join('') || '<span class="dim">None yet. Keep playing!</span>'}</div></div>`;
    const go = el.querySelector('#calgo'); if (go) go.addEventListener('click', async () => { const r = await this.run(() => this.remote.rpc('rpc_calendar_claim')); if (!r) return; G.confetti(140); G.sfx('claim'); G.banner('DAY ' + r.day + ' CLAIMED', `+${r.coins} coins · +${r.points} ★` + (r.cosmetic ? ' · rare cosmetic!' : ''), '📅'); this.notify(`Day ${r.day}: +${r.coins} coins, +${r.points} stars${r.cosmetic ? ' and a rare cosmetic!' : ''}`); await this.run(() => this.sync()); this._rewards(el); });
  }
  async _city(el) {
    el.innerHTML = '<div class="dim">Loading…</div>';
    const ago = t => { const s = Math.max(1, (Date.now() - Date.parse(t)) / 1000); return s < 3600 ? Math.round(s / 60) + 'm' : s < 86400 ? Math.round(s / 3600) + 'h' : Math.round(s / 86400) + 'd'; };
    const [feed, fr, coop] = await Promise.all([this.run(() => this.remote.select('public_feed?select=at,text')), this.run(() => this.remote.rpc('rpc_friend_feed')), this.run(() => this.remote.rpc('rpc_coop_list'))]); if (!feed || this.tab !== 'city') return;
    el.innerHTML = `<div class="sc"><div style="font:400 20px var(--game-font)">📰 City news</div>${feed.slice(0, 12).map(f => `<div class="rank"><span>${esc(f.text)}</span><span class="dim" style="margin-left:auto">${ago(f.at)}</span></div>`).join('') || '<div class="dim">Quiet so far.</div>'}</div>
<div class="sc"><div style="font:400 20px var(--game-font)">👥 Friends</div><div style="display:flex;gap:8px"><input type="text" id="fname" placeholder="@their username" maxlength="31"><button class="gbtn blue" id="fgo">Follow</button></div><div class="dim">Following: ${fr && fr.following.length ? fr.following.map(n => '@' + esc(n)).join(', ') : 'nobody yet'}</div>${(fr ? fr.feed : []).slice(0, 8).map(f => `<div class="rank"><span>${esc(f.text)}</span><span class="dim" style="margin-left:auto">${ago(f.at)}</span></div>`).join('')}</div>
<div class="sc"><div style="font:400 20px var(--game-font)">🏗️ Community projects</div>${(coop || []).map(p => `<div class="q"><div class="qi">${p.status === 'done' ? '🎉' : '🎡'}</div><div class="qb"><div class="qt">${esc(p.name)}</div><div class="xp"><i style="width:${Math.min(100, Math.round(p.funded / p.goal * 100))}%"></i></div><div class="dim">${fmt(p.funded)} / ${fmt(p.goal)} coins · you gave ${fmt(p.mine)} of max ${fmt(p.cap)}</div></div>${p.status === 'open' ? `<button class="gbtn gold" data-coop="${p.id}">+100</button>` : ''}</div>`).join('') || '<div class="dim">No project is open right now.</div>'}</div>`;
    const fgo = el.querySelector('#fgo'); fgo.addEventListener('click', async () => { const r = await this.run(() => this.remote.rpc('rpc_follow', { p_username: el.querySelector('#fname').value })); if (r) { this.notify('Following!'); this._city(el); } });
    el.querySelectorAll('[data-coop]').forEach(b => b.addEventListener('click', async () => { const r = await this.run(() => this.remote.rpc('rpc_coop_contribute', { p_project: +b.dataset.coop, p_amount: 100 })); if (r) { this.notify(r.done ? 'Project finished! Everyone who helped gets a reward.' : 'Thank you! +100 coins given.'); this._city(el); } }));
  }

  renderSignIn() {
    this.tabsEl.innerHTML = ''; const el = this.body, mode = this.authMode || 'create';
    if (this.remote.recovery) {
      el.innerHTML = `<div class="sc"><span class="gpill" style="align-self:flex-start">NEW PASSWORD</span><input type="password" id="np" placeholder="New password (8+ characters)" autocomplete="new-password"><button class="gbtn green big" id="npgo">Save new password</button><div class="err" id="smsg"></div></div>`;
      el.querySelector('#npgo').addEventListener('click', async () => { const msg = el.querySelector('#smsg'), pw = el.querySelector('#np').value; if (pw.length < 8) { msg.textContent = 'Use at least 8 characters.'; return; } try { await this.remote.updatePassword(pw); this.remote.recovery = false; await this.afterSignIn(); this.render(); } catch (e) { msg.textContent = e.message; } });
      return;
    }
    el.innerHTML = `<div style="text-align:center"><span class="gpill">${mode === 'create' ? 'JOIN THE CITY' : 'WELCOME BACK'}</span><div style="font:400 30px var(--game-font);margin:8px 0 2px">Claim your building</div><div class="dim">Free. No email to wait for. Takes 10 seconds.</div></div>
<div class="seg"><button data-m="create" class="${mode === 'create' ? 'on' : ''}">Create account</button><button data-m="login" class="${mode === 'login' ? 'on' : ''}">Log in</button></div>
<input type="email" id="semail" placeholder="Email" autocomplete="email"><input type="password" id="spass" placeholder="Password (8+ characters)" autocomplete="${mode === 'create' ? 'new-password' : 'current-password'}">
${mode === 'create' ? '<label style="display:flex;gap:8px;align-items:center"><input type="checkbox" id="sage" style="width:20px;height:20px"> I am 13 or older</label>' : ''}<button class="gbtn blue big" id="sgo">${mode === 'create' ? 'Create account' : 'Log in'}</button><div class="err" id="smsg"></div>
<div class="dim" style="text-align:center">Your email is only used for your account and is never shown to anyone. ${mode === 'login' ? '<br><a href="#" id="sforgot">Forgot your password? Send me a reset link</a>' : ''}<br><a href="privacy.html" target="_blank">Privacy (draft)</a></div>`;
    el.querySelectorAll('[data-m]').forEach(b => b.addEventListener('click', () => { this.authMode = b.dataset.m; this.renderSignIn(); }));
    const msg = el.querySelector('#smsg'), go = el.querySelector('#sgo');
    go.addEventListener('click', async () => {
      const em = el.querySelector('#semail').value.trim(), pw = el.querySelector('#spass').value;
      if (!/^\S+@\S+\.\S+$/.test(em)) { msg.textContent = 'Enter a valid email.'; return; } if (pw.length < 8) { msg.textContent = 'Use a password with at least 8 characters.'; return; }
      if (mode === 'create' && !el.querySelector('#sage').checked) { msg.textContent = 'Please confirm you are 13 or older.'; return; }
      go.disabled = true; go.textContent = 'One moment…'; msg.textContent = '';
      try {
        if (mode === 'create') { const r = await this.remote.signUp(em, pw); if (!r.signedIn) { msg.style.color = '#9bffb4'; msg.textContent = 'Almost done: check your email and click the confirmation link.'; go.disabled = false; go.textContent = 'Create account'; return; } } else await this.remote.signInPassword(em, pw);
        this.close(); await this.afterSignIn();
      } catch (e) { msg.textContent = e.message; go.disabled = false; go.textContent = mode === 'create' ? 'Create account' : 'Log in'; }
    });
    const fg = el.querySelector('#sforgot'); if (fg) fg.addEventListener('click', async e => { e.preventDefault(); const em = el.querySelector('#semail').value.trim(); if (!/^\S+@\S+\.\S+$/.test(em)) { msg.textContent = 'Type your email above first.'; return; } try { await this.remote.resetPassword(em); msg.style.color = '#9bffb4'; msg.textContent = 'If that email has an account, a reset link is on its way.'; } catch (err) { msg.textContent = err.message; } });
  }

  render() { const key = this.tab + '|' + (this._opens || 0), fresh = this._animKey !== key; this._animKey = key; this.body.classList.toggle('noanim', !fresh); this._render(); if (fresh) G.animateIn(this.body); }   // animate on open and tab change, not on every refresh
  _render() {
    if (this.remote && !this.remote.signedIn) { this.renderSignIn(); return; }
    const TABS = [['quests', 'Quests'], ['building', 'My building'], ['rewards', 'Rewards'], ['city', 'City'], ['style', 'Style'], ['crates', 'Crates'], ['leaders', 'Leaders'], ['support', 'Support'], ['more', 'More']];
    this.tabsEl.innerHTML = TABS.map(([id, n]) => `<button data-t="${id}" class="${this.tab === id ? 'on' : ''}">${n}</button>`).join(''); this.tabsEl.querySelectorAll('[data-t]').forEach(b => b.addEventListener('click', () => { this.tab = b.dataset.t; this.render(); }));
    const el = this.body, v = this.v, lv = this.level, nl = nextLevel(v.points), cur = LEVELS.find(l => l.level === lv); const bind = (sel, fn) => el.querySelectorAll(sel).forEach(e => e.addEventListener('click', () => fn(e)));
    const { W, count, next } = this.getCtx(), today = dayIndex(Date.now()), checked = v.lastDay === today;

    if (this.tab === 'quests') {
      const pct = nl ? Math.round((v.points - cur.at) / (nl.at - cur.at) * 100) : 100, found = this.foundToday(), c = v.claim, trackOn = checked ? ((v.streak - 1) % 7) + 1 : v.streak % 7;
      const quest = (icon, title, sub, reward, done, btn) => `<div class="q ${done ? 'done' : ''}"><div class="qi">${done ? '✅' : icon}</div><div class="qb"><div class="qt">${title}</div><div class="dim">${sub}</div></div>${btn || (reward ? `<div class="rw">${reward}</div>` : '')}</div>`;
      el.innerHTML = `<div id="qlive"></div><div class="qhead"><div class="av">${esc(this.name.replace('@', '')[0] || 'B').toUpperCase()}</div><div style="flex:1"><div style="font:400 20px var(--game-font)">${esc(this.name)} · Level ${lv}${v.supporter ? ' <span class="gpill" style="font-size:11px;padding:2px 8px">★ SUPPORTER</span>' : ''}</div><div class="xp"><i style="width:${pct}%"></i></div><div class="dim">${nl ? `${fmt(v.points - cur.at)} / ${fmt(nl.at - cur.at)} ★ to Level ${nl.level}: ${esc(nl.unlocks[0])}` : 'Max level!'}</div></div></div>
${quest('📅', 'Daily check-in', `<div class="gstreak" style="justify-content:flex-start;margin:6px 0 0">${Array.from({ length: 7 }, (_, i) => `<i class="${i < trackOn ? 'on' : ''}" style="width:28px;height:28px;font-size:13px">${i === 6 ? '🎁' : i + 1}</i>`).join('')}</div>`, `+${dailyReward(Math.max(1, v.streak + (checked ? 1 : 0)))} ★`, checked)}
${quest('🌟', 'Find the golden stars', `${[0, 1, 2].map(i => i < found ? '★' : '☆').join(' ')} &nbsp; ${found}/3 found today`, '+25 ★ each', found >= 3, found < 3 ? `<button class="gbtn gold" id="qhunt">Find one</button>` : '')}
${quest('🏷️', 'Claim your building', c ? `${esc(c.platform)} · building #${c.building + 1}` : 'Put your name on a building', '', !!c, c ? '' : `<button class="gbtn blue" id="qclaim">Claim</button>`)}
${quest('✔️', 'Verify it is you', c ? (c.status === 'verified' ? 'Verified! Your plate has a ✓' : 'Comment your code to get verified') : 'Claim a building first', '+100 ★', c && c.status === 'verified', c && c.status !== 'verified' ? `<button class="gbtn green" id="qver">Verify</button>` : '')}
${this.remote ? quest('🤝', 'Invite a friend', 'Share your link. They claim a building, you earn.', '+50 ★', false, `<button class="gbtn pink" id="qinv">Copy link</button>`) : ''}
${next ? quest('🔮', 'Predict the next milestone', `When will the city reach ${fmt(next.at)}? (${esc(next.name)})`, '+200 ★', !!v.predictions[next.at], `<button class="gbtn dark" id="qpred">${v.predictions[next.at] ? 'Change' : 'Guess'}</button>`) : ''}
${v.crates ? quest('🎁', `${v.crates} mystery crate${v.crates > 1 ? 's' : ''} ready!`, 'Open them to win cosmetics', '', false, `<button class="gbtn gold pulse" id="qcrate">Open</button>`) : ''}`;
      bind('#qhunt', () => { const t = this.goldenToday(Math.max(1, W ? W.S.length : 1)).find(i => !this.isFound(i)); if (t === undefined) this.notify('No stars to find right now.'); else { this.close(); this.locateGolden(t); } });
      bind('#qclaim', () => { this.tab = 'building'; this.render(); }); bind('#qver', () => { this.tab = 'building'; this.render(); }); bind('#qpred', () => { this.tab = 'more'; this.render(); }); bind('#qcrate', () => { this.tab = 'crates'; this.render(); });
      if (this.remote) this._dailyQuests(el.querySelector('#qlive'));
      bind('#qinv', () => { const link = `${location.origin}${location.pathname}?ref=${v.referralCode}`; navigator.clipboard && navigator.clipboard.writeText(link); this.notify('Invite link copied! Send it to a friend.'); });
    }

    if (this.tab === 'building') {
      const c = v.claim;
      if (!c) {
        const p = this.pending, plat = this.platform || 'instagram';
        el.innerHTML = `<div class="steps"><i class="${p ? 'on' : ''}"></i><i></i><i></i></div>
<div class="sc"><div><span class="sn">1</span><b style="font:400 17px var(--game-font)">Pick your building</b></div>${p ? `<div class="rank">🏠 <b>Building #${p.i + 1}</b> <span class="dim">${esc(p.type)}</span></div>` : '<div class="dim">Tap the button, then tap any building in the city.</div>'}<button class="gbtn ${p ? 'dark' : 'blue'}" id="cpick">${p ? 'Pick a different one' : 'Pick a building'}</button></div>
<div class="sc"><div><span class="sn">2</span><b style="font:400 17px var(--game-font)">Who are you?</b></div><div class="seg"><button data-pl="instagram" class="${plat === 'instagram' ? 'on' : ''}">Instagram</button><button data-pl="youtube" class="${plat === 'youtube' ? 'on' : ''}">YouTube</button></div><input type="text" id="cuser" placeholder="@yourusername" maxlength="31" value="${esc(this.draftName || '')}">
<label style="display:flex;gap:8px;align-items:center"><input type="checkbox" id="copt" checked style="width:20px;height:20px"> Show my @name on my building</label><label style="display:flex;gap:8px;align-items:center"><input type="checkbox" id="cage" style="width:20px;height:20px"> I am 13 or older</label></div>
<button class="gbtn green big" id="csub">Claim it!</button><div class="err" id="cerr"></div>`;
        bind('#cpick', () => { this.draftName = el.querySelector('#cuser').value; this.pickMode = true; this.close(); this.notify('Tap a building to pick it!'); });
        bind('[data-pl]', b => { this.draftName = el.querySelector('#cuser').value; this.platform = b.dataset.pl; this.render(); });
        bind('#csub', async () => { if (!this.pending) { el.querySelector('#cerr').textContent = 'Pick a building first.'; return; } const err = await this.claimBuilding(this.pending.i, plat, el.querySelector('#cuser').value, el.querySelector('#copt').checked, el.querySelector('#cage').checked); if (err) el.querySelector('#cerr').textContent = err; else { this.pending = null; this.draftName = ''; G.confetti(220); this.render(); } });
      } else {
        el.innerHTML = `<div class="steps"><i class="on"></i><i class="on"></i><i class="${c.status === 'verified' ? 'on' : ''}"></i></div><div class="sc" style="text-align:center"><span class="gpill" style="align-self:center">${c.status === 'verified' ? '✓ VERIFIED' : 'PENDING'}</span><div style="font:400 24px var(--game-font)">Building #${c.building + 1}</div><div class="dim">${esc(c.platform)} · ${c.optIn ? '@' + esc(c.username) : 'name hidden'}</div></div>
${c.status === 'verified' ? '<div class="q done"><div class="qi">✅</div><div class="qb"><div class="qt">You are verified!</div><div class="dim">Your name plate shows a green check.</div></div></div>' : `<div class="sc"><div><span class="sn">3</span><b style="font:400 17px var(--game-font)">Prove it is you</b></div><div class="dim">Comment this code on my latest ${c.platform === 'youtube' ? 'video' : 'post'}:</div><div class="code">${esc(c.code)}</div><button class="gbtn dark" id="ccopy">Copy code</button><div class="dim">${this.remote ? 'YouTube comments are checked automatically. Instagram ones are checked by hand. ' : ''}Verified = <b>+100 ★</b>.</div>${this.remote ? '<button class="gbtn green" id="crefresh">Check my status</button>' : '<button class="gbtn green" id="cver">Demo: simulate verification</button>'}</div>`}
<div style="display:flex;gap:8px;flex-wrap:wrap"><button class="gbtn green" id="cin">Go inside</button><button class="gbtn blue" id="cfly">Show my building</button><button class="gbtn pink" id="cshare">Make a share card</button>${this.remote ? '' : '<button class="gbtn dark" id="cdrop">Remove claim</button>'}</div>`;
        bind('#ccopy', () => { navigator.clipboard && navigator.clipboard.writeText(c.code); this.notify('Code copied!'); });
        bind('#cver', () => { this.verifyDemo(); G.confetti(160); G.sfx('claim'); G.banner('VERIFIED!', 'Your name plate has a green check', '✅'); this.render(); }); bind('#cdrop', () => { this.v.claim = null; this.save(); this.applyFx(); this.render(); });
        bind('#crefresh', async () => { await this.run(() => this.sync(true)); if (this.v.claim && this.v.claim.status === 'verified') { G.confetti(200); G.sfx('claim'); G.banner('VERIFIED!', 'Your name plate has a green check', '✅'); } this.applyFx(); this.render(); });
        bind('#cin', () => { this.close(); this.getCtx().enter(c.building); });
        bind('#cfly', () => { this.close(); this.getCtx().fly(c.building); }); bind('#cshare', () => { this.close(); this.getCtx().share(c.building); });
      }
    }

    if (this.tab === 'style') {
      el.innerHTML = `<div class="dim">Spend ★ on cosmetics for your building. Rare ones come from crates. Cosmetics are only for looks.</div><div class="grid">` + COSMETICS.map(c => {
        const own = v.owned.includes(c.id), eq = v.equipped[c.slot] === c.id, lock = lv < c.level;
        return `<div class="item ${eq ? 'eq' : ''}" style="--rc:${RC[c.rarity]}"><div class="ic">${SLOT_ICON[c.slot] || '✨'}</div><div class="rn">${c.rarity}</div><div style="font:400 14px var(--game-font)">${esc(c.name.replace(/^[A-Za-z ]+: /, ''))}</div>${own ? `<button class="gbtn ${eq ? 'green' : 'blue'}" data-eq="${c.id}" style="padding:6px 10px;font-size:13px">${eq ? 'Equipped' : 'Equip'}</button>` : c.source === 'crate' ? '<div class="dim">🎁 crate only</div>' : lock ? `<div class="dim">🔒 Level ${c.level}</div>` : `<button class="gbtn gold" data-buy="${c.id}" style="padding:6px 10px;font-size:13px" ${v.points < c.cost ? 'disabled' : ''}>★ ${fmt(c.cost)}</button>`}</div>`;
      }).join('') + '</div>';
      bind('[data-buy]', b => this.buy(b.dataset.buy)); bind('[data-eq]', b => this.equip(b.dataset.eq));
    }

    if (this.tab === 'crates') {
      el.innerHTML = `<div class="crate ${v.crates ? 'shake' : ''}">🎁</div><div style="text-align:center;font:400 22px var(--game-font)">${v.crates} crate${v.crates === 1 ? '' : 's'}</div><button class="gbtn gold big" id="copen" ${v.crates ? '' : 'disabled'}>Open a crate!</button><div class="dim" style="text-align:center">Earn one for every 7-day streak and every city milestone. Never for sale.</div>
<div class="dim">Odds, shown to everyone</div>${Object.entries(CRATE_ODDS).map(([k, p]) => `<div class="rank" style="border-left:6px solid ${RC[k]}"><b style="text-transform:capitalize">${k}</b><span style="margin-left:auto">${Math.round(p * 100)}%</span></div>`).join('')}<div class="dim">Duplicates turn into 25 ★.</div>`;
      bind('#copen', async () => { const r = await this.openOne(); if (r) { this.close(); this.showCrate(r); } });
    }

    if (this.tab === 'leaders') {
      el.innerHTML = '<div class="dim">Loading…</div>'; const medals = ['🥇', '🥈', '🥉'];
      const draw = b => { const tbl = (title, rows, k, unit) => `<div class="dim" style="margin-top:6px">${title}</div>${rows.length ? rows.slice(0, 10).map((r, i) => `<div class="rank">${medals[i] || '#' + (i + 1)} <span>${esc(r.name)}</span><b style="margin-left:auto">${fmt(r[k])}${unit}</b></div>`).join('') : '<div class="dim">Nobody yet. Be the first!</div>'}`; if (this.tab === 'leaders') el.innerHTML = tbl('Top stars', b.points, 'points', ' ★') + tbl('Longest streaks', b.streaks, 'streak', ' 🔥') + tbl('Most invites', b.referrals, 'referrals', ' 🤝'); };
      if (this.remote) this.run(async () => draw(await this.remote.boards())); else draw({ points: [{ name: this.name, points: v.points }], streaks: [{ name: this.name, streak: v.bestStreak }], referrals: [] });
    }

    if (this.tab === 'support') {
      const q = (this.remote && this.remote.s ? `?client_reference_id=${encodeURIComponent(this.remote.s.uid)}&prefilled_email=${encodeURIComponent(this.remote.email)}` : ''), tag = STRIPE_LINKS.test ? '<span class="gpill" style="align-self:flex-start">TEST MODE: no real money</span>' : '';
      el.innerHTML = `${tag}${v.supporter ? '<div class="q done"><div class="qi">🏅</div><div class="qb"><div class="qt">You are a Supporter. Thank you!</div><div class="dim">Your name plate shows a ★.</div></div></div>' : ''}<div class="sc"><div style="font:400 20px var(--game-font)">💛 Support Neverend City</div><div class="dim">Supporting is optional and only for looks and thanks. It never changes follower counts, levels or leaderboards, and nothing here is a random reward.</div></div>
<div class="q"><div class="qi">🏅</div><div class="qb"><div class="qt">Supporter pack · $5</div><div class="dim">Supporter badge and your name on the wall.</div></div><a class="gbtn gold" href="${STRIPE_LINKS.supporter}${q}" target="_blank" rel="noopener" style="text-decoration:none;color:#fff">Support</a></div>
<div class="q"><div class="qi">☕</div><div class="qb"><div class="qt">Leave a tip</div><div class="dim">Pick your own amount, from $1.</div></div><a class="gbtn pink" href="${STRIPE_LINKS.tip}${q}" target="_blank" rel="noopener" style="text-decoration:none;color:#fff">Tip</a></div>
<div class="dim">Payments are handled by Stripe. We never see your card. ${STRIPE_LINKS.test ? 'Test card: 4242 4242 4242 4242, any future date, any CVC.' : ''}</div>`;
    }

    if (this.tab === 'rewards') { if (!this.remote) el.innerHTML = '<div class="dim">The 28-day calendar and achievements work on the live site.</div>'; else this._rewards(el); }
    if (this.tab === 'city') { if (!this.remote) el.innerHTML = '<div class="dim">The news feed, friends and community projects work on the live site.</div>'; else this._city(el); }

    if (this.tab === 'more') {
      const m = next, cur2 = m && v.predictions[m.at], opts = next && (this.remote ? this.voteRows.filter(r => r.milestone === next.at).map(r => r.option) : VOTE_OPTIONS[next.at]);
      el.innerHTML = `${m ? `<div class="sc"><div style="font:400 18px var(--game-font)">🔮 Predict: ${fmt(m.at)} buildings</div><div class="dim">Pick the day the city reaches ${fmt(m.at)} (${esc(m.name)}). Right now: ${fmt(count)}. Correct = <b>+200 ★</b>.</div><input type="date" id="pdate" value="${cur2 ? new Date(cur2 * DAY).toISOString().slice(0, 10) : ''}"><button class="gbtn blue" id="psave">Save my guess</button></div>` : ''}
${opts && opts.length ? `<div class="sc"><div style="font:400 18px var(--game-font)">🗳️ Vote: next landmark at ${fmt(next.at)}</div>${opts.map(o => `<button class="gbtn ${v.votes[next.at] === o ? 'green' : 'dark'}" data-vote="${esc(o)}">${esc(o)}${v.votes[next.at] === o ? ' ✓' : ''}</button>`).join('')}</div>` : ''}
<div class="sc"><div style="font:400 18px var(--game-font)">⚙️ Your account</div>${this.remote ? `<div class="dim">Signed in as ${esc(this.remote.email)} (only you can see this)</div><button class="gbtn dark" id="sout">Log out</button>` : ''}<button class="gbtn dark" id="vdel">Delete my account and data</button><a href="privacy.html" target="_blank">Privacy (draft)</a></div>
${this.remote ? `<div class="sc"><div style="font:400 18px var(--game-font)">🎟️ Beta invite code</div><input type="text" id="icode" placeholder="NC-XXXXXX" maxlength="12"><button class="gbtn blue" id="iredeem">Use code</button></div>
<div class="sc"><div style="font:400 18px var(--game-font)">🚩 Report a problem</div><div class="dim">Report a name, a home or anything that breaks the rules. Building number is optional.</div><input type="text" id="rbld" placeholder="Building number (optional)" inputmode="numeric"><input type="text" id="rwhy" placeholder="What is wrong?" maxlength="300"><button class="gbtn dark" id="rsend">Send report</button></div>` : ''}
<div class="sc"><a href="help.html" target="_blank">Help and FAQ</a></div>`;
      bind('#iredeem', async () => { const r = await this.run(() => this.remote.rpc('rpc_redeem_invite', { p_code: el.querySelector('#icode').value })); if (r) this.notify('Invite accepted. Welcome to the beta!'); });
      bind('#rsend', async () => { const b = el.querySelector('#rbld').value.trim(), why = el.querySelector('#rwhy').value; const r = await this.run(async () => { await this.remote.rpc('rpc_report', { p_kind: b ? 'home' : 'other', p_building: b ? (+b - 1) : null, p_reason: why }); return true; }); if (r) { this.notify('Thank you. We will look at it.'); el.querySelector('#rwhy').value = ''; } });
      bind('#psave', async () => { const d = el.querySelector('#pdate').value; if (!d) return; const day = Math.floor(Date.parse(d + 'T00:00:00Z') / DAY); if (this.remote) { await this.run(() => this.remote.rpc('rpc_predict', { p_milestone: m.at, p_day: day })); await this.run(() => this.sync(true)); } else { v.predictions[m.at] = day; this.save(); } this.notify('Guess saved!'); this.render(); });
      bind('[data-vote]', async b => { if (this.remote) { await this.run(() => this.remote.rpc('rpc_vote', { p_milestone: next.at, p_option: b.dataset.vote })); await this.run(() => this.sync(true)); } else { v.votes[next.at] = b.dataset.vote; this.save(); } this.render(); });
      bind('#sout', () => { this.remote.signOut(); this.rv = visitorDefault(); this._lastPts = null; this.applyFx(); this.refreshBadge(true); this.render(); });
      bind('#vdel', async () => { if (!confirm('Delete your account and all your data? This cannot be undone.')) return; if (this.remote) { await this.run(() => this.remote.rpc('rpc_delete_account')); this.remote.signOut(); this.rv = visitorDefault(); this._lastPts = null; await this.run(() => this.loadPublic()); this.notify('Your account and data were deleted.'); } else this.store.reset(); this.applyFx(); this.refreshBadge(true); this.render(); });
    }
  }
}
