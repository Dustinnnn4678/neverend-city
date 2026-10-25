// Deterministic city generator. Structure #i depends only on the fixed seed and on structures 0..i-1,
// so the city only ever grows and never reshuffles. No Three.js in here (testable in Node).

export const SEED = 20260101;
export const L = 16;          // lot size (m)
export const ROAD = 12;       // road width (m)
export const P = 3 * L + ROAD; // block period (m): 3x3 lots + road

// Milestone sizes (kept low so unlocks come quickly).
export const T = { paved: 25, town: 50, services: 100, apts: 200, downtown: 400 };
export const MILESTONES = [
  { at: 0,     name: 'Village' },
  { at: 25,    name: 'Paved roads' },
  { at: 50,    name: 'Town center' },
  { at: 100,   name: 'Public services' },
  { at: 200,   name: 'Apartments and townhomes' },
  { at: 400,   name: 'Downtown' },
  { at: 1000,  name: 'River, highway and trains' },
  { at: 2000,  name: 'Airport' },
  { at: 4000,  name: 'Skyline district' },
  { at: 8000,  name: 'New suburbs' },
  { at: 15000, name: 'Mega tower' },
  { at: 30000, name: 'Follower monument' },
];

const ZONE = {
  house: 'res', townhome: 'res', apartment: 'res',
  gas: 'com', store: 'com', shop: 'com', diner: 'com', office: 'com', mall: 'com', garage: 'com',
  warehouse: 'ind', watertower: 'ind', powerplant: 'ind', celltower: 'ind',
  school: 'civ', fire: 'civ', police: 'civ', clinic: 'civ', post: 'civ', hospital: 'civ', church: 'civ', library: 'civ', clocktower: 'civ', cityhall: 'civ',
  cinema: 'com', bank: 'com', hotel: 'com', observation: 'com', windmill: 'park', skyscraper: 'com', stadium: 'civ', campus: 'civ', amusement: 'park', megatower: 'com', monument: 'park',
  park: 'park', green: 'park',
};
export const TWO_LOT = new Set(['mall', 'hospital']);

// Headline structures that appear exactly when a milestone is reached (one-off landmarks included).
const FORCED = new Map([
  [2, 'gas'], [5, 'store'], [11, 'windmill'],
  [24, 'park'],
  [49, 'diner'], [50, 'school'], [51, 'park'], [52, 'shop'], [53, 'shop'], [54, 'clocktower'], [55, 'cinema'], [56, 'bank'],
  [99, 'fire'], [100, 'police'], [101, 'clinic'], [102, 'post'], [103, 'cityhall'],
  [199, 'apartment'], [200, 'townhome'], [201, 'apartment'], [202, 'hotel'],
  [399, 'office'], [400, 'mall'], [401, 'hospital'], [402, 'garage'], [403, 'observation'], [404, 'office'],
  [1199, 'powerplant'],
  [3999, 'stadium'], [7999, 'campus'], [8000, 'amusement'], [14999, 'megatower'], [29999, 'monument'],
]);
// Which structure index "owns" each milestone (for fly-to celebrations).
export const UNLOCK_INDEX = { 25: 24, 50: 49, 100: 99, 200: 199, 400: 399, 4000: 3999, 8000: 7999, 15000: 14999, 30000: 29999 };
// Infrastructure unlocks fly to a place instead of a structure.
export const UNLOCK_POS = { 1000: { x: -5 * P, z: 0 }, 2000: { x: 11.5 * P, z: 0 } };

