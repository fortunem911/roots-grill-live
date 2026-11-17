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
  var signature = '', currentIndex = -1, currentVideo = null;
  var items = [];
  function errorMessage(message) {
    if (portrait) { fallback.textContent = message; fallback.style.display = 'grid'; }
    else if (!items.length) stage.innerHTML = '<div class="display-empty"><strong>'+message+'</strong></div>';
  }
  function safeUrl(url) { try { var u = new URL(url); return u.protocol === 'https:' ? u.href : ''; } catch (_) { return ''; } }
  function isVideo(item) { return String(item.mimeType || '').indexOf('video/') === 0; }
  function signatureOf(list) { return list.map(function(i){return i.id+':'+i.url+':'+i.durationMs;}).join('|'); }
  function show(index, slotStartedAt) {
    if (!items.length) { errorMessage('Waiting for '+display+' media…'); return; }
    var i = ((Number(index) || 0) % items.length + items.length) % items.length;
    if (portrait) {
      var item = items[i];
      if (i === currentIndex && screen.src === item.url) return;
      var preload = new Image();
      preload.onload = function () { screen.src = item.url; screen.hidden = false; screen.style.display = 'block'; fallback.style.display = 'none'; currentIndex = i; };
      preload.onerror = function () { errorMessage('Media unavailable. Retrying…'); };
      preload.src = item.url;
      return;
    }
    if (i === currentIndex) {
      if (currentVideo && Number.isFinite(Number(slotStartedAt))) {
        var desired = Math.max(0,(Date.now() - Number(slotStartedAt))/1000);
        if (Math.abs(currentVideo.currentTime - desired) > 1.5 && Number.isFinite(currentVideo.duration)) {
          try { currentVideo.currentTime = Math.min(desired,Math.max(0,currentVideo.duration-0.1)); } catch (_) {}
        }
      }
      return;
    }
    var slides = stage.querySelectorAll('.slide');
    for (var n=0;n<slides.length;n++) {
      var active = n === i; slides[n].hidden = !active; slides[n].classList.toggle('active',active);
      var v = slides[n].querySelector('video');
      if (v && !active) { v.pause(); v.currentTime = 0; }
    }
    currentVideo = slides[i] && slides[i].querySelector('video');
    if (currentVideo) {
      currentVideo.muted = true;
      var desiredSeconds = Number.isFinite(Number(slotStartedAt)) ? Math.max(0,(Date.now()-Number(slotStartedAt))/1000) : 0;
      if (currentVideo.readyState >= 1 && Number.isFinite(currentVideo.duration)) {
        try { currentVideo.currentTime = Math.min(desiredSeconds,Math.max(0,currentVideo.duration-0.1)); } catch (_) {}
      }
      var promise = currentVideo.play(); if (promise && promise.catch) promise.catch(function(){});
    }
    currentIndex = i;
  }
  function apply(state) {
    var next = (Array.isArray(state.items) ? state.items : []).filter(function(i){ return (i.display || display) === display && safeUrl(i.url) && (!portrait || !isVideo(i)); });
    var sig = signatureOf(next);
    if (sig !== signature) {
      signature = sig; items = next; currentIndex = -1;
      if (!portrait) {
        stage.innerHTML = '';
        next.forEach(function(item) {
          var slide = document.createElement('article'); slide.className = 'slide'; slide.hidden = true;
          var media = document.createElement(isVideo(item) ? 'video' : 'img');
          media.src = item.url; if (media.tagName === 'VIDEO') { media.muted = true; media.playsInline = true; media.preload = 'auto'; }
          else media.alt = item.originalName || 'Roots Grill artwork';
          slide.appendChild(media); stage.appendChild(slide);
        });
      }
    } else items = next;
    if (!items.length) { errorMessage('Waiting for '+display+' media…'); return; }
    show(state.currentIndex, state.slotStartedAt);
  }
  async function refresh() {
    try {
      var response = await fetch(endpoint+'&_='+Date.now(), {headers:{'apikey':publishable},cache:'no-store'});
      if (!response.ok) throw new Error('Display service HTTP '+response.status);
      apply(await response.json());
    } catch (e) { console.warn('Roots Grill display refresh:',e); if (!items.length) errorMessage('Connecting to Roots Grill Cloud…'); }
  }
  refresh();
  setInterval(refresh, 2000);
  window.addEventListener('online',refresh);
})();
