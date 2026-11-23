// Supabase Edge Function: screen-heartbeat (JWT verification disabled).
// Requires screen-specific token provisioned separately in grill_screens.
// No public unauthenticated writes; all writes verified against a SHA-256 token hash.
import { createClient } from 'npm:@supabase/supabase-js@2';
const headers = {
  'Access-Control-Allow-Origin':'*',
  'Access-Control-Allow-Methods':'POST, OPTIONS',
  'Access-Control-Allow-Headers':'content-type, apikey, authorization, x-screen-token',
  'Cache-Control':'no-store'
};
function reply(body: unknown, status=200) { return Response.json(body,{status,headers}); }
function hex(buffer: ArrayBuffer) {
  return Array.from(new Uint8Array(buffer)).map(n=>n.toString(16).padStart(2,'0')).join('');
}
Deno.serve(async request=>{
  if(request.method==='OPTIONS') return new Response(null,{headers});
  if(request.method!=='POST') return reply({error:'Method not allowed'},405);
  try {
    const token=request.headers.get('x-screen-token')||'';
    if(!/^[a-f0-9]{64}$/i.test(token)) return reply({error:'Unauthorized'},401);
    const data=await request.json();
    if(typeof data?.screenId!=='string'||data.screenId.length>100) return reply({error:'Invalid screen'},400);
    const hash=hex(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(token)));
    const db=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false}});
    const {data:screen,error}=await db.from('grill_screens').select('id,token_hash,disabled').eq('id',data.screenId).maybeSingle();
    if(error) throw error;
    if(!screen||screen.token_hash!==hash) return reply({error:'Unauthorized'},401);
    if(screen.disabled) return reply({error:'Screen disabled by Head Office'},403);
    const clean=(value:unknown,max:number)=>typeof value==='string'?value.slice(0,max):null;
    const {error:updateError}=await db.from('grill_screens').update({
      last_seen:new Date().toISOString(),
      current_media_id:clean(data.mediaId,100),
      current_media_name:clean(data.mediaName,180),
      player_mode:clean(data.playerMode,30),
      playback_issue:clean(data.playbackIssue,180),
      updated_at:new Date().toISOString()
    }).eq('id',screen.id);
    if(updateError) throw updateError;
    return reply({ok:true});
  } catch(error) {
    console.error('heartbeat error',error);
    return reply({error:'Temporarily unavailable'},503);
  }
});