// Planned sites: whole blocks kept open (meadow) until their milestone, so the city only ever grows.
// 'fill' sites are filled by normal structures once unlocked; the rest are built by forced landmarks or by infrastructure.
export const SITES = {
  downtown: { at: T.downtown, fill: true, blocks: ['2,0', '3,0', '2,1', '3,1'] },
  skyline:  { at: 4000, fill: true, blocks: ['4,0', '5,0', '4,1', '5,1'] },
  stadium:  { at: 4000, blocks: ['2,-2'] },
  harbor:   { at: 4000, blocks: ['-6,2', '-6,3', '-4,2', '-4,3'] },
  airport:  { at: 2000, blocks: [10, 11, 12, 13].flatMap(x => [-1, 0, 1].map(z => x + ',' + z)) },
  campus:   { at: 8000, blocks: ['-8,-3'] },
  amusement:{ at: 8000, blocks: ['7,-4'] },
  mega:     { at: 15000, blocks: ['-1,-1'] },
  monument: { at: 30000, blocks: ['1,1'] },
};
export const RIVER_BX = -5, HIGHWAY_BZ = -5, RAIL_BZ = 5, INFRA_AT = 1000;
const SITE_OF = new Map(); for (const [name, s] of Object.entries(SITES)) for (const b of s.blocks) SITE_OF.set(b, name);
export function blockSite(bx, bz) {
  if (bx === RIVER_BX) return 'river'; if (bz === HIGHWAY_BZ) return 'highway'; if (bz === RAIL_BZ) return 'rail';
  return SITE_OF.get(bx + ',' + bz) || null;
}
export function siteUnlocked(name, n) { return name === 'river' || name === 'highway' || name === 'rail' ? n >= INFRA_AT : n >= SITES[name].at; }
export const DOWNTOWN_CENTER = { x: 2.5 * P, z: 0.5 * P };
const SKYLINE_CENTER = { x: 4.5 * P, z: 0.5 * P };
const SPAN9 = { stadium: '2,-2', campus: '-8,-3', amusement: '7,-4', megatower: '-1,-1', monument: '1,1' };
export const SITE_CENTER = {
  river: { x: RIVER_BX * P, z: 0 }, airport: { x: 11.5 * P, z: 0 }, harbor: { x: -5 * P, z: 2.5 * P }, skyline: SKYLINE_CENTER,
  stadium: { x: 2 * P, z: -2 * P }, campus: { x: -8 * P, z: -3 * P }, amusement: { x: 7 * P, z: -4 * P }, mega: { x: -P, z: -P }, monument: { x: P, z: P },
};

function mulberry32(a) { return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
function hash2(x, z) { let h = (Math.imul(x | 0, 374761393) + Math.imul(z | 0, 668265263) + SEED) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }
const rngFor = i => mulberry32((SEED ^ Math.imul(i + 1, 2654435761)) >>> 0);

function targets(n) {
  if (n < T.town) return { res: 0.88, com: 0, ind: 0, civ: 0, park: 0.12 };
  if (n < T.services) return { res: 0.55, com: 0.25, ind: 0, civ: 0.10, park: 0.10 };
  return { res: 0.45, com: 0.25, ind: 0.10, civ: 0.10, park: 0.10 };
}

function buildLots(N) {
  const M = Math.ceil(N * 1.2) + 80;
  let R = 1; while (9 * (2 * R + 1) ** 2 < M) R++;
  R += 1;
  const lots = [];
  for (let bx = -R; bx <= R; bx++) for (let bz = -R; bz <= R; bz++) {
    const ring = Math.max(Math.abs(bx), Math.abs(bz)), site = blockSite(bx, bz);
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) {
      const x = bx * P + (i - 1) * L, z = bz * P + (j - 1) * L, d = Math.hypot(x, z);
      lots.push({ bx, bz, i, j, x, z, d, ring, site, key: d + (hash2(bx * 3 + i, bz * 3 + j) - 0.5) * 24 });
    }
  }
  lots.sort((a, b) => a.ring - b.ring || a.key - b.key);
  const index = new Map();
  lots.forEach((l, o) => { l.o = o; index.set(l.bx + ',' + l.bz + ',' + l.i + ',' + l.j, o); });
  return { lots, index };
}

function facing(lot, rng) {
  const dx = lot.i - 1, dz = lot.j - 1;
  if (dx === 0 && dz === 0) return Math.floor(rng() * 4);
  if (Math.abs(dx) >= Math.abs(dz) && dx !== 0) return dx > 0 ? 1 : 3; // front +z rotated: k1 -> +x, k3 -> -x
  return dz > 0 ? 0 : 2;
}

