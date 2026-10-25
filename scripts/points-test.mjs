import { dailyReward, nextStreak, dayIndex, DAY, goldenForDay, CRATE_ODDS, rollRarity, openCrate, cratesForStreak, levelOf, nameOk, predictionHit, pointsMultiplier, EVENT_MS, canBuy, COSMETICS, makeCode } from '../points.js';
let fails = 0; const ok = (n, c, x = '') => { console.log((c ? 'PASS ' : 'FAIL ') + n + (x ? '  ' + x : '')); if (!c) fails++; };

ok('day 1 gives +10', dailyReward(1) === 10);
ok('day 2 gives +15', dailyReward(2) === 15);
ok('streak bonus caps at +50 (60 total)', dailyReward(11) === 60 && dailyReward(40) === 60);
ok('same-day visit does not count twice', !nextStreak(100, 100, 3).counted);
ok('next-day visit continues the streak', nextStreak(100, 101, 3).streak === 4);
ok('skipping a day resets to 1', nextStreak(100, 103, 9).streak === 1);

const g1 = goldenForDay(20000, 500), g2 = goldenForDay(20000, 500), g3 = goldenForDay(20001, 500);
ok('3 distinct golden objects', g1.length === 3 && new Set(g1).size === 3);
ok('same day gives the same objects for everyone', JSON.stringify(g1) === JSON.stringify(g2));
ok('a different day moves them', JSON.stringify(g1) !== JSON.stringify(g3));
ok('tiny city still works', goldenForDay(5, 2).length === 2);

const odds = Object.values(CRATE_ODDS).reduce((a, b) => a + b, 0);
ok('crate odds sum to 100%', Math.abs(odds - 1) < 1e-9);
const N = 200000, tally = { common: 0, rare: 0, epic: 0, legendary: 0 }; let s = 12345; const rnd = () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
for (let i = 0; i < N; i++) tally[rollRarity(rnd())]++;
ok('simulated crate odds match 60/30/9/1', Math.abs(tally.common / N - 0.6) < 0.01 && Math.abs(tally.rare / N - 0.3) < 0.01 && Math.abs(tally.epic / N - 0.09) < 0.005 && Math.abs(tally.legendary / N - 0.01) < 0.003, JSON.stringify(tally));
ok('every rarity has crate loot', ['common', 'rare', 'epic', 'legendary'].every(r => openCrate(r === 'common' ? 0.1 : r === 'rare' ? 0.7 : r === 'epic' ? 0.93 : 0.995, 0).rarity === r));
ok('rare cosmetics only come from crates (legendary never buyable)', COSMETICS.filter(c => c.rarity === 'legendary').every(c => c.source === 'crate'));
ok('crate every 7-day streak', cratesForStreak(7) === 1 && cratesForStreak(14) === 1 && cratesForStreak(6) === 0 && cratesForStreak(0) === 0);

ok('levels', levelOf(0) === 1 && levelOf(249) === 1 && levelOf(250) === 2 && levelOf(1000) === 3 && levelOf(5000) === 4 && levelOf(20000) === 5);
ok('cannot buy above your level', !canBuy(COSMETICS.find(c => c.id === 'neon-pink'), 2, 99999) && canBuy(COSMETICS.find(c => c.id === 'neon-pink'), 3, 800));
ok('cannot buy crate-only items', !canBuy(COSMETICS.find(c => c.id === 'plate-gold'), 5, 99999));

ok('good names pass', nameOk('@sunny_day') && nameOk('creator.123'));
ok('bad names are blocked (even with leetspeak)', !nameOk('f.u.c.k') && !nameOk('sh1t') && !nameOk('x'.repeat(40)) && !nameOk(''));

const T = Date.UTC(2026, 9, 25, 12);
ok('prediction is right only on the right day', predictionHit(dayIndex(T), T + 3600e3) && !predictionHit(dayIndex(T), T + DAY));
ok('double points only during the 10-minute event', pointsMultiplier(T + 1000, T) === 2 && pointsMultiplier(T + EVENT_MS + 1, T) === 1 && pointsMultiplier(T, 0) === 1);
const code = makeCode(rnd); ok('verification code looks right', /^NC-[A-Z2-9]{6}$/.test(code), code);

console.log(fails ? `\n${fails} FAILED` : '\nAll points checks passed'); process.exit(fails ? 1 : 0);
