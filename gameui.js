// Game feel: chunky buttons, confetti, floating stars, level-up and welcome screens, the top game bar.
import { LEVELS, levelOf, nextLevel, POINTS, dailyReward } from './points.js';

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmt = n => Math.round(n).toLocaleString();
const COLORS = ['#ff4fb8', '#ffd23a', '#4ae0ff', '#8bff9b', '#b79bff', '#ff8a6b', '#ffffff'];

export function injectStyles() {
  if (document.getElementById('gamecss')) return;
  const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = 'https://fonts.googleapis.com/css2?family=Lilita+One&display=swap'; document.head.appendChild(l);
  const s = document.createElement('style'); s.id = 'gamecss';
  s.textContent = `
:root{--game-font:'Lilita One','Trebuchet MS',system-ui,sans-serif}
.gbtn{appearance:none;border:3px solid #fff;border-radius:999px;color:#fff;font-family:var(--game-font);font-size:15px;letter-spacing:.03em;padding:9px 16px 8px;cursor:pointer;text-shadow:0 2px 0 rgba(0,0,0,.35);transition:transform .12s,filter .12s;pointer-events:auto}
.gbtn:hover{transform:translateY(-2px);filter:brightness(1.1)}.gbtn:active{transform:translateY(2px) scale(.98)}.gbtn:disabled{opacity:.45;cursor:not-allowed;transform:none}
.gbtn.blue{background:linear-gradient(#4b8bff,#1f4fd8);box-shadow:0 4px 0 #0d2a8a,0 8px 18px rgba(0,0,0,.4)}.gbtn.green{background:linear-gradient(#34e0a0,#0e9a6a);box-shadow:0 4px 0 #086446,0 8px 18px rgba(0,0,0,.4)}
.gbtn.pink{background:linear-gradient(#ff6bc4,#d4237f);box-shadow:0 4px 0 #86104f,0 8px 18px rgba(0,0,0,.4)}.gbtn.gold{background:linear-gradient(#ffc83a,#e0820a);box-shadow:0 4px 0 #8e5006,0 8px 18px rgba(0,0,0,.4)}
.gbtn.dark{background:linear-gradient(#3a4466,#1e2540);box-shadow:0 4px 0 #0e1226,0 8px 18px rgba(0,0,0,.4)}.gbtn.big{font-size:19px;padding:13px 26px 12px}
.gbtn.pulse{animation:gpulse 1.6s ease-in-out infinite}
@keyframes gpulse{0%,100%{transform:scale(1);box-shadow:0 4px 0 #0d2a8a,0 0 0 0 rgba(120,190,255,.7)}50%{transform:scale(1.06);box-shadow:0 4px 0 #0d2a8a,0 0 0 14px rgba(120,190,255,0)}}
#dock{display:flex;gap:8px;justify-content:center;flex-wrap:wrap;pointer-events:auto}
#bottom{flex-direction:column;align-items:center}#viewmenu{display:flex;flex-wrap:wrap;gap:8px;justify-content:center;pointer-events:auto}#viewmenu[hidden]{display:none}
#gamebar{display:flex;gap:8px;justify-content:center;align-items:center;margin-top:10px;pointer-events:auto;flex-wrap:wrap}
.gchip{display:flex;align-items:center;gap:7px;padding:5px 13px 5px 7px;border-radius:999px;background:rgba(14,20,44,.78);border:2px solid rgba(255,255,255,.85);font-family:var(--game-font);font-size:16px;color:#fff;cursor:pointer;box-shadow:0 3px 0 rgba(0,0,0,.4);transition:transform .15s}
.gchip:hover{transform:translateY(-1px)}.gchip.bump{animation:gbump .45s}.gchip small{font-family:system-ui,sans-serif;font-size:10px;opacity:.7;letter-spacing:.08em}
@keyframes gbump{0%{transform:scale(1)}40%{transform:scale(1.25)}100%{transform:scale(1)}}
.gring{position:relative;width:38px;height:38px}.gring svg{position:absolute;inset:0;transform:rotate(-90deg)}.gring b{position:absolute;inset:0;display:grid;place-items:center;font-size:16px}
.gfloat{position:fixed;z-index:70;pointer-events:none;font-family:var(--game-font);font-size:26px;color:#ffe066;text-shadow:0 3px 0 #8a5a00,0 0 18px rgba(255,210,60,.8);animation:gfloat 1.6s ease-out forwards}
@keyframes gfloat{0%{opacity:0;transform:translateY(10px) scale(.6)}15%{opacity:1;transform:translateY(0) scale(1.25)}100%{opacity:0;transform:translateY(-70px) scale(1)}}
.govl{position:fixed;inset:0;z-index:65;display:grid;place-items:center;background:radial-gradient(circle at 50% 45%,rgba(40,50,120,.75),rgba(3,6,18,.92));animation:gfadein .35s;font-family:var(--game-font);color:#fff;text-align:center;padding:16px}
@keyframes gfadein{from{opacity:0}to{opacity:1}}
.gcard{position:relative;width:min(460px,92vw);padding:26px 22px 22px;border-radius:28px;background:linear-gradient(#1b2557,#0f1638);border:4px solid #fff;box-shadow:0 8px 0 #060a24,0 24px 60px rgba(0,0,0,.6);animation:gpop .5s cubic-bezier(.2,1.6,.4,1)}
@keyframes gpop{0%{transform:scale(.4);opacity:0}100%{transform:scale(1);opacity:1}}
.gpill{display:inline-block;padding:5px 14px;border-radius:999px;background:linear-gradient(#4b8bff,#1f4fd8);border:3px solid #fff;font-size:13px;letter-spacing:.12em}
.gcard h1{margin:12px 0 6px;font-size:34px;line-height:1.05;font-weight:400}.gcard p{margin:0 0 14px;font-family:system-ui,sans-serif;font-size:15px;line-height:1.5;color:#c9d4ff}
.ghero{font-size:84px;line-height:1;margin:6px 0;animation:gbob 2s ease-in-out infinite;filter:drop-shadow(0 8px 12px rgba(0,0,0,.45))}@keyframes gbob{0%,100%{transform:translateY(0) rotate(-3deg)}50%{transform:translateY(-12px) rotate(3deg)}}
.gdots{display:flex;gap:7px;justify-content:center;margin:6px 0 14px}.gdots i{width:10px;height:10px;border-radius:50%;background:rgba(255,255,255,.3);transition:.2s}.gdots i.on{background:#fff;transform:scale(1.3)}
.gbig{font-size:64px;line-height:1;color:#ffe066;text-shadow:0 5px 0 #8a5a00,0 0 30px rgba(255,210,60,.7);margin:6px 0}
.gring2{position:absolute;left:50%;top:50%;width:80px;height:80px;margin:-40px;border-radius:50%;border:4px solid rgba(255,230,120,.8);pointer-events:none;animation:gring 1.4s ease-out infinite}.gring2:nth-child(2){animation-delay:.45s}.gring2:nth-child(3){animation-delay:.9s}
@keyframes gring{0%{transform:scale(.3);opacity:1}100%{transform:scale(5);opacity:0}}
.gripple{position:fixed;z-index:90;width:14px;height:14px;margin:-7px;border-radius:50%;border:3px solid rgba(255,255,255,.9);pointer-events:none;animation:grip .5s ease-out forwards}
@keyframes grip{0%{transform:scale(.4);opacity:.95}100%{transform:scale(4.2);opacity:0}}
#dock{animation:gdock .7s cubic-bezier(.2,1.4,.4,1) both}@keyframes gdock{from{transform:translateY(40px);opacity:0}to{transform:none;opacity:1}}
#gamebar{animation:gdown .6s cubic-bezier(.2,1.4,.4,1) both .15s}@keyframes gdown{from{transform:translateY(-24px);opacity:0}to{transform:none;opacity:1}}
#vhub{backdrop-filter:blur(7px);-webkit-backdrop-filter:blur(7px)}#vhub.closing{animation:gfadeout .2s forwards}#vhub.closing .card{animation:gshrink .2s forwards}
@keyframes gfadeout{to{opacity:0}}@keyframes gshrink{to{transform:translate(-50%,-50%) scale(.9);opacity:0}}
#vhub .body.noanim>*{animation:none!important}#vhub .body>*{animation:gitem .38s cubic-bezier(.2,1.2,.4,1) both;animation-delay:calc(var(--i,0) * 45ms)}
@keyframes gitem{from{opacity:0;transform:translateY(14px) scale(.97)}to{opacity:1;transform:none}}
#vhub .q,#vhub .item,#vhub .rank{transition:transform .15s,box-shadow .15s,border-color .15s}#vhub .q:hover,#vhub .item:hover{transform:translateY(-2px);box-shadow:0 8px 18px rgba(0,0,0,.35)}
#vhub .tabs button{transition:transform .12s,background .2s}#vhub .tabs button:active{transform:scale(.94)}
.gbanner{position:fixed;left:50%;top:21%;z-index:85;display:flex;gap:14px;align-items:center;padding:14px 26px 14px 18px;border-radius:24px;background:linear-gradient(#2b3a8a,#161f55);border:4px solid #fff;box-shadow:0 8px 0 #060a24,0 0 50px rgba(120,160,255,.65);color:#fff;font-family:var(--game-font);overflow:hidden;pointer-events:none;animation:gbanin .65s cubic-bezier(.2,1.7,.35,1) both}
.gbanner.out{animation:gbanout .4s ease-in forwards}.gbanner::after{content:"";position:absolute;inset:0;background:linear-gradient(105deg,transparent 35%,rgba(255,255,255,.55) 50%,transparent 65%);transform:translateX(-120%);animation:gshine 1.1s .5s ease-out}
.gbe{font-size:46px;animation:gbob 1.6s ease-in-out infinite}.gbt{font-size:28px;letter-spacing:.04em;text-shadow:0 3px 0 rgba(0,0,0,.4)}.gbs{font:600 13px system-ui,sans-serif;opacity:.8;letter-spacing:.06em}
@keyframes gbanin{from{transform:translate(-50%,-90px) scale(.5);opacity:0}to{transform:translate(-50%,0) scale(1);opacity:1}}@keyframes gbanout{to{transform:translate(-50%,-40px) scale(.85);opacity:0}}@keyframes gshine{to{transform:translateX(120%)}}
.gstreak{display:flex;gap:6px;justify-content:center;margin:10px 0}.gstreak i{width:34px;height:34px;border-radius:50%;display:grid;place-items:center;font-style:normal;font-size:15px;background:rgba(255,255,255,.12);border:2px solid rgba(255,255,255,.3)}.gstreak i.on{background:linear-gradient(#ffb020,#ff6a00);border-color:#fff;animation:gbump .5s}
`;
  document.head.appendChild(s);
  // every button gets a soft tap ring and a tick sound
  addEventListener('pointerdown', e => {
    const b = e.target.closest && e.target.closest('button, .gchip, a.gbtn, .q, .item'); if (!b || b.disabled) return;
    if (!document.body.classList.contains('rm')) { const r = document.createElement('div'); r.className = 'gripple'; r.style.left = e.clientX + 'px'; r.style.top = e.clientY + 'px'; document.body.appendChild(r); setTimeout(() => r.remove(), 520); }
    sfx('tap');
  }, true);
}

