// Supabase Edge Function: verifies YouTube claims by looking for the claim code in comments on your latest video.
// STATUS: written, not yet deployed or tested. It runs on a schedule (every few minutes) or when called from the admin page.
// Secrets it needs (Supabase > Edge Functions > Secrets): YT_API_KEY, YT_CHANNEL_ID, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.
// Never put the service role key in any web page or in the repository.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';

Deno.serve(async () => {
  const yt = Deno.env.get('YT_API_KEY')!, channel = Deno.env.get('YT_CHANNEL_ID')!;
  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

  // 1) latest video of the channel
  const search = await (await fetch(`https://www.googleapis.com/youtube/v3/search?part=id&channelId=${channel}&order=date&type=video&maxResults=1&key=${yt}`)).json();
  const videoId = search.items?.[0]?.id?.videoId;
  if (!videoId) return new Response(JSON.stringify({ ok: false, reason: 'no video found' }), { status: 200 });

  // 2) recent comments on that video
  const comments = await (await fetch(`https://www.googleapis.com/youtube/v3/commentThreads?part=snippet&videoId=${videoId}&maxResults=100&order=time&key=${yt}`)).json();
  const found = new Map<string, string>(); // code -> author display name (like "@handle")
  for (const t of comments.items ?? []) {
    const s = t.snippet.topLevelComment.snippet, text: string = s.textDisplay ?? '';
    for (const m of text.matchAll(/NC-[A-Z2-9]{6}/g)) found.set(m[0], String(s.authorDisplayName ?? '').toLowerCase());
  }

  // 3) match pending YouTube claims: the code must be there AND the commenter's handle must match the claimed username
  const { data: pending } = await db.from('claims').select('id, code, username').eq('status', 'pending').eq('platform', 'youtube');
  let verified = 0;
  for (const c of pending ?? []) {
    const author = found.get(c.code); if (!author) continue;
    if (author.replace(/^@/, '') !== String(c.username).toLowerCase()) continue;
    const { error } = await db.rpc('service_verify_claim', { p_id: c.id }); if (!error) verified++;
  }
  return new Response(JSON.stringify({ ok: true, videoId, checked: pending?.length ?? 0, verified }), { headers: { 'Content-Type': 'application/json' } });
});
