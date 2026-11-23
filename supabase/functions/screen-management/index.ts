// ROOTS_GRILL_SCREEN_MANAGEMENT_V1
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
    db.from('grill_screens').select('id,label,store_id,display,rotation,last_seen,player_mode,playback_issue,updated_at').order('label')
   ]);
   if(stores.error)throw stores.error;if(screens.error)throw screens.error;
   return reply({ok:true,stores:stores.data,screens:screens.data,serverTime:new Date().toISOString()});
  }
  if(body.action==='create'){
   const label=typeof body.label==='string'?body.label.trim():'';
   const storeId=typeof body.storeId==='string'?body.storeId.trim():'';
   const display=body.display;
   if(label.length<2||label.length>80||!/^[-a-z0-9]{1,100}$/.test(storeId)||!['landscape','portrait'].includes(display))
    return reply({error:'Invalid label, store or orientation'},400);
   const {data:store,error:storeError}=await db.from('grill_stores').select('id').eq('id',storeId).maybeSingle();
   if(storeError)throw storeError;if(!store)return reply({error:'Store not registered'},404);
   const id='screen-'+crypto.randomUUID();
   const {data,error}=await db.from('grill_screens').insert({id,label,store_id:storeId,display,rotation:display==='portrait'?270:0}).select('id,label,store_id,display,rotation').single();
   if(error)throw error;
   return reply({ok:true,screen:data},201);
  }
  return reply({error:'Unknown action'},400);
 }catch(error){console.error('Screen management:',error);return reply({error:'Screen management service unavailable'},503);}
});
