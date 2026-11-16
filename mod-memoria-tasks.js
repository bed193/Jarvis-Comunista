/* =========================================================
 * mod-memoria-tasks.js  (Jarvis v1.9)
 * Memória (jarvis_memories) + Tarefas (jarvis_tasks)
 * - Intercepta fetch /chat: injeta contexto + processa tags
 * - Sincroniza contadores MEM / TASKS no #hudL
 * - Modal de tarefas (#tasksBtn ou área TASKS: do #hudL)
 * - Lembrete falado ao acordar do modo Dormir
 * Carregar antes de </body>:  <script src="mod-memoria-tasks.js"></script>
 * ========================================================= */
(function () {
  'use strict';
  if (window.__jvMemTasksLoaded) return;
  window.__jvMemTasksLoaded = true;

  var API = 'https://jarvis-api.emanuelpedro086.workers.dev';
  var KEY_MEM = 'jarvis_memories';
  var KEY_TASKS = 'jarvis_tasks';
  var MAX_MEM = 25;
  var MAX_TASKS = 50;

  /* ---------- storage ---------- */
  function load(key) {
    try {
      var v = JSON.parse(localStorage.getItem(key) || '[]');
      return Array.isArray(v) ? v : [];
    } catch (e) { return []; }
  }
  function save(key, arr) {
    try { localStorage.setItem(key, JSON.stringify(arr)); } catch (e) {}
  }
  function textOf(item) {
    if (item == null) return '';
    if (typeof item === 'string') return item;
    if (typeof item === 'object') {
      return String(item.text || item.desc || item.description || item.title ||
        item.task || item.fact || item.name || '');
    }
    return String(item);
  }
  function norm(s) { return textOf(s).trim().toLowerCase(); }

  /* ---------- processamento de tags ---------- */
  function addMemory(fact) {
    fact = fact.trim();
    if (!fact) return false;
    var mem = load(KEY_MEM);
    var n = fact.toLowerCase();
    if (mem.some(function (m) { return norm(m) === n; })) return false;
    mem.push(fact);
    if (mem.length > MAX_MEM) mem = mem.slice(-MAX_MEM);
    save(KEY_MEM, mem);
    return true;
  }
  function addTask(desc) {
    desc = desc.trim();
    if (!desc) return false;
    var tasks = load(KEY_TASKS);
    var n = desc.toLowerCase();
    if (tasks.some(function (t) { return norm(t) === n; })) return false;
    tasks.push(desc);
    if (tasks.length > MAX_TASKS) tasks = tasks.slice(-MAX_TASKS);
    save(KEY_TASKS, tasks);
    return true;
  }
  function removeTasksByKeyword(kw) {
    kw = kw.trim().toLowerCase();
    if (!kw) return false;
    var tasks = load(KEY_TASKS);
    var kept = tasks.filter(function (t) { return norm(t).indexOf(kw) === -1; });
    if (kept.length === tasks.length) return false;
    save(KEY_TASKS, kept);
    return true;
  }

  var changed = false;
  function processText(s) {
    if (typeof s !== 'string' || s.indexOf('[') === -1) return s;
    var out = s;
    out = out.replace(/\[save:\s*([^\]]+)\]/gi, function (_, v) {
      if (addMemory(v)) changed = true; return '';
    });
    out = out.replace(/\[task_add:\s*([^\]]+)\]/gi, function (_, v) {
      if (addTask(v)) changed = true; return '';
    });
    out = out.replace(/\[task_done:\s*([^\]]+)\]/gi, function (_, v) {
      if (removeTasksByKeyword(v)) changed = true; return '';
    });
    if (out !== s) out = out.replace(/[ \t]{2,}/g, ' ').trim();
    return out;
  }
  function walk(node) {
    if (node == null) return node;
    if (typeof node === 'string') return processText(node);
    if (Array.isArray(node)) {
      for (var i = 0; i < node.length; i++) node[i] = walk(node[i]);
      return node;
    }
    if (typeof node === 'object') {
      Object.keys(node).forEach(function (k) { node[k] = walk(node[k]); });
    }
    return node;
  }

  /* ---------- injeção no system prompt ---------- */
  var RULES =
    'REGRAS DE MEMÓRIA E TAREFAS:\n' +
    '1) Sempre que o usuário disser seu nome, preferência, dado pessoal ou pedir para lembrar/guardar algo sobre ele, inclua na resposta a tag [save: fato curto].\n' +
    '2) Sempre que o usuário pedir para adicionar/anotar uma tarefa, lembrete ou compromisso, inclua na resposta a tag [task_add: descrição da tarefa].\n' +
    '3) Sempre que o usuário disser que concluiu/fez uma tarefa, inclua [task_done: palavra-chave].\n' +
    'NUNCA diga que salvou ou anotou se não incluir a tag correspondente!';

  function buildContext() {
    var mem = load(KEY_MEM).map(textOf).filter(Boolean);
    var tasks = load(KEY_TASKS).map(textOf).filter(Boolean);
    var s = '\n\n--- MEMÓRIA DO USUÁRIO ---\n';
    s += mem.length ? mem.map(function (m) { return '- ' + m; }).join('\n') : '(nenhum fato salvo)';
    s += '\n\n--- TAREFAS PENDENTES ---\n';
    s += tasks.length ? tasks.map(function (t) { return '- ' + t; }).join('\n') : '(nenhuma tarefa pendente)';
    s += '\n\n' + RULES;
    return s;
  }

  function injectSystem(payload) {
    if (!payload || !Array.isArray(payload.messages)) return payload;
    var extra = buildContext();
    var sys = null;
    for (var i = 0; i < payload.messages.length; i++) {
      if (payload.messages[i] && payload.messages[i].role === 'system') { sys = payload.messages[i]; break; }
    }
    if (!sys) {
      payload.messages.unshift({ role: 'system', content: extra.trim() });
    } else if (typeof sys.content === 'string') {
      sys.content += extra;
    } else if (Array.isArray(sys.content)) {
      sys.content.push({ type: 'text', text: extra });
    } else {
      sys.content = extra.trim();
    }
    return payload;
  }

  /* ---------- interceptação do fetch ---------- */
  var origFetch = window.fetch.bind(window);

  function urlOf(input) {
    try {
      if (typeof input === 'string') return input;
      if (input && input.url) return input.url;
      return String(input);
    } catch (e) { return ''; }
  }
  function isChat(url) {
    return /\/chat(\?|$|#)/.test(url) && url.indexOf('jarvis-api') !== -1 ||
           /^\/chat(\?|$)/.test(url);
  }

  window.fetch = async function (input, init) {
    var url = urlOf(input);
    var method = ((init && init.method) || (input && input.method) || 'GET').toUpperCase();
    if (!isChat(url) || method !== 'POST') return origFetch(input, init);

    var args = [input, init];
    try {
      var bodyText = null;
      if (init && typeof init.body === 'string') {
        bodyText = init.body;
      } else if (!(init && init.body) && typeof Request !== 'undefined' && input instanceof Request) {
        bodyText = await input.clone().text();
      }
      if (bodyText) {
        var payload = JSON.parse(bodyText);
        var newBody = JSON.stringify(injectSystem(payload));
        if (init && typeof init.body === 'string') {
          args = [input, Object.assign({}, init, { body: newBody })];
        } else {
          args = [new Request(input, { body: newBody }), init];
        }
      }
    } catch (e) { args = [input, init]; }

    var res = await origFetch(args[0], args[1]);

    try {
      var ct = (res.headers.get('content-type') || '').toLowerCase();
      if (ct.indexOf('event-stream') !== -1) return res; // streaming: não mexe
      var raw = await res.clone().text();
      changed = false;
      var outText;
      var parsed = null;
      try { parsed = JSON.parse(raw); } catch (e) { parsed = null; }
      if (parsed !== null && typeof parsed === 'object') {
        outText = JSON.stringify(walk(parsed));
      } else {
        outText = processText(raw);
      }
      if (changed) syncHudCounters();
      if (outText === raw) return res;
      var headers = new Headers(res.headers);
      headers.delete('content-length');
      headers.delete('content-encoding');
      return new Response(outText, { status: res.status, statusText: res.statusText, headers: headers });
    } catch (e) {
      return res;
    }
  };

  /* ---------- HUD ---------- */
  function setCount(text, label, n) {
    var re = new RegExp('(\\b' + label + '\\s*[:=]?\\s*)\\d+', 'gi');
    return text.replace(re, '$1' + n);
  }

  function syncHudCounters() {
    var hud = document.getElementById('hudL');
    if (!hud) return;
    var m = load(KEY_MEM).length;
    var t = load(KEY_TASKS).length;
    var walker = document.createTreeWalker(hud, NodeFilter.SHOW_TEXT, null);
    var node;
    var nodes = [];
    while ((node = walker.nextNode())) nodes.push(node);
    nodes.forEach(function (tn) {
      var v = tn.nodeValue;
      var nv = setCount(setCount(v, 'MEM', m), 'TASKS', t);
      if (nv !== v) { tn.nodeValue = nv; return; }
      // caso "MEM" e o número estejam em elementos irmãos separados
      if (/^\s*\d+\s*$/.test(v)) {
        var el = tn.parentElement;
        var prev = el && el.previousElementSibling;
        var lab = prev && prev.textContent.trim().replace(/[:=\s]+$/, '').toUpperCase();
        var target = lab === 'MEM' ? m : lab === 'TASKS' ? t : null;
        if (target !== null && String(target) !== v.trim()) tn.nodeValue = String(target);
      }
    });
  }
  window.__jvSyncHud = syncHudCounters;

  var hudRaf = 0;
  function watchHud() {
    var hud = document.getElementById('hudL');
    if (!hud || hud.__jvObs) return;
    hud.__jvObs = true;
    new MutationObserver(function () {
      if (hudRaf) return;
      hudRaf = requestAnimationFrame(function () { hudRaf = 0; syncHudCounters(); });
    }).observe(hud, { childList: true, subtree: true, characterData: true });
  }

  /* ---------- modal de tarefas ---------- */
  var modal = null;

  function css() {
    if (document.getElementById('jv-mt-style')) return;
    var st = document.createElement('style');
    st.id = 'jv-mt-style';
    st.textContent =
      '#jv-tasks-modal{position:fixed;inset:0;z-index:99999;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.65);font-family:monospace}' +
      '#jv-tasks-modal .jv-p{width:min(92vw,420px);max-height:80vh;display:flex;flex-direction:column;background:#07060d;border:1px solid #b026ff;box-shadow:0 0 18px #b026ff88,inset 0 0 12px #b026ff22;border-radius:6px;color:#e8d9ff}' +
      '#jv-tasks-modal .jv-h{display:flex;justify-content:space-between;align-items:center;padding:10px 14px;border-bottom:1px solid #b026ff66;letter-spacing:2px;font-size:13px;color:#d28bff}' +
      '#jv-tasks-modal .jv-x{background:none;border:0;color:#d28bff;font-size:18px;cursor:pointer}' +
      '#jv-tasks-modal .jv-l{overflow-y:auto;padding:6px 14px;flex:1}' +
      '#jv-tasks-modal .jv-r{display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px dashed #b026ff33;font-size:14px}' +
      '#jv-tasks-modal .jv-r span{flex:1;word-break:break-word}' +
      '#jv-tasks-modal .jv-ok{background:transparent;border:1px solid #39ff14;color:#39ff14;border-radius:3px;padding:2px 8px;cursor:pointer;font-family:monospace}' +
      '#jv-tasks-modal .jv-e{padding:14px 0;color:#8a7aa8;font-size:13px}' +
      '#jv-tasks-modal .jv-a{display:flex;gap:8px;padding:10px 14px;border-top:1px solid #b026ff66}' +
      '#jv-tasks-modal input{flex:1;min-width:0;background:#0f0c1a;border:1px solid #b026ff88;color:#fff;padding:8px;border-radius:3px;font-family:monospace;font-size:14px}' +
      '#jv-tasks-modal .jv-add{background:#b026ff;border:0;color:#fff;padding:0 12px;border-radius:3px;cursor:pointer;font-family:monospace}';
    document.head.appendChild(st);
  }

  function renderModal() {
    if (!modal) return;
    var list = modal.querySelector('.jv-l');
    list.textContent = '';
    var tasks = load(KEY_TASKS);
    if (!tasks.length) {
      var e = document.createElement('div');
      e.className = 'jv-e';
      e.textContent = 'Nenhuma tarefa pendente.';
      list.appendChild(e);
    }
    tasks.forEach(function (t, i) {
      var row = document.createElement('div');
      row.className = 'jv-r';
      var sp = document.createElement('span');
      sp.textContent = textOf(t);
      var b = document.createElement('button');
      b.className = 'jv-ok';
      b.textContent = '[✓]';
      b.addEventListener('click', function () {
        var cur = load(KEY_TASKS);
        cur.splice(i, 1);
        save(KEY_TASKS, cur);
        syncHudCounters();
        renderModal();
      });
      row.appendChild(sp);
      row.appendChild(b);
      list.appendChild(row);
    });
    modal.querySelector('.jv-hc').textContent = 'TAREFAS [' + tasks.length + ']';
  }

  function closeModal() {
    if (modal) { modal.remove(); modal = null; }
  }

  function openModal() {
    if (modal) return;
    css();
    modal = document.createElement('div');
    modal.id = 'jv-tasks-modal';
    modal.innerHTML =
      '<div class="jv-p"><div class="jv-h"><span class="jv-hc"></span><button class="jv-x" type="button">✕</button></div>' +
      '<div class="jv-l"></div>' +
      '<div class="jv-a"><input type="text" placeholder="+ Nova tarefa" maxlength="120"><button class="jv-add" type="button">ADD</button></div></div>';
    document.body.appendChild(modal);
    var input = modal.querySelector('input');
    function add() {
      var v = input.value.trim();
      if (!v) return;
      addTask(v);
      input.value = '';
      syncHudCounters();
      renderModal();
    }
    modal.querySelector('.jv-add').addEventListener('click', add);
    input.addEventListener('keydown', function (e) {
      e.stopPropagation();
      if (e.key === 'Enter') add();
      if (e.key === 'Escape') closeModal();
    });
    input.addEventListener('keyup', function (e) { e.stopPropagation(); });
    modal.querySelector('.jv-x').addEventListener('click', closeModal);
    modal.addEventListener('click', function (e) { if (e.target === modal) closeModal(); });
    renderModal();
  }
  window.__jvOpenTasks = openModal;

  function clickedTasksLine(e) {
    var hud = document.getElementById('hudL');
    if (!hud || !hud.contains(e.target)) return false;
    var own = (e.target.textContent || '');
    if (e.target !== hud && /TASKS/i.test(own) && own.length < 40) return true;
    try {
      var r = document.caretRangeFromPoint && document.caretRangeFromPoint(e.clientX, e.clientY);
      if (r && r.startContainer && r.startContainer.nodeType === 3) {
        var txt = r.startContainer.nodeValue || '';
        var off = r.startOffset;
        var start = txt.lastIndexOf('\n', off - 1) + 1;
        var end = txt.indexOf('\n', off);
        if (end === -1) end = txt.length;
        return /TASKS/i.test(txt.slice(start, end));
      }
    } catch (err) {}
    return false;
  }

  document.addEventListener('click', function (e) {
    var btn = document.getElementById('tasksBtn');
    if ((btn && btn.contains(e.target)) || clickedTasksLine(e)) {
      e.preventDefault();
      e.stopPropagation();
      openModal();
    }
  }, true);

  /* ---------- lembrete ao acordar ---------- */
  function findBarBtn(label) {
    var bar = document.getElementById('bar');
    if (!bar) return null;
    var btns = bar.querySelectorAll('button');
    for (var i = 0; i < btns.length; i++) {
      if (btns[i].textContent.trim() === label) return btns[i];
    }
    return null;
  }

  var audioEl = null;
  function showCaption(txt) {
    var c = document.getElementById('caption');
    if (c) c.textContent = txt;
  }
  function clearCaption(txt) {
    var c = document.getElementById('caption');
    if (c && c.textContent === txt) c.textContent = '';
  }
  function fallbackSpeech(txt) {
    try {
      var u = new SpeechSynthesisUtterance(txt);
      u.lang = 'pt-BR';
      u.onend = function () { clearCaption(txt); };
      speechSynthesis.speak(u);
    } catch (e) { setTimeout(function () { clearCaption(txt); }, 6000); }
  }
  async function speak(txt) {
    showCaption(txt);
    try {
      var res = await origFetch(API + '/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: txt, format: 'mp3' })
      });
      if (!res.ok) throw new Error('tts ' + res.status);
      var blob = await res.blob();
      var objUrl = URL.createObjectURL(blob);
      if (audioEl) { try { audioEl.pause(); } catch (e) {} }
      audioEl = new Audio(objUrl);
      audioEl.onended = function () { URL.revokeObjectURL(objUrl); clearCaption(txt); };
      audioEl.onerror = function () { fallbackSpeech(txt); };
      await audioEl.play();
    } catch (e) {
      fallbackSpeech(txt);
    }
  }

  function reminderText() {
    var tasks = load(KEY_TASKS).map(textOf).filter(Boolean);
    var n = tasks.length;
    if (!n) return '';
    var shown = tasks.slice(0, 5).join('; ');
    if (n > 5) shown += '; e mais ' + (n - 5);
    return 'Ah, antes que eu esqueça: você tem ' + n + ' ' +
      (n === 1 ? 'tarefa pendente' : 'tarefas pendentes') + ': ' + shown + '.';
  }

  var wasSleeping = null;
  function checkSleep() {
    var btn = findBarBtn('Dormir');
    if (!btn) return;
    var on = btn.classList.contains('on');
    if (wasSleeping === null) { wasSleeping = on; return; }
    if (wasSleeping && !on) {
      if (load(KEY_TASKS).length >= 1) {
        setTimeout(function () {
          var b = findBarBtn('Dormir');
          if (b && b.classList.contains('on')) return; // voltou a dormir
          var txt = reminderText();
          if (txt) speak(txt);
        }, 3500);
      }
    }
    wasSleeping = on;
  }

  function watchBar() {
    var bar = document.getElementById('bar');
    if (!bar || bar.__jvObs) return;
    bar.__jvObs = true;
    new MutationObserver(checkSleep).observe(bar, {
      attributes: true, attributeFilter: ['class'], subtree: true, childList: true
    });
    checkSleep();
  }

  /* ---------- init ---------- */
  function init() {
    syncHudCounters();
    watchHud();
    watchBar();
    setInterval(function () {
      syncHudCounters();
      watchHud();
      watchBar();
    }, 1500);
    window.addEventListener('storage', syncHudCounters);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
