// City Coins economy. Pure functions with no browser or server dependencies, so the exact same
// code can run in the browser (demo mode) and later on the server, where it is the source of truth.
// All earnings come from timestamps (never from a client-reported number).
// Coins can never be cashed out, sold or transferred between players.

export const HOUR = 3600 * 1000;
export const MAX_LEVEL = 50;

export const BUSINESSES = {
  lemonade: { name: 'Lemonade stand',   base: 12,   unlockOwner: 1,  color: '#ffd23a' },
  coffee:   { name: 'Coffee shop',      base: 40,   unlockOwner: 2,  color: '#a8683a' },
  pizza:    { name: 'Pizza place',      base: 90,   unlockOwner: 4,  color: '#d9433a' },
  arcade:   { name: 'Arcade',           base: 160,  unlockOwner: 6,  color: '#b79bff' },
  gym:      { name: 'Gym',              base: 260,  unlockOwner: 8,  color: '#3a8a5a' },
  clothing: { name: 'Clothing store',   base: 420,  unlockOwner: 10, color: '#ff8fb1' },
  cars:     { name: 'Car dealership',   base: 800,  unlockOwner: 13, color: '#2f6aa8' },
  tech:     { name: 'Tech startup',     base: 1500, unlockOwner: 16, color: '#6fe3ff' },
};

// Growth path: stand -> shop -> franchise. Higher stages unlock at owner level milestones.
export const STAGES = [
  { name: 'stand',     fromLevel: 1,  ownerLevel: 1 },
  { name: 'shop',      fromLevel: 10, ownerLevel: 5 },
  { name: 'franchise', fromLevel: 25, ownerLevel: 12 },
];
export const stageOf = level => STAGES.reduce((s, st) => (level >= st.fromLevel ? st : s), STAGES[0]);

export const FURNITURE = {
  bed:       { name: 'Bed',            price: 120, w: 2.0, d: 1.6, kind: 'floor' },
  sofa:      { name: 'Sofa',           price: 150, w: 2.2, d: 0.9, kind: 'floor' },
  tv:        { name: 'TV and stand',   price: 200, w: 1.6, d: 0.5, kind: 'floor' },
  plant:     { name: 'Plant',          price: 25,  w: 0.6, d: 0.6, kind: 'floor' },
  lamp:      { name: 'Floor lamp',     price: 40,  w: 0.5, d: 0.5, kind: 'floor' },
  table:     { name: 'Table + chairs', price: 90,  w: 1.6, d: 1.6, kind: 'floor' },
  bookshelf: { name: 'Bookshelf',      price: 80,  w: 1.2, d: 0.4, kind: 'floor' },
  rug:       { name: 'Rug',            price: 35,  w: 2.4, d: 1.6, kind: 'rug' },
  art:       { name: 'Wall art',       price: 30,  w: 1.0, d: 0.1, kind: 'wall' },
};
export const SELL_BACK = 0.5;

/* ---------- levels ---------- */
export const upgradeCost = (type, level) => Math.round(BUSINESSES[type].base * 10 * Math.pow(1.16, level - 1));
export const workerSlots = level => 1 + Math.floor(level / 5);                    // visible 3D workers
export const workerCost = (type, hired) => Math.round(BUSINESSES[type].base * 25 * Math.pow(1.5, hired));
export const managerCost = type => BUSINESSES[type].base * 400;
export const baseIncomePerHour = (type, level) => BUSINESSES[type].base * level * Math.pow(1.09, level - 1);

/* ---------- multipliers (server decides these; the client only displays) ---------- */
export function multiplier(player, nowMs, events = []) {
  let m = 1;
  if (player.boost2x) m *= 2;                    // permanent 2x boost (real-money purchase, handled server-side)
  if (player.supporter) m *= 1.1;                // supporter members: +10% income
  for (const e of events) if (nowMs >= e.start && nowMs < e.end) m *= e.mult || 1;
  return m;
}

/* Deterministic daily events from a per-player seed, so server and client agree without storing anything. */
export function eventsForDay(seed, dayIndex) {
  const h = x => { let t = (x ^ 0x9e3779b9) >>> 0; t = Math.imul(t ^ t >>> 15, 0x85ebca6b); t = Math.imul(t ^ t >>> 13, 0xc2b2ae35); return ((t ^ t >>> 16) >>> 0) / 4294967296; };
  const day0 = dayIndex * 24 * HOUR, out = [];
  const r1 = h(seed * 31 + dayIndex), r2 = h(seed * 17 + dayIndex * 7 + 1), r3 = h(seed * 13 + dayIndex * 5 + 2);
  out.push({ type: 'rush', label: 'Rush hour: +50% income', start: day0 + Math.floor(r1 * 20) * HOUR, end: day0 + Math.floor(r1 * 20) * HOUR + HOUR, mult: 1.5 });
  if (r2 < 0.5) out.push({ type: 'celebrity', label: 'Celebrity visit: 2x income', start: day0 + Math.floor(r2 * 40) * HOUR, end: day0 + Math.floor(r2 * 40) * HOUR + HOUR, mult: 2 });
  if (r3 < 0.35) out.push({ type: 'broken', label: 'A machine broke: fix it to keep earning', start: day0 + Math.floor(r3 * 60) * HOUR, end: day0 + Math.floor(r3 * 60) * HOUR + 2 * HOUR, mult: 1, needsFix: true });
  return out;
}
export const dayOf = ms => Math.floor(ms / (24 * HOUR));

/* ---------- earnings ---------- */
// biz = { type, level, manager, lastCollect(ms), fixedAt(ms) }
export function offlineCapHours(player) { return player.longOffline ? 24 : 8; }   // $2.99 extension (server-side flag)
export function pendingEarnings(biz, player, nowMs, seed = 1, useEvents = true) {
  const capH = biz.manager ? offlineCapHours(player) : 1;           // without a manager, one hour of income waits for you
  const from = biz.lastCollect, to = Math.min(nowMs, from + capH * HOUR);
  if (to <= from) return 0;
  const perMs = baseIncomePerHour(biz.type, biz.level) / HOUR;
  let total = 0, t = from;
  // walk hour-sized slices so multipliers and events are applied for the right moments
  while (t < to) {
    const step = Math.min(to, t + HOUR / 4), mid = (t + step) / 2, evs = useEvents ? [...eventsForDay(seed, dayOf(mid)), ...eventsForDay(seed, dayOf(mid) - 1)] : [];
    const broken = evs.find(e => e.needsFix && mid >= e.start && mid < e.end && !(biz.fixedAt >= e.start && biz.fixedAt < e.end + HOUR));
    if (!broken) total += perMs * (step - t) * multiplier(player, mid, evs);
    t = step;
  }
  return Math.floor(total);
}

export function netWorth(state) {
  let w = state.coins || 0;
  for (const b of Object.values(state.business || {})) {
    for (let l = 1; l < b.level; l++) w += upgradeCost(b.type, l);
    for (let k = 0; k < (b.workers || 0); k++) w += workerCost(b.type, k);
    if (b.manager) w += managerCost(b.type);
  }
  for (const list of Object.values(state.furniture || {})) for (const f of list) w += FURNITURE[f.id]?.price || 0;
  return Math.floor(w);
}
export const ownerLevel = state => Math.max(1, 1 + Math.floor(Math.log2(1 + netWorth(state) / 150)));
