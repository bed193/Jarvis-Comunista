/* === mod-memoria-tasks.js (v7.0 - Sync Sem Pisca + Injeção Real no /chat) === */
(function () {
  if (window.__jarvisMemTasksV7) return;
  window.__jarvisMemTasksV7 = true;

  const MEM_KEY = 'jarvis_memories';
  const TASK_KEY = 'jarvis_tasks';

  function getMem() {
    try {
      const d = JSON.parse(localStorage.getItem(MEM_KEY) || '[]');
      return Array.isArray(d) ? d : [];
    } catch { return []; }
  }

  function saveMem(arr) {
    localStorage.setItem(MEM_KEY, JSON.stringify(arr.slice(-30)));
    syncHud();
  }

  function getTasks() {
    try {
      const d = JSON.parse(localStorage.getItem(TASK_KEY) || '[]');
      return Array.isArray(d) ? d : [];
    } catch { return []; }
  }

  function saveTasks(arr) {
    localStorage.setItem(TASK_KEY, JSON.stringify(arr));
    syncHud();
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

  // Sincroniza #hudL instantaneamente via MutationObserver (zero pisca-pisca)
  let isSyncing = false;
  function syncHud() {
    if (isSyncing) return;
    const hudL = document.getElementById('hudL');
    if (!hudL) return;

    const mCount = getMem().length;
    const tCount = getTasks().length;
    const cur = hudL.innerHTML;
    const next = cur
      .replace(/MEM:\s*\d+/i, `MEM: ${mCount}`)
      .replace(/TASKS:\s*\d+/i, `TASKS: ${tCount}`);

    if (next !== cur) {
      isSyncing = true;
      hudL.innerHTML = next;
      isSyncing = false;
    }
  }

  // Captura direta pela fala do usuário (garantia dupla)
  function captureFromUserText(txt) {
    if (!txt || typeof txt !== 'string') return;
    const clean = txt.trim();

    // 1. Concluir tarefa/atividade
    const doneMatch = clean.match(
      /(?:conclu[íi]|terminei|j[áa]\s+fiz|finalizei|fechei)\s+(?:a\s+(?:tarefa|atividade)\s+|o\s+compromisso\s+)?(.+)/i
    );
    if (doneMatch && doneMatch[1].length > 2) {
      const key = doneMatch[1].replace(/[.!?]+$/, '').trim().toLowerCase();
      let tasks = getTasks();
      const before = tasks.length;
      tasks = tasks.filter(t => !t.toLowerCase().includes(key));
      if (tasks.length < before) {
        saveTasks(tasks);
        showToast('✅ Atividade concluída!');
      }
      return;
    }

    // 2. Adicionar tarefa/atividade
    const taskMatch = clean.match(
      /(?:anot[ae]\s+(?:a[íi]\s+)?(?:para\s+eu\s+|que\s+eu\s+tenho\s+que\s+|a\s+tarefa\s+|a\s+atividade\s+)?|adicion[ae]\s+(?:na\s+lista\s+|a\s+tarefa\s+|a\s+atividade\s+)?|coloc[ae]\s+(?:na\s+(?:minha\s+)?lista|nas\s+tarefas|nas\s+atividades)\s*:?\s*|me\s+lembr[ae]\s+de\s+|n[ãa]o\s+me\s+deixa\s+esquecer\s+de\s+|nova\s+(?:tarefa|atividade)\s*:?\s*|tenho\s+que\s+fazer\s+|preciso\s+fazer\s+)(.+)/i
    );
    if (taskMatch && taskMatch[1].length > 2) {
      const desc = taskMatch[1].replace(/[.!?]+$/, '').trim();
      const tasks = getTasks();
      if (!tasks.some(x => x.toLowerCase() === desc.toLowerCase())) {
        tasks.push(desc);
        saveTasks(tasks);
        showToast(`📌 Atividade: ${desc}`);
      }
      return;
    }

    // 3. Salvar fato na memória
    const memMatch = clean.match(
      /(?:lembr[ae]\s+que|guard[ae]\s+(?:na\s+mem[óo]ria\s+)?que|salv[ae]\s+(?:na\s+mem[óo]ria\s+)?que|memoriz[ae]\s+que|meu\s+nome\s+[ée])\s+(.+)/i
    );
    if (memMatch && memMatch[1].length > 2) {
      const fato = clean.match(/meu\s+nome\s+[ée]/i)
        ? `Nome do usuário: ${memMatch[1].replace(/[.!?]+$/, '').trim()}`
        : memMatch[1].replace(/[.!?]+$/, '').trim();
      const mems = getMem();
      if (!mems.some(x => x.toLowerCase() === fato.toLowerCase())) {
        mems.push(fato);
        saveMem(mems);
        showToast(`💾 Memória: ${fato}`);
      }
    }
  }

  // Processa tags retornadas pela IA
  function processAITags(raw) {
    if (!raw || typeof raw !== 'string') return;

    for (const m of raw.matchAll(/\[save:\s*([^\]]+)\]/gi)) {
      const fato = m[1].trim();
      const mems = getMem();
      if (fato && !mems.some(x => x.toLowerCase() === fato.toLowerCase())) {
        mems.push(fato);
        saveMem(mems);
        showToast(`💾 Memória: ${fato}`);
      }
    }

    for (const m of raw.matchAll(/\[task_add:\s*([^\]]+)\]/gi)) {
      const desc = m[1].trim();
      const tasks = getTasks();
      if (desc && !tasks.some(x => x.toLowerCase() === desc.toLowerCase())) {
        tasks.push(desc);
        saveTasks(tasks);
        showToast(`📌 Atividade: ${desc}`);
      }
    }

    for (const m of raw.matchAll(/\[task_done:\s*([^\]]+)\]/gi)) {
      const key = m[1].trim().toLowerCase();
      let tasks = getTasks();
      const before = tasks.length;
      tasks = tasks.filter(t => !t.toLowerCase().includes(key));
      if (tasks.length < before) {
        saveTasks(tasks);
        showToast('✅ Atividade concluída!');
      }
    }
  }

  // Intercepta /chat de forma segura sem quebrar Request nem stream
  const origFetch = window.fetch;
  window.fetch = async function (input, init) {
    const url = typeof input === 'string' ? input : (input && input.url) || '';

    if (url.includes('/chat') && init && typeof init.body === 'string') {
      try {
        const body = JSON.parse(init.body);
        if (Array.isArray(body.messages)) {
          const lastUser = [...body.messages].reverse().find(m => m.role === 'user');
          if (lastUser) {
            const userStr = typeof lastUser.content === 'string'
              ? lastUser.content
              : (Array.isArray(lastUser.content) ? (lastUser.content.find(c => c.type === 'text')?.text || '') : '');
            captureFromUserText(userStr);
          }

          const mems = getMem();
          const tasks = getTasks();
          const contextBlock =
            `\n[DADOS REAIS DO SISTEMA - LEIA COM ATENÇÃO]\n` +
            `- Memórias salvas sobre o usuário (${mems.length}): ${mems.length ? mems.join(' | ') : 'NENHUMA'}.\n` +
            `- Tarefas/Atividades pendentes (${tasks.length}): ${tasks.length ? tasks.map((t, i) => `${i + 1}. ${t}`).join(' | ') : 'NENHUMA'}.\n` +
            `REGRAS OBRIGATÓRIAS:\n` +
            `1) Quando perguntarem quais tarefas ou memórias existem, responda APENAS com base nas listas acima. NUNCA invente tarefas.\n` +
            `2) Se o usuário pedir para lembrar/guardar algo ou informar nome/gosto, inclua no final: [save: fato curto].\n` +
            `3) Se o usuário pedir para anotar/adicionar tarefa ou atividade, inclua no final: [task_add: descrição curta].\n` +
            `4) Se o usuário concluir uma tarefa, inclua no final: [task_done: palavra-chave].\n`;

          const sys = body.messages.find(m => m.role === 'system');
          if (sys && typeof sys.content === 'string') {
            sys.content += contextBlock;
          } else {
            body.messages.unshift({ role: 'system', content: contextBlock });
          }
          init.body = JSON.stringify(body);
        }
      } catch (e) {}
    }

    const res = await origFetch.apply(this, arguments);

    if (url.includes('/chat')) {
      try {
        const data = await res.clone().json();
        const reply = data?.choices?.[0]?.message?.content || data?.reply || data?.text || '';
        processAITags(reply);
      } catch (e) {}
    }

    return res;
  };

  // Modal ao tocar em TASKS
  function openTasksModal() {
    const old = document.getElementById('jarvisTasksModal');
    if (old) { old.remove(); return; }

    const modal = document.createElement('div');
    modal.id = 'jarvisTasksModal';
    modal.style.cssText =
      'position:fixed;top:64px;left:12px;width:275px;background:rgba(8,12,20,0.96);' +
      'border:1px solid #00F0FF;border-radius:8px;padding:12px;z-index:9999;' +
      'color:#E2E8F0;font-family:monospace;font-size:12px;box-shadow:0 0 18px rgba(0,240,255,0.3);';

    function render() {
      const tasks = getTasks();
      const mems = getMem();
      modal.innerHTML = `
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;border-bottom:1px solid rgba(0,240,255,0.3);padding-bottom:4px;">
          <strong style="color:#00F0FF;">ATIVIDADES (${tasks.length}) | MEM (${mems.length})</strong>
          <button id="closeJTask" style="background:none;border:none;color:#FF1E56;font-weight:bold;cursor:pointer;font-size:14px;">✕</button>
        </div>
        <div style="max-height:130px;overflow-y:auto;margin-bottom:8px;">
          ${tasks.length ? tasks.map((t, i) => `
            <div style="display:flex;justify-content:space-between;align-items:center;padding:4px 0;border-bottom:1px solid rgba(255,255,255,0.08);">
              <span>• ${t}</span>
              <button data-del="${i}" style="background:rgba(57,255,20,0.15);border:1px solid #39FF14;color:#39FF14;border-radius:4px;padding:1px 6px;cursor:pointer;">✓</button>
            </div>
          `).join('') : '<div style="opacity:0.6;">Nenhuma atividade pendente.</div>'}
        </div>
        <div style="display:flex;gap:4px;">
          <input id="newJTaskInp" placeholder="Nova atividade..." style="flex:1;background:#0f172a;border:1px solid #334155;color:#fff;padding:5px 6px;border-radius:4px;font-size:11px;">
          <button id="addJTaskBtn" style="background:#00F0FF;color:#000;border:none;border-radius:4px;padding:5px 10px;font-weight:bold;cursor:pointer;">+</button>
        </div>
      `;
      modal.querySelector('#closeJTask').onclick = () => modal.remove();
      modal.querySelector('#addJTaskBtn').onclick = () => {
        const inp = modal.querySelector('#newJTaskInp');
        if (inp.value.trim()) {
          const list = getTasks();
          list.push(inp.value.trim());
          saveTasks(list);
          render();
        }
      };
      modal.querySelectorAll('[data-del]').forEach(btn => {
        btn.onclick = () => {
          const idx = Number(btn.getAttribute('data-del'));
          const list = getTasks();
          list.splice(idx, 1);
          saveTasks(list);
          render();
        };
      });
    }
    render();
    document.body.appendChild(modal);
  }

  setTimeout(() => {
    const hudL = document.getElementById('hudL');
    if (hudL) {
      syncHud();
      const hudObs = new MutationObserver(() => syncHud());
      hudObs.observe(hudL, { childList: true, subtree: true, characterData: true });
    }

    const tasksBtn = document.getElementById('tasksBtn');
    if (tasksBtn) {
      tasksBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        openTasksModal();
      });
    } else if (hudL) {
      hudL.addEventListener('click', openTasksModal);
    }
  }, 400);
})();
        
