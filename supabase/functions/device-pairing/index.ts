// ROOTS_GRILL_DEVICE_PAIRING_API_V1
// Supabase Edge Function: device-pairing. Deploy with legacy JWT verification OFF.
// POST actions: start, poll, approve. No changes to existing player URLs.
import { createClient } from 'npm:@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'content-type, apikey, authorization',
  'Cache-Control': 'no-store'
};
const url = Deno.env.get('SUPABASE_URL')!;
const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const db = createClient(url, serviceKey, {auth:{persistSession:false,autoRefreshToken:false}});
const enc = new TextEncoder();
const reply = (data:unknown,status=200)=>Response.json(data,{status,headers:CORS});
const digest = async (value:string)=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',enc.encode(value)))).map(x=>x.toString(16).padStart(2,'0')).join('');
const secret = (bytes=32)=>Array.from(crypto.getRandomValues(new Uint8Array(bytes))).map(x=>x.toString(16).padStart(2,'0')).join('');
const alphabet='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
function pairingCode() {
  const random=crypto.getRandomValues(new Uint8Array(10));
  return Array.from(random,x=>alphabet[x%alphabet.length]).join('');
}
const validId=(v:unknown)=>typeof v==='string'&&/^[a-z0-9][a-z0-9-]{2,79}$/.test(v);
const validClaim=(v:unknown)=>typeof v==='string'&&/^[0-9a-f]{64}$/.test(v);
async function isAdmin(req:Request) {
  const jwt=(req.headers.get('authorization')||'').replace(/^Bearer\s+/i,'');
  if(!jwt) return null;
  const {data:{user},error}=await db.auth.getUser(jwt);
  if(error||!user) return null;
  // Verify membership directly; service-role RPC is not user-scoped.
  const {data:membership,error:membershipError}=await db.from('grill_admins').select('*').eq('user_id',user.id).limit(1);
  if(membershipError||!membership?.length) return null;
  return user.id;
}
Deno.serve(async(req)=>{
  if(req.method==='OPTIONS') return new Response(null,{headers:CORS});
  if(req.method!=='POST') return reply({error:'Method not allowed'},405);
  try {
    const input=await req.json();
    const action=input?.action;
    if(action==='start') {
      const claim=secret();
      const code=pairingCode();
      const {data,error}=await db.from('grill_pairing_requests').insert({
        code_hash:await digest(code),claim_secret_hash:await digest(claim)
      }).select('id,expires_at').single();
      if(error) throw error;
      return reply({requestId:data.id,code,claimSecret:claim,expiresAt:data.expires_at});
    }
    if(action==='poll') {
      if(typeof input.requestId!=='string'||!validClaim(input.claimSecret)) return reply({error:'Invalid pairing request'},400);
      const {data:pair,error}=await db.from('grill_pairing_requests').select('id,status,expires_at,claim_secret_hash,screen_id').eq('id',input.requestId).maybeSingle();
      if(error) throw error;
      if(!pair||pair.claim_secret_hash!==await digest(input.claimSecret)) return reply({error:'Unauthorized'},401);
      if(new Date(pair.expires_at).getTime()<=Date.now()) return reply({status:'expired'});
      if(pair.status==='pending') return reply({status:'pending'});
      if(pair.status!=='approved') return reply({status:pair.status});
      const token=secret();
      const tokenHash=await digest(token);
      // First claimant wins: transition request atomically via status filter.
      const {data:claimed,error:claimError}=await db.from('grill_pairing_requests').update({status:'claimed',claimed_at:new Date().toISOString()}).eq('id',pair.id).eq('status','approved').select('screen_id').maybeSingle();
      if(claimError) throw claimError;
      if(!claimed) return reply({status:'claimed'});
      const {data:screen,error:screenError}=await db.from('grill_screens').update({token_hash:tokenHash,last_seen:null,current_media_id:null,current_media_name:null}).eq('id',pair.screen_id).select('id,label,store_id,display,rotation').single();
      if(screenError) throw screenError;
      return reply({status:'paired',screen,deviceToken:token});
    }
    if(action==='approve') {
      const admin=await isAdmin(req);
      if(!admin) return reply({error:'Head Office authorization required'},403);
      const code=typeof input.code==='string'?input.code.toUpperCase().replace(/\s/g,''):'';
      if(!/^[A-Z2-9]{10}$/.test(code)||!validId(input.screenId)) return reply({error:'Invalid code or screen ID'},400);
      const {data:screen,error:screenError}=await db.from('grill_screens').select('id').eq('id',input.screenId).maybeSingle();
      if(screenError) throw screenError;
      if(!screen) return reply({error:'Register the screen first'},404);
      const hash=await digest(code);
      const {data:pair,error}=await db.from('grill_pairing_requests').update({status:'approved',approved_at:new Date().toISOString(),approved_by:admin,screen_id:input.screenId}).eq('code_hash',hash).eq('status','pending').gt('expires_at',new Date().toISOString()).select('id').maybeSingle();
      if(error) throw error;
      if(!pair) return reply({error:'Code expired, invalid, or already used'},404);
      return reply({ok:true,status:'approved',screenId:input.screenId});
    }
    return reply({error:'Unknown action'},400);
  } catch(e) {
    console.error('device pairing error',e);
    return reply({error:'Pairing service unavailable'},503);
  }
});
