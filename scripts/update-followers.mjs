// Updates live.json with Instagram followers + YouTube subscribers.
// Runs in GitHub Actions. Secrets: IG_ACCESS_TOKEN, YT_API_KEY. Variable/secret: YT_CHANNEL_ID.
// If a platform fails, its last known number is kept. Numbers never go down.
import { readFile, writeFile } from 'node:fs/promises';

async function getJson(url) {
  const res = await fetch(url);
  const body = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, body };
}

async function instagram() {
  const token = process.env.IG_ACCESS_TOKEN;
  if (!token) throw new Error('IG_ACCESS_TOKEN is not set');
  const url = new URL('https://graph.instagram.com/v21.0/me');
  url.searchParams.set('fields', 'username,followers_count');
  url.searchParams.set('access_token', token);
  const { ok, status, body } = await getJson(url);
  if (!ok || typeof body.followers_count !== 'number') throw new Error(body.error?.message ?? `HTTP ${status}`);
  return body.followers_count;
}

async function youtube() {
  const key = process.env.YT_API_KEY, id = process.env.YT_CHANNEL_ID;
  if (!key || !id) throw new Error('YT_API_KEY or YT_CHANNEL_ID is not set');
  const url = new URL('https://www.googleapis.com/youtube/v3/channels');
  url.searchParams.set('part', 'statistics');
  url.searchParams.set('id', id);
  url.searchParams.set('key', key);
  const { ok, status, body } = await getJson(url);
  const stats = body.items?.[0]?.statistics;
  if (!ok || !stats) throw new Error(body.error?.message ?? `HTTP ${status}`);
  if (stats.hiddenSubscriberCount) throw new Error('Subscriber count is hidden on this channel');
  return Number(stats.subscriberCount);
}

const file = new URL('../live.json', import.meta.url);
const live = JSON.parse(await readFile(file, 'utf8'));
const before = JSON.stringify(live);
let failed = false;

for (const [name, fetcher] of [['instagram', instagram], ['youtube', youtube]]) {
  try {
    const n = await fetcher();
    live[name] = Math.max(live[name] ?? 0, n);
    console.log(`${name}: ${n}`);
  } catch (err) {
    failed = true; // never print URLs or keys, only the message
    console.error(`${name} failed, keeping ${live[name] ?? 0}: ${err.message}`);
  }
}

live.total = (live.instagram ?? 0) + (live.youtube ?? 0);
const changed = JSON.stringify({ ...live, updated: 0 }) !== JSON.stringify({ ...JSON.parse(before), updated: 0 });
if (changed) {
  live.updated = new Date().toISOString();
  await writeFile(file, JSON.stringify(live, null, 2) + '\n');
  console.log(`total: ${live.total}`);
} else console.log('No change.');
if (failed) process.exitCode = 1; // makes the failure visible in the Actions tab
