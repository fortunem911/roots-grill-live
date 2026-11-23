/* Roots Grill Screen Management V1 — Head Office only. */
(function(){
'use strict';
const base='https://zvezbdoghzbrsvxazfwo.supabase.co';
const key='sb_publishable_IpUt3RpCm0f9Hlyiy_lRkA_GOuhS1pO';
const el=id=>document.getElementById(id);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const status=el('screenManagementStatus'),list=el('screenManagementList'),store=el('newScreenStore'),form=el('newScreenForm');
let loaded=false;
async function call(action,fields={}){
 const session=await db.auth.getSession(),token=session.data.session&&session.data.session.access_token;
 if(!token)throw Error('Please sign in to Head Office.');
 const res=await fetch(base+'/functions/v1/screen-management',{method:'POST',headers:{'content-type':'application/json','apikey':key,'authorization':'Bearer '+token},body:JSON.stringify({action,...fields})});
 const data=await res.json().catch(()=>({}));
 if(!res.ok||!data.ok)throw Error(data.error||'Screen management HTTP '+res.status);
 return data;
}
async function load(){
 status.textContent='Loading registered screens…';
 try{
  const data=await call('list');loaded=true;
  store.innerHTML=data.stores.map(s=>'<option value="'+esc(s.id)+'">'+esc(s.name)+'</option>').join('');
  const now=Date.parse(data.serverTime);
  list.innerHTML=data.screens.map(s=>{
   const age=s.last_seen?now-Date.parse(s.last_seen):Infinity;
   const online=age>=0&&age<120000;
   const state=!s.last_seen?'Not connected':online?'Online':'Offline';
   return '<div class="screen-mgmt-row"><div><strong>'+esc(s.label)+'</strong><small>'+esc(s.id)+'</small></div><div><span class="screen-mgmt-pill '+(online?'online':'')+'">'+esc(state)+'</span><small>'+esc(s.store_id)+' · '+esc(s.display)+'</small></div></div>';
  }).join('')||'<p class="muted">No screens registered.</p>';
  status.textContent=data.screens.length+' registered screens · status based on last heartbeat (online within 2 minutes).';
 }catch(e){status.textContent=e.message+'. Deploy the screen-management Edge Function to enable this panel.';}
}
form.addEventListener('submit',async e=>{
 e.preventDefault();
 const button=el('createScreenButton');button.disabled=true;
 try{
  const data=await call('create',{label:el('newScreenLabel').value,storeId:store.value,display:el('newScreenDisplay').value});
  form.reset();await load();
  status.textContent='✓ Created '+data.screen.label+'. Now pair it using the Pair Screens section.';
  const frame=el('pairingFrame');if(frame)frame.contentWindow.postMessage({type:'roots-grill-screens-changed'},location.origin);
 }catch(e){status.textContent=e.message;}finally{button.disabled=false;}
});
el('refreshScreensButton').addEventListener('click',load);
const nav=document.querySelector('a[href="#screen-management"]');
if(nav)nav.addEventListener('click',()=>load());
window.addEventListener('hashchange',()=>{if(location.hash==='#screen-management')load();});
if(location.hash==='#screen-management')load();
})();
