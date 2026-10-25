// Stripe calls this after a checkout. It checks Stripe's signature, then records the payment in the database.
// Secrets (Supabase > Edge Functions > Secrets): STRIPE_WEBHOOK_SECRET (whsec_...).
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided automatically. Deploy with "Verify JWT" turned OFF
// (Stripe has no Supabase login; the Stripe signature is the proof instead).
// Rule: a payment of $5.00 or more earns the cosmetic supporter badge; smaller ones are tips.

const enc = new TextEncoder();
const hex = (b: ArrayBuffer) => [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join('');

async function validSignature(body: string, header: string, secret: string): Promise<boolean> {
  const parts = Object.fromEntries(header.split(',').map(p => p.split('=') as [string, string]));
  const t = parts['t'], v1 = header.split(',').filter(p => p.startsWith('v1=')).map(p => p.slice(3));
  if (!t || !v1.length || Math.abs(Date.now() / 1000 - Number(t)) > 600) return false;
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const mac = hex(await crypto.subtle.sign('HMAC', key, enc.encode(`${t}.${body}`)));
  return v1.some(s => s.length === mac.length && s === mac);
}

Deno.serve(async req => {
  const secret = Deno.env.get('STRIPE_WEBHOOK_SECRET');
  if (req.method !== 'POST' || !secret) return new Response('Not configured', { status: 400 });
  const body = await req.text();
  if (!(await validSignature(body, req.headers.get('stripe-signature') || '', secret))) return new Response('Bad signature', { status: 400 });
  const ev = JSON.parse(body);
  if (ev.type !== 'checkout.session.completed') return new Response('ignored', { status: 200 });
  const s = ev.data.object;
  if (s.payment_status !== 'paid') return new Response('not paid', { status: 200 });
  const amount = Number(s.amount_total || 0), kind = amount >= 500 ? 'supporter' : 'tip';
  const uid = /^[0-9a-f-]{36}$/i.test(s.client_reference_id || '') ? s.client_reference_id : null;
  const r = await fetch(`${Deno.env.get('SUPABASE_URL')}/rest/v1/rpc/service_record_payment`, {
    method: 'POST',
    headers: { apikey: Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, Authorization: `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ p_event: ev.id, p_user: uid, p_kind: kind, p_amount: amount, p_live: !!ev.livemode }),
  });
  if (!r.ok) return new Response('db error', { status: 500 });   // Stripe will retry
  return new Response('ok', { status: 200 });
});
