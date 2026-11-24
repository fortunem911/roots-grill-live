/* Roots Grill Cloud dashboard — Supabase Auth + Storage + PostgREST. */
const PROJECT_URL = 'https://zvezbdoghzbrsvxazfwo.supabase.co';
const PUBLISHABLE_KEY = 'sb_publishable_IpUt3RpCm0f9Hlyiy_lRkA_GOuhS1pO';
const BUCKET = 'roots-grill-media';
const db = window.supabase.createClient(PROJECT_URL, PUBLISHABLE_KEY);
const el = id => document.getElementById(id);
const loginView = el('loginView'), dashboardView = el('dashboardView');
const loginForm = el('loginForm'), email = el('username'), password = el('password');
const loginStatus = el('loginStatus'), loginButton = el('loginButton');
const uploadForm = el('uploadForm'), mediaInput = el('mediaInput'), uploadStatus = el('uploadStatus');
const uploadButton = el('uploadButton'), uploadProgress = el('uploadProgress');
const adminGrid = el('adminGrid'), empty = el('adminEmptyState');
let items = [], filter = 'all';
const safe = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function authenticated(user) {
  loginView.hidden = !!user; dashboardView.hidden = !user;
  if (user) el('currentUser').textContent = user.email || 'Administrator';
  else password.value = '';
}
async function checkAdmin(user) {
  if (!user) return false;
  const { data, error } = await db.rpc('is_grill_admin');
  if (error) throw error;
  return data === true;
}
async function loadMedia() {
  const { data, error } = await db.from('media_items').select('id,storage_path,payload').order('updated_at', { ascending: false });
  if (error) { empty.hidden = false; empty.querySelector('h3').textContent = 'Could not load media'; empty.querySelector('p').textContent = error.message; return; }
  items = (data || []).map(row => ({...row.payload, id:row.id, storage_path:row.storage_path}));
  el('totalCount').textContent = items.length;
  el('landscapeCount').textContent = items.filter(i => i.display !== 'portrait').length;
  el('portraitCount').textContent = items.filter(i => i.display === 'portrait').length;
  render();
}
function render() {
  const visible = items.filter(i => filter === 'all' || (i.display || 'landscape') === filter);
  empty.hidden = visible.length > 0;
  if (!visible.length) { empty.querySelector('h3').textContent = 'No media uploaded yet'; empty.querySelector('p').textContent = 'Your uploaded artwork will appear here.'; }
  adminGrid.innerHTML = visible.map(i => {
    const isImage = String(i.mimeType || '').startsWith('image/');
    const preview = isImage ? '<img loading="lazy" src="'+safe(i.url)+'" alt="'+safe(i.originalName)+'">' : '<video controls preload="metadata" src="'+safe(i.url)+'"></video>';
    return '<article class="media-card"><div class="media-preview">'+preview+'<span class="display-badge '+safe(i.display || 'landscape')+'">'+safe(i.display || 'landscape')+'</span></div><div class="media-info"><strong>'+safe(i.originalName)+'</strong><small>'+safe(new Date(i.uploadedAt).toLocaleString())+'</small><div class="media-actions"><button class="delete-button" data-id="'+safe(i.id)+'" type="button">Delete</button></div></div></article>';
  }).join('');
  adminGrid.querySelectorAll('.delete-button').forEach(btn => btn.addEventListener('click', async () => {
    if (!confirm('Delete this file permanently?')) return;
    btn.disabled = true;
    const i = items.find(item => item.id === btn.dataset.id);
    try {
      const { error: deleteError } = await db.from('media_items').delete().eq('id', i.id);
      if (deleteError) throw deleteError;
      const { error: storageError } = await db.storage.from(BUCKET).remove([i.storage_path]);
      if (storageError) alert('Media removed from playlist, but storage cleanup failed: '+storageError.message);
      await loadMedia();
    } catch (e) { alert(e.message); btn.disabled = false; }
  }));
}
async function videoDuration(file) {
  if (!file.type.startsWith('video/')) return 10000;
  return new Promise(resolve => {
    const v = document.createElement('video'), u = URL.createObjectURL(file);
    const timer = setTimeout(() => done(null), 12000);
    function done(value) { clearTimeout(timer); URL.revokeObjectURL(u); v.removeAttribute('src'); resolve(value); }
    v.preload = 'metadata'; v.onloadedmetadata = () => done(Number.isFinite(v.duration) ? Math.ceil(v.duration * 1000) : null);
    v.onerror = () => done(null); v.src = u;
  });
}
async function orientation(file) {
  if (file.type.startsWith('video/')) return new Promise((resolve,reject)=>{const v=document.createElement('video'),u=URL.createObjectURL(file);const t=setTimeout(()=>done(false),15000);function done(ok){clearTimeout(t);const d=v.videoHeight>v.videoWidth?'portrait':'landscape';URL.revokeObjectURL(u);v.removeAttribute('src');if(ok)resolve(d);else reject(new Error('Cannot read video dimensions: '+file.name));}v.preload='metadata';v.onloadedmetadata=()=>done(v.videoWidth>0&&v.videoHeight>0);v.onerror=()=>done(false);v.src=u;});
  return new Promise(resolve => {
    const image = new Image(), url = URL.createObjectURL(file);
    image.onload = () => { const d = image.naturalHeight > image.naturalWidth ? 'portrait' : 'landscape'; URL.revokeObjectURL(url); resolve(d); };
    image.onerror = () => { URL.revokeObjectURL(url); resolve('landscape'); }; image.src = url;
  });
}
loginForm.addEventListener('submit', async e => {
  e.preventDefault(); loginButton.disabled = true; loginStatus.textContent = '';
  try {
    const {data,error} = await db.auth.signInWithPassword({email:email.value.trim(),password:password.value});
    if (error) throw error;
    if (!await checkAdmin(data.user)) { await db.auth.signOut(); throw new Error('This account is not authorized as a Roots Grill administrator.'); }
    authenticated(data.user); await loadMedia();
  } catch (err) { loginStatus.textContent = err.message; }
  finally { loginButton.disabled = false; }
});
el('togglePassword').addEventListener('click', () => { const show = password.type === 'password'; password.type = show ? 'text' : 'password'; el('togglePassword').textContent = show ? 'Hide' : 'Show'; });
el('logoutButton').addEventListener('click', async () => { await db.auth.signOut(); items = []; authenticated(null); });
el('refreshButton').addEventListener('click', loadMedia);
document.querySelectorAll('.filter-button').forEach(btn => btn.addEventListener('click', () => { filter = btn.dataset.filter; document.querySelectorAll('.filter-button').forEach(b => b.classList.toggle('active', b === btn)); render(); }));
mediaInput.addEventListener('change', () => { el('selectionText').textContent = Array.from(mediaInput.files).map(f => f.name).join(', ') || 'No files selected.'; });
const drop = el('dropZone');
['dragenter','dragover'].forEach(t => drop.addEventListener(t, e => { e.preventDefault(); drop.classList.add('dragging'); }));
['dragleave','drop'].forEach(t => drop.addEventListener(t, e => { e.preventDefault(); drop.classList.remove('dragging'); }));
drop.addEventListener('drop', e => { if (e.dataTransfer.files.length) { mediaInput.files = e.dataTransfer.files; mediaInput.dispatchEvent(new Event('change')); } });
uploadForm.addEventListener('submit', async e => {
  e.preventDefault(); const files = Array.from(mediaInput.files); if (!files.length) return;
  uploadButton.disabled = true; uploadProgress.hidden = false;
  let uploaded = 0;
  try {
    for (const file of files) {
      if (!/^(image|video)\//.test(file.type)) throw new Error('Unsupported file: '+file.name);
      if (file.size > 50 * 1024 * 1024) throw new Error(file.name+' exceeds the current 50 MB storage limit.');
      uploadStatus.textContent = 'Uploading '+file.name+' ('+(uploaded+1)+'/'+files.length+')…';
      const id = crypto.randomUUID(), display = await orientation(file), durationMs = await videoDuration(file);
      const path = display+'/'+id+'-'+file.name.replace(/[^a-zA-Z0-9._-]/g,'_');
      const {error: uploadError} = await db.storage.from(BUCKET).upload(path,file,{contentType:file.type,upsert:false});
      if (uploadError) throw uploadError;
      const url = db.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
      const payload = {id,filename:path.split('/').pop(),originalName:file.name,mimeType:file.type,url,display,uploadedAt:new Date().toISOString(),durationMs};
      const {error: insertError} = await db.from('media_items').insert({id,storage_path:path,payload});
      if (insertError) { await db.storage.from(BUCKET).remove([path]); throw insertError; }
      uploaded++;
    }
    uploadStatus.style.color = '#79d69b';
    uploadStatus.textContent = uploaded+' file(s) uploaded successfully.';
    mediaInput.value = ''; el('selectionText').textContent = 'No files selected.'; await loadMedia();
  } catch (err) { uploadStatus.style.color = ''; uploadStatus.textContent = 'Uploaded '+uploaded+' of '+files.length+'. '+(err && err.message ? err.message : String(err)); }
  finally { uploadButton.disabled = false; uploadProgress.hidden = true; }
});
(async () => {
  try {
    const {data:{user}} = await db.auth.getUser();
    if (user && await checkAdmin(user)) { authenticated(user); await loadMedia(); }
    else { if (user) await db.auth.signOut(); authenticated(null); }
  } catch (e) { authenticated(null); loginStatus.textContent = e.message; }
})();
