// Visitor points, levels, daily golden objects, crates and predictions.
// Pure functions (no browser or server code) so the same file runs in the demo and on the server,
// where every award is calculated from timestamps and never from a number the browser sends.

export const POINTS = { daily: 10, streakStep: 5, streakMax: 50, golden: 25, verify: 100, referral: 50, prediction: 200 };
export const DAY = 24 * 3600 * 1000;
export const dayIndex = ms => Math.floor(ms / DAY);

export const LEVELS = [
  { level: 1, at: 0,     unlocks: ['Claim a building', 'Basic colors'] },
  { level: 2, at: 250,   unlocks: ['Rooftop items', 'Name plate styles'] },
  { level: 3, at: 1000,  unlocks: ['Neon signs', 'Animated windows'] },
  { level: 4, at: 5000,  unlocks: ['Upgrade a house into a tower', 'Legendary skins'] },
  { level: 5, at: 20000, unlocks: ['Name a street after yourself (needs approval)'] },
];
export const levelOf = pts => LEVELS.reduce((l, x) => (pts >= x.at ? x.level : l), 1);
export const nextLevel = pts => LEVELS.find(x => x.at > pts) || null;

/* ---------- daily visit ---------- */
// streak = consecutive days including today. Day 1 = +10, day 2 = +15 ... bonus capped at +50.
export const dailyReward = streak => POINTS.daily + Math.min(POINTS.streakMax, POINTS.streakStep * Math.max(0, streak - 1));
// Returns the new streak when visiting on `today` after last visiting on `lastDay` (day indexes).
export function nextStreak(lastDay, today, streak) {
  if (lastDay === today) return { streak, counted: false };
  return { streak: lastDay === today - 1 ? streak + 1 : 1, counted: true };
}

/* ---------- double points during a live milestone event ---------- */
export const EVENT_MS = 10 * 60 * 1000;
export const pointsMultiplier = (nowMs, eventStartMs) => (eventStartMs && nowMs >= eventStartMs && nowMs < eventStartMs + EVENT_MS ? 2 : 1);