/* ---------- sound (tiny synthesized effects; no files to load) ---------- */
let ac = null, muted = false; try { muted = localStorage.getItem('nc.mute') === '1'; } catch (e) { /* ignore */ }
export const isMuted = () => muted;
export function setMuted(m) { muted = m; try { localStorage.setItem('nc.mute', m ? '1' : '0'); } catch (e) { /* ignore */ } }
function audio() { if (!ac) { try { ac = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { return null; } } if (ac.state === 'suspended') ac.resume(); return ac; }
function tone(freq, at, dur, type = 'sine', vol = 0.12, to) {
  const a = audio(); if (!a || muted) return; const t = a.currentTime + at, o = a.createOscillator(), g = a.createGain();
  o.type = type; o.frequency.setValueAtTime(freq, t); if (to) o.frequency.exponentialRampToValueAtTime(to, t + dur);
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.012); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g); g.connect(a.destination); o.start(t); o.stop(t + dur + 0.05);
}
export function sfx(name) {
  if (muted) return;
  if (name === 'tap') tone(720, 0, 0.05, 'triangle', 0.05);
  else if (name === 'open') tone(280, 0, 0.2, 'sine', 0.09, 640);
  else if (name === 'coin') { tone(988, 0, 0.09, 'square', 0.05); tone(1319, 0.08, 0.16, 'square', 0.05); }
  else if (name === 'claim') [523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, i * 0.09, 0.28, 'triangle', 0.1));
  else if (name === 'level') [392, 523, 659, 784, 1047, 1568].forEach((f, i) => tone(f, i * 0.08, 0.3, 'sine', 0.11));
  else if (name === 'place') { tone(170, 0, 0.14, 'sine', 0.2, 70); tone(900, 0.02, 0.05, 'triangle', 0.04); }
  else if (name === 'error') tone(180, 0, 0.18, 'sawtooth', 0.06, 120);
}

