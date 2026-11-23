// ROOTS_GRILL_DEVICE_PAIRING_API_V1_2
// Supabase Edge Function: device-pairing
// Scope: pre-registered home-test and head-office screens only.
// Deploy with legacy JWT verification OFF.
import { createClient } from 'npm:@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'content-type, apikey, authorization',
  'Cache-Control': 'no-store'
};
const db = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  { auth: { persistSession: false, autoRefreshToken: false } }
);
const respond = (data: unknown, status = 200) =>
  Response.json(data, { status, headers: cors });
const hash = async (value: string) =>
  Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))))
    .map(b => b.toString(16).padStart(2, '0')).join('');
const randomHex = (n = 32) =>
  Array.from(crypto.getRandomValues(new Uint8Array(n)))
    .map(b => b.toString(16).padStart(2, '0')).join('');
const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
function randomCode() {
  // Rejection sampling avoids modulo bias.
  const result: string[] = [];
  while (result.length < 10) {
    const bytes = crypto.getRandomValues(new Uint8Array(16));
    for (const b of bytes) {
      if (b < 224 && result.length < 10) result.push(alphabet[b % alphabet.length]);
    }
  }
  return result.join('');
}
const validClaim = (v: unknown) => typeof v === 'string' && /^[a-f0-9]{64}$/.test(v);
const validUuid = (v: unknown) => typeof v === 'string' &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
async function headOfficeUser(request: Request) {
  const jwt = (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  if (!jwt) return null;
  const { data: { user }, error } = await db.auth.getUser(jwt);
  if (error || !user) return null;
  const { data: admin, error: adminError } = await db.from('grill_admins')
    .select('user_id').eq('user_id', user.id).maybeSingle();
  return adminError || !admin ? null : user.id;
}
Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response(null, { headers: cors });
  if (request.method !== 'POST') return respond({ error: 'Method not allowed' }, 405);
  try {
    const input = await request.json();
    if (!input || typeof input !== 'object') return respond({ error: 'Invalid body' }, 400);

    if (input.action === 'start') {
      const claimSecret = randomHex();
      const code = randomCode();
      const { data, error } = await db.from('grill_pairing_requests')
        .insert({ code_hash: await hash(code), claim_secret_hash: await hash(claimSecret) })
        .select('id,expires_at').single();
      if (error) throw error;
      return respond({ requestId: data.id, code, claimSecret, expiresAt: data.expires_at });
    }

    if (input.action === 'poll') {
      if (!validUuid(input.requestId) || !validClaim(input.claimSecret))
        return respond({ error: 'Invalid pairing request' }, 400);
      const { data: pair, error } = await db.from('grill_pairing_requests')
        .select('status,expires_at,claim_secret_hash,screen_id')
        .eq('id', input.requestId).maybeSingle();
      if (error) throw error;
      if (!pair || pair.claim_secret_hash !== await hash(input.claimSecret))
        return respond({ error: 'Unauthorized' }, 401);
      if (new Date(pair.expires_at).getTime() <= Date.now())
        return respond({ status: 'expired' });
      if (pair.status !== 'approved') return respond({ status: pair.status });
      const { data: screen, error: screenError } = await db.from('grill_screens')
        .select('id,label,store_id,display,rotation')
        .eq('id', pair.screen_id).maybeSingle();
      if (screenError) throw screenError;
      if (!screen || !['home-test', 'head-office'].includes(screen.store_id) || !/^(home-(landscape|portrait)-01|roots-grill-(landscape|portrait)-01)$/.test(screen.id)) return respond({ error: 'Screen unavailable' }, 409);
      // Device already possesses claimSecret, which is its heartbeat token.
      return respond({ status: 'paired', screen });
    }

    if (input.action === 'approve') {
      const adminId = await headOfficeUser(request);
      if (!adminId) return respond({ error: 'Head Office authorization required' }, 403);
      const code = typeof input.code === 'string' ? input.code.toUpperCase().replace(/\s/g, '') : '';
      if (!/^[A-HJ-NP-Z2-9]{10}$/.test(code) ||
          typeof input.screenId !== 'string' ||
          !/^(home-(landscape|portrait)-01|roots-grill-(landscape|portrait)-01)$/.test(input.screenId))
        return respond({ error: 'Invalid code or test screen ID' }, 400);
      const { data: screen, error: screenError } = await db.from('grill_screens')
        .select('id,store_id').eq('id', input.screenId).maybeSingle();
      if (screenError) throw screenError;
      if (!screen || !((/^home-(landscape|portrait)-01$/.test(screen.id) && screen.store_id === 'home-test') || (/^roots-grill-(landscape|portrait)-01$/.test(screen.id) && screen.store_id === 'head-office')))
        return respond({ error: 'Screen is not registered for pairing' }, 403);
      const { data: approved, error } = await db.rpc('grill_approve_pairing', {
        p_code_hash: await hash(code),
        p_screen_id: screen.id,
        p_admin_id: adminId
      });
      if (error) throw error;
      if (!approved) return respond({ error: 'Code expired, invalid, or already used' }, 404);
      return respond({ ok: true, status: 'approved', screenId: screen.id });
    }

    return respond({ error: 'Unknown action' }, 400);
  } catch (error) {
    console.error('Pairing API error', error);
    return respond({ error: 'Pairing service unavailable' }, 503);
  }
});
