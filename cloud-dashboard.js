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
  if (!file.type.startsWith('video/')) return null;
  return new Promise(resolve => {
    const v = document.createElement('video'), u = URL.createObjectURL(file);
    const timer = setTimeout(() => done(null), 12000);
    function done(value) { clearTimeout(timer); URL.revokeObjectURL(u); v.removeAttribute('src'); resolve(value); }
    v.preload = 'metadata'; v.onloadedmetadata = () => done(Number.isFinite(v.duration) ? Math.ceil(v.duration * 1000) : null);
    v.onerror = () => done(null); v.src = u;
  });
}
// Browser-side single-thread FFmpeg: process videos BEFORE uploading to Supabase.
// The first load downloads a large WASM encoder. No paid processing server required.
let encoderPromise = null;
async function loadEncoder() {
  if (encoderPromise) return encoderPromise;
  encoderPromise = (async () => {
    const version = '0.12.15';
    const base = 'https://cdn.jsdelivr.net/npm/@ffmpeg/ffmpeg@' + version + '/dist/umd';
    const core = 'https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.10/dist/umd';
    if (!window.FFmpegWASM) {
      await new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = base + '/ffmpeg.js';
        script.onload = resolve;
        script.onerror = () => reject(new Error('Could not download video encoder. Check your internet connection.'));
        document.head.appendChild(script);
      });
    }
    async function blobURL(url, mime) {
      const response = await fetch(url);
      if (!response.ok) throw new Error('Encoder download failed (HTTP ' + response.status + ').');
      const blob = await response.blob();
      return URL.createObjectURL(new Blob([blob], {type:mime}));
    }
    const workerURL = await blobURL(base + '/814.ffmpeg.js', 'text/javascript');
    const coreURL = await blobURL(core + '/ffmpeg-core.js', 'text/javascript');
    const wasmURL = await blobURL(core + '/ffmpeg-core.wasm', 'application/wasm');
    const ffmpeg = new window.FFmpegWASM.FFmpeg();
    try {
      await ffmpeg.load({classWorkerURL:workerURL, coreURL, wasmURL});
    } finally {
      URL.revokeObjectURL(workerURL);
      URL.revokeObjectURL(coreURL);
      URL.revokeObjectURL(wasmURL);
    }
    return ffmpeg;
  })().catch(error => { encoderPromise = null; throw error; });
  return encoderPromise;
}
async function optimizeVideo(file, report) {
  report('Preparing TV-friendly video encoder (first use may take a minute)…');
  const ffmpeg = await loadEncoder();
  const id = crypto.randomUUID().replace(/-/g,'');
  const input = 'input-' + id + '.' + (file.name.split('.').pop() || 'mp4').replace(/[^a-z0-9]/gi,'').slice(0,8);
  const output = 'roots-' + id + '.mp4';
  try {
    report('Reading video ' + file.name + '…');
    await ffmpeg.writeFile(input, new Uint8Array(await file.arrayBuffer()));
    report('Trimming and compressing ' + file.name + ' to 10 seconds / 720p…');
    const code = await ffmpeg.exec([
      '-i',input,'-t','10','-map','0:v:0','-an',
      '-vf','scale=w=1280:h=720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2:color=black,fps=25,format=yuv420p',
      '-c:v','libx264','-preset','ultrafast','-crf','28',
      '-profile:v','baseline','-level','3.1',
      '-g','50','-movflags','+faststart','-y',output
    ]);
    if (code !== 0) throw new Error('Video encoding failed. Try an MP4/H.264 source.');
    const bytes = await ffmpeg.readFile(output);
    if (!bytes || !bytes.length) throw new Error('Encoder produced an empty video.');
    const result = new File([bytes],file.name.replace(/\.[^.]+$/,'')+'-tv.mp4',{type:'video/mp4'});
    if (result.size > 50*1024*1024) throw new Error('Compressed video still exceeds 50 MB.');
    return result;
  } finally {
    try { await ffmpeg.deleteFile(input); } catch (_) {}
    try { await ffmpeg.deleteFile(output); } catch (_) {}
  }
}
async function orientation(file) {
  if (!file.type.startsWith('image/')) return 'landscape';
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
      const video = file.type.startsWith('video/');
      // Never upload the unoptimized source if video processing fails.
      const prepared = video ? await optimizeVideo(file, message => { uploadStatus.textContent = message; }) : file;
      if (prepared.size > 50 * 1024 * 1024) throw new Error(prepared.name+' exceeds the current 50 MB storage limit.');
      uploadStatus.textContent = 'Uploading optimized '+prepared.name+' ('+(uploaded+1)+'/'+files.length+')…';
      const id = crypto.randomUUID(), display = await orientation(prepared), durationMs = video ? 10000 : null;
      const path = display+'/'+id+'-'+prepared.name.replace(/[^a-zA-Z0-9._-]/g,'_');
      const {error: uploadError} = await db.storage.from(BUCKET).upload(path,prepared,{contentType:prepared.type,upsert:false});
      if (uploadError) throw uploadError;
      const url = db.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
      const payload = {id,filename:path.split('/').pop(),originalName:file.name,mimeType:prepared.type,url,display,uploadedAt:new Date().toISOString(),durationMs};
      const {error: insertError} = await db.from('media_items').insert({id,storage_path:path,payload});
      if (insertError) { await db.storage.from(BUCKET).remove([path]); throw insertError; }
      uploaded++;
    }
    uploadStatus.style.color = '#79d69b';
    uploadStatus.textContent = uploaded+' file(s) uploaded successfully.';
    mediaInput.value = ''; el('selectionText').textContent = 'No files selected.'; await loadMedia();
  } catch (err) { uploadStatus.style.color = ''; uploadStatus.textContent = 'Uploaded '+uploaded+' of '+files.length+'. '+err.message; }
  finally { uploadButton.disabled = false; uploadProgress.hidden = true; }
});
(async () => {
  try {
    const {data:{user}} = await db.auth.getUser();
    if (user && await checkAdmin(user)) { authenticated(user); await loadMedia(); }
    else { if (user) await db.auth.signOut(); authenticated(null); }
  } catch (e) { authenticated(null); loginStatus.textContent = e.message; }
})();
