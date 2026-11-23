/* ROOTS_GRILL_WORK_TV_PAIRING_V1 — Head Office TV activation, separate from live links. */
(function () {
  'use strict';
  var script = document.currentScript;
  var screenId = script && script.getAttribute('data-screen-id');
  if (!/^roots-grill-(landscape|portrait)-01$/.test(screenId || '')) return;
  var base = 'https://zvezbdoghzbrsvxazfwo.supabase.co/functions/v1/';
  var publishable = 'sb_publishable_IpUt3RpCm0f9Hlyiy_lRkA_GOuhS1pO';
  var storageKey = 'roots-grill-paired-v1:' + screenId;
  var pendingKey = 'roots-grill-pending-v1:' + screenId;
  var portrait = screenId.indexOf('portrait') !== -1;
  var pairingTimer = null, heartbeatTimer = null, working = false;
  var overlay = document.createElement('section');
  overlay.id = 'rootsPairingOverlay';
  overlay.setAttribute('aria-live', 'polite');
  overlay.innerHTML =
    '<div class="rg-pair-box"><div class="rg-pair-brand">RG / ROOTS GRILL CLOUD</div>' +
    '<p class="rg-pair-eyebrow">HEAD OFFICE · SCREEN ACTIVATION</p>' +
    '<h1 id="rgPairTitle">Connecting your screen…</h1>' +
    '<div id="rgPairCode" class="rg-pair-code" hidden></div>' +
    '<p id="rgPairMessage">Preparing a secure pairing request.</p>' +
    '<p class="rg-pair-foot">Head Office: open <strong>pairing.html</strong> and approve this code.</p>' +
    '<button type="button" id="rgPairRetry" hidden>Try again</button></div>';
  var style = document.createElement('style');
  style.textContent =
    '#rootsPairingOverlay{position:fixed;inset:0;z-index:999999;display:grid;place-items:center;padding:24px;' +
    'background:radial-gradient(circle at 20% 0%,#3b1016,transparent 48%),#08090c;color:#fff;' +
    'font-family:Arial,system-ui,sans-serif;text-align:center;box-sizing:border-box;cursor:default}' +
    '#rootsPairingOverlay[hidden]{display:none!important}' +
    '.rg-pair-box{width:min(760px,100%);padding:clamp(20px,4vw,55px);border:1px solid #34353b;' +
    'border-radius:22px;background:#15171c;box-sizing:border-box}' +
    '.rg-pair-brand{font-weight:900;letter-spacing:.13em;font-size:clamp(12px,1.7vw,19px)}' +
    '.rg-pair-eyebrow{color:#ff747b;letter-spacing:.14em;font-weight:800;font-size:12px;margin-top:35px}' +
    '#rootsPairingOverlay h1{font-size:clamp(24px,4vw,44px);margin:14px 0}' +
    '.rg-pair-code{font-size:clamp(28px,6vw,66px);font-weight:900;letter-spacing:.13em;' +
    'background:#08090c;border:2px solid #d71920;border-radius:15px;padding:18px 8px;margin:24px 0;' +
    'font-variant-numeric:tabular-nums;overflow-wrap:anywhere}' +
    '#rgPairMessage,.rg-pair-foot{color:#b9bcc6;font-size:clamp(13px,1.7vw,18px);line-height:1.5}' +
    '.rg-pair-foot{margin-top:25px;font-size:13px}' +
    '#rgPairRetry{border:0;background:#d71920;color:white;border-radius:12px;padding:13px 24px;font-weight:800;margin-top:20px}' +
    (portrait ? '#rootsPairingOverlay{top:50%;left:50%;right:auto;bottom:auto;width:100vh;height:100vw;' +
    'transform:translate(-50%,-50%) rotate(270deg);transform-origin:center}' : '');
  document.head.appendChild(style);
  document.body.appendChild(overlay);
  var title = document.getElementById('rgPairTitle');
  var codeEl = document.getElementById('rgPairCode');
  var message = document.getElementById('rgPairMessage');
  var retry = document.getElementById('rgPairRetry');

  function read(key) {
    try { return JSON.parse(localStorage.getItem(key) || 'null'); } catch (_) { return null; }
  }
  function save(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); return true; } catch (_) { return false; }
  }
  function remove(key) { try { localStorage.removeItem(key); } catch (_) {} }
  async function request(action, body, token) {
    var headers = { 'content-type': 'application/json', 'apikey': publishable };
    if (token) headers['x-screen-token'] = token;
    var controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var timer = controller ? setTimeout(function () { controller.abort(); }, 10000) : null;
    try {
      var response = await fetch(base + (action === 'heartbeat' ? 'super-responder' : 'device-pairing'), {
        method: 'POST', headers: headers, body: JSON.stringify(body),
        signal: controller ? controller.signal : undefined, cache: 'no-store'
      });
      var data = await response.json().catch(function () { return {}; });
      if (!response.ok) {
        var error = new Error(data.error || 'HTTP ' + response.status);
        error.status = response.status;
        throw error;
      }
      return data;
    } finally { if (timer) clearTimeout(timer); }
  }
  function errorState(text) {
    overlay.hidden = false;
    title.textContent = 'Connection unavailable';
    message.textContent = text;
    codeEl.hidden = true;
    retry.hidden = false;
  }
  function showCode(pending) {
    overlay.hidden = false;
    title.textContent = 'Pair this TV';
    codeEl.hidden = false;
    codeEl.textContent = pending.code.slice(0, 5) + ' ' + pending.code.slice(5);
    message.textContent = 'Enter this code in the Head Office pairing dashboard. Expires in 10 minutes.';
    retry.hidden = true;
  }
  function startHeartbeat(token) {
    if (heartbeatTimer) clearInterval(heartbeatTimer);
    var inFlight = false;
    async function beat() {
      if (inFlight || !navigator.onLine) return;
      inFlight = true;
      try {
        // The heartbeat service accepts optional media context; never invent playback details.
        await request('heartbeat', { screenId: screenId }, token);
        overlay.hidden = true;
      } catch (e) {
        if (e.status === 401 || e.status === 403) {
          clearInterval(heartbeatTimer);
          heartbeatTimer = null;
          remove(storageKey);
          errorState('This screen is no longer authorized. Select Try again to request a new code.');
        } else {
          // Temporary network failures should not interrupt an already paired TV's media.
          console.warn('Roots Grill home TV heartbeat:', e.message);
        }
      } finally { inFlight = false; }
    }
    beat();
    heartbeatTimer = setInterval(beat, 30000);
  }
  async function pair() {
    if (working) return;
    working = true;
    retry.hidden = true;
    try {
      var pending = read(pendingKey);
      if (!pending || !pending.requestId || !/^[a-f0-9]{64}$/.test(pending.claimSecret || '') ||
          !pending.code || Date.parse(pending.expiresAt) <= Date.now()) {
        remove(pendingKey);
        title.textContent = 'Generating pairing code…';
        message.textContent = 'Contacting Roots Grill Cloud.';
        codeEl.hidden = true;
        pending = await request('start', { action: 'start' });
        if (!pending.requestId || !pending.claimSecret || !pending.code) throw Error('Invalid pairing response');
        if (!save(pendingKey, pending)) throw Error('Browser storage is unavailable. Enable site storage to pair this TV.');
      }
      showCode(pending);
      if (pairingTimer) clearInterval(pairingTimer);
      var inFlight = false;
      async function poll() {
        if (inFlight || !navigator.onLine) return;
        if (Date.parse(pending.expiresAt) <= Date.now()) {
          clearInterval(pairingTimer);
          pairingTimer = null;
          remove(pendingKey);
          errorState('This pairing code expired. Select Try again to generate a new one.');
          return;
        }
        inFlight = true;
        try {
          var result = await request('poll', {
            action: 'poll', requestId: pending.requestId, claimSecret: pending.claimSecret
          });
          if (result.status === 'paired' && result.screen && result.screen.id === screenId) {
            clearInterval(pairingTimer);
            pairingTimer = null;
            if (!save(storageKey, { token: pending.claimSecret, screenId: screenId }))
              throw Error('Unable to remember this device. Check browser storage.');
            remove(pendingKey);
            title.textContent = 'Screen approved!';
            message.textContent = 'Connecting to live monitoring…';
            codeEl.hidden = true;
            startHeartbeat(pending.claimSecret);
          } else if (result.status === 'expired' || result.status === 'cancelled') {
            clearInterval(pairingTimer);
            pairingTimer = null;
            remove(pendingKey);
            errorState('Pairing request expired or was cancelled. Select Try again.');
          }
        } catch (e) { console.warn('Roots Grill pairing poll:', e.message); }
        finally { inFlight = false; }
      }
      poll();
      pairingTimer = setInterval(poll, 4000);
    } catch (e) { errorState(e.message || 'Could not generate pairing code.'); }
    finally { working = false; }
  }
  retry.addEventListener('click', function () { remove(pendingKey); pair(); });
  var saved = read(storageKey);
  if (saved && /^[a-f0-9]{64}$/.test(saved.token || '') && saved.screenId === screenId) {
    overlay.hidden = true;
    startHeartbeat(saved.token);
  } else pair();
})();
