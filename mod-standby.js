/* ==========================================================================
   mod-standby.js  |  JARVIS v1.9 (Adaptado ao DOM real do index.html)
   Módulo autônomo: auto-sleep, LED de descanso e despertar por gesto.
   ========================================================================== */
(function () {
  'use strict';

  if (window.__jarvisStandbyLoaded) return;
  window.__jarvisStandbyLoaded = true;

  /* ----------------------------- CONFIGURAÇÃO ----------------------------- */
  var INACTIVITY_LIMIT = 120000;   // 2 minutos sem interação -> dormir
  var STATE_POLL_MS    = 500;      // checagem periódica do estado de sono
  var WAVE_START_DELAY = 1500;     // espera antes de ligar a câmera
  var FRAME_INTERVAL   = 250;      // análise de frames a cada 250ms
  var WAVE_THRESHOLD   = 28;       // limiar da diferença média de luminância
  var SAMPLE_W = 32, SAMPLE_H = 24;
  var LS_KEY = 'jarvis_wave_sensor';

  /* ------------------------------- ESTADO --------------------------------- */
  var waveSensorEnabled = false;
  var wasSleeping = false;
  var inactivityTimer = null;
  var startTimer = null;
  var frameTimer = null;
  var stream = null;
  var video = null;
  var canvas = null, ctx = null;
  var prevLum = null;
  var starting = false;
  var waveBtn = null;

  try { waveSensorEnabled = localStorage.getItem(LS_KEY) === 'true'; } catch (e) {}

  /* ------------------------------ HELPERS DOM ----------------------------- */
  function getSleepBtn() {
    var btns = document.querySelectorAll('#bar button');
    for (var i = 0; i < btns.length; i++) {
      if (btns[i].textContent.trim().toLowerCase() === 'dormir') return btns[i];
    }
    return null;
  }

  function isSleeping() {
    var b = getSleepBtn();
    return !!(b && b.classList.contains('on'));
  }

  function isTimerActive() {
    var hudR = document.getElementById('hudR');
    if (!hudR) return false;
    var txt = hudR.textContent || '';
    return txt.indexOf('TIMER ') !== -1 || txt.indexOf('FOCO ') !== -1;
  }

  /* ========================================================================
     LED DE DESCANSO + MODO REPOUSO VISUAL
     ======================================================================== */
  var style = document.createElement('style');
  style.textContent =
    '@keyframes jarvisStandbyPulse{' +
      '0%,100%{opacity:.35;box-shadow:0 0 4px 1px rgba(0,240,255,.35);}' +
      '50%{opacity:1;box-shadow:0 0 12px 4px rgba(0,240,255,.9);}' +
    '}' +
    '#standbyLed{position:fixed;top:12px;right:12px;width:8px;height:8px;' +
      'border-radius:50%;background:#00F0FF;z-index:20;pointer-events:none;' +
      'display:none;animation:jarvisStandbyPulse 3s ease-in-out infinite;}' +
    '#hudL,#hudR,#bar{transition:opacity .6s ease;}';
  document.head.appendChild(style);

  var led = document.createElement('div');
  led.id = 'standbyLed';
  document.body.appendChild(led);

  function setDim(dim) {
    var v = dim ? '0.25' : '1';
    var hl = document.getElementById('hudL');
    var hr = document.getElementById('hudR');
    var bar = document.getElementById('bar');
    if (hl) hl.style.opacity = v;
    if (hr) hr.style.opacity = v;
    if (bar) bar.style.opacity = v;
  }

  /* ========================================================================
     WAVE-TO-WAKE (câmera frontal local 32x24)
     ======================================================================== */
  function stopCamera() {
    if (startTimer) { clearTimeout(startTimer); startTimer = null; }
    if (frameTimer) { clearInterval(frameTimer); frameTimer = null; }
    if (stream) {
      try { stream.getTracks().forEach(function (t) { t.stop(); }); } catch (e) {}
      stream = null;
    }
    if (video) {
      try { video.pause(); video.srcObject = null; } catch (e) {}
    }
    prevLum = null;
    starting = false;
  }

  function showWaveEffect() {
    var w = document.createElement('div');
    w.style.cssText =
      'position:fixed;left:50%;top:50%;width:40px;height:40px;' +
      'margin:-20px 0 0 -20px;border-radius:50%;border:3px solid #00F0FF;' +
      'box-shadow:0 0 24px #00F0FF,inset 0 0 24px #00F0FF;' +
      'z-index:30;pointer-events:none;opacity:.9;';
    document.body.appendChild(w);
    var done = function () { if (w.parentNode) w.parentNode.removeChild(w); };
    if (w.animate) {
      var a = w.animate(
        [{ transform: 'scale(1)', opacity: 0.9 },
         { transform: 'scale(22)', opacity: 0 }],
        { duration: 500, easing: 'ease-out' }
      );
      a.onfinish = done;
    }
    setTimeout(done, 600);
  }

  function onWaveDetected() {
    stopCamera();
    showWaveEffect();
    var b = getSleepBtn();
    if (b) b.click();
    else document.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
  }

  function analyzeFrame() {
    if (!stream || !video || video.readyState < 2) return;
    if (!isSleeping()) { stopCamera(); return; }
    try {
      ctx.drawImage(video, 0, 0, SAMPLE_W, SAMPLE_H);
      var d = ctx.getImageData(0, 0, SAMPLE_W, SAMPLE_H).data;
      var n = SAMPLE_W * SAMPLE_H;
      var cur = new Array(n);
      for (var i = 0, p = 0; i < n; i++, p += 4) {
        cur[i] = d[p] + d[p + 1] + d[p + 2];
      }
      if (prevLum) {
        var sum = 0;
        for (var j = 0; j < n; j++) sum += Math.abs(cur[j] - prevLum[j]);
        if (sum / n > WAVE_THRESHOLD) { onWaveDetected(); return; }
      }
      prevLum = cur;
    } catch (e) {}
  }

  function startCamera() {
    if (stream || starting) return;
    if (!waveSensorEnabled || !isSleeping()) return;
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) return;
    starting = true;

    navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'user', width: 64, height: 48 },
      audio: false
    }).then(function (s) {
      if (!waveSensorEnabled || !isSleeping()) {
        s.getTracks().forEach(function (t) { t.stop(); });
        starting = false;
        return;
      }
      stream = s;
      starting = false;
      if (!video) {
        video = document.createElement('video');
        video.setAttribute('playsinline', '');
        video.muted = true;
        video.style.cssText = 'position:fixed;width:1px;height:1px;opacity:0;pointer-events:none;left:-10px;top:-10px;';
        document.body.appendChild(video);
      }
      if (!canvas) {
        canvas = document.createElement('canvas');
        canvas.width = SAMPLE_W; canvas.height = SAMPLE_H;
        canvas.style.display = 'none';
        ctx = canvas.getContext('2d', { willReadFrequently: true });
      }
      video.srcObject = stream;
      var pr = video.play();
      if (pr && pr.catch) pr.catch(function () {});
      prevLum = null;
      frameTimer = setInterval(analyzeFrame, FRAME_INTERVAL);
    }).catch(function () {
      starting = false;
    });
  }

  function scheduleCamera() {
    if (startTimer) clearTimeout(startTimer);
    startTimer = setTimeout(function () {
      startTimer = null;
      startCamera();
    }, WAVE_START_DELAY);
  }

  /* ---- Botão "Mão: ON/OFF" dentro de #bar ---- */
  function updateWaveBtnLabel() {
    if (!waveBtn) return;
    waveBtn.textContent = 'Mão: ' + (waveSensorEnabled ? 'ON' : 'OFF');
    waveBtn.classList.toggle('on', waveSensorEnabled);
  }

  function injectWaveButton() {
    if (document.getElementById('btnWaveSensor')) {
      waveBtn = document.getElementById('btnWaveSensor');
      return true;
    }
    var bar = document.getElementById('bar');
    if (!bar) return false;
    waveBtn = document.createElement('button');
    waveBtn.id = 'btnWaveSensor';
    waveBtn.type = 'button';
    updateWaveBtnLabel();
    waveBtn.addEventListener('click', function (ev) {
      ev.stopPropagation();
      waveSensorEnabled = !waveSensorEnabled;
      try { localStorage.setItem(LS_KEY, String(waveSensorEnabled)); } catch (e) {}
      updateWaveBtnLabel();
      if (!waveSensorEnabled) stopCamera();
      else if (isSleeping()) scheduleCamera();
    });
    bar.appendChild(waveBtn);
    return true;
  }

  /* ========================================================================
     SINCRONIZAÇÃO DE SONO E AUTO-SLEEP
     ======================================================================== */
  function syncSleepState() {
    var sleeping = isSleeping();
    led.style.display = sleeping ? 'block' : 'none';
    setDim(sleeping);

    if (sleeping && !wasSleeping) {
      if (waveSensorEnabled) scheduleCamera();
    } else if (!sleeping && wasSleeping) {
      stopCamera();
    } else if (!sleeping) {
      if (stream || startTimer) stopCamera();
    }
    wasSleeping = sleeping;
  }

  function onInactivityTimeout() {
    var b = getSleepBtn();
    if (b && !b.classList.contains('on') && !isTimerActive()) {
      b.click();
    }
    resetInactivity();
  }

  function resetInactivity() {
    if (inactivityTimer) clearTimeout(inactivityTimer);
    inactivityTimer = setTimeout(onInactivityTimeout, INACTIVITY_LIMIT);
  }

  ['pointerdown', 'touchstart', 'keydown'].forEach(function (evt) {
    document.addEventListener(evt, resetInactivity, { passive: true, capture: true });
  });

  /* ============================== INICIALIZAÇÃO ============================ */
  function init() {
    var tries = 0;
    (function tryInject() {
      if (injectWaveButton() || ++tries > 20) return;
      setTimeout(tryInject, 300);
    })();

    var caption = document.getElementById('caption');
    if (caption) {
      new MutationObserver(resetInactivity).observe(caption, {
        childList: true, characterData: true, subtree: true
      });
    }

    var sb = getSleepBtn();
    if (sb) {
      new MutationObserver(syncSleepState).observe(sb, {
        attributes: true, attributeFilter: ['class']
      });
    }
    setInterval(syncSleepState, STATE_POLL_MS);

    document.addEventListener('visibilitychange', function () {
      if (document.hidden) stopCamera();
      else if (waveSensorEnabled && isSleeping()) scheduleCamera();
    });
    window.addEventListener('pagehide', stopCamera);

    resetInactivity();
    syncSleepState();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