export function genCity(N) {
  const { lots, index } = buildLots(N);
  const used = new Uint8Array(lots.length);
  const byDist = c => (a, b) => Math.hypot(a.x - c.x, a.z - c.z) - Math.hypot(b.x - c.x, b.z - c.z);
  const fillLists = [
    { site: 'downtown', at: SITES.downtown.at, list: lots.filter(l => l.site === 'downtown').sort(byDist(DOWNTOWN_CENTER)), p: 0 },
    { site: 'skyline', at: SITES.skyline.at, list: lots.filter(l => l.site === 'skyline').sort(byDist(SKYLINE_CENTER)), p: 0 },
  ];
  let ptr = 0, ringMax = 0;
  const count = {}, zones = { res: 0, com: 0, ind: 0, civ: 0, park: 0 };
  const structures = [];

  const free = (l, n) => !used[l.o] && (!l.site || (SITES[l.site]?.fill && n >= SITES[l.site].at));
  function partnerFor(lot, n, rng) {
    const opts = [[1, 0], [-1, 0], [0, 1], [0, -1]].sort(() => rng() - 0.5);
    for (const [di, dj] of opts) {
      const ii = lot.i + di, jj = lot.j + dj;
      if (ii < 0 || ii > 2 || jj < 0 || jj > 2) continue;
      const o = index.get(lot.bx + ',' + lot.bz + ',' + ii + ',' + jj);
      if (o !== undefined && free(lots[o], n)) return lots[o];
    }
    return null;
  }

  for (let i = 0; i < N; i++) {
    const n = i + 1, rng = rngFor(i);
    let type = FORCED.get(i), lot;
    if (type && SPAN9[type]) { const [sbx, sbz] = SPAN9[type].split(',').map(Number); lot = lots[index.get(sbx + ',' + sbz + ',1,1')]; }
    if (!lot) for (const f of fillLists) if (n >= f.at) { while (f.p < f.list.length && used[f.list[f.p].o]) f.p++; if (f.p < f.list.length) { lot = f.list[f.p]; break; } }
    if (!lot) { while (used[lots[ptr].o] || lots[ptr].site) ptr++; lot = lots[ptr]; }
    const dC = Math.hypot(lot.x - DOWNTOWN_CENTER.x, lot.z - DOWNTOWN_CENTER.z);
    if (!type) type = decide(n, lot, dC, rng);
    let partner = null;
    if (TWO_LOT.has(type)) { partner = partnerFor(lot, n, rng); if (!partner) type = type === 'mall' ? 'shop' : 'clinic'; }

    used[lot.o] = 1; if (partner) used[partner.o] = 1;
    if (SPAN9[type]) for (let a = 0; a < 3; a++) for (let b2 = 0; b2 < 3; b2++) used[index.get(lot.bx + ',' + lot.bz + ',' + a + ',' + b2)] = 1;
    count[type] = (count[type] || 0) + 1; zones[ZONE[type]]++;
    ringMax = Math.max(ringMax, lot.ring);
    const s = { i, type, variant: Math.floor(rng() * 1000), x: lot.x, z: lot.z, yaw: facing(lot, rng), bx: lot.bx, bz: lot.bz, lotI: lot.i, lotJ: lot.j, d: lot.d, dC, span: 1 };
    if (SPAN9[type]) { s.span = 9; s.x = lot.bx * P; s.z = lot.bz * P; s.yaw = 0; }
    if (partner) {
      s.x = (lot.x + partner.x) / 2; s.z = (lot.z + partner.z) / 2; s.span = 2;
      s.yaw = partner.i !== lot.i ? (lot.j >= 1 ? 0 : 2) : (lot.i >= 1 ? 1 : 3);
    }
    structures.push(s);
  }

  function decide(n, lot, dC, rng) {
    if (lot.site === 'skyline') { const r = rng(); return r < 0.88 ? 'skyscraper' : 'hotel'; }
    if (lot.site === 'downtown') { const r = rng(); return r < 0.78 ? 'office' : r < 0.9 ? 'garage' : r < 0.95 ? 'hotel' : 'shop'; }
    if (n >= 8000 && lot.ring >= 14 && rng() < 0.45) return 'house'; // new suburbs: quiet, leafy, mostly houses
    const t = targets(n), tot = Math.max(1, structures.length);
    let sum = 0; const w = {};
    for (const z in t) { if (t[z] <= 0) continue; const share = zones[z] / tot; w[z] = Math.max(0.02 * t[z], t[z] * (1 + 8 * (t[z] - share))); sum += w[z]; }
    let r = rng() * sum, zone = 'res';
    for (const z in w) { r -= w[z]; if (r <= 0) { zone = z; break; } }
    const c = k => count[k] || 0, d = lot.d;
    if (zone === 'res') {
      if (n < T.apts) return 'house';
      const pApt = Math.exp(-d / 130) * 0.65, pTown = 0.3 * Math.exp(-d / 260) + 0.1, q = rng();
      return q < pApt ? 'apartment' : q < pApt + pTown ? 'townhome' : 'house';
    }
    if (zone === 'com') {
      const opts = [['shop', 6]];
      if (c('diner') < 1 + n / 60) opts.push(['diner', 1]);
      if (c('gas') < 1 + n / 150) opts.push(['gas', 0.6]);
      if (c('cinema') < 1 + n / 120) opts.push(['cinema', 0.6]);
      if (c('bank') < 1 + n / 100) opts.push(['bank', 0.5]);
      if (n >= T.apts && c('hotel') < 1 + n / 90) opts.push(['hotel', 0.7]);
      if (n >= T.downtown && dC < 260) { opts.push(['office', 3], ['garage', 1]); }
      if (n >= T.downtown && c('mall') < 1 + n / 700) opts.push(['mall', 0.15]);
      return weighted(opts, rng);
    }
    if (zone === 'ind') { if (n >= T.services && c('celltower') < 1 + n / 60 && rng() < 0.12) return 'celltower'; return c('watertower') < 1 + n / 500 && rng() < 0.08 ? 'watertower' : 'warehouse'; }
    if (zone === 'civ') {
      const S2 = T.services, want = [['school', 1 + Math.floor(n / 90)], ['fire', n >= S2 ? 1 + Math.floor(n / 130) : 0], ['police', n >= S2 ? 1 + Math.floor(n / 150) : 0],
        ['clinic', n >= S2 ? 1 + Math.floor(n / 100) : 0], ['post', n >= S2 ? 1 + Math.floor(n / 120) : 0], ['hospital', n >= T.downtown ? 1 + Math.floor(n / 1200) : 0],
        ['church', n >= T.town ? 1 + Math.floor(n / 80) : 0], ['library', n >= S2 ? 1 + Math.floor(n / 150) : 0]];
      let best = null, bestDef = 0;
      for (const [k, w2] of want) { if (!w2) continue; const def = (w2 - c(k)) / w2; if (def > bestDef) { bestDef = def; best = k; } }
      return best || weighted([['school', 3], ['church', 3], ['clinic', 2], ['post', 1], ['library', 2]], rng);
    }
    return n < T.town ? 'green' : 'park';
  }
  function weighted(opts, rng) { let s = 0; for (const o of opts) s += o[1]; let r = rng() * s; for (const o of opts) { r -= o[1]; if (r <= 0) return o[0]; } return opts[0][0]; }

  return { structures, ringMax, roadRing: ringMax + 1, count, zones };
}

export function tierFor(n) { let t = 0; MILESTONES.forEach((m, k) => { if (n >= m.at) t = k; }); return t; }
export function nextMilestone(n) { return MILESTONES.find(m => m.at > n) || null; }

// Platform of structure i: stable for a given instagram:youtube ratio.
export function platformOf(i, igShare) { return Math.floor((i + 1) * igShare) > Math.floor(i * igShare) ? 'ig' : 'yt'; }