/* ---------- big banner ("BUILDING CLAIMED!") ---------- */
export function banner(title, sub, emoji = '🎉') {
  const b = document.createElement('div'); b.className = 'gbanner'; b.innerHTML = `<div class="gbe">${emoji}</div><div><div class="gbt">${esc(title)}</div><div class="gbs">${esc(sub || '')}</div></div>`; document.body.appendChild(b);
  setTimeout(() => { b.classList.add('out'); setTimeout(() => b.remove(), 420); }, 3000);
}

/* ---------- panel helpers: staggered entrance, bars that fill, numbers that count up ---------- */
export function animateIn(root) {
  [...root.children].slice(0, 16).forEach((c, i) => c.style.setProperty('--i', i));
  root.querySelectorAll('.xp i').forEach(b => { const w = b.style.width; b.style.width = '0%'; void b.offsetWidth; requestAnimationFrame(() => { b.style.width = w; }); });
}
export function countUp(el, to, ms = 700) {
  const from = Number(el.dataset.v ?? to); el.dataset.v = to; if (from === to || document.body.classList.contains('rm')) { el.textContent = fmt(to); return; }
  const t0 = performance.now(); const step = t => { const k = Math.min(1, (t - t0) / ms), e = 1 - Math.pow(1 - k, 3); el.textContent = fmt(from + (to - from) * e); if (k < 1) requestAnimationFrame(step); }; requestAnimationFrame(step);
}

