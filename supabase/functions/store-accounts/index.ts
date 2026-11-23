import { createClient } from 'npm:@supabase/supabase-js@2';
const url=Deno.env.get('SUPABASE_URL')!;
const admin=createClient(url,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false,autoRefreshToken:false}});
const cors={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization,apikey,content-type','Access-Control-Allow-Methods':'POST,OPTIONS','Cache-Control':'no-store'};
const send=(data:unknown,status=200)=>Response.json(data,{status,headers:cors});
Deno.serve(async req=>{
 if(req.method==='OPTIONS')return new Response(null,{headers:cors});
 if(req.method!=='POST')return send({error:'Method not allowed'},405);
 try{
  const jwt=(req.headers.get('authorization')||'').replace(/^Bearer\s+/i,'');
  const {data:{user},error:authErr}=await admin.auth.getUser(jwt);
  if(authErr||!user)return send({error:'Sign in required'},401);
  const body=await req.json();
  if(body.action==='accept'){
   const email=(user.email||'').trim().toLowerCase();
   if(!email||!user.email_confirmed_at)return send({error:'Verified email required'},403);
   const {data:invites,error:invErr}=await admin.from('grill_store_invitations').select('id,store_id,expires_at').eq('email',email).eq('status','pending').gt('expires_at',new Date().toISOString());
   if(invErr)throw invErr;
   if(!invites?.length)return send({error:'No valid invitation for this email'},404);
   for(const inv of invites){
    const {error:memberErr}=await admin.from('grill_store_memberships').upsert({store_id:inv.store_id,user_id:user.id,role:'manager',active:true},{onConflict:'store_id,user_id'});
    if(memberErr)throw memberErr;
    const {error:updateErr}=await admin.from('grill_store_invitations').update({status:'accepted',accepted_by:user.id,accepted_at:new Date().toISOString(),updated_at:new Date().toISOString()}).eq('id',inv.id).eq('status','pending');
    if(updateErr)throw updateErr;
   }
   return send({ok:true,accepted:invites.length});
  }
  if(body.action==='managerOverview'){
   const {data:memberships,error:membershipErr}=await admin.from('grill_store_memberships').select('store_id,role').eq('user_id',user.id).eq('active',true);
   if(membershipErr)throw membershipErr;
   if(!memberships?.length)return send({error:'No active store assignment. Ask Head Office to verify your invitation.'},403);
   const storeIds=[...new Set(memberships.map(m=>m.store_id))];
   const [stores,screens]=await Promise.all([
    admin.from('grill_stores').select('id,name').in('id',storeIds).order('name'),
    admin.from('grill_screens').select('id,label,location,store_id,display,last_seen,disabled,current_media_name,playback_issue').in('store_id',storeIds).order('label')
   ]);
   if(stores.error)throw stores.error;if(screens.error)throw screens.error;
   return send({ok:true,stores:stores.data,screens:screens.data,serverTime:new Date().toISOString(),email:user.email,managerName:typeof user.user_metadata?.full_name==='string'?user.user_metadata.full_name:''});
  }
  const {data:headOffice,error:adminErr}=await admin.from('grill_admins').select('user_id').eq('user_id',user.id).maybeSingle();
  if(adminErr||!headOffice)return send({error:'Head Office access required'},403);
  if(body.action==='verifyManagers'){
   const storeId=typeof body.storeId==='string'?body.storeId:'';
   if(!/^[-a-z0-9]{1,100}$/.test(storeId))return send({error:'Invalid store'},400);
   const {data:store,error:storeErr}=await admin.from('grill_stores').select('id,name').eq('id',storeId).maybeSingle();
   if(storeErr)throw storeErr;if(!store)return send({error:'Store not found'},404);
   const [memberships,invitations]=await Promise.all([
    admin.from('grill_store_memberships').select('user_id,role,active,created_at').eq('store_id',storeId),
    admin.from('grill_store_invitations').select('email,status,invited_at,accepted_at,expires_at,accepted_by').eq('store_id',storeId).order('invited_at',{ascending:false})
   ]);
   if(memberships.error)throw memberships.error;if(invitations.error)throw invitations.error;
   const members=(memberships.data||[]).map(m=>({...m,email:(invitations.data||[]).find(i=>i.accepted_by===m.user_id)?.email||'Email not recorded in invitation'}));
   return send({ok:true,store,members,invitations:invitations.data});
  }
  if(body.action==='stores'){
   const {data,error}=await admin.from('grill_stores').select('id,name').order('name');if(error)throw error;
   return send({ok:true,stores:data});
  }
  if(body.action==='createStore'){
   const name=typeof body.name==='string'?body.name.trim():'';
   if(name.length<3||name.length>100)return send({error:'Store name must be 3–100 characters'},400);
   const id='store-'+crypto.randomUUID();
   const {data,error}=await admin.from('grill_stores').insert({id,name}).select('id,name').single();
   if(error)throw error;
   return send({ok:true,store:data},201);
  }
  if(body.action==='invite'){
   const storeId=typeof body.storeId==='string'?body.storeId:'';
   const email=typeof body.email==='string'?body.email.trim().toLowerCase():'';
   const managerName=typeof body.managerName==='string'?body.managerName.trim().replace(/\s+/g,' '):'';
   if(managerName.length<2||managerName.length>80)return send({error:'Manager name must be 2–80 characters'},400);
   if(!/^[-a-z0-9]{1,100}$/.test(storeId)||!/^\S+@\S+\.\S+$/.test(email)||email.length>254)return send({error:'Invalid store or email'},400);
   const {data:store,error:storeErr}=await admin.from('grill_stores').select('id,name').eq('id',storeId).maybeSingle();
   if(storeErr)throw storeErr;if(!store)return send({error:'Store not found'},404);
   const {data:existing}=await admin.from('grill_store_invitations').select('id').eq('store_id',storeId).eq('email',email).eq('status','pending').maybeSingle();
   if(existing)return send({error:'A pending invitation already exists for this email and store'},409);
   const {data:inv,error:insertErr}=await admin.from('grill_store_invitations').insert({store_id:storeId,email,invited_by:user.id}).select('id').single();
   if(insertErr)return send({error:'Could not create invitation (it may already be pending)'},409);
   const redirectTo='https://fortunem911.github.io/roots-grill-live/manager-accept.html';
   const {error:inviteErr}=await admin.auth.admin.inviteUserByEmail(email,{redirectTo,data:{roots_grill_store:store.name,full_name:managerName}});
   if(inviteErr){
    await admin.from('grill_store_invitations').delete().eq('id',inv.id);
    return send({error:'Email invitation failed: '+inviteErr.message},502);
   }
   return send({ok:true,message:'Supabase accepted the invitation email request. Check recipient inbox and spam.'});
  }
  return send({error:'Unknown action'},400);
 }catch(e){console.error('Store accounts:',e);return send({error:'Store accounts service unavailable'},503);}
});