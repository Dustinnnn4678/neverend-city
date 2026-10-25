// Checks that the prices and rules written into supabase/tycoon.sql match economy.js (the source of truth).
// Run: node scripts/tycoon-parity-test.mjs
import { readFileSync } from 'node:fs';
import { BUSINESSES, FURNITURE, SELL_BACK, MAX_LEVEL, workerSlots } from '../economy.js';

const sql = readFileSync('supabase/tycoon.sql', 'utf8');
let fails = 0; const check = (ok, msg) => { if (!ok) { fails++; console.log('FAIL:', msg); } };

// business catalog: ('lemonade', 12, 1), ...
const bizBlock = sql.match(/insert into public\.game_catalog_business[^;]*;/s)[0];
const biz = [...bizBlock.matchAll(/\('(\w+)',\s*(\d+),\s*(\d+)\)/g)].map(m => ({ type: m[1], base: +m[2], unlock: +m[3] }));
check(biz.length === Object.keys(BUSINESSES).length, 'business count differs');
for (const b of biz) { const j = BUSINESSES[b.type]; check(!!j, `business ${b.type} missing in economy.js`); if (j) { check(j.base === b.base, `${b.type} base ${b.base} vs ${j.base}`); check(j.unlockOwner === b.unlock, `${b.type} unlock ${b.unlock} vs ${j.unlockOwner}`); } }

const furnBlock = sql.match(/insert into public\.game_catalog_furniture[^;]*;/s)[0];
const furn = [...furnBlock.matchAll(/\('(\w+)',\s*(\d+)\)/g)].map(m => ({ id: m[1], price: +m[2] }));
check(furn.length === Object.keys(FURNITURE).length, 'furniture count differs');
for (const f of furn) check(FURNITURE[f.id] && FURNITURE[f.id].price === f.price, `furniture ${f.id} price ${f.price} vs ${FURNITURE[f.id] && FURNITURE[f.id].price}`);

// formulas in the SQL must contain the same constants as economy.js
check(/power\(1\.09::numeric, l - 1\)/.test(sql), 'income growth 1.09 missing');
check(/\* 10 \* power\(1\.16::numeric, l - 1\)/.test(sql), 'upgrade cost formula (x10, 1.16) missing');
check(/\* 25 \* power\(1\.5::numeric, hired\)/.test(sql), 'worker cost formula (x25, 1.5) missing');
check(/\* 400\)::bigint/.test(sql), 'manager cost (x400) missing');
check(/floor\(bz\.level \/ 5\)|floor\(bz\.level \/ 5\)/.test(sql) && workerSlots(10) === 3 && workerSlots(4) === 1, 'worker slots rule (1 + level/5) differs');
check(/floor\(price \* 0\.5\)/.test(sql) && SELL_BACK === 0.5, 'sell-back is not 50%');
check(/level between 1 and 50/.test(sql) && MAX_LEVEL === 50, 'max level is not 50');
check(/then 24 else 8 end\) else 1 end/.test(sql), 'offline cap (1h without manager, 8h with, 24h extended) differs');
check(/\(case when sup then 1\.1 else 1 end\)/.test(sql) && /\(case when pl\.boost2x then 2 else 1 end\)/.test(sql), 'income multipliers (supporter 1.1, boost 2) differ');

// the server can never sell, cash out or transfer coins
check(!/transfer|trade|cash_?out|withdraw/i.test(sql.replace(/--.*$/gm, '')), 'tycoon.sql mentions transfer/trade/cash out');

console.log(fails ? `${fails} check(s) failed` : 'All tycoon parity checks passed'); process.exit(fails ? 1 : 0);
