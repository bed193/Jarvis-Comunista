/* === mod-memoria-tasks.js (v5.0 - 100% Nativo, Sem Interceptar Storage) === */
(function () {
  if (window.__jarvisMemTasksV5) return;
  window.__jarvisMemTasksV5 = true;

  const MEM_KEY = 'jarvis_memories';
  const TASK_KEY = 'jarvis_tasks';

  function getMem() {
    try {
      const data = JSON.parse(localStorage.getItem(MEM_KEY) || '[]');
      return Array.isArray(data) ? data : [];
    } catch { return []; }
  }
  function saveMem(arr) {
    localStorage.setItem(MEM_KEY, JSON.stringify(arr.slice(-30)));
    syncHud(true);
  }

  function getTasks() {
    try {
      const data = JSON.parse(localStorage.getItem(TASK_KEY) || '[]');
      return Array.isArray(data) ? data : [];
    } catch { return []; }
  }
  function saveTasks(arr) {
    localStorage.setItem(TASK_KEY, JSON.stringify(arr));
    syncHud(true);
  }

  function showToast(msg) {
    const old = document.getElementById('jMemToast');
    if (old) old.remove();
    const t = document.createElement('div');
    t.id = 'jMemToast';
    t.textContent = msg;
    t.style.cssText =
      'position:fixed;top:48px;left:50%;transform:translateX(-50%);' +
      'background:rgba(0,240,255,0.18);border:1px solid #00F0FF;color:#00F0FF;' +
      'padding:4px 12px;border-radius:12px;font-family:monospace;font-size:11px;' +
      'z-index:10000;pointer-events:none;backdrop-filter:blur(4px);';
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 2800);
  }

  // Sincroniza MEM: X e TASKS: X no #hudL com segurança
  let lastM = -1;
  let lastT = -1;
  function syncHud(force) {
    const hudL = document.getElementById('hudL');
    if (!hudL) return;

    const mCount = getMem().length;
    const tCount = getTasks().length;
    if (!force && mCount === lastM && tCount === lastT &&
        hudL.textContent.includes(`MEM: ${mCount}`) &&
        hudL.textContent.includes(`TASKS: ${tCount}`)) {
      return;
    }

    lastM = mCount;
    lastT = tCount;
    hudL.innerHTML = hudL.innerHTML
      .replace(/MEM:\s*\d+/i, `MEM: ${mCount}`)
      .replace(/TASKS:\s*\d+/i, `TASKS: ${tCount}`);
  }

  // Detector natural da fala do usuário
  function parseUserNatural(userText) {
    if (!userText || typeof userText !== 'string') return;
    const clean = userText.trim();

    // Concluir tarefa/atividade
    const doneMatch = clean.match(
      /(?:conclu[íi]|terminei|j[áa]\s+fiz|finalizei|fechei|marca\s+como\s+feit[oa])\s+(?:a\s+(?:tarefa|atividade)\s+|o\s+compromisso\s+)?(.+)/i
    );
    if (doneMatch && doneMatch[1].length > 2) {
      const key = doneMatch[1].replace(/[.!?]+$/, '').trim().toLowerCase();
      let tasks = getTasks();
      const before = tasks.length;
      tasks = tasks.filter(t => !t.toLowerCase().includes(key));
      if (tasks.length < before) {
        saveTasks(tasks);
        showToast('✅ Atividade concluída!');
        return;
      }
    }

    // Adicionar tarefa/atividade
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

    // Salvar fato na memória
    const memMatch = clean.match(
      /(?:lembr[ae]\s+que|guard[ae]\s+(?:na\s+mem[óo]ria\s+)?que|salv[ae]\s+(?:na\s+mem[óo]ria\s+)?que|anot[ae]\s+que)\s+(.+)/i
    );
    if (memMatch && memMatch[1].length > 3) {
      const fato = memMatch[1].replace(/[.!?]+$/, '').trim();
      const mems = getMem();
      if (!mems.some(x => x.toLowerCase() === fato.toLowerCase())) {
        mems.push(fato);
        saveMem(mems);
        showToast(`💾 Memória: ${fato}`);
      }
    }
  }

  // Processa tags invisíveis da IA
  function parseAITags(raw) {
    if (!raw || typeof raw !== 'string') return;

    const saveMatches = [...raw.matchAll(/\[save:\s*([^\]]+)\]/gi)];
    if (saveMatches.length) {
      const mems = getMem();
      saveMatches.forEach(m => {
        const fato = m[1].trim();
        if (fato && !mems.some(x => x.toLowerCase() === fato.toLowerCase())) {
          mems.push(fato);
          showToast(`💾 Memória: ${fato}`);
        }
      });
      saveMem(mems);
    }

    const addMatches = [...raw.matchAll(/\[task_add:\s*([^\]]+)\]/gi)];
    if (addMatches.length) {
      const tasks = getTasks();
      addMatches.forEach(m => {
        const desc = m[1].trim();
        if (desc && !tasks.some(x => x.toLowerCase() === desc.toLowerCase())) {
          tasks.push(desc);
          showToast(`📌 Atividade: ${desc}`);
        }
      });
      saveTasks(tasks);
    }

    const doneMatches = [...raw.matchAll(/\[task_done:\s*([^\]]+)\]/gi)];
    if (doneMatches.length) {
      let tasks = getTasks();
      const before = tasks.length;
      doneMatches.forEach(m => {
        const key = m[1].trim().toLowerCase();
        tasks = tasks.filter(t => !t.toLowerCase().includes(key));
      });
      if (tasks.length < before) {
        saveTasks(tasks);
        showToast('✅ Atividade concluída!');
      }
    }
  }

  // Intercepta window.fetch apenas para /chat
  const origFetch = window.fetch;
  window.fetch = async function (input, init) {
    const url = typeof input === 'string' ? input : (input && input.url) || '';

    if (url.includes('/chat') && init && init.body && typeof init.body === 'string') {
      try {
        const payload = JSON.parse(init.body);
        if (Array.isArray(payload.messages)) {
          const lastUser = [...payload.messages].reverse().find(m => m.role === 'user');
          if (lastUser) {
            const txt = typeof lastUser.content === 'string'
              ? lastUser.content
              : (Array.isArray(lastUser.content) ? (lastUser.content.find(c => c.type === 'text')?.text || '') : '');
            parseUserNatural(txt);
          }

          const mems = getMem();
          const tasks = getTasks();
          const extraSys =
            `\n[MEMÓRIA E ATIVIDADES DO USUÁRIO]\n` +
            `Memórias: ${mems.length ? mems.join(' | ') : 'nenhuma'}.\n` +
            `Atividades: ${tasks.length ? tasks.join(' | ') : 'nenhuma'}.\n` +
            `Sempre que o usuário pedir para anotar uma atividade, compromisso, lembrete ou tarefa, inclua no fim da resposta: [task_add: descrição curta]. Se concluir algo, inclua: [task_done: palavra-chave]. Se revelar fato pessoal, inclua: [save: fato curto].\n`;

          const sysMsg = payload.messages.find(m => m.role === 'system');
          if (sysMsg && typeof sysMsg.content === 'string') {
            sysMsg.content += extraSys;
          } else {
            payload.messages.unshift({ role: 'system', content: extraSys });
          }
          init.body = JSON.stringify(payload);
        }
      } catch (e) {}
    }

    const response = await origFetch.apply(this, arguments);

    if (url.includes('/chat')) {
      try {
        const cloned = response.clone();
        const data = await cloned.json();
        const reply = data?.choices?.[0]?.message?.content || data?.reply || data?.text || '';
        parseAITags(reply);
        setTimeout(() => syncHud(true), 250);
      } catch (e) {}
    }

    return response;
  };

  // Modal gerenciável ao tocar em TASKS no HUD
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

  function initHud() {
    const hudL = document.getElementById('hudL');
    const tasksBtn = document.getElementById('tasksBtn');
    if (tasksBtn) {
      tasksBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        openTasksModal();
      });
    } else if (hudL) {
      hudL.addEventListener('click', openTasksModal);
    }
    syncHud(true);
    setInterval(() => syncHud(false), 800);
  }

  function watchWakeUp() {
    const sleepBtn = Array.from(document.querySelectorAll('#bar button'))
      .find(b => b.textContent.trim().toLowerCase().includes('dormir'));
    if (!sleepBtn) return;

    let wasSleeping = sleepBtn.classList.contains('on');
    const obs = new MutationObserver(() => {
      const nowSleeping = sleepBtn.classList.contains('on');
      if (wasSleeping && !nowSleeping) {
        const tasks = getTasks();
        if (tasks.length > 0) {
          setTimeout(() => {
            const cap = document.getElementById('caption');
            if (cap) cap.textContent = `Pendências de hoje (${tasks.length}): ${tasks.join('; ')}.`;
          }, 3300);
        }
      }
      wasSleeping = nowSleeping;
    });
    obs.observe(sleepBtn, { attributes: true, attributeFilter: ['class'] });
  }

  setTimeout(() => {
    initHud();
    watchWakeUp();
  }, 500);
})();
      
