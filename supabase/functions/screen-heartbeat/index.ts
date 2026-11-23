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
    const patch:Record<string,unknown>={last_seen:new Date().toISOString(),updated_at:new Date().toISOString()};
    if(data.playerMode!==undefined)patch.player_mode=clean(data.playerMode,30);
    if(data.playbackIssue!==undefined)patch.playback_issue=clean(data.playbackIssue,180);
    // Preserve last reported media on ordinary heartbeat requests.
    // Only authenticated playback events can change Now Playing.
    if(data.playbackEvent && typeof data.playbackEvent.mediaId==='string' && typeof data.playbackEvent.mediaName==='string'){
      patch.current_media_id=clean(data.playbackEvent.mediaId,100);
      patch.current_media_name=clean(data.playbackEvent.mediaName,180);
    }
    const {error:updateError}=await db.from('grill_screens').update(patch).eq('id',screen.id);
    if(updateError) throw updateError;
    // Optional, explicitly reported playback transition. Ordinary heartbeats
    // do not create history. A unique index deduplicates retries.
    if(data.playbackEvent!==undefined && data.playbackEvent!==null) {
      const event=data.playbackEvent;
      const validId=typeof event.mediaId==='string' && event.mediaId.length>0 && event.mediaId.length<=100;
      const validName=typeof event.mediaName==='string' && event.mediaName.length>0 && event.mediaName.length<=180;
      const validStart=typeof event.startedAt==='string' && !Number.isNaN(Date.parse(event.startedAt));
      const started=validStart?Date.parse(event.startedAt):NaN;
      const validTime=validStart && started<=Date.now()+60000 && started>=Date.now()-86400000;
      const duration=event.durationMs==null?null:event.durationMs;
      const validDuration=duration===null || (Number.isInteger(duration) && duration>=0 && duration<=86400000);
      if(!validId || !validName || !validTime || !validDuration) return reply({error:'Invalid playback event'},400);
      const {error:historyError}=await db.from('grill_playback_events').upsert({
        screen_id:screen.id,
        media_id:event.mediaId,
        media_name:event.mediaName,
        started_at:new Date(started).toISOString(),
        duration_ms:duration
      },{onConflict:'screen_id,media_id,started_at',ignoreDuplicates:true});
      if(historyError) {
        console.error('playback history write error',historyError);
        return reply({error:'Playback history temporarily unavailable'},503);
      }
    }
    return reply({ok:true});
  } catch(error) {
    console.error('heartbeat error',error);
    return reply({error:'Temporarily unavailable'},503);
  }
});
