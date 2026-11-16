/* mod-rede.js — Analisador de Rede & Ferramenta de Segurança (Jarvis v1.9) */
(function () {
  'use strict';
  try {
    if (window.__modRedeLoaded) return;
    window.__modRedeLoaded = true;

    var WORKER = 'https://jarvis-api.emanuelpedro086.workers.dev';
    var RULE = 'Se o usuário pedir para testar a internet/ping/velocidade, diagnosticar a rede ou gerar uma senha forte, inclua a tag [rede] na resposta.';
    var TRIGGER = /(rede|ping|velocidade da internet|diagn[oó]stico|senha forte)/i;

    var panel = null, btn = null, pingBox = null, speedBox = null, passField = null, passBtnCopy = null;
    var pinging = false, measuring = false;

    /* ---------- utilidades ---------- */
    function $(id) { try { return document.getElementById(id); } catch (e) { return null; } }

    function colorFor(ms) {
      if (ms < 120) return '#00FF41';
      if (ms <= 300) return '#FACC15';
      return '#FF3B3B';
    }

    function styleBtn(b) {
      b.style.cssText = 'background:transparent;color:#00FF41;border:1px solid #00FF41;border-radius:4px;' +
        'padding:6px 10px;font-family:"Courier New",monospace;font-size:12px;cursor:pointer;margin:2px 4px 2px 0;';
    }

    function mk(tag, css, txt) {
      var el = document.createElement(tag);
      if (css) el.style.cssText = css;
      if (txt != null) el.textContent = txt;
      return el;
    }

    function setBtnOn(on) {
      try { if (btn) btn.classList.toggle('on', !!on); } catch (e) {}
    }

    function isOpen() { return !!(panel && panel.style.display !== 'none'); }

    /* ---------- A) PING ---------- */
    var TARGETS = [
      { name: 'JARVIS WORKER', url: WORKER },
      { name: 'CLOUDFLARE EDGE', url: 'https://1.1.1.1' },
      { name: 'GITHUB PAGES', url: 'https://bed193.github.io/Jarvis-Comunista/' }
    ];

    function pingOne(t, row) {
      var t0 = performance.now();
      var ctrl = (typeof AbortController !== 'undefined') ? new AbortController() : null;
      var to = setTimeout(function () { try { if (ctrl) ctrl.abort(); } catch (e) {} }, 8000);
      return nativeFetch(t.url, { mode: 'no-cors', cache: 'no-store', signal: ctrl ? ctrl.signal : undefined })
        .then(function () {
          clearTimeout(to);
          var ms = Math.round(performance.now() - t0);
          row.textContent = t.name + ': ' + ms + ' ms';
          row.style.color = colorFor(ms);
        })
        .catch(function () {
          clearTimeout(to);
          row.textContent = t.name + ': FALHA';
          row.style.color = '#FF3B3B';
        });
    }

    function runPing() {
      if (pinging || !pingBox) return;
      pinging = true;
      pingBox.innerHTML = '';
      var jobs = TARGETS.map(function (t) {
        var row = mk('div', 'margin:2px 0;font-size:12px;color:#7a8;', t.name + ': ...');
        pingBox.appendChild(row);
        return pingOne(t, row);
      });
      Promise.all(jobs).then(function () { pinging = false; }, function () { pinging = false; });
    }

    /* ---------- B) VELOCIDADE ---------- */
    function bar(mbps) {
      var max = 100, n = 20;
      var filled = Math.max(0, Math.min(n, Math.round((mbps / max) * n)));
      return '[' + '█'.repeat(filled) + '░'.repeat(n - filled) + ']';
    }

    function downloadTest(url) {
      var t0 = performance.now();
      return nativeFetch(url, { cache: 'no-store' }).then(function (r) {
        if (!r || !r.ok) throw new Error('http');
        return r.arrayBuffer();
      }).then(function (buf) {
        var sec = (performance.now() - t0) / 1000;
        if (!buf || !buf.byteLength || sec <= 0) throw new Error('vazio');
        return { bytes: buf.byteLength, mbps: (buf.byteLength * 8) / (sec * 1000000) };
      });
    }

    function runSpeed() {
      if (measuring || !speedBox) return;
      measuring = true;
      speedBox.style.color = '#FACC15';
      speedBox.textContent = 'Medindo... (2 MB)';
      var bust = '&_=' + Date.now();
      downloadTest('https://speed.cloudflare.com/__down?bytes=2000000' + bust)
        .catch(function () {
          return downloadTest('https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js?_=' + Date.now());
        })
        .then(function (res) {
          var v = res.mbps;
          speedBox.style.color = v >= 20 ? '#00FF41' : (v >= 5 ? '#FACC15' : '#FF3B3B');
          speedBox.textContent = v.toFixed(2) + ' Mbps\n' + bar(v);
          speedBox.style.whiteSpace = 'pre';
        })
        .catch(function () {
          speedBox.style.color = '#FF3B3B';
          speedBox.textContent = 'FALHA NO TESTE';
        })
        .then(function () { measuring = false; });
    }

    /* ---------- C) SENHA ---------- */
    function genPassword() {
      var sets = [
        'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
        'abcdefghijklmnopqrstuvwxyz',
        '0123456789',
        '!@#$%&*?+-_=^~'
      ];
      var all = sets.join('');
      var len = 20;
      var c = window.crypto || window.msCrypto;
      if (!c || !c.getRandomValues) return null;

      function rnd(max) {
        var lim = Math.floor(4294967296 / max) * max;
        var a = new Uint32Array(1), x;
        do { c.getRandomValues(a); x = a[0]; } while (x >= lim);
        return x % max;
      }

      var out = sets.map(function (s) { return s.charAt(rnd(s.length)); });
      while (out.length < len) out.push(all.charAt(rnd(all.length)));
      for (var i = out.length - 1; i > 0; i--) {
        var j = rnd(i + 1), tmp = out[i]; out[i] = out[j]; out[j] = tmp;
      }
      return out.join('');
    }

    function newPass() {
      if (!passField) return;
      var p = genPassword();
      passField.value = p || 'CRYPTO INDISPONÍVEL';
    }

    function copyPass() {
      if (!passField || !passField.value) return;
      var done = function () {
        if (!passBtnCopy) return;
        passBtnCopy.textContent = 'COPIADO!';
        setTimeout(function () { if (passBtnCopy) passBtnCopy.textContent = 'Copiar'; }, 1400);
      };
      try {
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(passField.value).then(done, fallbackCopy);
        } else fallbackCopy();
      } catch (e) { fallbackCopy(); }

      function fallbackCopy() {
        try {
          passField.removeAttribute('readonly');
          passField.select();
          passField.setSelectionRange(0, 99);
          document.execCommand('copy');
          passField.setAttribute('readonly', 'readonly');
          done();
        } catch (e) {}
      }
    }

    /* ---------- PAINEL ---------- */
    function section(title) {
      var wrap = mk('div', 'border-top:1px dashed rgba(0,255,65,0.35);margin-top:10px;padding-top:8px;');
      wrap.appendChild(mk('div', 'font-size:11px;opacity:0.8;margin-bottom:4px;', title));
      return wrap;
    }

    function buildPanel() {
      if ($('redePanel')) { panel = $('redePanel'); return; }
      panel = mk('div');
      panel.id = 'redePanel';
      panel.style.cssText = 'position:fixed;left:50%;top:46%;transform:translate(-50%,-50%);width:min(92vw,380px);' +
        'background:rgba(6,10,16,0.92);border:1px solid #00FF41;box-shadow:0 0 20px rgba(0,255,65,0.25);' +
        'border-radius:8px;padding:14px;font-family:"Courier New",monospace;color:#00FF41;z-index:15;' +
        'display:none;backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px);box-sizing:border-box;' +
        'max-height:80vh;overflow-y:auto;';

      var head = mk('div', 'display:flex;justify-content:space-between;align-items:center;');
      head.appendChild(mk('div', 'font-weight:bold;font-size:13px;', '// NET_SCANNER & SEC_TOOL'));
      var x = mk('button', '', '[X]');
      styleBtn(x);
      x.style.margin = '0';
      x.style.border = 'none';
      x.addEventListener('click', closePanel);
      head.appendChild(x);
      panel.appendChild(head);

      /* A */
      var a = section('A) LATÊNCIA (PING AO VIVO)');
      var bp = mk('button', '', 'Testar Ping'); styleBtn(bp);
      bp.addEventListener('click', runPing);
      pingBox = mk('div', 'margin-top:6px;');
      a.appendChild(bp); a.appendChild(pingBox);
      panel.appendChild(a);

      /* B */
      var b = section('B) VELOCIDADE DE DOWNLOAD');
      var bs = mk('button', '', 'Medir Mbps'); styleBtn(bs);
      bs.addEventListener('click', runSpeed);
      speedBox = mk('div', 'margin-top:6px;font-size:13px;', '— Mbps');
      b.appendChild(bs); b.appendChild(speedBox);
      panel.appendChild(b);

      /* C */
      var c = section('C) GERADOR DE SENHA (20 CHARS)');
      passField = mk('input');
      passField.type = 'text';
      passField.readOnly = true;
      passField.style.cssText = 'width:100%;box-sizing:border-box;background:#000;color:#00FF41;border:1px solid #00FF41;' +
        'border-radius:4px;padding:6px;font-family:"Courier New",monospace;font-size:13px;margin-bottom:4px;';
      var bn = mk('button', '', 'Nova'); styleBtn(bn);
      bn.addEventListener('click', newPass);
      passBtnCopy = mk('button', '', 'Copiar'); styleBtn(passBtnCopy);
      passBtnCopy.addEventListener('click', copyPass);
      c.appendChild(passField); c.appendChild(bn); c.appendChild(passBtnCopy);
      panel.appendChild(c);

      (document.body || document.documentElement).appendChild(panel);
    }

    function openPanel() {
      try {
        if (!panel) buildPanel();
        if (!panel) return;
        panel.style.display = 'block';
        setBtnOn(true);
        if (passField && !passField.value) newPass();
        runPing();
      } catch (e) {}
    }

    function closePanel() {
      try {
        if (panel) panel.style.display = 'none';
        setBtnOn(false);
      } catch (e) {}
    }

    function togglePanel() { isOpen() ? closePanel() : openPanel(); }

    /* ---------- BOTÃO EM #bar ---------- */
    function injectButton() {
      var bar = $('bar');
      if (!bar) return false;
      var found = null;
      var list = bar.querySelectorAll('button');
      for (var i = 0; i < list.length; i++) {
        if ((list[i].textContent || '').trim() === 'Rede') { found = list[i]; break; }
      }
      if (found) { btn = found; return true; }
      btn = document.createElement('button');
      btn.textContent = 'Rede';
      try {
        var ref = list.length ? list[list.length - 1] : null;
        if (ref && ref.className) btn.className = String(ref.className).replace(/\bon\b/g, '').trim();
      } catch (e) {}
      btn.addEventListener('click', function (ev) {
        try { ev.stopPropagation(); } catch (e) {}
        togglePanel();
      });
      bar.appendChild(btn);
      return true;
    }

    /* ---------- INTERCEPTAÇÃO DO FETCH ---------- */
    var nativeFetch = window.fetch ? window.fetch.bind(window) : function () { return Promise.reject(new Error('no fetch')); };

    function isChat(url, init) {
      try {
        var u = typeof url === 'string' ? url : (url && url.url) || '';
        var method = ((init && init.method) || (url && url.method) || 'GET').toUpperCase();
        return method === 'POST' && /\/chat(\?|$|#)/.test(u);
      } catch (e) { return false; }
    }

    function lastUserText(messages) {
      for (var i = messages.length - 1; i >= 0; i--) {
        var m = messages[i];
        if (m && m.role === 'user') {
          if (typeof m.content === 'string') return m.content;
          if (Array.isArray(m.content)) {
            return m.content.map(function (p) { return p && p.type === 'text' ? p.text : ''; }).join(' ');
          }
          return '';
        }
      }
      return '';
    }

    function injectRule(messages) {
      var sys = null;
      for (var i = 0; i < messages.length; i++) {
        if (messages[i] && messages[i].role === 'system') { sys = messages[i]; break; }
      }
      if (sys) {
        if (typeof sys.content === 'string') {
          if (sys.content.indexOf('[rede]') === -1) sys.content += '\n' + RULE;
        } else if (Array.isArray(sys.content)) {
          sys.content.push({ type: 'text', text: RULE });
        }
      } else {
        messages.unshift({ role: 'system', content: RULE });
      }
    }

    function stripTag(obj) {
      var found = false;
      var re = /\[rede\]/gi;
      (function walk(o) {
        if (!o || typeof o !== 'object') return;
        for (var k in o) {
          if (!Object.prototype.hasOwnProperty.call(o, k)) continue;
          if (typeof o[k] === 'string') {
            if (re.test(o[k])) { found = true; o[k] = o[k].replace(/\[rede\]/gi, '').replace(/\s{2,}/g, ' ').trim(); }
            re.lastIndex = 0;
          } else walk(o[k]);
        }
      })(obj);
      return found;
    }

    function wrappedFetch(url, init) {
      var openByUser = false;
      var newInit = init;
      try {
        if (isChat(url, init) && init && typeof init.body === 'string') {
          var body = JSON.parse(init.body);
          if (body && Array.isArray(body.messages)) {
            injectRule(body.messages);
            openByUser = TRIGGER.test(lastUserText(body.messages));
            newInit = Object.assign({}, init, { body: JSON.stringify(body) });
          }
        } else {
          return nativeFetch(url, init);
        }
      } catch (e) {
        return nativeFetch(url, init);
      }

      if (openByUser) openPanel();

      return nativeFetch(url, newInit).then(function (resp) {
        try {
          var clone = resp.clone();
          return clone.text().then(function (txt) {
            var data;
            try { data = JSON.parse(txt); } catch (e) { return resp; }
            if (stripTag(data)) {
              openPanel();
              var headers = new Headers(resp.headers);
              headers.delete('content-length');
              return new Response(JSON.stringify(data), {
                status: resp.status, statusText: resp.statusText, headers: headers
              });
            }
            return resp;
          });
        } catch (e) { return resp; }
      });
    }

    try { window.fetch = wrappedFetch; } catch (e) {}

    /* ---------- INIT ---------- */
    function init() {
      try { injectButton(); buildPanel(); } catch (e) {}
    }
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', init);
    } else {
      init();
    }
    setTimeout(function () { if (!btn) init(); }, 1200);
  } catch (err) {
    try { console.warn('[mod-rede] falha ao iniciar:', err); } catch (e) {}
  }
})();
