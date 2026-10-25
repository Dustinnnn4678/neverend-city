import { HOUR, BUSINESSES, pendingEarnings, baseIncomePerHour, upgradeCost, netWorth, ownerLevel, eventsForDay, dayOf, stageOf, workerSlots } from '../economy.js';

let fails = 0;
const ok = (name, cond, extra = '') => { console.log((cond ? 'PASS ' : 'FAIL ') + name + (extra ? '  ' + extra : '')); if (!cond) fails++; };

const T0 = Date.UTC(2026, 9, 25, 12, 0, 0), plain = { boost2x: false, supporter: false };
const seed = 1;

const biz = { type: 'coffee', level: 3, manager: true, lastCollect: T0, fixedAt: 0 };
const hourly = baseIncomePerHour('coffee', 3);
ok('one hour earns one hour of income', Math.abs(pendingEarnings(biz, plain, T0 + HOUR, seed, false) - hourly) <= 2, `${pendingEarnings(biz, plain, T0 + HOUR, seed, false)} vs ${Math.round(hourly)}`);
ok('offline earnings capped at 8 hours', pendingEarnings(biz, plain, T0 + 30 * HOUR, seed, false) === pendingEarnings(biz, plain, T0 + 8 * HOUR, seed, false));
ok('24-hour extension raises the cap', pendingEarnings(biz, { ...plain, longOffline: true }, T0 + 30 * HOUR, seed, false) > pendingEarnings(biz, plain, T0 + 30 * HOUR, seed, false) * 2.9);
ok('no manager: only 1 hour waits', pendingEarnings({ ...biz, manager: false }, plain, T0 + 30 * HOUR, seed, false) === pendingEarnings(biz, plain, T0 + HOUR, seed, false));
ok('2x boost doubles income', Math.abs(pendingEarnings(biz, { ...plain, boost2x: true }, T0 + HOUR, seed, false) - 2 * pendingEarnings(biz, plain, T0 + HOUR, seed, false)) <= 2);
ok('supporter gives +10%', Math.abs(pendingEarnings(biz, { ...plain, supporter: true }, T0 + HOUR, seed, false) / pendingEarnings(biz, plain, T0 + HOUR, seed, false) - 1.1) < 0.01);
ok('time going backwards earns nothing', pendingEarnings(biz, plain, T0 - HOUR, seed, false) === 0);
ok('income grows with level', baseIncomePerHour('pizza', 20) > baseIncomePerHour('pizza', 19));
ok('level 50 is reachable and bounded', baseIncomePerHour('lemonade', 50) < 1e6, String(Math.round(baseIncomePerHour('lemonade', 50))));
ok('every business exists with a price curve', Object.keys(BUSINESSES).every(t => upgradeCost(t, 1) > 0 && upgradeCost(t, 49) > upgradeCost(t, 1)));
ok('stages unlock by level', stageOf(1).name === 'stand' && stageOf(10).name === 'shop' && stageOf(25).name === 'franchise');
ok('workers scale with level', workerSlots(1) === 1 && workerSlots(50) === 11);

// broken machine halts income until fixed
let bs = 1; while (!eventsForDay(bs, dayOf(T0)).some(e => e.needsFix)) bs++;
const ev = eventsForDay(bs, dayOf(T0)).find(e => e.needsFix);
const bb = { ...biz, lastCollect: ev.start - HOUR / 2 };
const withBreak = pendingEarnings(bb, plain, ev.start + HOUR, bs, true), fixed = pendingEarnings({ ...bb, fixedAt: ev.start + 60000 }, plain, ev.start + HOUR, bs, true);
ok('a broken machine pauses income until fixed', fixed > withBreak, `${withBreak} < ${fixed}`);

const state = { coins: 100, business: { a: { type: 'coffee', level: 3, workers: 1, manager: false } }, furniture: { a: [{ id: 'bed' }, { id: 'sofa' }] } };
ok('net worth counts coins, upgrades, workers and furniture', netWorth(state) === 100 + upgradeCost('coffee', 1) + upgradeCost('coffee', 2) + Math.round(BUSINESSES.coffee.base * 25) + 120 + 150, String(netWorth(state)));
ok('owner level rises with net worth', ownerLevel({ coins: 100000 }) > ownerLevel({ coins: 100 }));

console.log(fails ? `\n${fails} FAILED` : '\nAll economy checks passed');
process.exit(fails ? 1 : 0);

