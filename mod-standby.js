/* ==========================================================================
   mod-standby.js  |  JARVIS v1.9
   Módulo autônomo: auto-sleep, LED de descanso e despertar por gesto.
   Não depende de variáveis internas do index.html (IIFE fechada):
   todo o estado é lido/controlado pelo DOM real.
   Carregar antes de </body>:  <script src="mod-standby.js"></script>
   ========================================================================== */
(function () {
  'use strict';

  // Evita carregar o módulo duas vezes
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
  var startTimer = null;           // timeout de 1.5s para ligar a câmera
  var frameTimer = null;           // intervalo de análise
  var stream = null;               // MediaStream ativo
  var video = null;                // <video> oculto
  var canvas = null, ctx = null;   // canvas oculto 32x24
  var prevLum = null;              // frame anterior (null = calibração)
  var starting = false;            // evita getUserMedia concorrente
  var waveBtn = null;

  try { waveSensorEnabled = localStorage.getItem(LS_KEY) === 'true'; } catch (e) {}

  /* ------------------------------ HELPERS DOM ----------------------------- */
  function getSleepBtn() {
    return document.querySelector('#modeBar button[data-act="sleep"]') ||
           document.querySelector('button[data-act="sleep"]') ||
           document.querySelector('[data-act="sleep"]');
  }
  function isSleeping() {
    var b = getSleepBtn();
    return !!(b && b.classList.contains('on'));
  }
  function isTimerActive() {
    var t = document.getElementById('hudTimer');
    return !!(t && t.style.display !== 'none');
  }

  /* ========================================================================
     2. LED DE DESCANSO + MODO REPOUSO VISUAL (CSS e elemento)
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
    '#hud,#controls{transition:opacity .6s ease;}' +
    '#btnWaveSensor{cursor:pointer;}';
  document.head.appendChild(style);

  var led = document.createElement('div');
  led.id = 'standbyLed';
  document.body.appendChild(led);

  function setDim(dim) {
    var v = dim ? '0.25' : '1';
    var hud = document.getElementById('hud');
    var ctl = document.getElementById('controls');
    if (hud) hud.style.opacity = v;
    if (ctl) ctl.style.opacity = v;
  }

  /* ========================================================================
     3. WAVE-TO-WAKE (câmera 100% local, nenhum frame sai do aparelho)
     ======================================================================== */

  // Para a câmera e limpa todos os timers/recursos do sensor
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

  // Onda circular ciano expandindo no centro da tela (500ms)
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
    setTimeout(done, 600); // garantia de limpeza
  }

  // Detecção de movimento detectada -> acorda o Jarvis
  function onWaveDetected() {
    stopCamera();
    showWaveEffect();
    var b = getSleepBtn();
    if (b) b.click(); else document.body.click();
  }

  // Analisa um frame: diferença média absoluta de luminância (R+G+B)
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
      if (prevLum) { // primeiro frame é só calibração
        var sum = 0;
        for (var j = 0; j < n; j++) sum += Math.abs(cur[j] - prevLum[j]);
        if (sum / n > WAVE_THRESHOLD) { onWaveDetected(); return; }
      }
      prevLum = cur;
    } catch (e) { /* frame inválido: ignora */ }
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
      // Estado pode ter mudado enquanto o usuário aceitava a permissão
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
      starting = false; // permissão negada ou sem câmera
    });
  }

  // Agenda o início da câmera 1.5s após entrar em repouso
  function scheduleCamera() {
    if (startTimer) clearTimeout(startTimer);
    startTimer = setTimeout(function () {
      startTimer = null;
      startCamera();
    }, WAVE_START_DELAY);
  }

  /* ---- Botão "Mão: ON/OFF" na primeira .row de #controls ---- */
  function updateWaveBtnLabel() {
    if (waveBtn) waveBtn.textContent = 'Mão: ' + (waveSensorEnabled ? 'ON' : 'OFF');
  }

  function injectWaveButton() {
    if (document.getElementById('btnWaveSensor')) {
      waveBtn = document.getElementById('btnWaveSensor');
      return true;
    }
    var row = document.querySelector('#controls .row') ||
              document.querySelector('#controls') ||
              (getSleepBtn() && getSleepBtn().parentNode);
    if (!row) return false;
    waveBtn = document.createElement('button');
    waveBtn.id = 'btnWaveSensor';
    waveBtn.type = 'button';
    updateWaveBtnLabel();
    waveBtn.addEventListener('click', function (ev) {
      ev.stopPropagation();
      waveSensorEnabled = !waveSensorEnabled;
      try { localStorage.setItem(LS_KEY, String(waveSensorEnabled)); } catch (e) {}
      updateWaveBtnLabel();
      if (!waveSensorEnabled) stopCamera();        // desligou: para já
      else if (isSleeping()) scheduleCamera();     // ligou dormindo: inicia
    });
    row.appendChild(waveBtn);
    return true;
  }

  /* ========================================================================
     Sincronização do estado de sono (LED, dim e câmera)
     ======================================================================== */
  function syncSleepState() {
    var sleeping = isSleeping();
    led.style.display = sleeping ? 'block' : 'none';
    setDim(sleeping);

    if (sleeping && !wasSleeping) {
      // Acabou de dormir
      if (waveSensorEnabled) scheduleCamera();
    } else if (!sleeping && wasSleeping) {
      // Acabou de acordar (toque, voz ou gesto): câmera desligada já
      stopCamera();
    } else if (!sleeping) {
      // Garantia contínua enquanto acordado
      if (stream || startTimer) stopCamera();
    }
    wasSleeping = sleeping;
  }

  /* ========================================================================
     1. AUTO-SLEEP POR INATIVIDADE
     ======================================================================== */
  function onInactivityTimeout() {
    var b = getSleepBtn();
    if (b && !b.classList.contains('on') && !isTimerActive()) {
      b.click();
    }
    resetInactivity(); // rearma para a próxima checagem
  }

  function resetInactivity() {
    if (inactivityTimer) clearTimeout(inactivityTimer);
    inactivityTimer = setTimeout(onInactivityTimeout, INACTIVITY_LIMIT);
  }

  ['pointerdown', 'touchstart', 'keydown'].forEach(function (evt) {
    document.addEventListener(evt, resetInactivity, { passive: true, capture: true });
  });

  /* ============================== INICIALIZAÇÃO ============================ */
  function toast(msg) {
    var t = document.createElement('div');
    t.textContent = msg;
    t.style.cssText = 'position:fixed;left:50%;top:40px;transform:translateX(-50%);' +
      'background:#000c;color:#00F0FF;border:1px solid #00F0FF;padding:6px 12px;' +
      'border-radius:8px;font:12px monospace;z-index:99999;pointer-events:none;';
    document.body.appendChild(t);
    setTimeout(function () { if (t.parentNode) t.parentNode.removeChild(t); }, 4000);
  }

  function init() {
    console.log('[mod-standby] carregado');
    setTimeout(function () {
      var falta = [];
      if (!getSleepBtn()) falta.push('botão sleep');
      if (!document.getElementById('btnWaveSensor')) falta.push('botão Mão');
      if (!document.getElementById('hud')) falta.push('#hud');
      if (!document.getElementById('controls')) falta.push('#controls');
      toast(falta.length ? 'mod-standby: não achei ' + falta.join(', ')
                         : 'mod-standby ativo ✔');
    }, 1500);
    // Botão de mão (tenta de novo se a .row ainda não existir)
    var tries = 0;
    (function tryInject() {
      if (injectWaveButton() || ++tries > 20) return;
      setTimeout(tryInject, 500);
    })();

    // Observa mudanças no texto da legenda -> conta como atividade
    var caption = document.getElementById('caption');
    if (caption) {
      new MutationObserver(resetInactivity).observe(caption, {
        childList: true, characterData: true, subtree: true
      });
    }

    // Observa a classe do botão de dormir + checagem periódica
    var sb = getSleepBtn();
    if (sb) {
      new MutationObserver(syncSleepState).observe(sb, {
        attributes: true, attributeFilter: ['class']
      });
    }
    setInterval(syncSleepState, STATE_POLL_MS);

    // Segurança: página oculta -> libera a câmera
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
