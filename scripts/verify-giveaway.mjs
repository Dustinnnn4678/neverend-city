// Anyone can check a giveaway draw. Usage:
//   node scripts/verify-giveaway.mjs <seed> <winner_count> <entrant_user_id> <entrant_user_id> ...
// It prints the seed fingerprint (compare it with the one published BEFORE the draw) and the winners.
// The shuffle is the exact one the database uses: sort entrants by id, then a Fisher-Yates shuffle where
// step i uses SHA-256(seed + ":" + i) read as an unsigned 32-bit number.
import { createHash } from 'node:crypto';

export function draw(seed, winnerCount, ids) {
  const a = [...ids].sort(); const n = a.length;                      // uuid text sorts the same as the database sort
  for (let i = n; i >= 2; i--) { const d = createHash('sha256').update(`${seed}:${i}`).digest(); const r = d.readUInt32BE(0); const j = r % i; [a[i - 1], a[j]] = [a[j], a[i - 1]]; }
  return a.slice(0, Math.min(winnerCount, n));
}
export const fingerprint = seed => createHash('sha256').update(seed).digest('hex');

if (import.meta.url === `file://${process.argv[1].replace(/\\/g, '/')}` || process.argv[1]?.endsWith('verify-giveaway.mjs')) {
  const [seed, count, ...ids] = process.argv.slice(2);
  if (!seed || !count || !ids.length) { console.log('Usage: node scripts/verify-giveaway.mjs <seed> <winner_count> <entrant ids...>'); process.exit(0); }
  console.log('Seed fingerprint (must match the one announced before the draw):', fingerprint(seed));
  console.log('Winners:', draw(seed, Number(count), ids));
}
