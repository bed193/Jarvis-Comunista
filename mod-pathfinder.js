/* mod-pathfinder.js — Jarvis Deep Think + visualizador A* (Pathfinder)
 * Carregar antes de </body>: <script src="mod-pathfinder.js"></script>
 * Interage apenas via DOM real (#bar, #caption) e window.fetch.
 */
(function () {
  'use strict';

  if (window.__jarvisPathfinderLoaded) return;
  window.__jarvisPathfinderLoaded = true;

  /* ========================= CONFIG ========================= */
  var TRIGGERS = ['resposta completa', 'explica completo', 'detalha'];
  var DEEP_PROMPT = 'MODO DEEP THINK ATIVO: Dê uma resposta completa, didática e bem estruturada em até 10 frases curtas (sem markdown, listas com asteriscos ou emojis, pois será lida em voz alta). Comece com [thinking] ou [smirk].';
  var DEEP_MAX_TOKENS = 900;
  var STOP_DELAY_MS = 1500;      // após o fim da fala
  var RESPONSE_GRACE_MS = 3000;  // espera a legenda aparecer após o fetch
  var FADE_MS = 400;
  var EXPAND_PER_FRAME = 5;      // nós expandidos pelo A* por frame
  var PATH_CELLS_PER_FRAME = 2;
  var PATH_HOLD_MS = 1400;

  var COL_CLOSED = 'rgba(0, 240, 255, 0.25)';
  var COL_OPEN = 'rgba(0, 240, 255, 0.50)';
  var COL_GRID = 'rgba(0, 240, 255, 0.07)';
  var COL_WALL = 'rgba(120, 190, 255, 0.14)';
  var COL_PATH = '#39FF14';
  var COL_GOLD = '#FACC15';

  /* ========================= UTILS ========================= */
  function norm(s) {
    return String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  }

  function contentToText(c) {
    if (typeof c === 'string') return c;
    if (Array.isArray(c)) {
      return c.map(function (p) {
        return p && typeof p.text === 'string' ? p.text : '';
      }).join(' ');
    }
    return '';
  }

  /* ========================= ESTADO ========================= */
  var deepOn = false;
  var armed = false;          // modo visual ativo
  var pending = 0;            // fetches /chat em andamento
  var holdUntil = 0;
  var lastCaptionVisible = 0;
  var suppressText = null;    // legenda ignorada após interrupção
  var monitorId = null;

  /* ========================= BOTÃO "Deep" ========================= */
  var deepBtn = null;

  function setupButton() {
    var bar = document.getElementById('bar');
    if (!bar || deepBtn) return !!deepBtn;

    deepBtn = document.createElement('button');
    deepBtn.type = 'button';
    deepBtn.textContent = 'Deep';
    var sample = bar.querySelector('button');
    if (sample) deepBtn.className = sample.className.replace(/\bon\b/g, '').trim();
    deepBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      deepOn = !deepOn;
      deepBtn.classList.toggle('on', deepOn);
    });
    bar.appendChild(deepBtn);
    return true;
  }

  if (!setupButton()) {
    var mo = new MutationObserver(function () {
      if (setupButton()) mo.disconnect();
    });
    mo.observe(document.documentElement, { childList: true, subtree: true });
  }

  /* ========================= CANVAS ========================= */
  var canvas = document.createElement('canvas');
  canvas.id = 'pathfinderCanvas';
  canvas.style.cssText =
    'position:fixed;inset:0;width:100%;height:100%;pointer-events:none;z-index:2;' +
    'mix-blend-mode:screen;opacity:0;transition:opacity .4s;';
  document.body.appendChild(canvas);
  var ctx = canvas.getContext('2d');

  var W = 0, H = 0, CS = 16, GW = 0, GH = 0, OX = 0, OY = 0;

  /* ========================= LABIRINTO ========================= */
  var walls, g, f, parent, state, heapK, heapV;
  var startI, goalI, path, pathShown, phase, phaseAt, found;

  function resize() {
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = window.innerWidth;
    H = window.innerHeight;
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    CS = Math.max(14, Math.round(Math.min(W, H) / 22));
    GW = Math.max(11, Math.floor(W / CS));
    GH = Math.max(11, Math.floor(H / CS));
    if (GW % 2 === 0) GW--;
    if (GH % 2 === 0) GH--;
    OX = Math.floor((W - GW * CS) / 2);
    OY = Math.floor((H - GH * CS) / 2);
    newMaze();
  }

  function newMaze() {
    var n = GW * GH, i;
    walls = new Uint8Array(n).fill(1);

    // DFS iterativo (labirinto perfeito)
    var stack = [], sx = 1, sy = 1;
    walls[sy * GW + sx] = 0;
    stack.push(sx, sy);
    var dirs = [[2, 0], [-2, 0], [0, 2], [0, -2]];
    while (stack.length) {
      var cy = stack[stack.length - 1], cx = stack[stack.length - 2];
      var opts = [];
      for (i = 0; i < 4; i++) {
        var nx = cx + dirs[i][0], ny = cy + dirs[i][1];
        if (nx > 0 && ny > 0 && nx < GW - 1 && ny < GH - 1 && walls[ny * GW + nx] === 1) opts.push(i);
      }
      if (!opts.length) { stack.length -= 2; continue; }
      var d = dirs[opts[(Math.random() * opts.length) | 0]];
      walls[(cy + d[1] / 2) * GW + (cx + d[0] / 2)] = 0;
      walls[(cy + d[1]) * GW + (cx + d[0])] = 0;
      stack.push(cx + d[0], cy + d[1]);
    }

    // abre algumas paredes para criar rotas alternativas
    var extra = Math.floor(n * 0.03);
    for (i = 0; i < extra; i++) {
      var rx = 1 + ((Math.random() * (GW - 2)) | 0), ry = 1 + ((Math.random() * (GH - 2)) | 0);
      walls[ry * GW + rx] = 0;
    }

    startI = pickOpen(0, 0.25);
    goalI = pickOpen(0.75, 1);

    g = new Float32Array(n).fill(Infinity);
    f = new Float32Array(n).fill(Infinity);
    parent = new Int32Array(n).fill(-1);
    state = new Uint8Array(n); // 0 livre, 1 open, 2 closed
    heapK = []; heapV = [];
    g[startI] = 0;
    f[startI] = heur(startI);
    state[startI] = 1;
    heapPush(f[startI], startI);
    found = false;
    path = [];
    pathShown = 0;
    phase = 'search';
    phaseAt = performance.now();
  }

  function pickOpen(x0, x1) {
    for (var t = 0; t < 400; t++) {
      var x = Math.floor((x0 + Math.random() * (x1 - x0)) * GW);
      var y = Math.floor(Math.random() * GH);
      if (x > 0 && y > 0 && x < GW - 1 && y < GH - 1 && !walls[y * GW + x]) return y * GW + x;
    }
    for (var i = 0; i < walls.length; i++) if (!walls[i]) return i;
    return 0;
  }

  /* ========================= A* ========================= */
  function heur(i) {
    var x = i % GW, y = (i / GW) | 0, gx = goalI % GW, gy = (goalI / GW) | 0;
    return Math.abs(x - gx) + Math.abs(y - gy);
  }

  function heapPush(k, v) {
    var i = heapK.length;
    heapK.push(k); heapV.push(v);
    while (i > 0) {
      var p = (i - 1) >> 1;
      if (heapK[p] <= heapK[i]) break;
      var tk = heapK[p]; heapK[p] = heapK[i]; heapK[i] = tk;
      var tv = heapV[p]; heapV[p] = heapV[i]; heapV[i] = tv;
      i = p;
    }
  }

  function heapPop() {
    var v = heapV[0], lk = heapK.pop(), lv = heapV.pop();
    if (heapK.length) {
      heapK[0] = lk; heapV[0] = lv;
      var i = 0, n = heapK.length;
      for (;;) {
        var l = 2 * i + 1, r = l + 1, m = i;
        if (l < n && heapK[l] < heapK[m]) m = l;
        if (r < n && heapK[r] < heapK[m]) m = r;
        if (m === i) break;
        var tk = heapK[m]; heapK[m] = heapK[i]; heapK[i] = tk;
        var tv = heapV[m]; heapV[m] = heapV[i]; heapV[i] = tv;
        i = m;
      }
    }
    return v;
  }

  function stepAStar() {
    var steps = EXPAND_PER_FRAME;
    while (steps-- > 0 && heapK.length) {
      var cur = heapPop();
      if (state[cur] === 2) continue;
      state[cur] = 2;
      if (cur === goalI) { buildPath(); return; }
      var cx = cur % GW, cy = (cur / GW) | 0;
      var nb = [cur - 1, cur + 1, cur - GW, cur + GW];
      var ok = [cx > 0, cx < GW - 1, cy > 0, cy < GH - 1];
      for (var k = 0; k < 4; k++) {
        if (!ok[k]) continue;
        var nI = nb[k];
        if (walls[nI] || state[nI] === 2) continue;
        var ng = g[cur] + 1;
        if (ng < g[nI]) {
          g[nI] = ng;
          f[nI] = ng + heur(nI);
          parent[nI] = cur;
          state[nI] = 1;
          heapPush(f[nI], nI);
        }
      }
    }
    if (!heapK.length && !found) { phase = 'hold'; phaseAt = performance.now(); } // sem rota (raro)
  }

  function buildPath() {
    var p = [], c = goalI;
    while (c !== -1) { p.push(c); c = parent[c]; }
    path = p.reverse();
    pathShown = 0;
    found = true;
    phase = 'path';
    phaseAt = performance.now();
  }

  /* ========================= RENDER ========================= */
  function cell(i, color, inset) {
    var x = OX + (i % GW) * CS, y = OY + ((i / GW) | 0) * CS;
    ctx.fillStyle = color;
    ctx.fillRect(x + inset, y + inset, CS - inset * 2, CS - inset * 2);
  }

  function draw() {
    ctx.clearRect(0, 0, W, H);

    // grade tática
    ctx.strokeStyle = COL_GRID;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (var gx = 0; gx <= GW; gx++) {
      ctx.moveTo(OX + gx * CS + 0.5, OY);
      ctx.lineTo(OX + gx * CS + 0.5, OY + GH * CS);
    }
    for (var gy = 0; gy <= GH; gy++) {
      ctx.moveTo(OX, OY + gy * CS + 0.5);
      ctx.lineTo(OX + GW * CS, OY + gy * CS + 0.5);
    }
    ctx.stroke();

    var n = GW * GH, i;
    for (i = 0; i < n; i++) {
      if (walls[i]) cell(i, COL_WALL, 1);
      else if (state[i] === 2) cell(i, COL_CLOSED, 1);
      else if (state[i] === 1) cell(i, COL_OPEN, 2);
    }

    // rota
    if (path.length && pathShown > 0) {
      ctx.save();
      ctx.shadowColor = COL_PATH;
      ctx.shadowBlur = 10;
      for (i = 0; i < pathShown; i++) cell(path[i], COL_PATH, 2);
      ctx.restore();
      var head = path[Math.min(pathShown, path.length) - 1];
      ctx.save();
      ctx.shadowColor = COL_GOLD;
      ctx.shadowBlur = 14;
      cell(head, COL_GOLD, 1);
      ctx.restore();
    }

    // origem e destino
    cell(startI, COL_GOLD, 2);
    ctx.save();
    ctx.shadowColor = COL_GOLD;
    ctx.shadowBlur = 12;
    cell(goalI, COL_GOLD, 0);
    ctx.restore();
  }

  /* ========================= LOOP ========================= */
  var rafId = null, running = false;

  function frame(now) {
    if (!running) return;
    if (phase === 'search') {
      stepAStar();
    } else if (phase === 'path') {
      pathShown = Math.min(path.length, pathShown + PATH_CELLS_PER_FRAME);
      if (pathShown >= path.length && now - phaseAt > 400 + path.length * 8) {
        phase = 'hold';
        phaseAt = now;
      }
    } else if (phase === 'hold') {
      if (now - phaseAt > PATH_HOLD_MS) newMaze();
    }
    draw();
    rafId = requestAnimationFrame(frame);
  }

  var hideTimer = null;

  function show() {
    if (hideTimer) { clearTimeout(hideTimer); hideTimer = null; }
    if (!running) {
      resize();
      running = true;
      rafId = requestAnimationFrame(frame);
    }
    canvas.style.opacity = '1';
  }

  function hide() {
    canvas.style.opacity = '0';
    if (hideTimer) clearTimeout(hideTimer);
    hideTimer = setTimeout(function () {
      if (armed) return;
      running = false;
      if (rafId) cancelAnimationFrame(rafId);
      rafId = null;
      ctx.clearRect(0, 0, W, H);
    }, FADE_MS + 100);
  }

  function activate() {
    armed = true;
    suppressText = null;
    lastCaptionVisible = performance.now();
    show();
    if (!monitorId) monitorId = setInterval(monitor, 200);
  }

  function deactivate() {
    armed = false;
    if (monitorId) { clearInterval(monitorId); monitorId = null; }
    hide();
  }

  /* ========================= MONITOR DA LEGENDA ========================= */
  function captionState() {
    var el = document.getElementById('caption');
    if (!el) return { visible: false, text: '' };
    var text = (el.textContent || '').trim();
    var cs = window.getComputedStyle(el);
    var visible = !!text && cs.display !== 'none' && cs.visibility !== 'hidden' && parseFloat(cs.opacity) > 0.05;
    return { visible: visible, text: text };
  }

  function monitor() {
    if (!armed) return;
    var now = performance.now();
    var cap = captionState();
    var visible = cap.visible;

    if (suppressText !== null) {
      if (visible && cap.text === suppressText) visible = false;
      else suppressText = null;
    }
    if (visible) lastCaptionVisible = now;

    if (pending === 0 && !visible && now > holdUntil && now - lastCaptionVisible > STOP_DELAY_MS) {
      deactivate();
    }
  }

  // Toque para interromper (ignora toques na barra #bar)
  function onTap(e) {
    if (!armed) return;
    var bar = document.getElementById('bar');
    if (bar && e.target && bar.contains(e.target)) return;
    suppressText = captionState().text;
    deactivate();
  }
  document.addEventListener('pointerdown', onTap, true);
  document.addEventListener('touchstart', onTap, { capture: true, passive: true });

  window.addEventListener('resize', function () { if (running) resize(); });

  /* ========================= INTERCEPTAÇÃO DO FETCH ========================= */
  var origFetch = window.fetch;

  function isChatUrl(input) {
    try {
      var u = typeof input === 'string' ? input : (input && input.url) || String(input);
      return /\/chat\/?$/.test(new URL(u, location.href).pathname);
    } catch (e) { return false; }
  }

  function methodOf(input, init) {
    var m = (init && init.method) || (input && input.method) || 'GET';
    return String(m).toUpperCase();
  }

  var SYS_RE = /(?:no\s+)?m[aá]ximo\s+(?:de\s+)?(?:2|duas)\s+frases?(?:\s+curtas?)?\.?/gi;

  function applyDeep(payload) {
    var msgs = payload.messages, replaced = false, i;
    for (i = 0; i < msgs.length; i++) {
      var m = msgs[i];
      if (!m || m.role !== 'system') continue;
      if (typeof m.content === 'string') {
        var out = m.content.replace(SYS_RE, DEEP_PROMPT);
        if (out !== m.content) { m.content = out; replaced = true; }
        else { m.content = m.content + '\n\n' + DEEP_PROMPT; replaced = true; }
      } else if (Array.isArray(m.content)) {
        m.content.push({ type: 'text', text: DEEP_PROMPT });
        replaced = true;
      }
      break;
    }
    if (!replaced) msgs.unshift({ role: 'system', content: DEEP_PROMPT });
    if ('max_tokens' in payload) payload.max_tokens = DEEP_MAX_TOKENS;
  }

  async function prepare(input, init) {
    if (!isChatUrl(input) || methodOf(input, init) !== 'POST') return null;

    var bodyText = null;
    if (init && typeof init.body === 'string') bodyText = init.body;
    else if ((!init || init.body == null) && typeof Request !== 'undefined' && input instanceof Request) {
      bodyText = await input.clone().text();
    }
    if (!bodyText) return null;

    var payload = JSON.parse(bodyText);
    if (!payload || !Array.isArray(payload.messages)) return null;

    var lastUser = '';
    for (var i = payload.messages.length - 1; i >= 0; i--) {
      if (payload.messages[i] && payload.messages[i].role === 'user') {
        lastUser = contentToText(payload.messages[i].content);
        break;
      }
    }
    var t = norm(lastUser);
    var byVoice = TRIGGERS.some(function (k) { return t.indexOf(k) !== -1; });
    if (!deepOn && !byVoice) return null;

    applyDeep(payload);
    var newBody = JSON.stringify(payload);

    if (typeof Request !== 'undefined' && input instanceof Request) {
      var opts = init ? Object.assign({}, init, { body: newBody }) : { body: newBody };
      return { args: [new Request(input, opts)] };
    }
    return { args: [input, Object.assign({}, init, { body: newBody })] };
  }

  window.fetch = async function (input, init) {
    var plan = null;
    try { plan = await prepare(input, init); } catch (e) { plan = null; }
    if (!plan) return origFetch.call(window, input, init);

    pending++;
    activate();
    try {
      return await origFetch.apply(window, plan.args);
    } finally {
      pending = Math.max(0, pending - 1);
      holdUntil = performance.now() + RESPONSE_GRACE_MS;
    }
  };
})();
