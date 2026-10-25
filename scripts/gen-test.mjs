import { genCity } from '../city-gen.js';
const big = genCity(31000), small = genCity(3000);
let bad = -1; for (let i = 0; i < 3000; i++) { const p = big.structures[i], q = small.structures[i]; if (p.type !== q.type || p.x !== q.x || p.z !== q.z || p.variant !== q.variant) { bad = i; break; } }
console.log('prefix stable 3000:', bad === -1, bad);
const first = t => big.structures.findIndex(s => s.type === t);
const order = (a, b) => first(a) < first(b);
console.log('garage before mall:', order('garage', 'mall'), '| clinic before hospital:', order('clinic', 'hospital'), '| garage before stadium:', order('garage', 'stadium'), '| library before campus:', order('library', 'campus'), '| garage+hotel before megatower:', order('garage', 'megatower') && order('hotel', 'megatower'), '| park before monument:', order('park', 'monument'));
for (const t of ['stadium', 'campus', 'amusement', 'megatower', 'monument']) console.log(t, 'at structure', first(t) + 1, '(milestone)');
const seen = new Set(); let dup = 0; for (const s of big.structures) { const k = Math.round(s.x) + ',' + Math.round(s.z) + ',' + s.span; if (seen.has(k)) dup++; seen.add(k); } console.log('dups', dup);
