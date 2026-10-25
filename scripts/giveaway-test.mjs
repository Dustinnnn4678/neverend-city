import { draw, fingerprint } from './verify-giveaway.mjs';
let fails = 0; const ok = (n, c, x = '') => { console.log((c ? 'PASS ' : 'FAIL ') + n + (x ? '  ' + x : '')); if (!c) fails++; };
const ids = Array.from({ length: 200 }, (_, i) => `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`);
const seed = 'a'.repeat(64);
const w1 = draw(seed, 5, ids), w2 = draw(seed, 5, [...ids].reverse());
ok('same seed and entrants give the same winners', JSON.stringify(w1) === JSON.stringify(w2));
ok('winners are distinct and are entrants', new Set(w1).size === 5 && w1.every(w => ids.includes(w)));
ok('a different seed changes the winners', JSON.stringify(draw('b'.repeat(64), 5, ids)) !== JSON.stringify(w1));
ok('asking for more winners than entrants is safe', draw(seed, 10, ids.slice(0, 3)).length === 3 && draw(seed, 1, []).length === 0);
const counts = new Map(); for (let t = 0; t < 4000; t++) { const w = draw(String(t).padStart(64, '0'), 1, ids.slice(0, 10))[0]; counts.set(w, (counts.get(w) || 0) + 1); }
ok('fair: every one of 10 entrants wins about 10% of 4000 draws', [...counts.values()].every(c => c > 300 && c < 500) && counts.size === 10, JSON.stringify([...counts.values()]));
ok('fingerprint is a SHA-256 hex string', /^[0-9a-f]{64}$/.test(fingerprint(seed)));
console.log(fails ? `\n${fails} FAILED` : '\nAll giveaway checks passed'); process.exit(fails ? 1 : 0);
