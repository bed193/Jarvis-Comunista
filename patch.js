/* =====================================================================
   JARVIS patch.js (v1.9 -> ponte para v2.0)
   Carregar antes de </body>:  <script src="patch.js"></script>
   Não reescreve o index.html. Tudo defensivo (try/catch + typeof).
   ===================================================================== */
(function () {
  'use strict';
  if (window.__jarvisPatchLoaded) return;
  window.__jarvisPatchLoaded = true;

  var WORKER = 'https://jarvis-api.emanuelpedro086.workers.dev';
  var TAG_MARK = 'FORMATO EXATO DAS TAGS (patch)';

  /* ---------- helpers de acesso a globais (let/const/var) ---------- */
  function gRec()    { try { return typeof recognition !== 'undefined' ? recognition : window.recognition; } catch (e) { return window.recognition; } }
  function gPlayer() { try { return typeof player !== 'undefined' ? player : window.player; } catch (e) { return window.player; } }
  function gAuto()   { try { return typeof isAuto !== 'undefined' ? isAuto : window.isAuto; } catch (e) { return window.isAuto; } }
  function gTheme()  { try { return typeof currentTheme !== 'undefined' ? currentTheme : window.currentTheme; } catch (e) { return window.currentTheme; } }

  window.lastUserTranscript = window.lastUserTranscript || '';

  var STRIP_ALL = /\[\s*[a-z_0-9]+\s*(?::[^\]]*)?\]/gi;
  var ACTION_RE = /\[\s*(youtube|maps|whatsapp)\s*:\s*([^\]]*)\]/gi;

  function stripAllTags(s) {
    return String(s || '').replace(STRIP_ALL, '').replace(/[ \t]{2,}/g, ' ').trim();
  }

  /* =================================================================
     1) ABERTURA EXTERNA (YouTube / Maps / WhatsApp)
     ================================================================= */
  var _last = { url: '', t: 0 };

  window.abrirExterno = function (url) {
    if (!url) return false;
    var now = Date.now();
    if (_last.url === url && now - _last.t < 3000) return false; // evita abrir 2x
    _last.url = url; _last.t = now;

    var left = false;
    function onLeave() { left = true; }
    document.addEventListener('visibilitychange', onLeave, { once: true });
    window.addEventListener('pagehide', onLeave, { once: true });
    window.addEventListener('blur', onLeave, { once: true });

    try {
      var a = document.createElement('a');
      a.href = url;
      a.target = '_blank';
      a.rel = 'noopener';
      a.style.display = 'none';
      document.body.appendChild(a);
      a.click();
      setTimeout(function () { try { a.remove(); } catch (e) {} }, 800);
    } catch (e) {
      window.location.href = url;
      return true;
    }
    // Fallback: se o Chrome bloqueou a nova aba (nada saiu da página), navega direto.
    setTimeout(function () {
      if (!left && document.visibilityState === 'visible') {
        window.location.href = url;
      }
    }, 900);
    return true;
  };

  function norm(s) {
    return String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
  }

  function lookupContactNumber(nameOrNum) {
    var raw = String(nameOrNum || '').trim();
    var digits = raw.replace(/\D/g, '');
    if (digits.length >= 8) return digits;
    var list;
    try { list = JSON.parse(localStorage.getItem('jarvis_contacts') || 'null'); } catch (e) { list = null; }
    if (!list) return '';
    var target = norm(raw);
    var found = '';
    function test(name, tel) {
      var n = norm(name);
      if (!n || !tel) return;
      if (n === target || n.indexOf(target) !== -1 || target.indexOf(n) !== -1) {
        if (!found) found = String(tel);
      }
    }
    if (Array.isArray(list)) {
      list.forEach(function (c) {
        if (!c) return;
        test(c.nome || c.name || c.n, c.tel || c.telefone || c.phone || c.numero || c.number || c.t);
      });
    } else if (typeof list === 'object') {
      Object.keys(list).forEach(function (k) {
        var v = list[k];
        if (v && typeof v === 'object') test(k, v.tel || v.telefone || v.phone || v.numero || v.number);
        else test(k, v);
      });
    }
    return found.replace(/\D/g, '');
  }

  function buildWhatsappUrl(arg) {
    var idx = arg.indexOf('|');
    var who = (idx === -1 ? arg : arg.slice(0, idx)).trim();
    var msg = (idx === -1 ? '' : arg.slice(idx + 1)).trim();
    var num = lookupContactNumber(who);
    if (num && (num.length === 10 || num.length === 11)) num = '55' + num;
    var url = 'https://api.whatsapp.com/send?';
    if (num) url += 'phone=' + num + '&';
    return url + 'text=' + encodeURIComponent(msg);
  }

  function runAction(kind, arg) {
    arg = String(arg || '').trim();
    if (!arg) return;
    if (kind === 'youtube') {
      window.abrirExterno('https://www.youtube.com/results?search_query=' + encodeURIComponent(arg));
    } else if (kind === 'maps') {
      window.abrirExterno('https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(arg));
    } else if (kind === 'whatsapp') {
      window.abrirExterno(buildWhatsappUrl(arg));
    }
  }

  /* =================================================================
     3) TIMER: minutos -> segundos
     ================================================================= */
  var WORD_NUM = { um: 1, uma: 1, dois: 2, duas: 2, tres: 3, 'três': 3, quatro: 4, cinco: 5, seis: 6, sete: 7, oito: 8, nove: 9, dez: 10, quinze: 15, vinte: 20, trinta: 30 };

  function spokenMinutes() {
    var m = String(window.lastUserTranscript || '').match(/(\d+|um|uma|dois|duas|tr[eê]s|quatro|cinco|seis|sete|oito|nove|dez|quinze|vinte|trinta)\s*minutos?/i);
    if (!m) return null;
    var v = m[1].toLowerCase();
    return /^\d+$/.test(v) ? parseInt(v, 10) : (WORD_NUM[v] || null);
  }

  function fixTimers(text) {
    return text.replace(/\[\s*timer\s*:\s*(\d+)\s*\]/gi, function (full, n) {
      var N = parseInt(n, 10);
      var said = spokenMinutes();
      if (said !== null && N === said) N = N * 60;
      return '[timer: ' + N + ']';
    });
  }

  /* =================================================================
     Interceptação do fetch (/chat e /tts)
     ================================================================= */
  var SYS_REINFORCE =
    '\n\n[' + TAG_MARK + ']\n' +
    'Para abrir apps/sites use EXATAMENTE estas tags (uma por resposta, sem texto dentro além do pedido):\n' +
    '[youtube: termo de busca]\n' +
    '[maps: local ou endereço]\n' +
    '[whatsapp: nome_do_contato_ou_numero | mensagem]\n' +
    'Para timers use [timer: N] com N SEMPRE em SEGUNDOS (1 minuto = 60). ' +
    'Nunca explique as tags nem as leia em voz alta.';

  function lastUserText(messages) {
    for (var i = messages.length - 1; i >= 0; i--) {
      var m = messages[i];
      if (!m || m.role !== 'user') continue;
      if (typeof m.content === 'string') return m.content;
      if (Array.isArray(m.content)) {
        return m.content.filter(function (p) { return p && p.type === 'text'; })
          .map(function (p) { return p.text; }).join(' ');
      }
    }
    return '';
  }

  function patchChatRequest(init) {
    try {
      if (!init || typeof init.body !== 'string') return init;
      var body = JSON.parse(init.body);
      if (body && Array.isArray(body.messages)) {
        var u = lastUserText(body.messages);
        if (u) window.lastUserTranscript = u;
        var sys = null;
        for (var i = 0; i < body.messages.length; i++) {
          if (body.messages[i] && body.messages[i].role === 'system') { sys = body.messages[i]; break; }
        }
        if (sys) {
          if (typeof sys.content === 'string') {
            if (sys.content.indexOf(TAG_MARK) === -1) sys.content += SYS_REINFORCE;
          } else if (Array.isArray(sys.content)) {
            var has = sys.content.some(function (p) { return p && typeof p.text === 'string' && p.text.indexOf(TAG_MARK) !== -1; });
            if (!has) sys.content.push({ type: 'text', text: SYS_REINFORCE });
          }
        } else {
          body.messages.unshift({ role: 'system', content: SYS_REINFORCE.trim() });
        }
      }
      if (body && typeof body.system === 'string' && body.system.indexOf(TAG_MARK) === -1) {
        body.system += SYS_REINFORCE;
      }
      var ni = {};
      for (var k in init) ni[k] = init[k];
      ni.body = JSON.stringify(body);
      return ni;
    } catch (e) { return init; }
  }

  // Localiza o campo de texto da resposta em formatos comuns
  function findTextRef(o) {
    if (!o || typeof o !== 'object') return null;
    var keys = ['reply', 'text', 'response', 'answer', 'message', 'content', 'output'];
    for (var i = 0; i < keys.length; i++) {
      if (typeof o[keys[i]] === 'string') return { get: function (k) { return function () { return o[k]; }; }(keys[i]), set: function (k) { return function (v) { o[k] = v; }; }(keys[i]) };
    }
    if (Array.isArray(o.choices) && o.choices[0]) {
      var c = o.choices[0];
      if (c.message && typeof c.message.content === 'string') return { get: function () { return c.message.content; }, set: function (v) { c.message.content = v; } };
      if (typeof c.text === 'string') return { get: function () { return c.text; }, set: function (v) { c.text = v; } };
    }
    if (Array.isArray(o.content) && o.content[0] && typeof o.content[0].text === 'string') {
      var p = o.content[0];
      return { get: function () { return p.text; }, set: function (v) { p.text = v; } };
    }
    if (o.message && typeof o.message === 'object') return findTextRef(o.message);
    if (o.data && typeof o.data === 'object') return findTextRef(o.data);
    return null;
  }

  function transformReply(raw) {
    var text = String(raw);

    // memoriza cidade pedida em [weather: cidade] para o relógio/clima
    var w = text.match(/\[\s*weather\s*:\s*([^\]]+)\]/i);
    if (w && w[1]) { try { localStorage.setItem('jarvis_city', w[1].trim()); window.JARVIS_CITY = w[1].trim(); } catch (e) {} }

    // timers corrigidos
    text = fixTimers(text);

    // ações externas: extrai, remove da resposta (index.html não abre de novo) e executa a primeira
    var actions = [];
    text = text.replace(ACTION_RE, function (full, kind, arg) {
      actions.push([kind.toLowerCase(), arg]);
      return '';
    });
    text = text.replace(/[ \t]{2,}/g, ' ').trim();
    if (actions.length) {
      try { runAction(actions[0][0], actions[0][1]); } catch (e) {}
    }
    return text;
  }

  var _fetch = window.fetch ? window.fetch.bind(window) : null;

  if (_fetch) {
    window.fetch = async function (input, init) {
      var url = '';
      try { url = typeof input === 'string' ? input : (input && input.url) || String(input); } catch (e) {}
      var isChat = /\/chat(\?|#|$)/.test(url);
      var isTts = /\/tts(\?|#|$)/.test(url);

      if (isChat) init = patchChatRequest(init);

      if (isTts && init && typeof init.body === 'string') {
        try {
          var tb = JSON.parse(init.body);
          if (tb && typeof tb.text === 'string') {
            var clean = stripAllTags(tb.text);
            if (clean) {
              tb.text = clean;
              var ti = {};
              for (var k in init) ti[k] = init[k];
              ti.body = JSON.stringify(tb);
              init = ti;
            }
          }
        } catch (e) {}
      }

      var res = await _fetch(input, init);
      if (!isChat || !res || !res.ok) return res;

      try {
        var ct = (res.headers.get('content-type') || '').toLowerCase();
        if (ct.indexOf('event-stream') !== -1) return res; // streaming: não mexe

        var raw = await res.clone().text();
        var obj = null;
        try { obj = JSON.parse(raw); } catch (e) { obj = null; }
        var ref = obj ? findTextRef(obj) : null;
        var rawText = ref ? ref.get() : (obj ? '' : raw);
        if (!rawText) return res;

        // 5) gancho global para os módulos v2.0 (recebe o texto bruto, com todas as tags)
        try { window.dispatchEvent(new CustomEvent('jarvis-response', { detail: rawText })); } catch (e) {}

        var newText = transformReply(rawText);
        if (newText === rawText) return res;

        var outBody;
        if (ref) { ref.set(newText); outBody = JSON.stringify(obj); }
        else outBody = newText;

        var h = new Headers(res.headers);
        h.delete('content-length');
        h.delete('content-encoding');
        return new Response(outBody, { status: res.status, statusText: res.statusText, headers: h });
      } catch (e) {
        return res;
      }
    };
  }

  // Remove tags que sobrarem no #caption (expressões etc.)
  function watchCaption() {
    var cap = document.getElementById('caption');
    if (!cap || cap.__jpWatch) return;
    cap.__jpWatch = true;
    var busy = false;
    new MutationObserver(function () {
      if (busy) return;
      var t = cap.textContent;
      if (t && /\[\s*[a-z_0-9]+\s*(?::[^\]]*)?\]/i.test(t)) {
        busy = true;
        cap.textContent = stripAllTags(t);
        busy = false;
      }
    }).observe(cap, { childList: true, characterData: true, subtree: true });
  }
  watchCaption();

  /* =================================================================
     2) MICROFONE NO MODO AUTO
     ================================================================= */
  var WAKE_RE = /jarvis|jarves|jarbas|javes|j[áa] vi|chave/i;
  var WAKE_START = /^\s*((?:ei|hey|oi|ok|e a[ií])\s+)?(jarves|jarbas|javes|j[áa] vi|chave)\b/i;

  function normalizeWake(t) {
    return String(t || '').replace(WAKE_START, function (m, pre) { return (pre || '') + 'Jarvis'; });
  }

  function wrapResultEvent(ev) {
    try {
      var results = [];
      for (var i = 0; i < ev.results.length; i++) {
        var r = ev.results[i];
        var alts = [];
        for (var j = 0; j < r.length; j++) alts.push({ transcript: normalizeWake(r[j].transcript), confidence: r[j].confidence });
        // coloca na frente a alternativa que contém a wake word
        var w = -1;
        for (var a = 0; a < alts.length; a++) { if (WAKE_RE.test(alts[a].transcript)) { w = a; break; } }
        if (w > 0) { var tmp = alts[0]; alts[0] = alts[w]; alts[w] = tmp; }
        var item = alts.slice();
        item.isFinal = r.isFinal;
        results.push(item);
      }
      return { resultIndex: ev.resultIndex, results: results, timeStamp: ev.timeStamp, type: ev.type, target: ev.target };
    } catch (e) { return ev; }
  }

  function setupRecognition() {
    var rec = gRec();
    if (!rec) return false;
    try { rec.interimResults = true; rec.maxAlternatives = 3; } catch (e) {}

    if (typeof rec.onresult === 'function' && !rec.onresult.__jp) {
      var origRes = rec.onresult;
      var wrapped = function (ev) {
        try {
          var last = ev.results[ev.results.length - 1];
          var txt = last && last[0] ? last[0].transcript : '';
          if (txt) window.lastUserTranscript = txt;
          if (!last || !last.isFinal) return; // parciais só alimentam lastUserTranscript
        } catch (e) {}
        return origRes.call(this, wrapResultEvent(ev));
      };
      wrapped.__jp = true;
      rec.onresult = wrapped;
    }

    if (typeof rec.onend === 'function' && !rec.onend.__jp) {
      var origEnd = rec.onend;
      var wEnd = function (ev) {
        var r = origEnd.call(this, ev);
        setTimeout(restartIfNeeded, 150);
        return r;
      };
      wEnd.__jp = true;
      rec.onend = wEnd;
    }
    return true;
  }

  function audioPlaying() {
    var p = gPlayer();
    return !!(p && !p.paused && !p.ended);
  }

  function restartIfNeeded() {
    var rec = gRec();
    if (!rec || gAuto() !== true || audioPlaying()) return;
    try { rec.start(); } catch (e) { /* já ativo */ }
  }

  setupRecognition();
  setInterval(setupRecognition, 1500); // reaplica caso o index recrie/reatribua handlers

  (function bindPlayerEnd() {
    var p = gPlayer();
    if (!p || p.__jpEnd) { if (!p) setTimeout(bindPlayerEnd, 1500); return; }
    p.__jpEnd = true;
    p.addEventListener('ended', function () { setTimeout(restartIfNeeded, 300); });
  })();

  /* =================================================================
     4) RELÓGIO + CLIMA NO TOPO
     ================================================================= */
  var THEME_COLORS = { punk: '#ff2ea6', stark: '#2fd6ff', edgerunner: '#f7ee2a', stealth: '#9aa7b4' };
  var tempTxt = '--°C';
  var clockEl = null;

  function buildClock() {
    if (document.getElementById('jp-clock')) { clockEl = document.getElementById('jp-clock'); return; }
    clockEl = document.createElement('div');
    clockEl.id = 'jp-clock';
    clockEl.style.cssText =
      'position:fixed;top:58px;left:50%;transform:translateX(-50%);pointer-events:none;' +
      'z-index:5;opacity:0.55;font:600 13px/1 ui-monospace,Menlo,Consolas,monospace;' +
      'letter-spacing:2px;white-space:nowrap;user-select:none;-webkit-user-select:none;';
    (document.body || document.documentElement).appendChild(clockEl);
  }

  function pad(n) { return n < 10 ? '0' + n : '' + n; }

  function tickClock() {
    if (!clockEl) return;
    var d = new Date();
    var txt = pad(d.getHours()) + ':' + pad(d.getMinutes()) + ' \u2022 ' + tempTxt;
    if (clockEl.textContent !== txt) clockEl.textContent = txt;
    var col = THEME_COLORS[gTheme()] || '#2fd6ff';
    clockEl.style.color = col;
    clockEl.style.textShadow = '0 0 8px ' + col + ', 0 0 16px ' + col;
  }

  function getCity() {
    var c = window.JARVIS_CITY;
    if (!c) { try { c = localStorage.getItem('jarvis_city'); } catch (e) {} }
    return c || 'Brasilia'; // padrão; defina window.JARVIS_CITY ou localStorage 'jarvis_city'
  }

  function updateWeather() {
    if (!_fetch) return;
    _fetch(WORKER + '/weather?city=' + encodeURIComponent(getCity()))
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (j) {
        var t = j && j.current && j.current.temperature_2m;
        if (typeof t === 'number') { tempTxt = Math.round(t) + '\u00B0C'; tickClock(); }
      })
      .catch(function () { /* silencioso */ });
  }

  function initClock() {
    buildClock();
    tickClock();
    setInterval(tickClock, 1000);
    updateWeather();
    setInterval(updateWeather, 15 * 60 * 1000);
  }

  if (document.body) initClock();
  else document.addEventListener('DOMContentLoaded', initClock);
  document.addEventListener('DOMContentLoaded', watchCaption);
})();
