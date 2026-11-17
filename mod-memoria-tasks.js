/* =========================================================
 * mod-memoria-tasks.js  (Jarvis v1.9 - rev 2)
 * Memória (jarvis_memories) + Tarefas (jarvis_tasks)
 *  - Detecção por INTENÇÃO na fala do usuário (sem comando exato)
 *  - Tags [save:] [task_add:] [task_done:] da IA continuam valendo
 *  - Contadores MEM / TASKS no #hudL
 *  - Modal de tarefas (#tasksBtn ou linha TASKS do #hudL)
 *  - Lembrete falado ao acordar do modo Dormir
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

  function log() {
    try { console.log.apply(console, ['[jv-mem]'].concat([].slice.call(arguments))); } catch (e) {}
  }

  /* ================= storage ================= */
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

  /* ================= utilidades de texto ================= */
  function stripAcc(s) { return s.normalize('NFD').replace(/[\u0300-\u036f]/g, ''); }
  function keyOf(s) {
    return stripAcc(String(s || '')).toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
  }
  function toks(k) { return k.split(' ').filter(function (t) { return t.length > 2; }); }
  function similar(a, b) {
    var ka = keyOf(textOf(a)), kb = keyOf(textOf(b));
    if (!ka || !kb) return false;
    if (ka === kb) return true;
    if (ka.length >= 6 && kb.length >= 6 && (ka.indexOf(kb) > -1 || kb.indexOf(ka) > -1)) return true;
    var ta = toks(ka), tb = toks(kb);
    if (!ta.length || !tb.length) return false;
    var inter = 0;
    ta.forEach(function (t) { if (tb.indexOf(t) > -1) inter++; });
    return inter / (ta.length + tb.length - inter) >= 0.6;
  }
  function cap(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; }
  function cleanTail(s) {
    s = String(s || '').replace(/\s+/g, ' ');
    s = s.replace(/(?<![\wÀ-ÿ])(?:por favor|pra mim|para mim|jarvis)(?![\wÀ-ÿ])/gi, '');
    return s.replace(/\s+/g, ' ').replace(/^[\s,:\-]+|[\s,:\-]+$/g, '').trim();
  }
  function normTask(s) {
    s = cleanTail(s);
    s = s.replace(/^(?:eu\s+)?(?:tenho\s+que|preciso(?:\s+de)?|vou\s+ter\s+que|devo|que\s+eu|que)\s+/i, '');
    s = s.replace(/^(?:de|para|pra)\s+/i, '');
    s = cleanTail(s);
    if (s.length > 100) s = s.slice(0, 100).trim();
    return cap(s);
  }
  function normFact(s) {
    s = cleanTail(s).replace(/^(?:que\s+)?eu\s+/i, '');
    if (s.length > 100) s = s.slice(0, 100).trim();
    return cap(s);
  }

  /* ================= operações ================= */
  function addMemory(fact) {
    fact = normFact(fact);
    if (fact.length < 3) return false;
    var mem = load(KEY_MEM);
    if (/^nome:/i.test(fact)) {
      mem = mem.filter(function (m) { return !/^nome:/i.test(textOf(m)); });
    } else if (mem.some(function (m) { return similar(m, fact); })) {
      return false;
    }
    mem.push(fact);
    if (mem.length > MAX_MEM) mem = mem.slice(-MAX_MEM);
    save(KEY_MEM, mem);
    return fact;
  }
  function addTask(desc) {
    desc = normTask(desc);
    if (desc.length < 3) return false;
    var tasks = load(KEY_TASKS);
    if (tasks.some(function (t) { return similar(t, desc); })) return false;
    tasks.push(desc);
    if (tasks.length > MAX_TASKS) tasks = tasks.slice(-MAX_TASKS);
    save(KEY_TASKS, tasks);
    return desc;
  }
  function removeTasksByKeyword(kw) {
    var k = keyOf(kw);
    if (!k) return [];
    var tasks = load(KEY_TASKS), removed = [];
    var kept = tasks.filter(function (t) {
      var hit = keyOf(textOf(t)).indexOf(k) !== -1;
      if (hit) removed.push(textOf(t));
      return !hit;
    });
    if (removed.length) save(KEY_TASKS, kept);
    return removed;
  }

  /* ---- concluir por frase natural ("já comprei o pão") ---- */
  var STOPW = ' de da do das dos pra para que eu ja com uma um uns umas as os foi tinha minha meu nao mais muito fiz conclui terminei finalizei resolvi completei acabei feito pronto tarefa acabou terminado e o a ';
  function sharedStem(a, b) {
    if (a === b) return true;
    var m = Math.min(a.length, b.length), cp = 0;
    while (cp < m && a.charAt(cp) === b.charAt(cp)) cp++;
    return cp >= 3 && cp >= m - 3;
  }
  function completeBySentence(sentence) {
    var st = toks(keyOf(sentence)).filter(function (t) { return STOPW.indexOf(' ' + t + ' ') === -1; });
    if (!st.length) return null;
    var tasks = load(KEY_TASKS), best = -1, bestScore = 0, tie = false;
    tasks.forEach(function (t, i) {
      var tt = toks(keyOf(textOf(t))), score = 0;
      st.forEach(function (s) { if (tt.some(function (x) { return sharedStem(s, x); })) score++; });
      if (score > bestScore) { bestScore = score; best = i; tie = false; }
      else if (score === bestScore && score > 0) tie = true;
    });
    if (best < 0 || tie) return null;
    var removed = tasks.splice(best, 1)[0];
    save(KEY_TASKS, tasks);
    return textOf(removed);
  }

  /* ================= extração por intenção ================= */
  var TASK_RES = [
    /(?<![\wÀ-ÿ])(?:anota|anote|adiciona|adicione|coloca|bota|põe|cria|crie|registra)\s+(?:aí\s+|ai\s+)?(?:uma?\s+|na\s+minha\s+)?(?:nova\s+)?(?:tarefa|lembrete|compromisso|pendência|pendencia)(?:\s+(?:na\s+(?:minha\s+)?lista|pra\s+mim|para\s+mim))?\s*(?:de|para|pra|que|:|-|,)?\s*(.+)/i,
    /(?<![\wÀ-ÿ])(?:põe|poe|bota|coloca|adiciona|adicione|inclui|inclua)\s+(.+?)\s+(?:na|em|à)\s+(?:minha\s+)?(?:lista|agenda|tarefas)(?![\wÀ-ÿ])/i,
    /(?<![\wÀ-ÿ])(?:me\s+)?(?:lembra|lembre|lembrar)(?:\s+me)?\s+(?:de|do|da|para|pra)\s+(.+)/i,
    /(?<![\wÀ-ÿ])tarefa\s*[:\-]\s*(.+)/i,
    /(?<![\wÀ-ÿ])(?:anota|anote)\s+(?:aí|ai)?\s*[:,\-]?\s*(?!que(?![\wÀ-ÿ]))(.{3,})/i,
    /(?<![\wÀ-ÿ])(?:eu\s+)?tenho\s+que\s+(.+)/i,
    /(?<![\wÀ-ÿ])(?:eu\s+)?preciso\s+(?!de\s+(?:ajuda|um\s+favor|saber|você|voce|que)(?![\wÀ-ÿ]))(?:de\s+)?([a-zçãõáéíóúâêô]+r(?![\wÀ-ÿ]).*)/i,
    /(?<![\wÀ-ÿ])não\s+(?:posso|vou|quero)\s+esquecer\s+(?:de|que)\s+(.+)/i,
    /(?<![\wÀ-ÿ])(?:tenho|marquei|agendei|vou\s+ter)\s+(?:uma?\s+)?((?:reunião|reuniao|consulta|prova|entrevista|compromisso|dentista|médico|medico|aula|treino|pagamento|boleto)(?![\wÀ-ÿ]).*)/i
  ];
  var DONE_RE = /(?<![\wÀ-ÿ])(?:j[áa]\s+)?(?:conclu[ií]|terminei|finalizei|completei|resolvi|acabei\s+de|fiz|comprei|liguei|paguei|enviei|mandei|lavei|estudei|entreguei|resolvido|feito|pronto)(?![\wÀ-ÿ])/i;
  var TASKISH = /^(?:eu\s+)?(?:tenho\s+que|preciso|devo|vou\s+ter\s+que|tenho\s+(?:uma?\s+)?(?:reuni|consulta|prova|entrevista|compromisso))/i;

  var MEM_NOUNS = 'cor|comida|time|banda|música|musica|filme|série|serie|jogo|esporte|signo|cidade|carro|moto|cachorro|gato|pet|mãe|mae|pai|irmão|irmao|irmã|irma|namorada|namorado|esposa|marido|filho|filha|chefe|trabalho|curso|faculdade|escola|profissão|profissao|apelido|celular|bebida|lanche|hobby|time de futebol';
  var NAME_STOP = ' e mas que eu tenho moro sou gosto pra para tambem também ';

  function extract(text) {
    var res = { mem: [], tasks: [], done: [] };
    var sentences = String(text || '').match(/[^.!?;\n]+[.!?;\n]*/g) || [];
    sentences.forEach(function (raw) {
      var s = raw.replace(/[.!?;\n]+$/, '').trim();
      if (s.length < 4) return;
      var isQuestion = /\?/.test(raw);
      var m, gotTask = false;

      /* ---- tarefas (primeira regra que casar) ---- */
      for (var i = 0; i < TASK_RES.length; i++) {
        m = s.match(TASK_RES[i]);
        if (m && m[1]) { res.tasks.push(m[1]); gotTask = true; break; }
      }

      if (isQuestion) return; // perguntas não geram memória/conclusão

      /* ---- concluir ---- */
      if (!gotTask && DONE_RE.test(s)) res.done.push(s);

      /* ---- memória explícita: "lembra/guarda/anota que ..." ---- */
      m = s.match(/(?<![\wÀ-ÿ])(?:lembra|lembre|lembrar|guarda|guarde|guardar|anota|anote|salva|salve|memoriza|memorize|grava|grave|não\s+esquece|nao\s+esquece|não\s+esqueça|nao\s+esqueca|fica\s+sabendo|saiba)\s+(?:aí\s+|ai\s+)?(?:disso\s+)?que\s+(.+)/i);
      if (m) {
        if (TASKISH.test(m[1].trim())) { if (!gotTask) res.tasks.push(m[1]); }
        else res.mem.push(m[1]);
      }

      /* ---- nome ---- */
      m = s.match(/(?<![\wÀ-ÿ])(?:meu\s+nome\s+(?:é|e)|me\s+chamo|pode\s+me\s+chamar\s+de|meu\s+apelido\s+(?:é|e))\s+(.+)/i);
      if (m) {
        var w = m[1].trim().split(/\s+/), name = [];
        for (var j = 0; j < w.length && name.length < 2; j++) {
          if (NAME_STOP.indexOf(' ' + w[j].toLowerCase() + ' ') !== -1) break;
          name.push(w[j].replace(/[,]/g, ''));
        }
        if (name.length) res.mem.push('Nome: ' + name.map(cap).join(' '));
      }

      /* ---- gostos ---- */
      m = s.match(/(?<![\wÀ-ÿ])eu\s+(gosto|amo|adoro|curto|odeio|detesto|prefiro)\s+(?:muito\s+)?(?:de\s+|do\s+|da\s+|dos\s+|das\s+)?(.+)/i);
      if (m) {
        var v = m[1].toLowerCase();
        var pre = /odeio|detesto/.test(v) ? 'Não gosta de ' : v === 'prefiro' ? 'Prefere ' : 'Gosta de ';
        res.mem.push(pre + m[2]);
      }

      /* ---- favoritos ---- */
      m = s.match(/(?<![\wÀ-ÿ])(?:meu|minha|meus|minhas)\s+(.{2,30}?)\s+(?:favorit[oa]s?|preferid[oa]s?)\s+(?:é|e|são|sao)\s+(.+)/i);
      if (m) res.mem.push(cap(m[1]) + ' favorito: ' + m[2]);

      /* ---- moradia / trabalho / estudo ---- */
      m = s.match(/(?<![\wÀ-ÿ])(?:eu\s+)?(moro|trabalho|estudo|nasci|cresci)\s+((?:em|no|na|com|de|numa?|pra)\s+.+)/i);
      if (m) {
        var map = { moro: 'Mora ', trabalho: 'Trabalha ', estudo: 'Estuda ', nasci: 'Nasceu ', cresci: 'Cresceu ' };
        res.mem.push(map[m[1].toLowerCase()] + m[2]);
      }

      /* ---- idade / aniversário ---- */
      m = s.match(/(?<![\wÀ-ÿ])(?:eu\s+)?tenho\s+(\d{1,2})\s+anos(?![\wÀ-ÿ])/i);
      if (m) res.mem.push('Idade: ' + m[1] + ' anos');
      m = s.match(/(?<![\wÀ-ÿ])meu\s+(?:aniversário|aniversario)\s+(?:é|e)\s+(.+)/i);
      if (m) res.mem.push('Aniversário: ' + m[1]);

      /* ---- "meu/minha X é Y" (lista segura de substantivos) ---- */
      m = s.match(new RegExp('(?<![\\wÀ-ÿ])(?:meu|minha)\\s+(' + MEM_NOUNS + ')\\s+(?:é|e)\\s+(?!favorit)(.{2,60})', 'i'));
      if (m) res.mem.push(cap(m[1]) + ': ' + m[2]);

      /* ---- "eu sou ..." (só perfis claros) ---- */
      m = s.match(/(?<![\wÀ-ÿ])eu\s+sou\s+(alérgic[oa]\s+a\s+.+|alergic[oa]\s+a\s+.+|vegetarian[oa]|vegan[oa]|canhot[oa]|estudante.*|[a-zç]+dor(?:a)?(?![\wÀ-ÿ])|[a-zç]+eiro(?:a)?(?![\wÀ-ÿ])|[a-zç]+ista(?![\wÀ-ÿ]))/i);
      if (m) res.mem.push('É ' + m[1]);
    });
    return res;
  }

  /* aplica a extração e devolve resumo do que foi registrado */
  function applyExtraction(res) {
    var sum = { mem: [], tasks: [], done: [] };
    res.mem.forEach(function (f) { var r = addMemory(f); if (r) sum.mem.push(r); });
    res.tasks.forEach(function (t) { var r = addTask(t); if (r) sum.tasks.push(r); });
    res.done.forEach(function (s) { var r = completeBySentence(s); if (r) sum.done.push(r); });
    return sum;
  }

  /* ================= tags da IA ================= */
  var aiSummary = { mem: [], tasks: [], done: [] };
  var wakeTagSeen = false;

  function processText(s) {
    if (typeof s !== 'string' || s.indexOf('[') === -1) return s;
    if (/\[wakeup\]/i.test(s)) wakeTagSeen = true;
    var out = s;
    out = out.replace(/\[save:\s*([^\]]+)\]/gi, function (_, v) {
      var r = addMemory(v); if (r) aiSummary.mem.push(r); return '';
    });
    out = out.replace(/\[task_add:\s*([^\]]+)\]/gi, function (_, v) {
      var r = addTask(v); if (r) aiSummary.tasks.push(r); return '';
    });
    out = out.replace(/\[task_done:\s*([^\]]+)\]/gi, function (_, v) {
      var r = removeTasksByKeyword(v); if (r.length) aiSummary.done = aiSummary.done.concat(r); return '';
    });
    if (out !== s) out = out.replace(/[ \t]{2,}/g, ' ').trim();
    return out;
  }
  function walk(node) {
    if (node == null) return node;
    if (typeof node === 'string') return processText(node);
    if (Array.isArray(node)) { for (var i = 0; i < node.length; i++) node[i] = walk(node[i]); return node; }
    if (typeof node === 'object') Object.keys(node).forEach(function (k) { node[k] = walk(node[k]); });
    return node;
  }

  /* ================= prompt ================= */
  var RULES =
    'REGRAS DE MEMÓRIA E TAREFAS:\n' +
    'Entenda a INTENÇÃO do usuário mesmo que ele não use comandos exatos.\n' +
    '1) Nome, preferência, gosto, rotina ou qualquer dado pessoal duradouro (mesmo dito de passagem) -> inclua [save: fato curto em 3ª pessoa, ex: Gosta de café].\n' +
    '2) Algo que o usuário precisa/quer fazer, compromisso, lembrete -> inclua [task_add: ação curta no infinitivo, ex: Comprar pão amanhã]. NUNCA copie a frase literal: sem "eu", "tenho que", "me lembra".\n' +
    '3) Usuário disse que concluiu algo da lista -> inclua [task_done: palavra-chave].\n' +
    '4) Se o sistema informar que JÁ registrou algo nesta mensagem, NÃO repita a tag; apenas confirme de forma natural e curta.\n' +
    '5) NUNCA diga que salvou/anotou sem incluir a tag correspondente ou sem o sistema ter registrado.';

  function buildContext(note) {
    var mem = load(KEY_MEM).map(textOf).filter(Boolean);
    var tasks = load(KEY_TASKS).map(textOf).filter(Boolean);
    var s = '\n\n--- MEMÓRIA DO USUÁRIO ---\n';
    s += mem.length ? mem.map(function (m) { return '- ' + m; }).join('\n') : '(nenhum fato salvo)';
    s += '\n\n--- TAREFAS PENDENTES ---\n';
    s += tasks.length ? tasks.map(function (t) { return '- ' + t; }).join('\n') : '(nenhuma tarefa pendente)';
    if (note) s += '\n\n' + note;
    s += '\n\n' + RULES;
    return s;
  }
  function sysNote(sum) {
    var p = [];
    if (sum.mem.length) p.push('memória salva: ' + sum.mem.join(' | '));
    if (sum.tasks.length) p.push('tarefa adicionada: ' + sum.tasks.join(' | '));
    if (sum.done.length) p.push('tarefa concluída/removida: ' + sum.done.join(' | '));
    return p.length ? 'O SISTEMA JÁ REGISTROU AUTOMATICAMENTE NESTA MENSAGEM -> ' + p.join('; ') + '.' : '';
  }

  function injectSystem(payload, note) {
    if (!payload || !Array.isArray(payload.messages)) return payload;
    var extra = buildContext(note), sys = null;
    for (var i = 0; i < payload.messages.length; i++) {
      if (payload.messages[i] && payload.messages[i].role === 'system') { sys = payload.messages[i]; break; }
    }
    if (!sys) payload.messages.unshift({ role: 'system', content: extra.trim() });
    else if (typeof sys.content === 'string') sys.content += extra;
    else if (Array.isArray(sys.content)) sys.content.push({ type: 'text', text: extra });
    else sys.content = extra.trim();
    return payload;
  }

  var lastUserText = '', lastSummary = null;
  function lastUserMessage(payload) {
    if (!payload || !Array.isArray(payload.messages)) return '';
    for (var i = payload.messages.length - 1; i >= 0; i--) {
      var m = payload.messages[i];
      if (m && m.role === 'user') {
        if (typeof m.content === 'string') return m.content;
        if (Array.isArray(m.content)) {
          return m.content.map(function (p) { return (p && (p.text || '')) || ''; }).join(' ');
        }
        return '';
      }
    }
    return '';
  }

  /* ================= fetch ================= */
  var origFetch = window.fetch.bind(window);
  function urlOf(input) {
    try { return typeof input === 'string' ? input : (input && input.url) ? input.url : String(input); }
    catch (e) { return ''; }
  }
  function isChat(url) { return /\/chat(\/|\?|#|$)/.test(url.split('://').pop().replace(/^[^\/]*/, '')); }

  window.fetch = async function (input, init) {
    var url = urlOf(input);
    var method = ((init && init.method) || (input && input.method) || 'GET').toUpperCase();
    if (method !== 'POST' || !isChat(url)) return origFetch(input, init);

    var args = [input, init];
    try {
      var bodyText = null;
      if (init && typeof init.body === 'string') bodyText = init.body;
      else if (!(init && init.body) && typeof Request !== 'undefined' && input instanceof Request) {
        bodyText = await input.clone().text();
      }
      if (bodyText) {
        var payload = JSON.parse(bodyText);
        var ut = lastUserMessage(payload), sum = { mem: [], tasks: [], done: [] };
        if (ut && ut !== lastUserText) {
          lastUserText = ut;
          sum = applyExtraction(extract(ut));
          lastSummary = sum;
          if (sum.mem.length || sum.tasks.length || sum.done.length) { syncHudCounters(); toastSummary(sum); }
        } else if (ut && lastSummary) {
          sum = lastSummary;
        }
        var newBody = JSON.stringify(injectSystem(payload, sysNote(sum)));
        args = (init && typeof init.body === 'string')
          ? [input, Object.assign({}, init, { body: newBody })]
          : [new Request(input, { body: newBody }), init];
      }
    } catch (e) { log('inject erro', e); args = [input, init]; }

    var res = await origFetch(args[0], args[1]);

    try {
      var ct = (res.headers.get('content-type') || '').toLowerCase();
      if (ct.indexOf('event-stream') !== -1) return res;
      var raw = await res.clone().text();
      aiSummary = { mem: [], tasks: [], done: [] };
      wakeTagSeen = false;
      var parsed = null, outText;
      try { parsed = JSON.parse(raw); } catch (e) { parsed = null; }
      outText = (parsed !== null && typeof parsed === 'object') ? JSON.stringify(walk(parsed)) : processText(raw);
      if (aiSummary.mem.length || aiSummary.tasks.length || aiSummary.done.length) {
        syncHudCounters(); toastSummary(aiSummary);
      }
      if (wakeTagSeen) scheduleReminder();
      if (outText === raw) return res;
      var headers = new Headers(res.headers);
      headers.delete('content-length'); headers.delete('content-encoding');
      return new Response(outText, { status: res.status, statusText: res.statusText, headers: headers });
    } catch (e) { return res; }
  };

  /* ================= toast ================= */
  var toastTimer = 0;
  function toast(msg) {
    var el = document.getElementById('jv-toast');
    if (!el) {
      el = document.createElement('div');
      el.id = 'jv-toast';
      el.style.cssText = 'position:fixed;top:12px;left:50%;transform:translateX(-50%);z-index:99998;max-width:90vw;' +
        'background:#07060dee;border:1px solid #b026ff;color:#e8d9ff;padding:7px 12px;border-radius:4px;' +
        'font:12px monospace;letter-spacing:1px;box-shadow:0 0 12px #b026ff88;pointer-events:none;transition:opacity .25s';
      document.body.appendChild(el);
    }
    el.textContent = msg; el.style.opacity = '1';
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.style.opacity = '0'; }, 2800);
  }
  function toastSummary(sum) {
    var p = [];
    if (sum.mem.length) p.push('MEMÓRIA: ' + sum.mem[0]);
    if (sum.tasks.length) p.push('TAREFA: ' + sum.tasks[0]);
    if (sum.done.length) p.push('CONCLUÍDA: ' + sum.done[0]);
    if (p.length) toast(p.join('  |  '));
  }

  /* ================= HUD ================= */
  function setCount(text, label, n) {
    return text.replace(new RegExp('(' + label + '\\s*[:=]?\\s*)\\d+', 'gi'), '$1' + n);
  }
  function syncHudCounters() {
    var hud = document.getElementById('hudL');
    if (!hud) return;
    var m = load(KEY_MEM).length, t = load(KEY_TASKS).length;
    var walker = document.createTreeWalker(hud, NodeFilter.SHOW_TEXT, null), nodes = [], n;
    while ((n = walker.nextNode())) nodes.push(n);
    nodes.forEach(function (tn) {
      var v = tn.nodeValue, nv = setCount(setCount(v, 'MEM', m), 'TASKS', t);
      if (nv !== v) { tn.nodeValue = nv; return; }
      if (/^\s*\d+\s*$/.test(v)) {
        var el = tn.parentElement;
        while (el && el !== hud) {
          var mm = el.textContent.trim().match(/^(MEM|TASKS)\s*[:=]?\s*\d+$/i);
          if (mm) {
            var target = mm[1].toUpperCase() === 'MEM' ? m : t;
            if (String(target) !== v.trim()) tn.nodeValue = String(target);
            break;
          }
          el = el.parentElement;
        }
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

  /* sincroniza imediatamente quando QUALQUER código grava as chaves */
  try {
    var _set = Storage.prototype.setItem;
    Storage.prototype.setItem = function (k) {
      var r = _set.apply(this, arguments);
      if (k === KEY_MEM || k === KEY_TASKS) setTimeout(syncHudCounters, 0);
      return r;
    };
  } catch (e) {}

  /* ================= modal de tarefas ================= */
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
      '#jv-tasks-modal .jv-add,#jv-tasks-modal .jv-t{background:#b026ff;border:0;color:#fff;padding:0 12px;border-radius:3px;cursor:pointer;font-family:monospace}' +
      '#jv-tasks-modal .jv-t{background:transparent;border:1px solid #b026ff;color:#d28bff;font-size:11px;padding:4px 8px}' +
      '#jv-tasks-modal .jv-f{padding:0 14px 10px;display:flex;justify-content:flex-end}';
    document.head.appendChild(st);
  }
  function renderModal() {
    if (!modal) return;
    var list = modal.querySelector('.jv-l');
    list.textContent = '';
    var tasks = load(KEY_TASKS);
    if (!tasks.length) {
      var e = document.createElement('div');
      e.className = 'jv-e'; e.textContent = 'Nenhuma tarefa pendente.';
      list.appendChild(e);
    }
    tasks.forEach(function (t, i) {
      var row = document.createElement('div'); row.className = 'jv-r';
      var sp = document.createElement('span'); sp.textContent = textOf(t);
      var b = document.createElement('button'); b.className = 'jv-ok'; b.textContent = '[✓]';
      b.addEventListener('click', function () {
        var cur = load(KEY_TASKS); cur.splice(i, 1); save(KEY_TASKS, cur);
        syncHudCounters(); renderModal();
      });
      row.appendChild(sp); row.appendChild(b); list.appendChild(row);
    });
    modal.querySelector('.jv-hc').textContent = 'TAREFAS [' + tasks.length + ']';
  }
  function closeModal() { if (modal) { modal.remove(); modal = null; } }
  function openModal() {
    if (modal) return;
    css();
    modal = document.createElement('div');
    modal.id = 'jv-tasks-modal';
    modal.innerHTML =
      '<div class="jv-p"><div class="jv-h"><span class="jv-hc"></span><button class="jv-x" type="button">✕</button></div>' +
      '<div class="jv-l"></div>' +
      '<div class="jv-a"><input type="text" placeholder="+ Nova tarefa" maxlength="120"><button class="jv-add" type="button">ADD</button></div>' +
      '<div class="jv-f"><button class="jv-t" type="button">🔊 TESTAR LEMBRETE</button></div></div>';
    document.body.appendChild(modal);
    var input = modal.querySelector('input');
    function add() {
      var v = input.value.trim();
      if (!v) return;
      addTask(v); input.value = ''; syncHudCounters(); renderModal();
    }
    modal.querySelector('.jv-add').addEventListener('click', add);
    modal.querySelector('.jv-t').addEventListener('click', function () {
      var t = reminderText();
      if (t) speak(t); else toast('Sem tarefas pendentes para lembrar.');
    });
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
    var own = e.target.textContent || '';
    if (e.target !== hud && /TASKS/i.test(own) && own.length < 40) return true;
    try {
      var r = document.caretRangeFromPoint && document.caretRangeFromPoint(e.clientX, e.clientY);
      if (r && r.startContainer && r.startContainer.nodeType === 3) {
        var txt = r.startContainer.nodeValue || '', off = r.startOffset;
        var start = txt.lastIndexOf('\n', off - 1) + 1, end = txt.indexOf('\n', off);
        if (end === -1) end = txt.length;
        return /TASKS/i.test(txt.slice(start, end));
      }
    } catch (err) {}
    return false;
  }
  document.addEventListener('click', function (e) {
    var btn = document.getElementById('tasksBtn');
    if ((btn && btn.contains(e.target)) || clickedTasksLine(e)) {
      e.preventDefault(); e.stopPropagation(); openModal();
    }
  }, true);

  /* ================= fala / lembrete ================= */
  var audioEl = null;
  function showCaption(txt) { var c = document.getElementById('caption'); if (c) c.textContent = txt; }
  function clearCaption(txt) { var c = document.getElementById('caption'); if (c && c.textContent === txt) c.textContent = ''; }
  function fallbackSpeech(txt) {
    try {
      var u = new SpeechSynthesisUtterance(txt);
      u.lang = 'pt-BR'; u.onend = function () { clearCaption(txt); };
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
      var objUrl = URL.createObjectURL(await res.blob());
      if (audioEl) { try { audioEl.pause(); } catch (e) {} }
      audioEl = new Audio(objUrl);
      audioEl.onended = function () { URL.revokeObjectURL(objUrl); clearCaption(txt); };
      audioEl.onerror = function () { fallbackSpeech(txt); };
      await audioEl.play();
    } catch (e) { log('tts falhou, usando speechSynthesis', e); fallbackSpeech(txt); }
  }
  function reminderText() {
    var tasks = load(KEY_TASKS).map(textOf).filter(Boolean), n = tasks.length;
    if (!n) return '';
    var shown = tasks.slice(0, 5).join('; ');
    if (n > 5) shown += '; e mais ' + (n - 5);
    return 'Ah, antes que eu esqueça: você tem ' + n + ' ' + (n === 1 ? 'tarefa pendente' : 'tarefas pendentes') + ': ' + shown + '.';
  }

  /* ---- detecção de estado "dormindo" ---- */
  var sleepBtn = null;
  function findSleepBtn() {
    if (sleepBtn && document.contains(sleepBtn)) return sleepBtn;
    var bar = document.getElementById('bar');
    if (!bar) return null;
    var btns = bar.querySelectorAll('button');
    for (var i = 0; i < btns.length; i++) {
      var t = btns[i].textContent.trim();
      if (t === 'Dormir' || /^dorm/i.test(t)) { sleepBtn = btns[i]; return sleepBtn; }
    }
    return null;
  }
  function isSleeping() {
    var b = findSleepBtn();
    if (b && b.classList.contains('on')) return true;
    var bc = document.body ? document.body.className : '';
    return /(^|\s)(sleep|sleeping|dormindo|standby-sleep)(\s|$)/i.test(String(bc));
  }

  var lastReminder = 0, wasSleeping = null;
  function scheduleReminder() {
    if (Date.now() - lastReminder < 15000) return;
    lastReminder = Date.now();
    if (!load(KEY_TASKS).length) return;
    log('lembrete agendado (3.5s)');
    setTimeout(function () {
      if (isSleeping()) return;
      var txt = reminderText();
      if (txt) speak(txt);
    }, 3500);
  }
  function checkSleep() {
    if (!findSleepBtn()) return;
    var now = isSleeping();
    if (wasSleeping === null) { wasSleeping = now; return; }
    if (wasSleeping && !now) scheduleReminder();
    wasSleeping = now;
  }

  /* ================= init ================= */
  window.__jvDebug = function () {
    return { mem: load(KEY_MEM), tasks: load(KEY_TASKS), sleeping: isSleeping(), sleepBtn: !!findSleepBtn(), hud: (document.getElementById('hudL') || {}).textContent };
  };
  window.__jvTestReminder = function () { var t = reminderText(); if (t) speak(t); return t; };

  function init() {
    syncHudCounters(); watchHud(); checkSleep();
    setInterval(function () { syncHudCounters(); watchHud(); }, 1500);
    setInterval(checkSleep, 400);
    window.addEventListener('storage', syncHudCounters);
    log('módulo carregado');
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