/* ---------- confetti ---------- */
let conf = null;
export function confetti(n = 160, origin) {
  if (document.body.classList.contains('rm')) return;          // "Reduce motion" is on
  if (!conf) { const c = document.createElement('canvas'); c.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;pointer-events:none;z-index:80'; document.body.appendChild(c); conf = { c, g: c.getContext('2d'), p: [], run: false }; }
  const { c, g } = conf, dpr = Math.min(devicePixelRatio || 1, 2); c.width = innerWidth * dpr; c.height = innerHeight * dpr;
  const ox = origin ? origin.x : innerWidth / 2, oy = origin ? origin.y : innerHeight * 0.4;
  for (let i = 0; i < n; i++) { const a = Math.random() * Math.PI * 2, s = 4 + Math.random() * 11; conf.p.push({ x: ox, y: oy, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 6, r: Math.random() * 6, vr: (Math.random() - 0.5) * 0.4, w: 6 + Math.random() * 8, h: 4 + Math.random() * 6, col: COLORS[i % COLORS.length], life: 1 }); }
  if (conf.run) return; conf.run = true;
  const step = () => { g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, innerWidth, innerHeight);
    conf.p = conf.p.filter(p => p.life > 0 && p.y < innerHeight + 30);
    for (const p of conf.p) { p.vy += 0.38; p.vx *= 0.992; p.x += p.vx; p.y += p.vy; p.r += p.vr; p.life -= 0.004; g.save(); g.translate(p.x, p.y); g.rotate(p.r); g.globalAlpha = Math.min(1, p.life * 2); g.fillStyle = p.col; g.fillRect(-p.w / 2, -p.h / 2, p.w, p.h); g.restore(); }
    if (conf.p.length) requestAnimationFrame(step); else { conf.run = false; g.clearRect(0, 0, innerWidth, innerHeight); } };
  requestAnimationFrame(step);
}

