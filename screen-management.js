/* Roots Grill Screen Management V1 — Head Office only. */
(function(){
'use strict';
const base='https://zvezbdoghzbrsvxazfwo.supabase.co';
const key='sb_publishable_IpUt3RpCm0f9Hlyiy_lRkA_GOuhS1pO';
const el=id=>document.getElementById(id);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const status=el('screenManagementStatus'),list=el('screenManagementList'),form=el('newScreenForm');
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

  const now=Date.parse(data.serverTime);
  list.innerHTML=data.screens.map(s=>{
   const age=s.last_seen?now-Date.parse(s.last_seen):Infinity;
   const online=!s.disabled&&age>=0&&age<120000;
   const state=s.disabled?'Disabled':!s.last_seen?'Not connected':online?'Online':'Offline';
   return '<div class="screen-mgmt-row"><div><strong>'+esc(s.label)+'</strong><small>'+esc(s.location||s.store_id)+' · '+esc(s.display)+'</small><small>'+esc(s.id)+'</small></div><div><span class="screen-mgmt-pill '+(online?'online':'')+'">'+esc(state)+'</span><div class="screen-mgmt-actions"><button type="button" data-action="edit" data-id="'+esc(s.id)+'">Edit</button><button type="button" data-action="toggle" data-id="'+esc(s.id)+'">'+(s.disabled?'Enable':'Disable')+'</button><button type="button" data-action="remove" data-id="'+esc(s.id)+'">Remove</button></div></div></div>';
  }).join('')||'<p class="muted">No screens registered.</p>';
  list.querySelectorAll('[data-action]').forEach(button=>button.addEventListener('click',async()=>{
   const screen=data.screens.find(s=>s.id===button.dataset.id);if(!screen)return;
   let action=button.dataset.action,fields={screenId:screen.id};
   if(action==='edit'){
    const label=prompt('Screen name',screen.label);if(label===null)return;
    const location=prompt('Location',screen.location||screen.store_id);if(location===null)return;
    action='update';fields={...fields,label,location};
   }else if(action==='toggle'){
    if(!confirm((screen.disabled?'Enable ':'Disable ')+screen.label+'?'+(screen.disabled?'':' This will reject its next heartbeat once the updated heartbeat service is deployed.')))return;
    action='update';fields.disabled=!screen.disabled;
   }else if(action==='remove'){
    if(!confirm('Remove '+screen.label+'? Only screens that have never paired (or have had their pairing revoked) can be removed.'))return;
   }
   button.disabled=true;
   try{await call(action,fields);await load();status.textContent='✓ Screen '+(action==='remove'?'removed':'updated')+'.';}
   catch(e){status.textContent=e.message;button.disabled=false;}
  }));
  status.textContent=data.screens.length+' registered screens · status based on last heartbeat (online within 2 minutes).';
 }catch(e){status.textContent=e.message+'. Deploy the screen-management Edge Function to enable this panel.';}
}
form.addEventListener('submit',async e=>{
 e.preventDefault();
 const button=el('createScreenButton');button.disabled=true;
 try{
  const data=await call('create',{label:el('newScreenLabel').value,location:el('newScreenLocation').value,display:el('newScreenDisplay').value});
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
