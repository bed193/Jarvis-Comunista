/* === mod-memoria-tasks.js (v9.0 - Leitura Total + Captura Ampla de Memória & Tarefas) === */
(function () {
  if (window.__jarvisMemTasksV9) return;
  window.__jarvisMemTasksV9 = true;

  const MEM_KEY = 'jarvis_memories';
  const TASK_KEY = 'jarvis_tasks';

  function getList(key) {
    try {
      const d = JSON.parse(localStorage.getItem(key) || '[]');
      return Array.isArray(d) ? d : [];
    } catch { return []; }
  }

  function setList(key, arr) {
    try {
      localStorage.setItem(key, JSON.stringify(arr));
      syncHud();
    } catch (e) {}
  }

  function showToast(msg) {
    const old = document.getElementById('jMemToast');
    if (old) old.remove();
    const t = document.createElement('div');
    t.id = 'jMemToast';
    t.textContent = msg;
    t.style.cssText =
      'position:fixed;top:52px;left:50%;transform:translateX(-50%);' +
      'background:rgba(0,240,255,0.2);border:1px solid #00F0FF;color:#00F0FF;' +
      'padding:4px 12px;border-radius:12px;font-family:monospace;font-size:11px;' +
      'z-index:10000;pointer-events:none;';
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 2600);
  }

  // Sincroniza MEM: X e TASKS: X sem piscar
  let lockingHud = false;
  function syncHud() {
    if (lockingHud) return;
    const hudL = document.getElementById('hudL');
    if (!hudL) return;

    const m = getList(MEM_KEY).length;
    const t = getList(TASK_KEY).length;
    const cur = hudL.innerHTML;
    const next = cur
      .replace(/MEM:\s*\d+/i, `MEM: ${m}`)
      .replace(/TASKS:\s*\d+/i, `TASKS: ${t}`);

    if (next !== cur) {
      lockingHud = true;
      hudL.innerHTML = next;
      lockingHud = false;
    }
  }

  // Detector natural amplo (garante salvamento mesmo se a IA esquecer a tag)
  function captureFromUser(txt) {
    if (!txt || typeof txt !== 'string') return;
    const clean = txt.trim();

    // 1. Concluir tarefa
    const doneMatch = clean.match(
      /(?:conclu[íi]|terminei|j[áa]\s+fiz|finalizei|fechei|risc[ae])\s+(?:a\s+(?:tarefa|atividade)\s+|o\s+compromisso\s+)?(.+)/i
    );
    if (doneMatch && doneMatch[1].length > 2) {
      const key = doneMatch[1].replace(/[.!?]+$/, '').trim().toLowerCase();
      const tasks = getList(TASK_KEY);
      const filtered = tasks.filter(t => !t.toLowerCase().includes(key));
      if (filtered.length < tasks.length) {
        setList(TASK_KEY, filtered);
        showToast('✅ Tarefa concluída!');
      }
      return;
    }

    // 2. Adicionar tarefa / atividade / plano
    const taskMatch = clean.match(
      /(?:anot[ae]\s+(?:a[íi]\s+)?(?:para\s+eu\s+|que\s+eu\s+tenho\s+que\s+|a\s+tarefa\s+|a\s+atividade\s+)?|adicion[ae]\s+(?:na\s+lista\s+|a\s+tarefa\s+|a\s+atividade\s+)?|coloc[ae]\s+(?:na\s+(?:minha\s+)?lista|nas\s+tarefas|nas\s+atividades)\s*:?\s*|me\s+lembr[ae]\s+de\s+|n[ãa]o\s+me\s+deixa\s+esquecer\s+de\s+|nova\s+(?:tarefa|atividade)\s*:?\s*|tenho\s+que\s+fazer\s+|preciso\s+fazer\s+)(.+)/i
    );
    if (taskMatch && taskMatch[1].length > 2) {
      const desc = taskMatch[1].replace(/[.!?]+$/, '').trim();
      const tasks = getList(TASK_KEY);
      if (!tasks.some(x => x.toLowerCase() === desc.toLowerCase())) {
        tasks.push(desc);
        setList(TASK_KEY, tasks);
        showToast(`📌 Salvo: ${desc}`);
      }
      return;
    }

    // 3. Salvar fato na memória (gatilhos naturais amplos)
    const memMatch = clean.match(
      /(?:lembr[ae]\s+que|guard[ae]\s+(?:na\s+mem[óo]ria\s+)?(?:que|isso)?\s*:?\s*|salv[ae]\s+(?:na\s+mem[óo]ria\s+)?(?:que|isso)?\s*:?\s*|memoriz[ae]\s+(?:que|isso)?\s*:?\s*|n[ãa]o\s+esquec[ae]\s+que|meu\s+nome\s+[ée]|eu\s+gosto\s+de|eu\s+moro\s+em|eu\s+trabalho\s+com|eu\s+estudo\s+)(.+)/i
    );
    if (memMatch && memMatch[1].length > 2) {
      let fato = memMatch[1].replace(/[.!?]+$/, '').trim();
      if (/meu\s+nome\s+[ée]/i.test(clean)) fato = `Nome do usuário: ${fato}`;
      else if (/eu\s+gosto\s+de/i.test(clean)) fato = `Gosta de ${fato}`;
      else if (/eu\s+moro\s+em/i.test(clean)) fato = `Mora em ${fato}`;
      else if (/eu\s+trabalho\s+com/i.test(clean)) fato = `Trabalha com ${fato}`;
      else if (/eu\s+estudo/i.test(clean)) fato = `Estuda ${fato}`;

      const mems = getList(MEM_KEY);
      if (!mems.some(x => x.toLowerCase() === fato.toLowerCase())) {
        mems.push(fato);
        setList(MEM_KEY, mems.slice(-30));
        showToast(`💾 Memória: ${fato}`);
      }
    }
  }

  // Intercepta /chat para injetar TODAS as memórias e tarefas reais na IA
  const _fetch = window.fetch;
  window.fetch = async function (input, init) {
    const url = typeof input === 'string' ? input : (input && input.url) || '';

    if (url.includes('/chat') && init && typeof init.body === 'string') {
      try {
        const body = JSON.parse(init.body);
        if (Array.isArray(body.messages)) {
          const lastUser = [...body.messages].reverse().find(m => m.role === 'user');
          if (lastUser) {
            const uTxt = typeof lastUser.content === 'string'
              ? lastUser.content
              : (Array.isArray(lastUser.content) ? (lastUser.content.find(c => c.type === 'text')?.text || '') : '');
            captureFromUser(uTxt);
          }

          const mems = getList(MEM_KEY);
          const tasks = getList(TASK_KEY);

          const contextoReal =
            `\n[BANCO DE DADOS REAL DO USUÁRIO - LEITURA OBRIGATÓRIA]\n` +
            `1. MEMÓRIAS SALVAS (${mems.length} itens): ${mems.length ? mems.map((m, i) => `(${i + 1}) ${m}`).join('; ') : 'Nenhuma memória salva'}.\n` +
            `2. TAREFAS / ATIVIDADES / PLANOS PENDENTES (${tasks.length} itens): ${tasks.length ? tasks.map((t, i) => `(${i + 1}) ${t}`).join('; ') : 'Nenhuma tarefa pendente'}.\n` +
            `INSTRUÇÕES OBRIGATÓRIAS:\n` +
            `- Se o usuário perguntar quais são as tarefas, atividades, pendências ou planos do dia, liste TODOS os ${tasks.length} itens acima sem omitir nenhum. Se estiver vazio, diga que não há tarefas pendentes.\n` +
            `- Se o usuário perguntar o que tem na sua memória ou o que você sabe sobre ele, cite TODOS os ${mems.length} itens da lista de memórias acima, sem esconder nenhum.\n` +
            `- Sempre que o usuário contar qualquer informação pessoal, preferência, rotina, nome, projeto ou pedir para lembrar/guardar algo, adicione no final da resposta: [save: fato curto e objetivo].\n` +
            `- Sempre que o usuário pedir para anotar uma tarefa, plano, lembrete ou atividade, adicione no final: [task_add: descrição curta]. Ao concluir, adicione: [task_done: palavra-chave].\n`;

          const sys = body.messages.find(m => m.role === 'system');
          if (sys && typeof sys.content === 'string') {
            sys.content += contextoReal;
          } else {
            body.messages.unshift({ role: 'system', content: contextoReal });
          }
          init.body = JSON.stringify(body);
        }
      } catch (e) {}
    }

    const res = await _fetch.apply(this, arguments);

    if (url.includes('/chat')) {
      try {
        const data = await res.clone().json();
        const reply = data?.choices?.[0]?.message?.content || data?.reply || data?.text || '';

        for (const m of reply.matchAll(/\[save:\s*([^\]]+)\]/gi)) {
          const fato = m[1].trim();
          const mems = getList(MEM_KEY);
          if (fato && !mems.some(x => x.toLowerCase() === fato.toLowerCase())) {
            mems.push(fato);
            setList(MEM_KEY, mems.slice(-30));
            showToast(`💾 Memória: ${fato}`);
          }
        }

        for (const m of reply.matchAll(/\[task_add:\s*([^\]]+)\]/gi)) {
          const desc = m[1].trim();
          const tasks = getList(TASK_KEY);
          if (desc && !tasks.some(x => x.toLowerCase() === desc.toLowerCase())) {
            tasks.push(desc);
            setList(TASK_KEY, tasks);
            showToast(`📌 Salvo: ${desc}`);
          }
        }

        for (const m of reply.matchAll(/\[task_done:\s*([^\]]+)\]/gi)) {
          const key = m[1].trim().toLowerCase();
          const tasks = getList(TASK_KEY);
          const filtered = tasks.filter(t => !t.toLowerCase().includes(key));
          if (filtered.length < tasks.length) {
            setList(TASK_KEY, filtered);
            showToast('✅ Tarefa concluída!');
          }
        }

        setTimeout(syncHud, 120);
      } catch (e) {}
    }

    return res;
  };

  setTimeout(() => {
    const hudL = document.getElementById('hudL');
    if (hudL) {
      syncHud();
      new MutationObserver(syncHud).observe(hudL, { childList: true, subtree: true, characterData: true });
    }
  }, 400);
})();
      
