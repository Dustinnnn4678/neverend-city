import { genCity, SITES } from '../city-gen.js';
const big = genCity(35000), small = genCity(3000);
let bad = -1; for (let i = 0; i < 3000; i++) { const p = big.structures[i], q = small.structures[i]; if (p.type !== q.type || p.x !== q.x || p.z !== q.z || p.variant !== q.variant) { bad = i; break; } }
console.log('prefix stable 3000:', bad === -1, bad);
for (const i of [999, 1999, 3999, 4000, 7999, 8000, 14999, 29999]) { const s = big.structures[i]; console.log(i + 1, s.type, Math.round(s.x), Math.round(s.z), 'span', s.span); }
const kinds = ['skyscraper', 'stadium', 'campus', 'amusement', 'megatower', 'monument']; console.log(kinds.map(k => k + ':' + (big.count[k] || 0)).join(' '));
const seen = new Set(); let dup = 0; for (const s of big.structures) { const k = Math.round(s.x) + ',' + Math.round(s.z) + ',' + s.span; if (seen.has(k)) dup++; seen.add(k); } console.log('dups', dup);
const t0 = performance.now(); genCity(100000); console.log('100k ms', Math.round(performance.now() - t0));
console.log(Object.fromEntries(Object.entries(big.zones).map(([k, v]) => [k, (v / 35000).toFixed(2)])));