/* ---------- floating "+25 ★" near the stars chip ---------- */
export function floatGain(text) {
  const t = document.getElementById('gchip-stars'), r = t ? t.getBoundingClientRect() : { left: innerWidth / 2 - 30, top: 120, width: 60 };
  const e = document.createElement('div'); e.className = 'gfloat'; e.textContent = text; e.style.left = r.left + r.width / 2 - 30 + 'px'; e.style.top = r.top + 'px'; document.body.appendChild(e); setTimeout(() => e.remove(), 1700);
  if (t) { t.classList.remove('bump'); void t.offsetWidth; t.classList.add('bump'); }
}

/* ---------- overlays ---------- */
function overlay(html, onClose) {
  const o = document.createElement('div'); o.className = 'govl'; o.innerHTML = html; document.body.appendChild(o);
  const close = () => { o.style.transition = 'opacity .25s'; o.style.opacity = 0; setTimeout(() => { o.remove(); onClose && onClose(); }, 250); };
  return { o, close };
}
export function levelUp(level, unlocks) {
  const { o, close } = overlay(`<div class="gcard"><div class="gring2"></div><div class="gring2"></div><div class="gring2"></div><span class="gpill">LEVEL UP</span><div class="gbig">Level ${level}!</div><p>You unlocked:</p>${(unlocks || []).map(u => `<p style="color:#fff;font-size:17px;margin:4px 0">★ ${esc(u)}</p>`).join('')}<button class="gbtn green big" id="gok" style="margin-top:12px">Awesome!</button></div>`);
  confetti(220); sfx('level'); o.querySelector('#gok').addEventListener('click', close); setTimeout(close, 6000);
}
export function welcomeBack({ name, streak, gained, crate }, onClose) {
  const days = Array.from({ length: 7 }, (_, i) => `<i class="${i < ((streak - 1) % 7) + 1 ? 'on' : ''}">${i === 6 ? '🎁' : i + 1}</i>`).join('');
  const { o, close } = overlay(`<div class="gcard"><span class="gpill">${streak > 1 ? 'DAILY STREAK' : 'WELCOME'}</span><h1>${streak > 1 ? `Day ${streak}! 🔥` : `Welcome, ${esc(name || 'builder')}!`}</h1><div class="gstreak">${days}</div><div class="gbig" id="gcount">+0 ★</div><p>${streak > 1 ? 'Come back tomorrow to keep your streak!' : 'You helped build Neverend City. Claim a building and make it yours!'}${crate ? '<br><b style="color:#ffe066">A mystery crate for your 7-day streak!</b>' : ''}</p><button class="gbtn blue big" id="gok">Let's go!</button></div>`, onClose);
  confetti(180); sfx('claim'); const el = o.querySelector('#gcount'); let v = 0; const iv = setInterval(() => { v = Math.min(gained, v + Math.max(1, Math.ceil(gained / 24))); el.textContent = '+' + v + ' ★'; if (v >= gained) clearInterval(iv); }, 35);
  o.querySelector('#gok').addEventListener('click', close); setTimeout(close, 9000);
}
const SLIDES = [
  ['WELCOME', 'Every follower gets a building.', 'Neverend City grows by one building for every Instagram follower and YouTube subscriber. Yours is already waiting.', '🏙️'],
  ['CLAIM IT', 'Make a building yours.', 'Pick one, add your @username, and prove it is you with a quick comment. Your name floats over it in 3D.', '🏷️'],
  ['EARN STARS', 'Visit, hunt, collect ★', 'Come back every day, find the hidden golden stars, invite friends. Stars level you up.', '⭐'],
  ['STYLE IT', 'Open crates, decorate.', 'Spend stars on colors, neon signs and rooftop items. Crates hold rare surprises.', '🎁'],
];
export function welcomeCarousel(onDone) {
  let i = 0; const { o, close } = overlay('<div class="gcard" id="gcar"></div>', onDone);
  const draw = () => { const [pill, h, p, e] = SLIDES[i]; o.querySelector('#gcar').innerHTML = `<span class="gpill">${pill}</span><div class="ghero">${e}</div><h1>${h}</h1><p>${p}</p><div class="gdots">${SLIDES.map((_, k) => `<i class="${k === i ? 'on' : ''}"></i>`).join('')}</div><button class="gbtn blue big" id="gnext">${i === SLIDES.length - 1 ? "Let's play!" : 'Next'}</button> <button class="gbtn dark" id="gskip" style="margin-left:6px">Skip</button>`;
    o.querySelector('#gnext').addEventListener('click', () => { if (i === SLIDES.length - 1) close(); else { i++; draw(); } }); o.querySelector('#gskip').addEventListener('click', close); };
  draw();
}

