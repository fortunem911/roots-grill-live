/* Roots Grill Cloud: public read-only display player. No admin credentials. */
(function () {
  'use strict';
  var portrait = !!document.getElementById('portraitScreen');
  var display = portrait ? 'portrait' : 'landscape';
  var endpoint = 'https://zvezbdoghzbrsvxazfwo.supabase.co/functions/v1/display-state?display=' + display;
  var publishable = 'sb_publishable_IpUt3RpCm0f9Hlyiy_lRkA_GOuhS1pO';
  var stage = document.getElementById('slideshow');
  var screen = document.getElementById('portraitScreen');
  var fallback = document.getElementById('portraitFallback');

  var host=portrait?screen.parentNode:stage;
  if(!host)return;
  if(screen)screen.style.display='none';
  var items=[],active=null,media=null,timer=null,watch=null,serial=0,refreshing=false,stopped=false,paused=false,objectUrl=null;
  var cacheName='roots-grill-media-v1', storageKey='rg-playlist-v1-'+display;
  var cacheBusy=false;
  function valid(i){try{return i && i.id && (i.display||display)===display && new URL(i.url).protocol==='https:';}catch(e){return false;}}
  function video(i){return String(i.mimeType||'').indexOf('video/')===0;}
  function clear(){serial++;clearTimeout(timer);clearInterval(watch);if(media){if(media.tagName==='VIDEO'){media.pause();media.removeAttribute('src');media.load();}media.remove();media=null;}if(objectUrl){URL.revokeObjectURL(objectUrl);objectUrl=null;}}
  function report(i,d){window.dispatchEvent(new CustomEvent('roots-grill-media-started',{detail:{mediaId:String(i.id),mediaName:String(i.originalName||i.filename||i.id),startedAt:new Date().toISOString(),durationMs:d}}));}
  function next(){var n=active?items.findIndex(function(i){return i.id===active.id;}):-1;show(items[(n+1)%items.length]);}
  async function cached(i){try{if(!window.caches)return null;var c=await caches.open(cacheName);var r=await c.match(i.url);return r?await r.blob():null;}catch(e){return null;}}
  async function warm(i){if(cacheBusy||!i||!navigator.onLine||!window.caches)return;cacheBusy=true;try{var c=await caches.open(cacheName);if(await c.match(i.url))return;var r=await fetch(i.url,{mode:'cors'});if(!r.ok)return;var b=await r.blob();if(b.size>50*1024*1024)return;var keys=await c.keys();while(keys.length>=6){await c.delete(keys.shift());}await c.put(i.url,new Response(b,{headers:{'Content-Type':b.type||i.mimeType}}));}catch(e){console.warn('Media cache unavailable',e);}finally{cacheBusy=false;}}
  async function show(i){
    clear();active=i||null;if(stopped||paused||!i)return;
    var token=serial,started=false,lastTime=0,lastProgress=Date.now();
    var b=await cached(i);if(token!==serial||stopped||paused)return;
    var m=document.createElement(video(i)?'video':'img');media=m;
    m.style.cssText='position:absolute;inset:0;width:100%;height:100%;object-fit:cover;background:#000;border:0;';
    if(fallback)fallback.style.display='none';
    function advance(){if(token===serial)next();}
    function fail(){if(token!==serial)return;clearTimeout(timer);clearInterval(watch);timer=setTimeout(advance,3000);}
    function start(){if(token!==serial||started)return;started=true;clearTimeout(timer);lastProgress=Date.now();report(i,video(i)?(Number.isFinite(m.duration)?Math.round(m.duration*1000):null):10000);if(!video(i)){timer=setTimeout(advance,10000);warm(i);}else if(b){var idx=items.findIndex(function(x){return x.id===i.id;});warm(items[(idx+1)%items.length]);}}
    m.onerror=fail;
    if(video(i)){m.muted=true;m.defaultMuted=true;m.playsInline=true;m.setAttribute('playsinline','');m.preload='auto';m.loop=false;m.controls=false;m.onplaying=start;m.onended=advance;watch=setInterval(function(){if(token!==serial)return;if(m.currentTime>lastTime+0.05){lastTime=m.currentTime;lastProgress=Date.now();}if(Date.now()-lastProgress>45000)fail();},5000);}
    else m.onload=start;
    timer=setTimeout(fail,45000);
    host.appendChild(m);
    if(b)objectUrl=URL.createObjectURL(b);
    m.src=objectUrl||i.url;
    if(video(i)){var p=m.play();if(p&&p.catch)p.catch(fail);if(!b)m.addEventListener('ended',function(){warm(i);},{once:true});}
  }
  function apply(state){var list=(Array.isArray(state.items)?state.items:[]).filter(valid);items=list;try{localStorage.setItem(storageKey,JSON.stringify(list));}catch(e){}if(!list.length){clear();active=null;return;}if(!active||!list.some(function(i){return i.id===active.id&&i.url===active.url;}))show(list[0]);}
  async function refresh(){if(stopped||paused||refreshing||!navigator.onLine)return;refreshing=true;var c=typeof AbortController!=='undefined'?new AbortController():null;var t=c?setTimeout(function(){c.abort();},8000):null;try{var r=await fetch(endpoint+'&_='+Date.now(),{headers:{apikey:publishable},cache:'no-store',signal:c?c.signal:undefined});if(r.ok&&!stopped&&!paused)apply(await r.json());}catch(e){}finally{clearTimeout(t);refreshing=false;}}
  window.addEventListener('roots-grill-player-stop',function(){stopped=true;clear();clearInterval(poll);});
  window.addEventListener('roots-grill-player-pause',function(){paused=true;clear();});
  window.addEventListener('roots-grill-player-resume',function(){if(!paused||stopped)return;paused=false;show(active||items[0]);refresh();});
  try{items=JSON.parse(localStorage.getItem(storageKey)||'[]').filter(valid);}catch(e){}
  if(items.length)show(items[0]);
  refresh();var poll=setInterval(refresh,2000);window.addEventListener('online',refresh);
})();
