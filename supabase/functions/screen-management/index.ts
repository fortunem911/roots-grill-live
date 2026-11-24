// ROOTS_GRILL_SCREEN_MANAGEMENT_V3
// Deploy as Supabase Edge Function "screen-management" with legacy JWT verification OFF.
// Head Office authorization is checked on every request.
import { createClient } from 'npm:@supabase/supabase-js@2';
const cors={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Methods':'POST, OPTIONS','Access-Control-Allow-Headers':'content-type, apikey, authorization','Cache-Control':'no-store'};
const db=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false,autoRefreshToken:false}});
const reply=(value:unknown,status=200)=>Response.json(value,{status,headers:cors});
Deno.serve(async req=>{
 if(req.method==='OPTIONS')return new Response(null,{headers:cors});
 if(req.method!=='POST')return reply({error:'Method not allowed'},405);
 try{
  const jwt=(req.headers.get('authorization')||'').replace(/^Bearer\s+/i,'');
  if(!jwt)return reply({error:'Sign in required'},401);
  const {data:{user},error:authError}=await db.auth.getUser(jwt);
  if(authError||!user)return reply({error:'Invalid session'},401);
  const {data:admin,error:adminError}=await db.from('grill_admins').select('user_id').eq('user_id',user.id).maybeSingle();
  if(adminError||!admin)return reply({error:'Head Office authorization required'},403);
  const body=await req.json();
  if(body.action==='list'){
   const [stores,screens]=await Promise.all([
    db.from('grill_stores').select('id,name').order('name'),
    db.from('grill_screens').select('id,label,location,disabled,store_id,display,rotation,last_seen,player_mode,playback_issue,current_media_id,current_media_name,player_diagnostics,updated_at').order('label')
   ]);
   if(stores.error)throw stores.error;if(screens.error)throw screens.error;
   return reply({ok:true,stores:stores.data,screens:screens.data,serverTime:new Date().toISOString()});
  }
  if(body.action==='history'){
   if(typeof body.screenId!=='string'||!/^[-a-z0-9]{1,100}$/.test(body.screenId))return reply({error:'Invalid screen'},400);
   const {data:screen,error:screenError}=await db.from('grill_screens').select('id').eq('id',body.screenId).maybeSingle();
   if(screenError)throw screenError;
   if(!screen)return reply({error:'Screen not found'},404);
   const {data:events,error:eventsError}=await db.from('grill_playback_events')
     .select('id,media_id,media_name,started_at,duration_ms,reported_at')
     .eq('screen_id',body.screenId).order('started_at',{ascending:false}).limit(20);
   if(eventsError)throw eventsError;
   return reply({ok:true,events:events||[]});
  }
  if(body.action==='create'){
   const label=typeof body.label==='string'?body.label.trim():'';
   const location=typeof body.location==='string'?body.location.trim():'';
   const storeId='head-office'; // Until manager scopes are introduced, HO owns new registrations.
   const display=body.display;
   if(label.length<2||label.length>80||location.length<2||location.length>120||!['landscape','portrait'].includes(display))
    return reply({error:'Invalid name, location or orientation'},400);
   const {data:store,error:storeError}=await db.from('grill_stores').select('id').eq('id',storeId).maybeSingle();
   if(storeError)throw storeError;if(!store)return reply({error:'Store not registered'},404);
   const id='screen-'+crypto.randomUUID();
   const {data,error}=await db.from('grill_screens').insert({id,label,location,store_id:storeId,display,rotation:display==='portrait'?270:0}).select('id,label,store_id,display,rotation').single();
   if(error)throw error;
   return reply({ok:true,screen:data},201);
  }
  if(body.action==='update'){
   if(typeof body.screenId!=='string'||!/^[-a-z0-9]{1,100}$/.test(body.screenId))return reply({error:'Invalid screen'},400);
   const patch:Record<string,unknown>={};
   if(body.label!==undefined){if(typeof body.label!=='string'||body.label.trim().length<2||body.label.trim().length>80)return reply({error:'Invalid screen name'},400);patch.label=body.label.trim();}
   if(body.location!==undefined){if(typeof body.location!=='string'||body.location.trim().length<2||body.location.trim().length>120)return reply({error:'Invalid location'},400);patch.location=body.location.trim();}
   if(body.disabled!==undefined){if(typeof body.disabled!=='boolean')return reply({error:'Invalid disabled state'},400);patch.disabled=body.disabled;}
   if(!Object.keys(patch).length)return reply({error:'Nothing to update'},400);
   const {data,error}=await db.from('grill_screens').update(patch).eq('id',body.screenId).select('id,label,location,disabled').maybeSingle();
   if(error)throw error;if(!data)return reply({error:'Screen not found'},404);
   return reply({ok:true,screen:data});
  }
  if(body.action==='remove'){
   if(typeof body.screenId!=='string'||!/^[-a-z0-9]{1,100}$/.test(body.screenId))return reply({error:'Invalid screen'},400);
   const {data:removed,error}=await db.rpc('grill_remove_screen',{p_screen_id:body.screenId});
   if(error)throw error;if(!removed)return reply({error:'Screen not found'},404);
   return reply({ok:true});
  }
  return reply({error:'Unknown action'},400);
 }catch(error){console.error('Screen management:',error);return reply({error:'Screen management service unavailable'},503);}
});