/* ---------- top game bar: level ring, stars, streak, crates ---------- */
export function renderBar(el, visitor, onOpen) {
  if (!el) return;
  if (visitor.remote && !visitor.remote.signedIn) { el.innerHTML = '<button class="gbtn blue big pulse" id="gjoin">Claim your building</button>'; el.querySelector('#gjoin').addEventListener('click', () => onOpen('quests')); return; }
  const v = visitor.v, lv = levelOf(v.points), nl = nextLevel(v.points), cur = LEVELS.find(l => l.level === lv), pct = nl ? (v.points - cur.at) / (nl.at - cur.at) : 1, C = 2 * Math.PI * 16;
  el.innerHTML = `<div class="gchip" id="gchip-level"><div class="gring"><svg viewBox="0 0 40 40"><circle cx="20" cy="20" r="16" fill="none" stroke="rgba(255,255,255,.2)" stroke-width="5"/><circle cx="20" cy="20" r="16" fill="none" stroke="#ffd23a" stroke-width="5" stroke-linecap="round" stroke-dasharray="${C}" stroke-dashoffset="${C * (1 - pct)}"/></svg><b>${lv}</b></div><small>LEVEL</small></div>
<div class="gchip" id="gchip-stars"><span style="color:#ffd23a;font-size:20px">★</span> <span id="gstarn" data-v="${el.dataset.stars ?? v.points}">${fmt(el.dataset.stars ?? v.points)}</span></div><div class="gchip" id="gchip-streak"><span style="font-size:18px">🔥</span> ${v.streak}</div>${v.crates ? `<div class="gchip" id="gchip-crates"><span style="font-size:18px">🎁</span> ${v.crates}</div>` : ''}`;
  el.querySelectorAll('.gchip').forEach(c => c.addEventListener('click', () => onOpen(c.id === 'gchip-crates' ? 'crates' : 'quests')));
  countUp(el.querySelector('#gstarn'), v.points); el.dataset.stars = v.points;      // the stars number rolls up to the new total
}