/* ---------- hidden golden objects: 3 per day, the same for everyone ---------- */
function hash(a, b) { let h = (Math.imul(a ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(b + 0x7f4a7c15, 0xc2b2ae35)) >>> 0; h = Math.imul(h ^ h >>> 15, 0x2c1b3c6d); h = Math.imul(h ^ h >>> 12, 0x297a2d39); return (h ^ h >>> 15) >>> 0; }
// Returns 3 distinct structure indexes among the first `n` structures. Deterministic per day.
export function goldenForDay(day, n, secret = 1) {
  const want = Math.min(3, n), out = [];
  for (let k = 0; out.length < want && k < 50; k++) { const idx = hash(day * 31 + secret, k * 7919 + 13) % n; if (!out.includes(idx)) out.push(idx); }
  for (let i = 0; out.length < want; i++) if (!out.includes(i)) out.push(i);
  return out;
}

/* ---------- mystery crates ---------- */
export const CRATE_ODDS = { common: 0.60, rare: 0.30, epic: 0.09, legendary: 0.01 };
export function rollRarity(r) { let acc = 0; for (const [k, p] of Object.entries(CRATE_ODDS)) { acc += p; if (r < acc) return k; } return 'common'; }
// Crates are earned: one per 7-day streak, and one at every city milestone.
export const cratesForStreak = streak => (streak > 0 && streak % 7 === 0 ? 1 : 0);

/* ---------- cosmetics (points shop) ---------- */
// source: 'points' = buyable with points at that level; 'crate' = only from crates or events
export const COSMETICS = [
  ...['Cream', 'Sky', 'Rose', 'Mint', 'Lilac', 'Sunset'].map(n => ({ id: 'color-' + n.toLowerCase(), name: 'Color: ' + n, rarity: 'common', level: 1, cost: 40, source: 'points', slot: 'color' })),
  { id: 'glow-warm',   name: 'Glowing windows (warm)', rarity: 'common', level: 1, cost: 120, source: 'points', slot: 'glow' },
  { id: 'roof-antenna', name: 'Rooftop antenna',       rarity: 'common', level: 2, cost: 200, source: 'points', slot: 'roof' },
  { id: 'roof-garden',  name: 'Roof garden',           rarity: 'common', level: 2, cost: 300, source: 'points', slot: 'roof' },
  { id: 'roof-helipad', name: 'Helipad',               rarity: 'rare',   level: 2, cost: 500, source: 'points', slot: 'roof' },
  { id: 'roof-billboard', name: 'Billboard with your name', rarity: 'rare', level: 2, cost: 600, source: 'points', slot: 'roof' },
  { id: 'plate-wood',   name: 'Name plate: wood',      rarity: 'common', level: 2, cost: 150, source: 'points', slot: 'plate' },
  { id: 'plate-neon',   name: 'Name plate: neon',      rarity: 'rare',   level: 2, cost: 400, source: 'points', slot: 'plate' },
  { id: 'neon-pink',    name: 'Neon sign: pink',       rarity: 'rare',   level: 3, cost: 700, source: 'points', slot: 'neon' },
  { id: 'neon-cyan',    name: 'Neon sign: cyan',       rarity: 'rare',   level: 3, cost: 700, source: 'points', slot: 'neon' },
  { id: 'glow-anim',    name: 'Animated windows',      rarity: 'epic',   level: 3, cost: 1200, source: 'points', slot: 'glow' },
  { id: 'fx-fireworks', name: 'Rooftop fireworks',     rarity: 'epic',   level: 3, cost: 1500, source: 'points', slot: 'fx' },
  // crate-only
  { id: 'roof-satellite', name: 'Satellite dish',      rarity: 'common', level: 1, source: 'crate', slot: 'roof' },
  { id: 'color-gold',   name: 'Color: Gold',           rarity: 'rare',   level: 1, source: 'crate', slot: 'color' },
  { id: 'fx-halo',      name: 'Halo ring',             rarity: 'epic',   level: 1, source: 'crate', slot: 'fx' },
  { id: 'plate-gold',   name: 'Name plate: gold',      rarity: 'epic',   level: 1, source: 'crate', slot: 'plate' },
  { id: 'skin-aurora',  name: 'Legendary skin: Aurora', rarity: 'legendary', level: 4, source: 'crate', slot: 'skin' },
  { id: 'skin-crystal', name: 'Legendary skin: Crystal', rarity: 'legendary', level: 4, source: 'crate', slot: 'skin' },
];
export const crateLoot = rarity => COSMETICS.filter(c => c.source === 'crate' && c.rarity === rarity);
// Opens a crate with a random number r in [0,1) and a second one for picking the item. Returns a cosmetic.
export function openCrate(r1, r2) {
  let rarity = rollRarity(r1), pool = crateLoot(rarity);
  while (!pool.length) { rarity = { legendary: 'epic', epic: 'rare', rare: 'common' }[rarity] || 'common'; pool = crateLoot(rarity); }
  return pool[Math.floor(r2 * pool.length) % pool.length];
}
export const canBuy = (c, level, pts) => c.source === 'points' && level >= c.level && pts >= c.cost;

/* ---------- predictions ---------- */
// A prediction is a calendar day (UTC). It is correct when the milestone is reached on that day.
export const predictionHit = (predictedDay, actualMs) => predictedDay === dayIndex(actualMs);

/* ---------- name filter (server runs the same list plus a stricter service if you add one) ---------- */
const BAD = ['fuck', 'shit', 'bitch', 'cunt', 'nigg', 'fagg', 'rape', 'nazi', 'hitler', 'porn', 'sex', 'dick', 'cock', 'pussy', 'whore', 'slut', 'kkk', 'kill'];
export function nameOk(name) {
  const n = String(name || '').toLowerCase().replace(/[^a-z0-9]/g, '').replace(/0/g, 'o').replace(/1/g, 'i').replace(/3/g, 'e').replace(/4/g, 'a').replace(/5/g, 's').replace(/\$/g, 's');
  return /^[a-z0-9._]{1,30}$/i.test(String(name || '').replace(/^@/, '')) && !BAD.some(w => n.includes(w));
}
// A short human-friendly verification code visitors paste into a comment.
export function makeCode(rand) { const A = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; let s = 'NC-'; for (let i = 0; i < 6; i++) s += A[Math.floor(rand() * A.length)]; return s; }
