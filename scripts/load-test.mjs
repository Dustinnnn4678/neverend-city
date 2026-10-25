// Light load test of the PUBLIC read endpoints (the ones every visitor hits). It sends only reads with the public key.
// Run: node scripts/load-test.mjs [concurrentUsers=50] [roundsPerUser=5]
// Start small. Free Supabase plans have request limits; try 50, then 200, then 1000 on your STAGING project, not the live one.
import { SUPABASE } from '../config.js';

const users = +process.argv[2] || 50, rounds = +process.argv[3] || 5;
const paths = ['public_claims?select=building,display_name,status', 'public_feed?select=at,text', 'golden_days?select=*&limit=1', 'live_events?select=started_at&order=started_at.desc&limit=1'];
const lat = []; let errors = 0;
async function user() { for (let r = 0; r < rounds; r++) for (const p of paths) { const t = performance.now(); try { const res = await fetch(`${SUPABASE.url}/rest/v1/${p}`, { headers: { apikey: SUPABASE.anonKey } }); if (!res.ok) errors++; await res.arrayBuffer(); } catch (e) { errors++; } lat.push(performance.now() - t); } }
const t0 = performance.now(); await Promise.all(Array.from({ length: users }, user)); const secs = (performance.now() - t0) / 1000;
lat.sort((a, b) => a - b); const q = p => lat[Math.min(lat.length - 1, Math.floor(lat.length * p))].toFixed(0);
console.log(`${users} simulated users, ${lat.length} requests in ${secs.toFixed(1)} s (${(lat.length / secs).toFixed(0)} req/s), errors: ${errors}`);
console.log(`latency ms: median ${q(0.5)}, 95th ${q(0.95)}, slowest ${q(0.999)}`);
console.log(errors ? 'Some requests failed. Check Supabase limits before launch.' : 'No errors.');
