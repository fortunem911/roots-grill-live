/* Roots Grill Screen Management V1 — Head Office only. */
(function(){
'use strict';
const base='https://zvezbdoghzbrsvxazfwo.supabase.co';
const key='sb_publishable_IpUt3RpCm0f9Hlyiy_lRkA_GOuhS1pO';
const el=id=>document.getElementById(id);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const status=el('screenManagementStatus'),list=el('screenManagementList'),form=el('newScreenForm');
let loaded=false;
let loading=false;
const refreshButton=el('refreshScreensButton');
let refreshFeedbackTimer=null;
function refreshVisual(state){
 if(!refreshButton)return;
 refreshButton.classList.toggle('rg-refresh-loading',state==='loading');
 refreshButton.classList.toggle('rg-refresh-success',state==='success');
 refreshButton.classList.toggle('rg-refresh-error',state==='error');
 refreshButton.disabled=state==='loading';
 refreshButton.textContent=state==='loading'?'⟳ Refreshing…':state==='success'?'✓ Updated':state==='error'?'! Retry refresh':'⟳ Refresh screens';
}

let lastLoadAt=0;
const details=el('screenDetailsPanel');
let selectedScreenId=null;
let historyRequest=0;
const durationLabel=v=>v==null?'Not reported':Math.round(v/1000)+'s (configured)';
async function loadHistory(id){
 const requestId=++historyRequest;
 const area=el('screenPlaybackHistory');if(!area)return;
 area.textContent='Loading recent playback…';
 try{
  const result=await call('history',{screenId:id});
  if(requestId!==historyRequest||selectedScreenId!==id)return;
  const target=el('screenPlaybackHistory');if(!target)return;
  target.innerHTML=result.events.length?result.events.slice(0,9).map(e=>'<div style="padding:10px 0;border-bottom:1px solid #30343d"><strong>'+esc(e.media_name)+'</strong><small style="display:block;color:#aab0ba;margin-top:5px">Started: '+esc(readableDate(e.started_at))+' · Duration: '+esc(durationLabel(e.duration_ms))+'</small></div>').join(''):'<p class="muted">No playback events recorded for this screen yet.</p>';
 }catch(e){if(requestId===historyRequest){const target=el('screenPlaybackHistory');if(target)target.textContent='Playback history unavailable: '+e.message;}}
}

const readableDate=v=>v&&Number.isFinite(Date.parse(v))?new Date(v).toLocaleString():'Never';
function showDetails(screen,serverTime,scrollToPanel=false){
 selectedScreenId=screen.id;
 const age=screen.last_seen?Date.parse(serverTime)-Date.parse(screen.last_seen):Infinity;
 const state=screen.disabled?'Disabled':!screen.last_seen?'Not connected':age>=0&&age<120000?'Online':'Offline';
 const fields=[['Status',state],['Location',screen.location||screen.store_id],['Orientation',screen.display],['Last heartbeat',readableDate(screen.last_seen)],['Player mode',screen.player_mode||'Not reported'],['Playback issue',screen.playback_issue||'None reported'],['Screen ID',screen.id]];
 details.innerHTML='<div class="screen-detail-head"><div><small class="muted">SCREEN DETAILS</small><h3>'+esc(screen.label)+'</h3></div><button type="button" id="closeScreenDetails">Close</button></div><div class="screen-detail-grid">'+fields.map(([name,value])=>'<div><small>'+esc(name)+'</small><strong>'+esc(value)+'</strong></div>').join('')+'</div><div class="screen-detail-note"><strong>Recent plays</strong><div id="screenPlaybackHistory" role="status">Loading recent playback…</div></div>';
 details.hidden=false;
 el('closeScreenDetails').addEventListener('click',()=>{details.hidden=true;selectedScreenId=null;++historyRequest});
 loadHistory(screen.id);
 if(scrollToPanel)requestAnimationFrame(()=>details.scrollIntoView({behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth',block:'start'}));
}

function setStatus(message,kind='neutral'){status.textContent=message;status.style.color=kind==='success'?'#66e99d':kind==='error'?'#ff8d92':'';}
async function call(action,fields={}){
 const session=await db.auth.getSession(),token=session.data.session&&session.data.session.access_token;
 if(!token)throw Error('Please sign in to Head Office.');
 const res=await fetch(base+'/functions/v1/screen-management',{method:'POST',headers:{'content-type':'application/json','apikey':key,'authorization':'Bearer '+token},body:JSON.stringify({action,...fields})});
 const data=await res.json().catch(()=>({}));
 if(!res.ok||!data.ok)throw Error(data.error||'Screen management HTTP '+res.status);
 return data;
}
async function load(manual=false){
 if(loading || document.getElementById('dashboardView').hidden || document.hidden)return;
 loading=true;
 if(manual){clearTimeout(refreshFeedbackTimer);refreshVisual('loading');}
 setStatus('Loading registered screens…');
 try{
  const data=await call('list');loaded=true;

  const now=Date.parse(data.serverTime);
  if(selectedScreenId){const selected=data.screens.find(s=>s.id===selectedScreenId);if(selected)showDetails(selected,data.serverTime);else{details.hidden=true;selectedScreenId=null;}}
  list.innerHTML=data.screens.map(s=>{
   const age=s.last_seen?now-Date.parse(s.last_seen):Infinity;
   const online=!s.disabled&&age>=0&&age<120000;
   const state=s.disabled?'Disabled':!s.last_seen?'Not connected':online?'Online':'Offline';
   return '<div class="screen-mgmt-row"><div><button type="button" class="screen-mgmt-name" data-details="'+esc(s.id)+'">'+esc(s.label)+'</button><small>'+esc(s.location||s.store_id)+' · '+esc(s.display)+'</small><small>'+esc(s.id)+'</small></div><div><span class="screen-mgmt-pill '+(online?'online':'')+'">'+esc(state)+'</span><div class="screen-mgmt-actions"><button type="button" data-action="edit" data-id="'+esc(s.id)+'">Edit</button><button type="button" data-action="toggle" data-id="'+esc(s.id)+'">'+(s.disabled?'Enable':'Disable')+'</button><button type="button" data-action="remove" data-id="'+esc(s.id)+'">Remove</button></div></div></div>';
  }).join('')||'<p class="muted">No screens registered.</p>';
  list.querySelectorAll('[data-details]').forEach(button=>button.addEventListener('click',()=>{const selected=data.screens.find(s=>s.id===button.dataset.details);if(selected)showDetails(selected,data.serverTime,true);}));
  list.querySelectorAll('[data-action]').forEach(button=>button.addEventListener('click',async()=>{
   const screen=data.screens.find(s=>s.id===button.dataset.id);if(!screen)return;
   let action=button.dataset.action,fields={screenId:screen.id};
   if(action==='edit'){
    const label=prompt('Screen name',screen.label);if(label===null)return;
    const location=prompt('Location',screen.location||screen.store_id);if(location===null)return;
    action='update';fields={...fields,label,location};
   }else if(action==='toggle'){
    if(!confirm((screen.disabled?'Enable ':'Disable ')+screen.label+'?'+(screen.disabled?'':' The TV will show a disabled screen until re-enabled.')))return;
    action='update';fields.disabled=!screen.disabled;
   }else if(action==='remove'){
    if(!confirm('Remove '+screen.label+'? This permanently deletes its registration and revokes its pairing. The physical TV can be registered again with a fresh code.'))return;
   }
   button.disabled=true;button.classList.add('rg-action-loading');const oldText=button.textContent;button.textContent='Working…';
   try{await call(action,fields);await load();setStatus('✓ Screen '+(action==='remove'?'removed':'updated')+'.','success');}
   catch(e){setStatus(e.message,'error');button.disabled=false;button.textContent=oldText;button.classList.remove('rg-action-loading');}
  }));
  setStatus(data.screens.length+' registered screens · status based on last heartbeat (online within 2 minutes).');
  if(manual)refreshVisual('success');
 }catch(e){setStatus(e.message+'. Check the screen-management service.','error');if(manual)refreshVisual('error');}
 finally{loading=false;lastLoadAt=Date.now();if(manual)refreshFeedbackTimer=setTimeout(()=>refreshVisual('idle'),2200);}
}
form.addEventListener('submit',async e=>{
 e.preventDefault();
 const button=el('createScreenButton');button.disabled=true;button.classList.add('rg-action-loading');const buttonText=button.textContent;button.textContent='Adding screen…';
 try{
  const data=await call('create',{label:el('newScreenLabel').value,location:el('newScreenLocation').value,display:el('newScreenDisplay').value});
  form.reset();await load();
  setStatus('✓ Created '+data.screen.label+'. Now pair it using the Pair Screens section.','success');
  const frame=el('pairingFrame');if(frame)frame.contentWindow.postMessage({type:'roots-grill-screens-changed'},location.origin);
 }catch(e){setStatus(e.message,'error');}finally{button.disabled=false;button.classList.remove('rg-action-loading');button.textContent=buttonText;}
});
refreshButton.addEventListener('click',()=>load(true));
const nav=document.querySelector('a[href="#screen-management"]');
if(nav)nav.addEventListener('click',()=>load());
window.addEventListener('hashchange',()=>{if(location.hash==='#screen-management')load();});
if(location.hash==='#screen-management')load();
function refreshWhenReady(){
 if(document.hidden || document.getElementById('dashboardView').hidden)return;
 if(!loaded || Date.now()-lastLoadAt>=30000)load();
}
db.auth.onAuthStateChange((event,session)=>{
 if(event==='SIGNED_IN' && session)setTimeout(refreshWhenReady,250);
 if(event==='SIGNED_OUT'){loaded=false;selectedScreenId=null;details.hidden=true;list.innerHTML='<p class="muted">Sign in to view registered screens.</p>';}
});
setInterval(refreshWhenReady,5000);
document.addEventListener('visibilitychange',()=>{if(!document.hidden)refreshWhenReady();});
window.addEventListener('focus',refreshWhenReady);
window.addEventListener('message',e=>{if(e.origin===location.origin && e.data && e.data.type==='roots-grill-screens-changed'){lastLoadAt=0;refreshWhenReady();}});
})();
