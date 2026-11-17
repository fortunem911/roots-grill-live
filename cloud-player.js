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
  var refreshing = false, portraitLoadToken = 0;
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
      var token = ++portraitLoadToken;
      var preload = new Image();
      preload.onload = function () { if (token !== portraitLoadToken) return; screen.src = item.url; screen.hidden = false; screen.style.display = 'block'; fallback.style.display = 'none'; currentIndex = i; };
      preload.onerror = function () { if (token === portraitLoadToken) errorMessage('Media unavailable. Retrying…'); };
      preload.src = item.url;
      return;
    }
    if (i === currentIndex) {
      // Do not repeatedly seek on every cloud poll: seeking stalls many built-in TV browsers.
      if (currentVideo && currentVideo.paused && currentVideo.readyState >= 2) {
        var resume = currentVideo.play();
        if (resume && resume.catch) resume.catch(function(){});
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
    // Keep only the current and next video eager-loaded on low-memory TVs.
    for (var k=0;k<slides.length;k++) {
      var candidate = slides[k].querySelector('video');
      if (candidate) candidate.preload = (k === i || k === (i+1)%slides.length) ? 'auto' : 'metadata';
    }
    if (currentVideo) {
      currentVideo.muted = true;
      var desiredSeconds = Number.isFinite(Number(slotStartedAt)) ? Math.max(0,(Date.now()-Number(slotStartedAt))/1000) : 0;
      // Seek once when activating a clip, not repeatedly during playback.
      if (currentVideo.readyState >= 2 && Number.isFinite(currentVideo.duration) && desiredSeconds < currentVideo.duration - 0.5) {
        try { currentVideo.currentTime = desiredSeconds; } catch (_) {}
      }
      var promise = currentVideo.play(); if (promise && promise.catch) promise.catch(function(){});
    }
    currentIndex = i;
  }
  function apply(state) {
    var next = (Array.isArray(state.items) ? state.items : []).filter(function(i){ return (i.display || display) === display && safeUrl(i.url) && (!portrait || !isVideo(i)); });
    var sig = signatureOf(next);
    if (sig !== signature) {
      signature = sig; items = next; currentIndex = -1; portraitLoadToken++;
      if (!portrait) {
        stage.innerHTML = '';
        next.forEach(function(item) {
          var slide = document.createElement('article'); slide.className = 'slide'; slide.hidden = true;
          var media = document.createElement(isVideo(item) ? 'video' : 'img');
          media.src = item.url; if (media.tagName === 'VIDEO') { media.muted = true; media.playsInline = true; media.loop = true; media.preload = 'metadata'; }
          else media.alt = item.originalName || 'Roots Grill artwork';
          slide.appendChild(media); stage.appendChild(slide);
        });
      }
    } else items = next;
    if (!items.length) { errorMessage('Waiting for '+display+' media…'); return; }
    show(state.currentIndex, state.slotStartedAt);
  }
  async function refresh() {
    if (refreshing || document.hidden || !navigator.onLine) return;
    refreshing = true;
    var controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var timeout = controller ? setTimeout(function() { controller.abort(); }, 8000) : null;
    try {
      var options = {headers:{'apikey':publishable},cache:'no-store'};
      if (controller) options.signal = controller.signal;
      var response = await fetch(endpoint+'&_='+Date.now(), options);
      if (!response.ok) throw new Error('Display service HTTP '+response.status);
      apply(await response.json());
    } catch (e) { console.warn('Roots Grill display refresh:',e); if (!items.length) errorMessage('Connecting to Roots Grill Cloud…'); }
    finally { if (timeout) clearTimeout(timeout); refreshing = false; }
  }
  refresh();
  setInterval(refresh, 2000);
  window.addEventListener('online',refresh);
  document.addEventListener('visibilitychange', function() { if (!document.hidden) refresh(); });
})();
