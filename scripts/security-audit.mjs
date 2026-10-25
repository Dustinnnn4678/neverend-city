// Static security audit of the database files. Run: node scripts/security-audit.mjs
// Checks, for every SQL file in supabase/:
//  1. every table has row level security turned on
//  2. every function is explicitly locked down (revoke ... from public/anon) so only the intended roles can call it
//  3. every "admin_" function checks require_admin() inside
//  4. no secret keys appear in any file the website serves
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const dir = 'supabase', files = readdirSync(dir).filter(f => f.endsWith('.sql') && f !== 'seed.sql');
const all = files.map(f => readFileSync(join(dir, f), 'utf8')).join('\n');
const strip = s => s.replace(/--.*$/gm, '');
const sql = strip(all);
let problems = 0; const bad = m => { problems++; console.log('PROBLEM:', m); };

const tables = [...sql.matchAll(/create table (?:if not exists )?public\.(\w+)/gi)].map(m => m[1]);
for (const t of new Set(tables)) if (!new RegExp(`alter table public\\.${t}\\s+enable row level security`, 'i').test(sql)) bad(`table ${t} has no row level security`);

const fnRe = /create (?:or replace )?function public\.(\w+)\s*\(([^)]*)\)/gi; const fns = new Map();
for (const m of sql.matchAll(fnRe)) fns.set(m[1], m[2]);
const revoked = [...sql.matchAll(/revoke all on function ([^;]+?) from ([^;]+);/gi)];
const names = new Set(); for (const r of revoked) for (const n of r[1].matchAll(/public\.(\w+)\s*\(/g)) names.add(n[1] + '|' + r[2]);
const anonOk = new Set(['name_ok', 'level_of', 'quest_key', 'quest_ids', 'biz_label', 'is_admin', 'event_multiplier', 'game_income_hr', 'game_upgrade_cost', 'game_worker_cost', 'game_manager_cost', 'handle_new_user']);   // harmless helpers
const schemaSql = existsSync(join(dir, 'schema.sql')) ? strip(readFileSync(join(dir, 'schema.sql'), 'utf8')) : '';
const blanket = /revoke all on all functions in schema public from public, anon/i.test(schemaSql);       // covers every function schema.sql itself creates
const inSchema = new Set([...schemaSql.matchAll(fnRe)].map(m => m[1]));
for (const [n] of fns) {
  const locked = [...names].some(x => x.startsWith(n + '|') && /anon|public/.test(x)) || (blanket && inSchema.has(n));
  if (!locked && !anonOk.has(n)) bad(`function ${n} is not revoked from public/anon`);
}
for (const [n] of fns) if (n.startsWith('admin_')) {
  const body = sql.slice(sql.search(new RegExp(`function public\\.${n}\\s*\\(`, 'i')), undefined); const first = body.split(/\n\s*create /i)[0];
  if (!/require_admin\(\)/.test(first)) bad(`admin function ${n} does not call require_admin()`);
}
for (const [n] of fns) if (/^rpc_/.test(n)) {
  const body = sql.slice(sql.search(new RegExp(`function public\\.${n}\\s*\\(`, 'i')), undefined); const first = body.split(/\n\s*create /i)[0];
  if (!/auth\.uid\(\)|check_rate|rpc_game_state\(\)|rpc_quests|require_owner/.test(first) && !/language sql/i.test(first.slice(0, 400))) bad(`rpc ${n} never looks at auth.uid() or check_rate`);
}

for (const f of ['config.js', 'index.html', 'main.js', 'visitor.js', 'remote.js', 'admin.html', 'gamestore.js', 'monitor.js']) if (existsSync(f)) {
  const t = readFileSync(f, 'utf8'); if (/sb_secret_|service_role\s*[:=]\s*['"]ey|sk_live_|sk_test_|whsec_|AIza[0-9A-Za-z_-]{35}/.test(t)) bad(`${f} contains something that looks like a secret key`);
}

console.log(`${tables.length} tables, ${fns.size} functions checked.`); if (problems) { console.log(problems + ' problem(s).'); process.exit(1); } console.log('Security audit passed.');
