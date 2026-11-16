/* mod-radar.js — Radar aéreo/espacial do Jarvis (ISS + OpenSky) | carregar antes de </body> */
(function () {
  'use strict';
  try {
    if (window.__jarvisRadarLoaded) return;
    window.__jarvisRadarLoaded = true;

    /* ---------- CONSTANTES ---------- */
    var BASE = { lat: -16.2525, lon: -47.9503, nome: 'LUZIÂNIA/GO' };
    var RANGE_KM = 500;
    var DURACAO_MS = 14000;
    var CYAN = '#00F0FF';
    var GREEN = '#39FF14';
    var ISS_URL = 'https://api.wheretheiss.at/v1/satellites/25544';
    var OPENSKY_URL = 'https://opensky-network.org/api/states/all?lamin=-19.5&lomin=-51.0&lamax=-13.0&lomax=-45.5';
    var RULE = 'Se o usuário perguntar onde está a ISS / Estação Espacial, sobre aviões passando perto ou pedir para ativar o radar aéreo/espacial, inclua a tag [radar] na resposta.';
    var RULE_MARK = 'inclua a tag [radar] na resposta';

    var origFetch = (typeof window.fetch === 'function') ? window.fetch.bind(window) : null;

    /* ---------- ESTADO ---------- */
    var active = false;
    var runId = 0;
    var stopTimer = null;
    var fadeTimer = null;
    var rafId = 0;
    var startedAt = 0;
    var data = { loading: false, iss: null, planes: [], planesOk: false, done: false };
    var btn = null, canvas = null, ctx = null, hud = null;
    var cssW = 0, cssH = 0, dpr = 1, frame = 0;

    /* ---------- GEO ---------- */
    function rad(d) { return d * Math.PI / 180; }
    function deg(r) { return r * 180 / Math.PI; }
    function haversine(lat1, lon1, lat2, lon2) {
      var R = 6371;
      var dLat = rad(lat2 - lat1), dLon = rad(lon2 - lon1);
      var a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
      return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    }
    function bearing(lat1, lon1, lat2, lon2) {
      var dLon = rad(lon2 - lon1);
      var y = Math.sin(dLon) * Math.cos(rad(lat2));
      var x = Math.cos(rad(lat1)) * Math.sin(rad(lat2)) - Math.sin(rad(lat1)) * Math.cos(rad(lat2)) * Math.cos(dLon);
      return (rad((deg(Math.atan2(y, x)) + 360) % 360));
    }
    function fmt(n) {
      try { return Math.round(n).toLocaleString('pt-BR'); } catch (e) { return String(Math.round(n)); }
    }

    /* ---------- FETCH COM TIMEOUT ---------- */
    function getJSON(url, ms) {
      var ctrl = (typeof AbortController === 'function') ? new AbortController() : null;
      var t = ctrl ? setTimeout(function () { try { ctrl.abort(); } catch (e) {} }, ms) : null;
      return origFetch(url, ctrl ? { signal: ctrl.signal } : {}).then(function (r) {
        if (t) clearTimeout(t);
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      }, function (err) { if (t) clearTimeout(t); throw err; });
    }

    function fetchISS() {
      return getJSON(ISS_URL, 6000).then(function (j) {
        var lat = Number(j.latitude), lon = Number(j.longitude);
        if (!isFinite(lat) || !isFinite(lon)) throw new Error('ISS inválida');
        return {
          lat: lat, lon: lon,
          alt: Number(j.altitude) || 0,
          vel: Number(j.velocity) || 0,
          dist: haversine(BASE.lat, BASE.lon, lat, lon),
          brg: bearing(BASE.lat, BASE.lon, lat, lon)
        };
      });
    }

    function fetchPlanes() {
      return getJSON(OPENSKY_URL, 5000).then(function (j) {
        var st = (j && Array.isArray(j.states)) ? j.states : [];
        var out = [];
        for (var i = 0; i < st.length; i++) {
          var s = st[i];
          if (!Array.isArray(s)) continue;
          var lat = s[6], lon = s[5];
          if (typeof lat !== 'number' || typeof lon !== 'number') continue;
          if (s[8] === true) continue;
          var alt = (typeof s[7] === 'number') ? s[7] : (typeof s[13] === 'number' ? s[13] : 0);
          var cs = (s[1] || '').toString().trim() || (s[0] || '???').toString().toUpperCase();
          out.push({
            callsign: cs, lat: lat, lon: lon,
            alt: Math.round(alt),
            vel: Math.round((s[9] || 0) * 3.6),
            dist: haversine(BASE.lat, BASE.lon, lat, lon),
            brg: bearing(BASE.lat, BASE.lon, lat, lon)
          });
        }
        out.sort(function (a, b) { return a.dist - b.dist; });
        return out.slice(0, 6);
      });
    }

    /* ---------- HUD (PAINEL TELEMÉTRICO) ---------- */
    function ensureHud() {
      if (hud && hud.isConnected) return hud;
      hud = document.createElement('div');
      hud.id = 'radarHud';
      var st = hud.style;
      st.position = 'fixed';
      st.left = '50%';
      st.transform = 'translateX(-50%)';
      st.bottom = '150px';
      st.zIndex = '4';
      st.pointerEvents = 'none';
      st.fontFamily = 'ui-monospace, Menlo, Consolas, "Courier New", monospace';
      st.fontSize = '11px';
      st.lineHeight = '1.45';
      st.color = CYAN;
      st.textShadow = '0 0 6px rgba(0,240,255,.7)';
      st.background = 'rgba(0,0,0,.38)';
      st.border = '1px solid rgba(0,240,255,.35)';
      st.borderRadius = '6px';
      st.padding = '6px 10px';
      st.maxWidth = '92vw';
      st.boxSizing = 'border-box';
      st.whiteSpace = 'nowrap';
      st.overflow = 'hidden';
      st.opacity = '0';
      st.transition = 'opacity 0.4s ease';
      (document.body || document.documentElement).appendChild(hud);
      return hud;
    }

    function positionHud() {
      if (!hud) return;
      try {
        var cap = document.getElementById('caption');
        var bottom = 150;
        if (cap) {
          var r = cap.getBoundingClientRect();
          if (r && r.height > 0) bottom = Math.max(8, window.innerHeight - r.top + 8);
        }
        hud.style.bottom = Math.round(bottom) + 'px';
      } catch (e) {}
    }

    function line(text, color) {
      var d = document.createElement('div');
      d.textContent = text;
      if (color) d.style.color = color;
      return d;
    }

    function renderHud() {
      var h = ensureHud();
      while (h.firstChild) h.removeChild(h.firstChild);
      if (data.loading) {
        h.appendChild(line('RADAR: VARRENDO ESPECTRO...'));
        return;
      }
      if (data.iss) {
        h.appendChild(line('ISS: ' + fmt(data.iss.dist) + ' km • ALT ' + fmt(data.iss.alt) + ' km • ' + fmt(data.iss.vel) + ' km/h'));
      } else {
        h.appendChild(line('ISS: SEM SINAL'));
      }
      if (data.planes.length) {
        for (var i = 0; i < data.planes.length; i++) {
          var p = data.planes[i];
          h.appendChild(line(p.callsign + ' • ' + fmt(p.alt) + 'm • ' + fmt(p.vel) + 'km/h', GREEN));
        }
      } else {
        h.appendChild(line('TRÁFEGO AÉREO: SEM ECO LOCAL', GREEN));
      }
    }

    /* ---------- CANVAS ---------- */
    function ensureCanvas() {
      if (canvas && canvas.isConnected) return canvas;
      canvas = document.getElementById('radarCanvas');
      if (!canvas) {
        canvas = document.createElement('canvas');
        canvas.id = 'radarCanvas';
        (document.body || document.documentElement).appendChild(canvas);
      }
      var s = canvas.style;
      s.position = 'fixed';
      s.top = '0'; s.right = '0'; s.bottom = '0'; s.left = '0';
      s.width = '100%';
      s.height = '100%';
      s.pointerEvents = 'none';
      s.zIndex = '3';
      s.mixBlendMode = 'screen';
      s.opacity = '0';
      s.transition = 'opacity 0.4s ease';
      ctx = canvas.getContext('2d');
      return canvas;
    }

    function resize() {
      if (!canvas || !ctx) return;
      var w = window.innerWidth || document.documentElement.clientWidth || 360;
      var h = window.innerHeight || document.documentElement.clientHeight || 640;
      var d = Math.min(window.devicePixelRatio || 1, 2);
      if (w === cssW && h === cssH && d === dpr) return;
      cssW = w; cssH = h; dpr = d;
      canvas.width = Math.round(w * d);
      canvas.height = Math.round(h * d);
      ctx.setTransform(d, 0, 0, d, 0, 0);
    }

    function project(brg, dist, R, clamp) {
      var f = dist / RANGE_KM;
      var out = f > 1;
      if (out && !clamp) return null;
      var r = Math.min(f, 1) * R;
      return { x: Math.sin(brg) * r, y: -Math.cos(brg) * r, out: out };
    }

    function glowOf(sweepA, brg) {
      var diff = (sweepA - brg) % (Math.PI * 2);
      if (diff < 0) diff += Math.PI * 2;
      return Math.max(0, 1 - diff / Math.PI);
    }

    function draw(t) {
      rafId = requestAnimationFrame(draw);
      if (!ctx) return;
      resize();
      frame++;
      if (frame % 30 === 0) positionHud();

      var W = cssW, H = cssH;
      ctx.clearRect(0, 0, W, H);
      var cx = W / 2, cy = H / 2;
      var R = Math.min(W, H) * 0.42;
      var sweepA = ((t % 4000) / 4000) * Math.PI * 2; // bússola: 0 = N, horário
      var cvA = function (b) { return b - Math.PI / 2; };

      ctx.save();
      ctx.translate(cx, cy);
      ctx.lineCap = 'round';

      // anéis
      ctx.strokeStyle = CYAN;
      ctx.fillStyle = CYAN;
      ctx.font = '9px ui-monospace, Menlo, Consolas, monospace';
      ctx.textAlign = 'left';
      for (var k = 1; k <= 4; k++) {
        ctx.globalAlpha = k === 4 ? 0.7 : 0.35;
        ctx.lineWidth = k === 4 ? 1.5 : 1;
        ctx.beginPath();
        ctx.arc(0, 0, R * k / 4, 0, Math.PI * 2);
        ctx.stroke();
        ctx.globalAlpha = 0.6;
        ctx.fillText((RANGE_KM * k / 4) + 'km', 4, -R * k / 4 - 2);
      }

      // cruz cardeal
      ctx.globalAlpha = 0.3;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(-R, 0); ctx.lineTo(R, 0);
      ctx.moveTo(0, -R); ctx.lineTo(0, R);
      ctx.stroke();
      ctx.globalAlpha = 0.95;
      ctx.font = 'bold 12px ui-monospace, Menlo, Consolas, monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('N', 0, -R - 12);
      ctx.fillText('S', 0, R + 12);
      ctx.fillText('L', R + 12, 0);
      ctx.fillText('O', -R - 12, 0);

      // varredura com rastro degradê
      var N = 36, step = (Math.PI / 2.2) / N;
      ctx.fillStyle = GREEN;
      for (var i = 0; i < N; i++) {
        var a1 = cvA(sweepA - i * step), a0 = cvA(sweepA - (i + 1) * step - 0.004);
        var al = Math.pow(1 - i / N, 2) * 0.32;
        ctx.globalAlpha = al;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.arc(0, 0, R, a0, a1);
        ctx.closePath();
        ctx.fill();
      }
      ctx.globalAlpha = 0.95;
      ctx.strokeStyle = GREEN;
      ctx.lineWidth = 2;
      ctx.shadowColor = GREEN;
      ctx.shadowBlur = 8;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(Math.cos(cvA(sweepA)) * R, Math.sin(cvA(sweepA)) * R);
      ctx.stroke();
      ctx.shadowBlur = 0;

      // base (centro)
      ctx.globalAlpha = 1;
      ctx.fillStyle = CYAN;
      ctx.beginPath();
      ctx.arc(0, 0, 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.font = '9px ui-monospace, Menlo, Consolas, monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.globalAlpha = 0.7;
      ctx.fillText(BASE.nome, 0, 7);

      // aeronaves
      var pulse = (t % 1200) / 1200;
      for (var p = 0; p < data.planes.length; p++) {
        var pl = data.planes[p];
        var pos = project(pl.brg, pl.dist, R, true);
        if (!pos) continue;
        var g = glowOf(sweepA, pl.brg);
        var ph = ((t / 1200) + p * 0.17) % 1;
        ctx.globalAlpha = 0.25 + 0.75 * g;
        ctx.fillStyle = GREEN;
        ctx.shadowColor = GREEN;
        ctx.shadowBlur = 10 * (0.4 + g);
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, 3.5 + 1.2 * Math.sin(ph * Math.PI * 2), 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.globalAlpha = (1 - ph) * 0.6;
        ctx.strokeStyle = GREEN;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, 4 + ph * 12, 0, Math.PI * 2);
        ctx.stroke();
        ctx.globalAlpha = 0.9;
        ctx.fillStyle = GREEN;
        ctx.font = '10px ui-monospace, Menlo, Consolas, monospace';
        ctx.textBaseline = 'alphabetic';
        var left = pos.x > R * 0.55;
        ctx.textAlign = left ? 'right' : 'left';
        ctx.fillText(pl.callsign, pos.x + (left ? -8 : 8), pos.y - 6);
      }

      // ISS
      if (data.iss) {
        var iss = data.iss;
        var ip = project(iss.brg, iss.dist, R, true);
        if (ip) {
          // linha direcional tracejada
          ctx.globalAlpha = 0.35;
          ctx.strokeStyle = CYAN;
          ctx.lineWidth = 1;
          ctx.setLineDash([3, 5]);
          ctx.beginPath();
          ctx.moveTo(0, 0);
          ctx.lineTo(ip.x, ip.y);
          ctx.stroke();
          ctx.setLineDash([]);

          var ig = 0.6 + 0.4 * Math.sin(t / 220);
          ctx.globalAlpha = ig;
          ctx.fillStyle = CYAN;
          ctx.shadowColor = CYAN;
          ctx.shadowBlur = 14;
          ctx.save();
          ctx.translate(ip.x, ip.y);
          ctx.rotate(Math.PI / 4);
          ctx.fillRect(-4, -4, 8, 8);
          ctx.restore();
          ctx.shadowBlur = 0;
          ctx.globalAlpha = (1 - pulse) * 0.7;
          ctx.strokeStyle = CYAN;
          ctx.beginPath();
          ctx.arc(ip.x, ip.y, 7 + pulse * 18, 0, Math.PI * 2);
          ctx.stroke();
          ctx.globalAlpha = 0.95;
          ctx.fillStyle = CYAN;
          ctx.font = 'bold 10px ui-monospace, Menlo, Consolas, monospace';
          ctx.textBaseline = 'alphabetic';
          var il = ip.x > R * 0.3;
          ctx.textAlign = il ? 'right' : 'left';
          ctx.fillText('ISS ' + fmt(iss.dist) + 'km', ip.x + (il ? -12 : 12), ip.y - 8);
        }
      }

      ctx.restore();
      ctx.globalAlpha = 1;
    }

    /* ---------- CONTROLE ---------- */
    function setBtn(on) {
      if (!btn) return;
      try { btn.classList.toggle('on', !!on); } catch (e) {}
    }

    function start() {
      if (active) return;
      active = true;
      var my = ++runId;
      startedAt = Date.now();
      data = { loading: true, iss: null, planes: [], planesOk: false, done: false };
      clearTimeout(fadeTimer);
      clearTimeout(stopTimer);
      ensureCanvas();
      ensureHud();
      resize();
      renderHud();
      positionHud();
      setBtn(true);
      void canvas.offsetWidth; // força reflow para a transição
      canvas.style.opacity = '1';
      hud.style.opacity = '1';
      if (!rafId) rafId = requestAnimationFrame(draw);
      stopTimer = setTimeout(function () { if (runId === my) stop(); }, DURACAO_MS);

      if (!origFetch) { data.loading = false; renderHud(); return; }
      Promise.allSettled([fetchISS(), fetchPlanes()]).then(function (res) {
        if (runId !== my || !active) return;
        data.loading = false;
        data.done = true;
        if (res[0].status === 'fulfilled') data.iss = res[0].value;
        if (res[1].status === 'fulfilled' && res[1].value.length) {
          data.planes = res[1].value;
          data.planesOk = true;
        }
        renderHud();
        positionHud();
      }).catch(function () {
        if (runId !== my) return;
        data.loading = false;
        renderHud();
      });
    }

    function stop() {
      if (!active) return;
      active = false;
      runId++;
      clearTimeout(stopTimer);
      setBtn(false);
      if (canvas) canvas.style.opacity = '0';
      if (hud) hud.style.opacity = '0';
      clearTimeout(fadeTimer);
      fadeTimer = setTimeout(function () {
        if (active) return;
        if (rafId) { cancelAnimationFrame(rafId); rafId = 0; }
        if (ctx) { try { ctx.clearRect(0, 0, cssW, cssH); } catch (e) {} }
      }, 450);
    }

    function toggle() { if (active) stop(); else start(); }

    /* ---------- BOTÃO EM #bar ---------- */
    function findRefButton(bar) {
      var bs = bar.querySelectorAll('button');
      if (!bs.length) return null;
      var pick = null;
      for (var i = 0; i < bs.length; i++) {
        var tx = (bs[i].textContent || '').trim();
        if (tx === 'Contatos') { pick = bs[i]; break; }
      }
      if (!pick) {
        for (var j = bs.length - 1; j >= 0; j--) {
          if ((bs[j].textContent || '').trim() !== 'Radar') { pick = bs[j]; break; }
        }
      }
      return pick;
    }

    function ensureButton() {
      var bar = document.getElementById('bar');
      if (!bar) return false;
      if (btn && btn.isConnected) return true;
      var bs = bar.querySelectorAll('button');
      for (var i = 0; i < bs.length; i++) {
        if ((bs[i].textContent || '').trim() === 'Radar') { btn = bs[i]; if (!btn.__radarBound) bind(btn); setBtn(active); return true; }
      }
      var ref = findRefButton(bar);
      var b;
      if (ref) {
        b = ref.cloneNode(false);
        b.removeAttribute('id');
        b.classList.remove('on');
      } else {
        b = document.createElement('button');
      }
      b.textContent = 'Radar';
      b.type = 'button';
      bind(b);
      bar.appendChild(b);
      btn = b;
      setBtn(active);
      return true;
    }

    function bind(b) {
      b.__radarBound = true;
      b.addEventListener('click', function () { toggle(); });
    }

    /* ---------- INTERCEPTAÇÃO DO FETCH /chat ---------- */
    function norm(s) {
      try { return String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase(); }
      catch (e) { return String(s || '').toLowerCase(); }
    }
    var TRIGGER = /radar|\biss\b|estacao espacial|\bavi(ao|oes)\b|\bvoos?\b/;

    function textOf(content) {
      if (typeof content === 'string') return content;
      if (Array.isArray(content)) {
        var o = '';
        for (var i = 0; i < content.length; i++) {
          var c = content[i];
          if (typeof c === 'string') o += ' ' + c;
          else if (c && typeof c.text === 'string') o += ' ' + c.text;
        }
        return o;
      }
      return '';
    }

    function lastUserText(msgs) {
      for (var i = msgs.length - 1; i >= 0; i--) {
        if (msgs[i] && msgs[i].role === 'user') return textOf(msgs[i].content);
      }
      return '';
    }

    function injectRule(obj) {
      var msgs = obj.messages;
      if (Array.isArray(msgs)) {
        for (var i = 0; i < msgs.length; i++) {
          var m = msgs[i];
          if (m && m.role === 'system') {
            if (typeof m.content === 'string') {
              if (m.content.indexOf(RULE_MARK) === -1) m.content += '\n\n' + RULE;
            } else if (Array.isArray(m.content)) {
              if (textOf(m.content).indexOf(RULE_MARK) === -1) m.content.push({ type: 'text', text: RULE });
            }
            return;
          }
        }
        if (typeof obj.system === 'string') {
          if (obj.system.indexOf(RULE_MARK) === -1) obj.system += '\n\n' + RULE;
          return;
        }
        msgs.unshift({ role: 'system', content: RULE });
      }
    }

    function stripTag(v) {
      if (typeof v === 'string') return v.replace(/\s*\[radar\]/gi, '');
      if (Array.isArray(v)) return v.map(stripTag);
      if (v && typeof v === 'object') {
        var o = {};
        for (var k in v) { if (Object.prototype.hasOwnProperty.call(v, k)) o[k] = stripTag(v[k]); }
        return o;
      }
      return v;
    }

    function isChatUrl(input) {
      try {
        var u = (typeof input === 'string') ? input : (input && input.url) ? input.url : String(input);
        var p = new URL(u, location.href).pathname.replace(/\/+$/, '');
        return /\/chat$/.test(p);
      } catch (e) { return false; }
    }

    function methodOf(input, init) {
      var m = (init && init.method) || (input && typeof input === 'object' && input.method) || 'GET';
      return String(m).toUpperCase();
    }

    function processResponse(res) {
      try {
        if (!res || !res.ok) return res;
        var ct = (res.headers && res.headers.get('content-type')) || '';
        if (/event-stream/i.test(ct)) return res;
        return res.clone().text().then(function (txt) {
          if (!/\[radar\]/i.test(txt)) return res;
          setTimeout(function () { start(); }, 0);
          var out;
          try { out = JSON.stringify(stripTag(JSON.parse(txt))); }
          catch (e) { out = txt.replace(/\s*\[radar\]/gi, ''); }
          var h = new Headers(res.headers);
          h.delete('content-length');
          return new Response(out, { status: res.status, statusText: res.statusText, headers: h });
        }).catch(function () { return res; });
      } catch (e) { return res; }
    }

    if (origFetch) {
      window.fetch = function (input, init) {
        var args = arguments;
        var chat = false;
        try { chat = isChatUrl(input) && methodOf(input, init) === 'POST'; } catch (e) {}
        if (!chat) return origFetch.apply(window, args);

        var newInit = init;
        try {
          if (init && typeof init.body === 'string') {
            var obj = JSON.parse(init.body);
            if (obj && typeof obj === 'object') {
              var ut = norm(lastUserText(Array.isArray(obj.messages) ? obj.messages : []));
              if (ut && TRIGGER.test(ut)) setTimeout(function () { start(); }, 0);
              injectRule(obj);
              newInit = Object.assign({}, init, { body: JSON.stringify(obj) });
            }
          }
        } catch (e) { newInit = init; }

        var p;
        try { p = origFetch.call(window, input, newInit); }
        catch (e) { return origFetch.apply(window, args); }
        return p.then(processResponse);
      };
    }

    /* ---------- INIT ---------- */
    function init() {
      try { ensureCanvas(); resize(); } catch (e) {}
      ensureButton();
      try {
        var bar = document.getElementById('bar');
        if (bar && typeof MutationObserver === 'function') {
          new MutationObserver(function () { ensureButton(); }).observe(bar, { childList: true });
        } else if (!bar) {
          var tries = 0;
          var iv = setInterval(function () {
            if (ensureButton() || ++tries > 20) clearInterval(iv);
          }, 500);
        }
      } catch (e) {}
      window.addEventListener('resize', function () { resize(); positionHud(); });
      window.addEventListener('orientationchange', function () { setTimeout(function () { resize(); positionHud(); }, 250); });
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
  } catch (err) {
    try { console.warn('[mod-radar] falhou ao iniciar:', err); } catch (e) {}
  }
})();
