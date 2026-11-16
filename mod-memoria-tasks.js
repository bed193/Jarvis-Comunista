/* === mod-memoria-tasks.js (v2.0 - Blindado com res.clone()) === */
(function () {
  if (window.__jarvisMemTasksLoaded) return;
  window.__jarvisMemTasksLoaded = true;

  const MEM_KEY = 'jarvis_memories';
  const TASK_KEY = 'jarvis_tasks';

  function getMem() {
    try { return JSON.parse(localStorage.getItem(MEM_KEY) || '[]'); }
    catch { return []; }
  }
  function saveMem(arr) {
    localStorage.setItem(MEM_KEY, JSON.stringify(arr.slice(-30)));
    syncHud();
  }

  function getTasks() {
    try { return JSON.parse(localStorage.getItem(TASK_KEY) || '[]'); }
    catch { return []; }
  }
  function saveTasks(arr) {
    localStorage.setItem(TASK_KEY, JSON.stringify(arr));
    syncHud();
  }

  // Sincroniza MEM: X e TASKS: X no #hudL real
  function syncHud() {
    const hudL = document.getElementById('hudL');
    if (!hudL) return;
    const mCount = getMem().length;
    const tCount = getTasks().length;
    hudL.innerHTML = hudL.innerHTML
      .replace(/MEM:\s*\d+/i, `MEM: ${mCount}`)
      .replace(/TASKS:\s*\d+/i, `TASKS: ${tCount}`);
  }

  // Processa tags invisíveis da IA
  function parseTags(raw) {
    if (!raw || typeof raw !== 'string') return;

    // [save: fato]
    const saveMatches = [...raw.matchAll(/\[save:\s*([^\]]+)\]/gi)];
    if (saveMatches.length) {
      const mems = getMem();
      saveMatches.forEach(m => {
        const fato = m[1].trim();
        if (fato && !mems.some(x => x.toLowerCase() === fato.toLowerCase())) {
          mems.push(fato);
        }
      });
      saveMem(mems);
    }

    // [task_add: descrição]
    const addMatches = [...raw.matchAll(/\[task_add:\s*([^\]]+)\]/gi)];
    if (addMatches.length) {
      const tasks = getTasks();
      addMatches.forEach(m => {
        const desc = m[1].trim();
        if (desc && !tasks.some(x => x.toLowerCase() === desc.toLowerCase())) {
          tasks.push(desc);
        }
      });
      saveTasks(tasks);
    }

    // [task_done: palavra-chave]
    const doneMatches = [...raw.matchAll(/\[task_done:\s*([^\]]+)\]/gi)];
    if (doneMatches.length) {
      let tasks = getTasks();
      doneMatches.forEach(m => {
        const key = m[1].trim().toLowerCase();
        tasks = tasks.filter(t => !t.toLowerCase().includes(key));
      });
      saveTasks(tasks);
    }
  }

  // Intercepta window.fetch com segurança (usando res.clone())
  const origFetch = window.fetch;
  window.fetch = async function (input, init) {
    const url = typeof input === 'string' ? input : (input && input.url) || '';

    if (url.includes('/chat') && init && init.body && typeof init.body === 'string') {
      try {
        const payload = JSON.parse(init.body);
        if (Array.isArray(payload.messages)) {
          const mems = getMem();
          const tasks = getTasks();
          const extraSys =
            `\n[SISTEMA MEMÓRIA E TAREFAS ATIVO]\n` +
            `Memórias salvas sobre o usuário: ${mems.length ? mems.join(' | ') : 'nenhuma ainda'}.\n` +
            `Tarefas pendentes: ${tasks.length ? tasks.join(' | ') : 'nenhuma'}.\n` +
            `REGRAS OBRIGATÓRIAS DE TAGS INVISÍVEIS:\n` +
            `- Se o usuário revelar qualquer dado pessoal, gosto, nome, rotina ou pedir para lembrar algo, inclua no fim: [save: fato curto]\n` +
            `- Se o usuário pedir para anotar/adicionar uma tarefa ou lembrete, inclua no fim: [task_add: descrição curta]\n` +
            `- Se o usuário disser que concluiu/fez uma tarefa, inclua no fim: [task_done: palavra-chave]\n`;

          const sysMsg = payload.messages.find(m => m.role === 'system');
          if (sysMsg && typeof sysMsg.content === 'string') {
            sysMsg.content += extraSys;
          } else {
            payload.messages.unshift({ role: 'system', content: extraSys });
          }
          init.body = JSON.stringify(payload);
        }
      } catch (e) { /* mantém body original se falhar */ }
    }

    const response = await origFetch.apply(this, arguments);

    if (url.includes('/chat')) {
      try {
        const cloned = response.clone();
        const data = await cloned.json();
        const reply = data?.choices?.[0]?.message?.content || data?.reply || data?.text || '';
        parseTags(reply);
      } catch (e) { /* ignora erro de parse */ }
    }

    return response;
  };

  // Painel gerenciável ao tocar em TASKS no HUD
  function openTasksModal() {
    const old = document.getElementById('jarvisTasksModal');
    if (old) { old.remove(); return; }

    const modal = document.createElement('div');
    modal.id = 'jarvisTasksModal';
    modal.style.cssText =
      'position:fixed;top:64px;left:12px;width:270px;background:rgba(8,12,20,0.95);' +
      'border:1px solid #00F0FF;border-radius:8px;padding:12px;z-index:9999;' +
      'color:#E2E8F0;font-family:monospace;font-size:12px;box-shadow:0 0 18px rgba(0,240,255,0.25);';

    function render() {
      const tasks = getTasks();
      const mems = getMem();
      modal.innerHTML = `
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;border-bottom:1px solid rgba(0,240,255,0.3);padding-bottom:4px;">
          <strong style="color:#00F0FF;">TAREFAS (${tasks.length}) & MEM (${mems.length})</strong>
          <button id="closeJTask" style="background:none;border:none;color:#FF1E56;font-weight:bold;cursor:pointer;">✕</button>
        </div>
        <div style="max-height:140px;overflow-y:auto;margin-bottom:8px;">
          ${tasks.length ? tasks.map((t, i) => `
            <div style="display:flex;justify-content:space-between;align-items:center;padding:4px 0;border-bottom:1px solid rgba(255,255,255,0.08);">
              <span>• ${t}</span>
              <button data-del="${i}" style="background:rgba(57,255,20,0.15);border:1px solid #39FF14;color:#39FF14;border-radius:4px;padding:1px 6px;cursor:pointer;">✓</button>
            </div>
          `).join('') : '<div style="opacity:0.6;">Nenhuma tarefa pendente.</div>'}
        </div>
        <div style="display:flex;gap:4px;">
          <input id="newJTaskInp" placeholder="Nova tarefa..." style="flex:1;background:#0f172a;border:1px solid #334155;color:#fff;padding:4px 6px;border-radius:4px;font-size:11px;">
          <button id="addJTaskBtn" style="background:#00F0FF;color:#000;border:none;border-radius:4px;padding:4px 8px;font-weight:bold;cursor:pointer;">+</button>
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

  // Liga o clique no #tasksBtn ou na área de TASKS do #hudL
  function bindHudClicks() {
    const tasksBtn = document.getElementById('tasksBtn');
    if (tasksBtn) {
      tasksBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        openTasksModal();
      });
    }
    const hudL = document.getElementById('hudL');
    if (hudL && !tasksBtn) {
      hudL.addEventListener('click', openTasksModal);
    }
  }

  // Lê tarefas ao acordar do modo Dormir
  function watchWakeUp() {
    const findSleepBtn = () => Array.from(document.querySelectorAll('#bar button'))
      .find(b => b.textContent.trim().toLowerCase().includes('dormir'));

    const sleepBtn = findSleepBtn();
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

  // Inicialização
  setTimeout(() => {
    syncHud();
    bindHudClicks();
    watchWakeUp();
  }, 500);
})();
                                          
