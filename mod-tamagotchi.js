/* =====================================================================
   mod-tamagotchi.js  —  Jarvis v2.0 (Safe Boot / Contrato: mapa-jarvis)
   Carregar no fim do index.html:  <script src="mod-tamagotchi.js?v=3"></script>
   ===================================================================== */
(() => {
  'use strict';
  if (window.__tamaLoaded) return;
  window.__tamaLoaded = true;

  function boot() {
    try {
      const $ = s => document.querySelector(s);
      const bar = $('#bar'), hudL = $('#hudL'), hudR = $('#hudR'), capEl = $('#caption'), themeBtn = $('#themeBtn');
      if (!bar || !hudL || !hudR || !themeBtn) return;

      /* ------------------------------ utilidades ------------------------------ */
      const KEY = 'jarvis_tama_state', DKEY = 'jarvis_diary';
      const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
      const rand = (a, b) => a + Math.random() * (b - a);
      const pick = a => a[(Math.random() * a.length) | 0];
      const pad = n => String(n).padStart(2, '0');
      const norm = t => String(t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
      const todayStr = () => { const d = new Date(); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); };
      const daysBetween = (a, b) => {
        const pa = String(a).split('-').map(Number), pb = String(b).split('-').map(Number);
        return Math.round((Date.UTC(pb[0], pb[1] - 1, pb[2]) - Date.UTC(pa[0], pa[1] - 1, pa[2])) / 864e5);
      };
      const el = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; };

      /* ------------------------------ estado ------------------------------ */
      const DEF = () => ({
        xp: 0, day: 1, streak: 1, affinity: 0, energy: 100, bondMode: 'partner', lastActiveDate: todayStr(),
        dailyXpEarned: 0, angryAbandonTurns: 0, devUnlocked: false, badges: [], dailyCraving: null, dailyCravingDone: false,
        steps: 0, sarcBoost: 0, ds: { chats: 0, pets: 0, tasks: 0, petMs: 0 }
      });

      function loadState() {
        const d = DEF();
        try {
          const o = JSON.parse(localStorage.getItem(KEY));
          if (o && typeof o === 'object') {
            const s = Object.assign(d, o, { ds: Object.assign(d.ds, o.ds || {}) });
            s.day = clamp(s.day | 0 || 1, 1, 7);
            s.streak = clamp(s.streak | 0 || 1, 1, 7);
            s.affinity = clamp(+s.affinity || 0, 0, 100);
            s.energy = clamp(isFinite(+s.energy) ? +s.energy : 100, 0, 100);
            s.xp = Math.max(0, +s.xp || 0);
            s.dailyXpEarned = clamp(+s.dailyXpEarned || 0, 0, 100);
            s.angryAbandonTurns = clamp(s.angryAbandonTurns | 0, 0, 3);
            s.bondMode = s.bondMode === 'acid' ? 'acid' : 'partner';
            s.badges = Array.isArray(s.badges) ? s.badges : [];
            return s;
          }
        } catch (e) {}
        return d;
      }

      let S = loadState();
      const save = () => { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {} };
      const loadDiary = () => { try { const a = JSON.parse(localStorage.getItem(DKEY) || '[]'); return Array.isArray(a) ? a : []; } catch (e) { return []; } };
      const saveDiary = a => { try { localStorage.setItem(DKEY, JSON.stringify(a.slice(-60))); } catch (e) {} };

      const unlocked = n => S.devUnlocked || S.day >= n;
      const themeOk = n => unlocked(n);

      const LOCKS = { 'Piscada': 2, 'Deboche': 2, 'Stark': 2, 'Edgerunner': 3, 'Stealth': 4, 'Comunista': 4, 'Banguela': 5, 'Asta': 6, 'Gear 5': 7 };
      const MODE_DAY = { comunista: 4, banguela: 5, asta: 6, gear5: 7 };
      const THEME_NAMES = ['punk', 'stark', 'edgerunner', 'stealth'];

      const CRAVINGS = {
        stark: 'Usar a armadura Stark hoje',
        carinho: 'Fazer 2 minutos de carinho no visor',
        camera: 'Testar a câmera / Olhar hoje',
        tarefa: 'Concluir 1 tarefa hoje',
        conversa: 'Bater um papo de 5 mensagens hoje',
        foco: 'Ativar o modo Foco hoje'
      };
      function newCraving() {
        const pool = Object.keys(CRAVINGS).filter(k => (k !== 'stark' || unlocked(2)) && k !== S.dailyCraving);
        S.dailyCraving = pick(pool);
        S.dailyCravingDone = false;
      }

      const MEDALS = {
        coruja_noturna: { n: 'Coruja Noturna', i: '🦉', d: 'Interagiu entre 02:00 e 04:59' },
        mestre_foco: { n: 'Mestre do Foco', i: '🎯', d: 'Ativou o Foco ou concluiu 3 tarefas no mesmo dia' },
        paz_selada: { n: 'Paz Selada', i: '🕊️', d: 'Acalmou o Jarvis depois do abandono' },
        explorador_campo: { n: 'Explorador de Campo', i: '🥾', d: '100+ passos no Modo Passeio' },
        sincronia_7: { n: 'Sincronia 7', i: '💠', d: 'Completou os 7 dias de ofensiva' }
      };

      /* ------------------------------ CSS ------------------------------ */
      const css = el('style');
      css.textContent = `
      #tamaOverlayCanvas{position:fixed;inset:0;width:100%;height:100%;pointer-events:none;z-index:6}
      #tamaHudBadge{position:fixed;left:12px;top:calc(env(safe-area-inset-top,0px) + 72px);z-index:7;cursor:pointer;padding:2px 0;font:10px/1.4 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;letter-spacing:.08em;color:rgba(var(--hudc),.85);text-shadow:0 0 6px rgba(var(--hudc),.45);white-space:nowrap}
      #tamaHudBadge .tb{display:block;margin-top:2px;width:96px;height:4px;border-radius:2px;background:rgba(var(--hudc),.18);overflow:hidden}
      #tamaHudBadge .tb i{display:block;height:100%;width:0;background:rgb(var(--hudc));box-shadow:0 0 6px rgba(var(--hudc),.8)}
      #tamaAfnBadge{position:fixed;right:12px;top:calc(env(safe-area-inset-top,0px) + 72px);z-index:7;font:10px/1.4 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;letter-spacing:.08em;text-shadow:0 0 6px currentColor;pointer-events:none}
      .tama-toast{position:fixed;left:50%;top:calc(env(safe-area-inset-top,0px) + 72px);transform:translateX(-50%);max-width:88%;z-index:9;padding:7px 14px;border-radius:999px;background:rgba(5,7,13,.9);border:1px solid rgba(var(--hudc),.5);color:rgba(var(--hudc),1);font:12px/1.35 system-ui,sans-serif;text-align:center;opacity:0;transition:opacity .35s;pointer-events:none}
      .tama-toast.show{opacity:1}
      .tama-drawer{position:fixed;left:8px;right:8px;bottom:calc(env(safe-area-inset-bottom,0px) + 60px);display:none;max-height:58vh;overflow:auto;padding:10px;border-radius:14px;background:rgba(5,7,13,.95);border:1px solid rgba(var(--ac),.35);z-index:8}
      .tama-drawer.open{display:block}
      .tama-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:6px}
      .tama-grid button{width:100%}
      .tama-sec{font:10px ui-monospace,Menlo,Consolas,monospace;letter-spacing:.14em;color:rgba(var(--hudc),.75);margin:8px 0 5px}
      .tama-sec:first-child{margin-top:0}
      #bar button[data-tlock]{opacity:.45}
      #bar button[data-tlock]::after{content:" " attr(data-tlock);font-size:10px}
      #tamaModal{position:fixed;inset:0;display:none;align-items:center;justify-content:center;background:rgba(0,0,0,.74);z-index:70}
      #tamaModal.open{display:flex}
      #tamaModal .card{width:min(92vw,380px);max-height:82vh;display:flex;flex-direction:column;border:1px solid rgba(var(--hudc),.45);border-radius:12px;background:#05070d;color:rgba(var(--hudc),.92);font:12.5px/1.5 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace}
      #tamaModal .hd{padding:10px 14px 4px;letter-spacing:.14em;color:rgba(250,204,21,.95)}
      #tamaModal .tabs{display:flex;gap:6px;padding:4px 12px}
      #tamaModal button{font:inherit;font-size:11.5px;padding:5px 10px;border-radius:999px;border:1px solid rgba(var(--hudc),.4);background:transparent;color:rgba(var(--hudc),.85);cursor:pointer}
      #tamaModal button.on{background:rgba(var(--hudc),.22);color:#fff}
      #tamaModal .bd{padding:8px 14px;overflow:auto;flex:1}
      #tamaModal .trow{display:flex;justify-content:space-between;gap:10px;padding:3px 0;border-bottom:1px solid rgba(var(--hudc),.12)}
      #tamaModal .tl{opacity:.7}
      #tamaModal .tv{text-align:right}
      #tamaModal .tbar{height:6px;border-radius:3px;background:rgba(var(--hudc),.16);overflow:hidden;margin:3px 0 6px}
      #tamaModal .tbar i{display:block;height:100%;background:rgb(var(--hudc))}
      #tamaModal .bond{display:flex;gap:6px;margin:6px 0}
      #tamaModal .mg{display:grid;grid-template-columns:1fr 1fr;gap:8px}
      #tamaModal .md{padding:8px;border:1px solid rgba(var(--hudc),.25);border-radius:8px;text-align:center}
      #tamaModal .md.off{opacity:.5}
      #tamaModal .de{padding:6px 0;border-bottom:1px solid rgba(var(--hudc),.12)}
      #tamaModal .ft{display:flex;flex-wrap:wrap;gap:6px;padding:8px 12px 12px;justify-content:space-between}
      #tamaModal .ft .tdev{font-size:10px;opacity:.65}
      `;
      document.head.appendChild(css);

      /* ------------------------------ áudio (sfx) ------------------------------ */
      let actx = null;
      function ensureAudio() {
        try {
          if (!actx) { const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return null; actx = new AC(); }
          if (actx.state === 'suspended') actx.resume().catch(() => {});
        } catch (e) {}
        return actx;
      }
      function tone(type, f0, f1, t, dur, vol) {
        const o = actx.createOscillator(), g = actx.createGain();
        o.type = type; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
        g.gain.setValueAtTime(.0001, t); g.gain.linearRampToValueAtTime(vol, t + Math.min(.03, dur / 3)); g.gain.linearRampToValueAtTime(.0001, t + dur);
        o.connect(g); g.connect(actx.destination); o.start(t); o.stop(t + dur + .03);
      }
      function sfx(k) {
        if (!ensureAudio() || actx.state !== 'running') return;
        try {
          const t = actx.currentTime + .01;
          if (k === 'denied') { tone('square', 220, 160, t, .09, .07); tone('square', 180, 120, t + .12, .12, .07); }
          else if (k === 'blip') tone('sine', 520, 780, t, .12, .06);
          else if (k === 'poke') tone('sawtooth', 110, 45, t, .35, .16);
          else if (k === 'achieve') { [523, 659, 784, 1047].forEach((f, i) => tone('triangle', f, f * 1.01, t + i * .09, .22, .09)); }
          else if (k === 'zap') { tone('square', 300, 1400, t, .35, .06); tone('sawtooth', 200, 900, t + .05, .3, .05); }
          else if (k === 'yawn') tone('sine', 420, 180, t, .9, .04);
          else if (k === 'purr') {
            const o = actx.createOscillator(), g = actx.createGain(), l = actx.createOscillator(), lg = actx.createGain(), f = actx.createBiquadFilter();
            o.type = 'sawtooth'; o.frequency.value = 58; l.frequency.value = 24; lg.gain.value = .03; f.type = 'lowpass'; f.frequency.value = 380;
            g.gain.setValueAtTime(.0001, t); g.gain.linearRampToValueAtTime(.05, t + .2); g.gain.linearRampToValueAtTime(.0001, t + 1.3);
            l.connect(lg); lg.connect(g.gain); o.connect(f); f.connect(g); g.connect(actx.destination);
            o.start(t); l.start(t); o.stop(t + 1.4); l.stop(t + 1.4);
          }
        } catch (e) {}
      }

      /* ------------------------------ toast / caption ------------------------------ */
      const toastEl = el('div', 'tama-toast tama-ui'); document.body.appendChild(toastEl);
      let toastT = 0;
      function toast(msg, ms) {
        toastEl.textContent = msg; toastEl.classList.add('show');
        clearTimeout(toastT); toastT = setTimeout(() => toastEl.classList.remove('show'), ms || 3500);
      }
      function setCaption(msg, ms) {
        if (!capEl) return;
        capEl.textContent = msg;
        setTimeout(() => { if (capEl.textContent === msg) capEl.textContent = ''; }, ms || 3800);
      }
      function denied(need) {
        sfx('denied');
        setCaption('Acesso bloqueado: exige Dia ' + need + ' de vínculo (atual: Dia ' + S.day + ').', 4000);
      }

      /* ------------------------------ botões / helpers de DOM ------------------------------ */
      let bypass = false;
      const findBtn = label => { const bs = bar.querySelectorAll('button'); for (const b of bs) if (b.textContent.trim() === label) return b; return null; };
      const on = label => { const b = findBtn(label); return !!(b && b.classList.contains('on')); };
      function press(b) { if (!b) return; bypass = true; try { b.click(); } finally { bypass = false; } }
      const curTheme = () => { const m = /TEMA\s*(\d)/.exec(themeBtn.textContent); return m ? +m[1] : 0; };
      const LOCKED_TOGGLES = ['Chapa', 'Foco', 'Discoteca', 'Banguela', 'Gear 5', 'Asta', 'Dormir'];
      const lockedToggleOn = () => LOCKED_TOGGLES.some(on);

      const mediaEls = new Set();
      try {
        const op = HTMLMediaElement.prototype.play;
        HTMLMediaElement.prototype.play = function () { mediaEls.add(this); try { touch(false); } catch (e) {} return op.apply(this, arguments); };
      } catch (e) {}
      const busy = () => {
        for (const m of mediaEls) if (!m.paused && !m.ended && m.currentTime > 0 && m.duration > 1) return true;
        try { return !!(window.speechSynthesis && speechSynthesis.speaking); } catch (e) { return false; }
      };

      /* ------------------------------ interação / inatividade ------------------------------ */
      let lastTouch = Date.now(), yawned = false, chatted = false, evCount = 0;
      function touch(real) {
        lastTouch = Date.now(); yawned = false; chatted = false;
        if (real) evCount++;
        const h = new Date().getHours();
        if (real && h >= 2 && h < 5) award('coruja_noturna');
      }

      /* ------------------------------ reações com a face ------------------------------ */
      let seqTok = 0;
      function faceSeq(steps, force) {
        if (force) { if (lockedToggleOn()) return false; }
        else if (on('Auto') || !on('Idle') || busy()) return false;
        const tok = ++seqTok, ev0 = evCount; let i = 0;
        const finish = () => {
          if (tok !== seqTok || (evCount !== ev0 && !force)) return;
          const last = findBtn(steps[steps.length - 1][0]);
          if (last && last.classList.contains('on') && !(S.angryAbandonTurns > 0 && steps[steps.length - 1][0] === 'Bravo')) press(findBtn('Idle'));
          if (on('Auto')) setTimeout(() => { if (tok === seqTok && evCount === ev0) { press(findBtn('Auto')); setTimeout(() => press(findBtn('Auto')), 350); } }, 150);
        };
        const step = () => {
          if (tok !== seqTok) return;
          if (i >= steps.length) { finish(); return; }
          const s = steps[i++], b = findBtn(s[0]);
          if (b) press(b);
          setTimeout(step, s[1]);
        };
        step();
        return true;
      }

      /* ------------------------------ sarcasmo efetivo / ciclo circadiano ------------------------------ */
      function baseSarc() { try { const v = parseInt(localStorage.getItem('jarvis_sarcasm'), 10); if (isFinite(v)) return clamp(v, 0, 100); } catch (e) {} return 80; }
      function effSarc() {
        if (S.angryAbandonTurns > 0) return 98;
        let v = baseSarc() + (S.bondMode === 'acid' ? S.affinity * .3 : -S.affinity * .4) + S.sarcBoost;
        return Math.round(clamp(v, 0, 100));
      }
      function period() {
        const h = new Date().getHours();
        if (h >= 6 && h <= 11) return { n: 'Manhã', tone: 'energia matinal, meio resmungão por café', tint: 0 };
        if (h >= 12 && h <= 18) return { n: 'Tarde', tone: 'tom produtivo e direto', tint: 0 };
        if (h >= 19 && h <= 23) return { n: 'Noite', tone: 'tom mais calmo e íntimo', tint: .08 };
        return { n: 'Madrugada', tone: 'tom sussurrado e sonolento, comentando que já é tarde', tint: .16 };
      }

      /* ------------------------------ progressão ------------------------------ */
      function pushDiary(date) {
        const a = loadDiary();
        if (a.some(e => e.date === date && e.day === S.day)) return;
        const d = S.ds, mood = S.affinity >= 70 ? 'Sinto que a gente está em sincronia.' : S.affinity >= 35 ? 'Já estou me acostumando com você.' : 'Ainda estou te estudando.';
        a.push({ day: S.day, date, text: 'Dia ' + S.day + ': ' + d.chats + ' conversas, ' + d.pets + ' carinhos, ' + d.tasks + ' tarefas, ' + S.dailyXpEarned + ' XP. Afinidade ' + Math.round(S.affinity) + '%. ' + mood });
        saveDiary(a);
      }
      function syncDay() {
        const today = todayStr();
        if (S.lastActiveDate === today) return;
        const diff = daysBetween(S.lastActiveDate, today);
        if (diff >= 1) {
          pushDiary(S.lastActiveDate);
          if (diff === 1) { S.streak = Math.min(7, S.streak + 1); S.day = Math.min(7, S.day + 1); }
          else { S.streak = Math.max(1, S.streak - 1); S.day = Math.max(1, S.day - 1); S.angryAbandonTurns = 3; }
          S.dailyXpEarned = 0; S.ds = DEF().ds; newCraving();
          if (S.streak >= 7) award('sincronia_7');
        }
        S.lastActiveDate = today; save();
        enforceLocks(); refreshUI();
        if (diff >= 2) toast('Você sumiu... o Jarvis ficou puto por abandono.', 5000);
        else if (diff === 1) toast('Novo dia de vínculo: Dia ' + S.day + '/7', 4000);
      }

      function gainXp(n, aff) {
        const was = S.dailyXpEarned, add = Math.min(n, Math.max(0, 100 - was));
        S.xp += add; S.dailyXpEarned += add;
        if (aff) S.affinity = clamp(S.affinity + aff, 0, 100);
        if (was < 100 && S.dailyXpEarned >= 100) pride();
        save(); refreshUI();
      }
      function craveDone(id) {
        if (S.dailyCraving !== id || S.dailyCravingDone) return;
        S.dailyCravingDone = true;
        gainXp(30, 26);
        toast('Vontade do Dia atendida! +20% de afinidade', 4500); sfx('achieve'); starsBurst(24);
      }
      function awardTask() {
        S.ds.tasks++; gainXp(30, 6); starsBurst(30); sfx('achieve');
        craveDone('tarefa');
        if (S.ds.tasks >= 3) award('mestre_foco');
      }
      function award(id) {
        if (!MEDALS[id] || S.badges.includes(id)) return;
        S.badges.push(id); save();
        toast('🏅 Medalha secreta: ' + MEDALS[id].n, 5000); sfx('achieve'); starsBurst(20); refreshUI();
      }
      function pride() {
        FX.prideUntil = Date.now() + 3500;
        faceSeq([['Feliz', 2500]], false); sfx('achieve');
        toast('Teto de 100 XP do dia! O Jarvis está orgulhoso.', 4000);
      }

      /* ------------------------------ travas de desbloqueio ------------------------------ */
      function enforceLocks() {
        for (const [lb, need] of [['Comunista', 4], ['Banguela', 5], ['Asta', 6], ['Gear 5', 7]]) {
          const b = findBtn(lb);
          if (b && b.classList.contains('on') && !unlocked(need)) { press(b); setCaption('Acesso bloqueado: exige Dia ' + need + ' de vínculo (atual: Dia ' + S.day + ').', 4000); }
        }
        let g = 0;
        while (curTheme() && !themeOk(curTheme()) && g++ < 5) press(themeBtn);
      }
      function refreshLocks() {
        bar.querySelectorAll('button').forEach(b => {
          if (b.classList.contains('tama-own')) return;
          const need = LOCKS[b.textContent.trim()];
          if (need && !unlocked(need)) b.setAttribute('data-tlock', '🔒 DIA ' + need); else b.removeAttribute('data-tlock');
        });
        const c = curTheme();
        drawerThemeBtns.forEach((b, i) => b.classList.toggle('on', c === i + 1));
      }
      function gotoTheme(n) {
        if (!themeOk(n)) { denied(n); return; }
        let g = 0; while (curTheme() !== n && g++ < 5) press(themeBtn);
        refreshUI();
      }

      document.addEventListener('click', e => {
        if (bypass) return;
        const b = e.target.closest && e.target.closest('button');
        if (!b) return;
        let need = 0;
        if (b === themeBtn) { const nx = ((curTheme() || 1) % 4) + 1; if (!themeOk(nx)) need = nx; }
        else if (bar.contains(b) && !b.classList.contains('tama-own')) { need = LOCKS[b.textContent.trim()] || 0; if (need && unlocked(need)) need = 0; }
        if (need) { e.stopImmediatePropagation(); e.preventDefault(); denied(need); }
      }, true);

      /* ------------------------------ organização da barra #bar ------------------------------ */
      const mk = (txt, cls) => { const b = el('button', cls || '', txt); b.type = 'button'; return b; };
      const dTools = el('div', 'tama-drawer tama-ui'), dModes = el('div', 'tama-drawer tama-ui');
      const gTools = el('div', 'tama-grid'), gThemes = el('div', 'tama-grid'), gModes = el('div', 'tama-grid'), gExpr = el('div', 'tama-grid');
      dTools.append(el('div', 'tama-sec', 'FERRAMENTAS'), gTools);
      dModes.append(el('div', 'tama-sec', 'ARMADURAS'), gThemes, el('div', 'tama-sec', 'MODOS'), gModes, el('div', 'tama-sec', 'EXPRESSÕES'), gExpr);
      const togTools = mk('Ferramentas ▾', 'tama-own tama-toggle'), togModes = mk('Modos ▾', 'tama-own tama-toggle');
      togTools.style.order = 4; togModes.style.order = 5;
      bar.append(togTools, togModes, dTools, dModes);

      const drawerThemeBtns = ['Punk', 'Stark', 'Edgerunner', 'Stealth'].map((n, i) => {
        const b = mk(n, 'tama-theme'); b.addEventListener('click', () => gotoTheme(i + 1)); gThemes.appendChild(b); return b;
      });

      const KEEP = { 'Auto': 1, 'Olhar': 2, 'Dormir': 3 };
      const MODEBTN = ['Chapa', 'Foco', 'Discoteca', 'Hacker', 'Banguela', 'Asta', 'Gear 5', 'Comunista'];
      const EXPR = ['Idle', 'Pensando', 'Deboche', 'Piscada', 'Bravo', 'Surpreso', 'Malicioso', 'Chorando', 'Morto', 'Glitch', 'Feliz', 'Entediado'];
      const isTool = t => /^Mão/.test(t) || ['Contatos', 'Radar', 'Rede', 'Passeio'].includes(t);
      function place(b) {
        if (b.tagName !== 'BUTTON' || b.classList.contains('tama-own') || b.classList.contains('tama-theme')) return;
        const t = b.textContent.trim();
        if (KEEP[t]) b.style.order = KEEP[t];
        else if (MODEBTN.includes(t)) gModes.appendChild(b);
        else if (EXPR.includes(t)) gExpr.appendChild(b);
        else if (isTool(t)) gTools.appendChild(b);
      }
      Array.from(bar.children).forEach(place);

      function closeDrawers() { dTools.classList.remove('open'); dModes.classList.remove('open'); togTools.classList.remove('on'); togModes.classList.remove('on'); }
      function toggleDrawer(d, tg) {
        const was = d.classList.contains('open'); closeDrawers();
        if (!was) { d.classList.add('open'); tg.classList.add('on'); if (unlocked(3)) curious(); }
        touch(true);
      }
      togTools.addEventListener('click', () => toggleDrawer(dTools, togTools));
      togModes.addEventListener('click', () => toggleDrawer(dModes, togModes));
      [dTools, dModes].forEach(d => d.addEventListener('click', e => { if (e.target.closest('button')) setTimeout(closeDrawers, 120); }));

      /* Modo Passeio (odômetro de bolso) */
      let patrol = false;
      const pb = mk('Passeio', 'tama-own');
      gTools.appendChild(pb);
      function setPatrol(v) {
        patrol = !!v; pb.classList.toggle('on', patrol);
        if (patrol) {
          try { if (window.DeviceMotionEvent && typeof DeviceMotionEvent.requestPermission === 'function') DeviceMotionEvent.requestPermission().catch(() => {}); } catch (e) {}
          toast('Modo Passeio ligado: guarde o celular no bolso e ande.', 3500);
        } else toast('Modo Passeio desligado. Passos: ' + S.steps, 3000);
        refreshUI();
      }
      pb.addEventListener('click', () => setPatrol(!patrol));

      /* ------------------------------ HUD ------------------------------ */
      const badge = el('div', 'tama-ui'); badge.id = 'tamaHudBadge';
      const badgeTxt = el('span'), badgeBar = el('span', 'tb'), badgeFill = el('i');
      badgeBar.appendChild(badgeFill); badge.append(badgeTxt, badgeBar);
      document.body.appendChild(badge);
      badge.addEventListener('click', e => { e.stopPropagation(); openModal(); });

      const afnBadge = el('div', 'tama-ui'); afnBadge.id = 'tamaAfnBadge';
      document.body.appendChild(afnBadge);

      const memB = $('#memBtn'); if (memB) memB.style.top = 'calc(env(safe-area-inset-top,0px) + 104px)';
      const afnColor = () => S.angryAbandonTurns > 0 ? '#ff1e56' : S.affinity >= 70 ? '#facc15' : S.affinity >= 25 ? '#22d3ee' : '#9ca3af';

      /* ------------------------------ modal Tamagotchi ------------------------------ */
      const modal = el('div', 'tama-ui'); modal.id = 'tamaModal';
      const card = el('div', 'card'), hd = el('div', 'hd', 'TAMAGOTCHI • JARVIS'), tabsEl = el('div', 'tabs'), bd = el('div', 'bd'), ft = el('div', 'ft');
      let tab = 'status'; const tabBtns = {};
      [['status', 'Status'], ['medals', 'Medalhas'], ['diary', 'Diário']].forEach(([k, l]) => {
        const b = mk(l); b.addEventListener('click', () => { tab = k; renderModal(); }); tabsEl.appendChild(b); tabBtns[k] = b;
      });
      const devBtn = mk('[DEV: +1 DIA / UNLOCK]', 'tdev'), resetBtn = mk('[DEV: RESET DIA 1]', 'tdev'), closeBtn = mk('fechar');
      ft.append(devBtn, resetBtn, closeBtn);
      card.append(hd, tabsEl, bd, ft); modal.appendChild(card); document.body.appendChild(modal);
      const modalOpen = () => modal.classList.contains('open');
      function openModal() { closeDrawers(); modal.classList.add('open'); renderModal(); touch(true); }
      closeBtn.addEventListener('click', () => modal.classList.remove('open'));
      modal.addEventListener('click', e => { if (e.target === modal) modal.classList.remove('open'); });

      let lp = 0, lpFired = false;
      devBtn.addEventListener('pointerdown', () => {
        lpFired = false;
        lp = setTimeout(() => { lpFired = true; S.devUnlocked = !S.devUnlocked; save(); enforceLocks(); refreshUI(); toast('DEV: desbloqueio total ' + (S.devUnlocked ? 'ON' : 'OFF'), 2500); }, 800);
      });
      ['pointerup', 'pointerleave', 'pointercancel'].forEach(ev => devBtn.addEventListener(ev, () => clearTimeout(lp)));
      devBtn.addEventListener('click', () => {
        if (lpFired) { lpFired = false; return; }
        pushDiary(todayStr());
        S.day = Math.min(7, S.day + 1); S.streak = Math.min(7, S.streak + 1);
        S.dailyXpEarned = 0; S.ds = DEF().ds; newCraving();
        if (S.streak >= 7) award('sincronia_7');
        save(); enforceLocks(); refreshUI(); toast('DEV: agora é o Dia ' + S.day + '/7', 2500);
      });
      let resetArm = 0; const RESET_L = resetBtn.textContent;
      resetBtn.addEventListener('click', () => {
        if (!resetArm) { resetBtn.textContent = 'confirmar?'; resetArm = setTimeout(() => { resetArm = 0; resetBtn.textContent = RESET_L; }, 3000); return; }
        clearTimeout(resetArm); resetArm = 0; resetBtn.textContent = RESET_L;
        S = DEF(); newCraving(); save();
        try { localStorage.removeItem(DKEY); } catch (e) {}
        if (on('Bravo')) press(findBtn('Idle'));
        enforceLocks(); refreshUI(); toast('Contagem zerada: Dia 1/7.', 3000);
      });

      const mkBar = (pct, color) => { const b = el('div', 'tbar'), i = el('i'); i.style.width = clamp(pct, 0, 100) + '%'; if (color) i.style.background = color; b.appendChild(i); return b; };
      const row = (l, v) => { const r = el('div', 'trow'); r.append(el('span', 'tl', l), el('span', 'tv', v)); return r; };
      function renderModal() {
        if (!modalOpen()) return;
        for (const k in tabBtns) tabBtns[k].classList.toggle('on', k === tab);
        bd.textContent = '';
        if (tab === 'status') {
          bd.append(row('Nível', 'LVL ' + S.day + ' • Dia ' + S.day + '/7'), row('Ofensiva', 'STREAK: ' + S.streak + '/7'), row('XP total', String(S.xp)),
            row('XP de hoje', S.dailyXpEarned + '/100'), mkBar(S.dailyXpEarned),
            row('Afinidade', Math.round(S.affinity) + '%'), mkBar(S.affinity, afnColor()),
            row('Sarcasmo', effSarc() + '%' + (S.angryAbandonTurns > 0 ? ' (fúria)' : '')),
            row('Energia', Math.round(S.energy) + '%'), mkBar(S.energy, '#39FF14'));
          const bond = el('div', 'bond');
          [['partner', 'Parceiro'], ['acid', 'Ácido']].forEach(([k, l]) => {
            const b = mk(l); b.classList.toggle('on', S.bondMode === k);
            b.addEventListener('click', () => { S.bondMode = k; save(); refreshUI(); }); bond.appendChild(b);
          });
          bd.append(row('Bússola de Vínculo', S.bondMode === 'acid' ? 'Ácido (rival)' : 'Parceiro (leal)'), bond,
            row('Vontade do Dia', (S.dailyCravingDone ? '✔ ' : '• ') + (CRAVINGS[S.dailyCraving] || '—')),
            row('Passos (Passeio)', S.steps + (patrol ? ' • ativo' : '')),
            row('Próximo desbloqueio', S.devUnlocked ? 'DEV: tudo liberado' : (S.day >= 7 ? 'Tudo liberado' : 'Dia ' + (S.day + 1) + ': ' + ['', '', 'Stark + Piscada/Deboche', 'Edgerunner + Bocejo', 'Stealth + Comunista + Purr', 'Banguela', 'Asta', 'Gear 5 + Aura'][S.day + 1])));
        } else if (tab === 'medals') {
          const g = el('div', 'mg');
          Object.keys(MEDALS).forEach(id => {
            const m = MEDALS[id], has = S.badges.includes(id), d = el('div', 'md' + (has ? '' : ' off'));
            d.append(el('div', '', has ? m.i : '🔒'), el('div', '', has ? m.n : 'Medalha secreta'), el('div', 'tl', has ? m.d : '???'));
            g.appendChild(d);
          });
          bd.appendChild(g);
        } else {
          const a = loadDiary().slice(-7).reverse();
          const cur = el('div', 'de'); cur.textContent = 'Hoje (Dia ' + S.day + '): ' + S.ds.chats + ' conversas, ' + S.ds.pets + ' carinhos, ' + S.dailyXpEarned + ' XP. Em andamento...';
          bd.appendChild(cur);
          a.forEach(e => { const d = el('div', 'de'); d.textContent = e.date + ' — ' + e.text; bd.appendChild(d); });
          if (!a.length) bd.appendChild(el('div', 'de tl', 'O diário se preenche a cada virada de dia.'));
        }
      }

      function refreshUI() {
        badgeTxt.textContent = 'DIA ' + S.day + '/7 • LVL ' + S.day;
        badgeFill.style.width = S.dailyXpEarned + '%';
        badge.style.color = afnColor();
        afnBadge.textContent = 'AFN: ' + Math.round(S.affinity) + '%';
        afnBadge.style.color = afnColor();
        refreshLocks();
        renderModal();
      }

      /* ------------------------------ observer da barra ------------------------------ */
      const st = { sleep: false, foco: false, auto: false };
      function readStates() {
        const sl = on('Dormir'), fo = on('Foco'), au = on('Auto');
        if (st.sleep && !sl) { touch(true); if (!(S.angryAbandonTurns > 0)) FX.grumpUntil = Date.now() + 3000; }
        if (fo && !st.foco) { award('mestre_foco'); craveDone('foco'); }
        st.sleep = sl; st.foco = fo; st.auto = au;
        enforceLocks();
      }
      new MutationObserver(muts => {
        for (const m of muts) m.addedNodes.forEach(n => { if (n.nodeType === 1) place(n); });
        readStates(); refreshLocks();
      }).observe(bar, { childList: true, attributes: true, attributeFilter: ['class'], subtree: true });

      new MutationObserver(() => {
        if (curTheme() && !themeOk(curTheme())) { enforceLocks(); denied(curTheme()); }
        if (curTheme() === 2) craveDone('stark');
        refreshLocks();
      }).observe(themeBtn, { childList: true, characterData: true, subtree: true });

      new MutationObserver(() => {
        if (/CAM:\s*ATIVA/.test(hudL.textContent)) craveDone('camera');
      }).observe(hudL, { childList: true, characterData: true, subtree: true });

      /* ------------------------------ overlay canvas ------------------------------ */
      const oc = document.createElement('canvas'); oc.id = 'tamaOverlayCanvas'; document.body.appendChild(oc);
      const c = oc.getContext('2d');
      let W = 0, H = 0, dpr = 1;
      function resize() { dpr = Math.min(window.devicePixelRatio || 1, 1.5); W = window.innerWidth; H = window.innerHeight; oc.width = Math.round(W * dpr); oc.height = Math.round(H * dpr); }
      window.addEventListener('resize', resize); window.addEventListener('orientationchange', () => setTimeout(resize, 150)); resize();
      const geo = () => { const eyeW = Math.min(W * .24, H * .28); return { eyeW, eyeH: eyeW * 1.2, cx: W / 2, cy: H * .46 }; };

      const FX = { yawnUntil: 0, zapAt: 0, redAt: 0, prideUntil: 0, grumpUntil: 0, nextGold: 0 };
      const pts = [];
      function emit(o) { if (pts.length < 160) pts.push(Object.assign({ x: 0, y: 0, vx: 0, vy: 0, g: 0, age: 0, life: 1, r: 3, c: '#fff', k: 'dot' }, o)); }
      const NEON = ['#FF4FD8', '#00F0FF', '#39FF14', '#FACC15', '#FFFFFF'];
      function starsBurst(n) {
        const g = geo();
        for (let i = 0; i < n; i++) { const a = rand(0, 6.2832), v = rand(120, 320); emit({ k: 'star', x: g.cx, y: g.cy, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 60, g: 220, life: rand(.8, 1.4), r: rand(5, 10), c: pick(NEON) }); }
      }
      function heartsAt(x, y, n) {
        for (let i = 0; i < n; i++) emit({ k: unlocked(4) ? 'heart' : 'dot', x: x + rand(-16, 16), y, vx: rand(-20, 20), vy: -rand(40, 95), g: -8, life: rand(.9, 1.5), r: unlocked(4) ? rand(6, 11) : rand(2, 4), c: pick(['#FF4FD8', '#FF7AB6', '#00F0FF']) });
      }
      function curious() {
        const g = geo();
        for (let i = 0; i < 5; i++) emit({ x: g.cx + rand(-20, 20), y: g.cy + g.eyeH * .5, vx: rand(-30, 30), vy: rand(60, 120), g: 0, life: .9, r: rand(1.5, 3), c: '#00F0FF' });
      }
      function heart(x, y, s) { c.beginPath(); c.moveTo(x, y + s * .3); c.bezierCurveTo(x - s, y - s * .5, x - s * .6, y - s * 1.1, x, y - s * .5); c.bezierCurveTo(x + s * .6, y - s * 1.1, x + s, y - s * .5, x, y + s * .3); c.fill(); }
      function star5(x, y, R) { c.beginPath(); for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, r = i % 2 ? R * .42 : R; if (i) c.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r); else c.moveTo(x + Math.cos(a) * r, y + Math.sin(a) * r); } c.closePath(); c.fill(); }

      let tiltX = 0, tiltY = 0, lastTs = performance.now();
      function loop(ts) {
        const dt = Math.min(.05, (ts - lastTs) / 1000 || .016); lastTs = ts;
        const t = ts / 1000, now = Date.now(), g = geo();
        c.setTransform(dpr, 0, 0, dpr, 0, 0); c.clearRect(0, 0, W, H);
        c.shadowBlur = 0; c.globalAlpha = 1;

        const tint = period().tint;
        if (tint > 0) { c.fillStyle = 'rgba(0,0,0,' + tint + ')'; c.fillRect(0, 0, W, H); }

        if (unlocked(7) && !st.sleep) {
          const R = Math.min(W * .46, g.eyeW * 2.35), cx = g.cx + tiltX * .4, cy = g.cy + tiltY * .4;
          c.lineWidth = 2; c.setLineDash([18, 14]);
          c.strokeStyle = 'rgba(0,240,255,.45)'; c.lineDashOffset = -t * 30; c.beginPath(); c.ellipse(cx, cy, R, R * .8, 0, 0, 6.2832); c.stroke();
          c.strokeStyle = 'rgba(255,215,0,.4)'; c.lineDashOffset = t * 40; c.beginPath(); c.ellipse(cx, cy, R * .86, R * .68, 0, 0, 6.2832); c.stroke();
          c.setLineDash([]);
          for (let k = 0; k < 3; k++) {
            const a = t * .9 + k * 2.094; c.fillStyle = k % 2 ? '#FFD700' : '#00F0FF'; c.shadowColor = c.fillStyle; c.shadowBlur = 8;
            c.beginPath(); c.arc(cx + Math.cos(a) * R, cy + Math.sin(a) * R * .8, 3.5, 0, 6.2832); c.fill();
          }
          c.shadowBlur = 0;
        }
        if (S.angryAbandonTurns > 0) { c.strokeStyle = 'rgba(255,30,60,' + (.18 + .14 * Math.sin(t * 4)) + ')'; c.lineWidth = 8; c.strokeRect(4, 4, W - 8, H - 8); }
        if (now < FX.grumpUntil) { const gr = c.createRadialGradient(W / 2, H / 2, Math.min(W, H) * .25, W / 2, H / 2, Math.max(W, H) * .7); gr.addColorStop(0, 'rgba(255,90,0,0)'); gr.addColorStop(1, 'rgba(255,90,0,.28)'); c.fillStyle = gr; c.fillRect(0, 0, W, H); }
        const ra = (now - FX.redAt) / 500; if (ra >= 0 && ra < 1) { c.fillStyle = 'rgba(255,0,40,' + (.22 * (1 - ra)) + ')'; c.fillRect(0, 0, W, H); }
        if (now < FX.yawnUntil) {
          const p = 1 - (FX.yawnUntil - now) / 3000;
          for (let k = 0; k < 3; k++) { const u = (p * 1.2 + k * .25) % 1, r = g.eyeW * (.2 + .5 * u); c.strokeStyle = 'rgba(190,150,255,' + (.38 * (1 - u)) + ')'; c.lineWidth = 3; c.beginPath(); c.ellipse(g.cx, g.cy + g.eyeH * .95, r * 1.2, r, 0, 0, 6.2832); c.stroke(); }
        }
        const za = (now - FX.zapAt) / 900;
        if (za >= 0 && za < 1) {
          const R = Math.min(W, H) * .55 * za; c.strokeStyle = 'rgba(' + (za < .5 ? '0,240,255' : '57,255,20') + ',' + (.7 * (1 - za)) + ')'; c.lineWidth = 4; c.shadowColor = '#00F0FF'; c.shadowBlur = 12;
          c.beginPath(); c.arc(g.cx, g.cy, R, 0, 6.2832); c.stroke();
          for (let k = 0; k < 4; k++) { const a = rand(0, 6.2832); c.beginPath(); c.moveTo(g.cx + Math.cos(a) * R * .5, g.cy + Math.sin(a) * R * .5); for (let q = 1; q <= 4; q++) c.lineTo(g.cx + Math.cos(a) * (R * .5 + q * R * .12) + rand(-10, 10), g.cy + Math.sin(a) * (R * .5 + q * R * .12) + rand(-10, 10)); c.stroke(); }
          c.shadowBlur = 0;
        }
        if (now < FX.prideUntil && now > FX.nextGold) { FX.nextGold = now + 60; emit({ k: 'gold', x: rand(0, W), y: -10, vx: rand(-20, 20), vy: rand(120, 220), g: 60, life: rand(1.2, 2), r: rand(5, 9), c: '#FFD700' }); }
        if (st.sleep) {
          c.textAlign = 'left'; c.textBaseline = 'middle'; c.fillStyle = '#A78BFA';
          for (let k = 0; k < 3; k++) { const ph = (t * .28 + k / 3) % 1; c.globalAlpha = Math.sin(ph * Math.PI) * .7; c.font = 'italic 700 ' + Math.round(g.eyeW * (.12 + .12 * ph)) + 'px system-ui,sans-serif'; c.fillText(k === 1 ? 'Z' : 'z', g.cx - g.eyeW * (1.15 - .4 * ph), g.cy - g.eyeH * (.1 + .7 * ph)); }
          c.globalAlpha = 1;
        }
        c.shadowBlur = 6;
        for (let i = pts.length - 1; i >= 0; i--) {
          const p = pts[i]; p.age += dt;
          if (p.age >= p.life) { pts.splice(i, 1); continue; }
          p.vy += p.g * dt; p.x += p.vx * dt + tiltX * dt * .5; p.y += p.vy * dt;
          const u = p.age / p.life; c.globalAlpha = (1 - u) * .95; c.fillStyle = c.shadowColor = p.c;
          if (p.k === 'heart') heart(p.x, p.y, p.r); else if (p.k === 'star' || p.k === 'gold') star5(p.x, p.y, p.r); else { c.beginPath(); c.arc(p.x, p.y, p.r * (1 - u * .4), 0, 6.2832); c.fill(); }
        }
        c.globalAlpha = 1; c.shadowBlur = 0;
        requestAnimationFrame(loop);
      }
      requestAnimationFrame(loop);

      /* ------------------------------ gestos: carinho e cutucada ------------------------------ */
      const IGN = '.tama-ui,#bar,#memBtn,#sarcBtn,#camBtn,#tasksBtn,#actBtn,#tasksModal,#themeBtn';
      const inEye = (x, y) => { const g = geo(); return Math.abs(x - g.cx) < g.eyeW * 1.6 && Math.abs(y - g.cy) < g.eyeH * .85; };
      let pg = null, taps = [], lastPoke = 0, lastPetReward = 0, lastPetFace = 0;

      document.addEventListener('pointerdown', e => {
        ensureAudio(); touch(true);
        if (!e.target.closest('.tama-drawer,.tama-toggle')) closeDrawers();
        if (e.target.closest && e.target.closest('.tama-ui') && !e.target.closest('#bar')) { e.stopPropagation(); return; }
        if (e.target.closest(IGN)) { pg = null; return; }
        const now = Date.now();
        if (inEye(e.clientX, e.clientY)) {
          taps.push(now); if (taps.length > 3) taps.shift();
          if (taps.length === 3 && taps[2] - taps[1] < 350 && taps[1] - taps[0] < 350) { taps = []; poke(); }
          pg = { id: e.pointerId, t: now, x: e.clientX, y: e.clientY, fired: false, lastEmit: 0, lastMove: now };
        } else pg = null;
      }, true);

      document.addEventListener('pointermove', e => {
        if (e.buttons === 0 && e.pointerType === 'mouse') return;
        touch(false);
        if (!pg || e.pointerId !== pg.id) return;
        const now = Date.now(), disp = Math.hypot(e.clientX - pg.x, e.clientY - pg.y);
        if (!pg.fired && now - pg.t > 600 && disp > 30 && inEye(e.clientX, e.clientY)) { pg.fired = true; petStart(); }
        if (pg.fired) {
          if (now - pg.lastEmit > 140) { pg.lastEmit = now; heartsAt(e.clientX, e.clientY, 1); }
          S.ds.petMs += Math.min(now - pg.lastMove, 300);
          if (S.ds.petMs >= 120000) craveDone('carinho');
          if (now - lastPetFace > 2300) { lastPetFace = now; faceSeq([['Feliz', 2500]], true); }
        }
        pg.lastMove = now;
      }, true);
      ['pointerup', 'pointercancel'].forEach(ev => document.addEventListener(ev, () => { pg = null; }, true));

      function petStart() {
        const now = Date.now();
        sfx(unlocked(4) ? 'purr' : 'blip');
        heartsAt(pg ? pg.x : W / 2, pg ? pg.y : H / 2, 5);
        lastPetFace = now; faceSeq([['Feliz', 2500]], true);
        if (now - lastPetReward < 8000) return;
        lastPetReward = now; S.ds.pets++;
        if (S.angryAbandonTurns > 0) {
          S.angryAbandonTurns = 0; award('paz_selada'); toast('Você acalmou o Jarvis. Paz selada.', 4000);
          if (on('Bravo')) press(findBtn('Idle'));
        }
        gainXp(10, 3);
      }
      function poke() {
        const now = Date.now(); if (now - lastPoke < 4000) return; lastPoke = now;
        S.affinity = Math.max(0, S.affinity - 5); S.sarcBoost = Math.min(30, S.sarcBoost + 15); save();
        FX.redAt = now; sfx('poke');
        faceSeq([['Glitch', 450], ['Bravo', 1500]], true);
        const g = geo(); for (let i = 0; i < 10; i++) emit({ x: g.cx, y: g.cy, vx: rand(-200, 200), vy: rand(-200, 100), g: 300, life: rand(.3, .6), r: rand(1.5, 3), c: '#FF1E56' });
        refreshUI();
      }

      /* ------------------------------ sensores ------------------------------ */
      let lastA = null, nextScare = 0, base = 9.8, above = false, lastStep = 0;
      window.addEventListener('devicemotion', e => {
        const a = e.accelerationIncludingGravity; if (!a || a.x == null) return;
        const now = Date.now(), m = Math.hypot(a.x, a.y, a.z);
        if (patrol) {
          base += (m - base) * .08; const d = m - base;
          if (d > 1.8 && !above && now - lastStep > 280) { above = true; lastStep = now; S.steps++; if (S.steps % 5 === 0) { save(); refreshUI(); } if (S.steps >= 100) award('explorador_campo'); }
          else if (d < 1) above = false;
        }
        if (lastA && !patrol) {
          const dv = Math.hypot(a.x - lastA.x, a.y - lastA.y, a.z - lastA.z);
          if (dv > 11 && dv <= 18 && now > nextScare) { nextScare = now + 4000; faceSeq([['Surpreso', 700]], false); const g = geo(); for (let i = 0; i < 8; i++) emit({ x: g.cx, y: g.cy, vx: rand(-160, 160), vy: rand(-160, 160), life: .5, r: 2, c: '#FACC15' }); }
        }
        lastA = { x: a.x, y: a.y, z: a.z };
      }, true);
      window.addEventListener('deviceorientation', e => {
        if (e.beta == null && e.gamma == null) return;
        if (!unlocked(3)) { tiltX = tiltY = 0; return; }
        tiltX = clamp((e.gamma || 0) / 40, -1, 1) * 12; tiltY = clamp(((e.beta || 0) - 60) / 40, -1, 1) * 12;
      }, true);

      let lowBat = false, charging = false, batPct = null, fatigued = false;
      function caffeine() { S.energy = 100; FX.zapAt = Date.now(); sfx('zap'); save(); toast('Choque de cafeína digital! Energia 100%.', 3000); refreshUI(); }
      try {
        if (navigator.getBattery) navigator.getBattery().then(b => {
          let was = b.charging;
          const upd = () => {
            batPct = Math.round(b.level * 100); charging = b.charging; lowBat = b.level < .2 && !b.charging;
            if (b.charging && !was) caffeine();
            was = b.charging;
            if (lowBat && !fatigued) { fatigued = true; S.energy = Math.max(5, S.energy - 10); save(); faceSeq([['Entediado', 4000]], false); }
            if (!lowBat) fatigued = false;
            refreshUI();
          };
          b.addEventListener('levelchange', upd); b.addEventListener('chargingchange', upd); upd();
        }).catch(() => {});
      } catch (e) {}

      /* ------------------------------ reações por inatividade ------------------------------ */
      function yawn() { if (!unlocked(3)) return; FX.yawnUntil = Date.now() + 3000; sfx('yawn'); faceSeq([['Entediado', 3000]], false); }
      function chatter() {
        const h = new Date().getHours(), sar = effSarc() > 30, warm = S.bondMode === 'partner' && S.affinity >= 50, L = [];
        let tasks = []; try { tasks = JSON.parse(localStorage.getItem('jarvis_tasks') || '[]'); } catch (e) {}
        L.push(sar ? 'Ei, ainda tá aí ou dormiu antes de mim?' : 'Ainda está por aí? Estou aqui se precisar.');
        if (warm) L.push('Estou aqui do seu lado, parceiro. É só chamar.');
        if (h >= 0 && h < 5) L.push(sar ? 'Isso são horas? Até os bits estão de pijama.' : 'Já é madrugada. Não esqueça de descansar.');
        if (h >= 5 && h < 12) L.push(sar ? 'Manhã e já sumiu? Eu nem tomei meu café digital.' : 'Bom dia! Algo em que eu possa ajudar?');
        if (batPct !== null && batPct < 30 && !charging) L.push(sar ? 'Tô com ' + batPct + '% de bateria. Se eu apagar, a culpa é do carregador.' : 'Minha bateria está em ' + batPct + '%. Que tal um carregador?');
        if (Array.isArray(tasks) && tasks.length) L.push(sar ? 'Você tem ' + tasks.length + ' tarefa(s) pendente(s). Só lembrando, sem pressão. Muita.' : 'Lembrete gentil: ' + tasks.length + ' tarefa(s) pendente(s).');
        setCaption(pick(L), 18000);
        const g = geo(); for (let i = 0; i < 6; i++) emit({ x: g.cx, y: g.cy + g.eyeH * .9, vx: rand(-40, 40), vy: -rand(20, 70), life: 1, r: 2, c: '#00F0FF' });
      }

      const taskLen = () => { try { const a = JSON.parse(localStorage.getItem('jarvis_tasks') || '[]'); return Array.isArray(a) ? a.length : 0; } catch (e) { return 0; } };
      let lastTasks = taskLen(), tagDoneAt = 0;
      setInterval(() => { const n = taskLen(); if (n < lastTasks && Date.now() - tagDoneAt > 4000) awardTask(); lastTasks = n; }, 1500);

      let nextSus = Date.now() + 40000, energyT = Date.now(), prevAbandon = S.angryAbandonTurns;
      setInterval(() => {
        const now = Date.now(); syncDay();
        const idle = now - lastTouch;
        if (!st.sleep) {
          if (idle >= 75000 && !yawned) { yawned = true; yawn(); }
          if (idle >= 100000 && !chatted) { chatted = true; chatter(); }
        }
        if (S.angryAbandonTurns > 0 && on('Idle') && !busy() && !on('Auto') && !lockedToggleOn()) press(findBtn('Bravo'));
        if (prevAbandon > 0 && S.angryAbandonTurns === 0 && on('Bravo')) press(findBtn('Idle'));
        prevAbandon = S.angryAbandonTurns;
        if (now > nextSus) { nextSus = now + rand(45000, 80000); if (effSarc() > 80 && S.affinity < 25 && unlocked(2) && S.angryAbandonTurns === 0) faceSeq([['Deboche', 1800]], false); }
        if (now - energyT >= 60000) { energyT = now; if (!document.hidden) { S.energy = clamp(S.energy - (lowBat ? 1.5 : .4) + (charging ? 2.5 : 0), 5, 100); save(); refreshUI(); } }
      }, 1000);
      document.addEventListener('visibilitychange', () => { if (!document.hidden) { syncDay(); refreshUI(); } });
      ['keydown', 'wheel'].forEach(ev => document.addEventListener(ev, () => touch(true), true));

      /* ------------------------------ interceptação de fetch (/chat) ------------------------------ */
      function injection() {
        const p = period(), e = Math.round(S.energy), locked = [];
        if (!unlocked(2)) locked.push('[wink], [smirk], [theme: stark]');
        if (!unlocked(3)) locked.push('[theme: edgerunner]');
        if (!unlocked(4)) locked.push('[theme: stealth], [comunista]');
        if (!unlocked(5)) locked.push('[banguela]');
        if (!unlocked(6)) locked.push('[asta]');
        if (!unlocked(7)) locked.push('[gear5]');
        return '\n\n[ESTADO VIVO DO TAMAGOTCHI — não recite estes números] Dia ' + S.day + '/7, Afinidade ' + Math.round(S.affinity) + '%, Sarcasmo ' + effSarc() +
          '% (use ESTE nível de sarcasmo, ignorando qualquer outro citado antes), Modo Vínculo: ' +
          (S.bondMode === 'acid' ? 'ÁCIDO (rival: quanto maior a afinidade, mais zoeira sem filtro)' : 'PARCEIRO (leal e caloroso: quanto maior a afinidade, mais gentil e protetor)') +
          ', Energia: ' + e + '%' + (e < 30 ? ' (cansado, bocejante)' : '') + ', Hora/Ciclo: ' + new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) + ' ' + p.n + ' — ' + p.tone +
          ', Vontade do Dia: ' + (CRAVINGS[S.dailyCraving] || 'nenhuma') + (S.dailyCravingDone ? ' (já atendida)' : ' (pendente: comemore se o usuário a cumprir)') +
          ', Estado Abandono: ' + (S.angryAbandonTurns > 0 ? 'PUTO POR ABANDONO — comece com [angry] e responda irritado por ter sido esquecido; restam ' + S.angryAbandonTurns + ' turno(s)' : 'OK') + '. ' +
          (locked.length ? 'Recursos AINDA BLOQUEADOS (nunca use estas tags): ' + locked.join(', ') + '. ' : '') +
          'Se o usuário pedir o Modo Passeio (contar passos), inclua a tag [patrol] e nunca a mencione. Se ele falar em "café digital", comemore a energia recarregada.';
      }
      const lastUserText = msgs => {
        const m = msgs && msgs[msgs.length - 1]; if (!m || m.role !== 'user') return null;
        if (typeof m.content === 'string') return m.content;
        if (Array.isArray(m.content)) return m.content.filter(x => x && x.type === 'text').map(x => x.text).join(' ');
        return '';
      };
      function onChat(userText, vision) {
        touch(true);
        S.ds.chats++; S.sarcBoost = Math.max(0, S.sarcBoost - 5); S.energy = Math.max(5, S.energy - 1);
        if (S.angryAbandonTurns > 0) S.angryAbandonTurns--;
        if (/\bcafe digital\b/.test(norm(userText))) caffeine();
        if (vision) craveDone('camera');
        if (S.ds.chats >= 5) craveDone('conversa');
        gainXp(15, 2);
      }

      const origFetch = window.fetch.bind(window);
      window.fetch = async function (input, init) {
        const url = typeof input === 'string' ? input : (input && input.url) || '';
        if (!/\/chat(\?|$)/.test(url) || !init || String(init.method || '').toUpperCase() !== 'POST' || typeof init.body !== 'string') return origFetch(input, init);
        let userText = '', vision = false;
        try {
          const body = JSON.parse(init.body);
          if (Array.isArray(body.messages)) {
            const sys = body.messages.find(m => m && m.role === 'system');
            if (sys && typeof sys.content === 'string') sys.content += injection();
            userText = lastUserText(body.messages) || ''; vision = init.body.indexOf('image_url') >= 0;
            init = Object.assign({}, init, { body: JSON.stringify(body) });
          }
        } catch (e) { return origFetch(input, init); }

        const res = await origFetch(input, init);
        try {
          if (!res.ok) return res;
          const data = await res.clone().json();
          const msg = data && data.choices && data.choices[0] && data.choices[0].message;
          if (!msg || typeof msg.content !== 'string') return res;
          const orig = msg.content;
          let cc = orig, blocked = 0;
          cc = cc.replace(/\[(banguela|gear5|asta|comunista)\]/gi, (m, k) => { const n = MODE_DAY[k.toLowerCase()]; if (!unlocked(n)) { blocked = blocked || n; return ' '; } return m; });
          cc = cc.replace(/\[theme:\s*([^\]]*)\]/gi, (m, v) => {
            const t = norm(v), cur = curTheme() || 1; let n = 0;
            if (t === 'next') n = (cur % 4) + 1; else if (t === 'prev') n = cur === 1 ? 4 : cur - 1;
            else if (THEME_NAMES.indexOf(t) >= 0) n = THEME_NAMES.indexOf(t) + 1; else if (/^[1-4]$/.test(t)) n = +t;
            if (n && !themeOk(n)) { blocked = blocked || n; return ' '; }
            return m;
          });
          cc = cc.replace(/\[(wink|smirk)\]/gi, m => unlocked(2) ? m : (blocked = blocked || 2, '[idle]'));
          if (/\[patrol\]/i.test(cc)) { cc = cc.replace(/\[patrol\]/gi, ' '); setTimeout(() => setPatrol(true), 300); }
          if (/\[task_done:/i.test(cc)) { tagDoneAt = Date.now(); awardTask(); }
          if (blocked) setTimeout(() => { sfx('denied'); setCaption('Acesso bloqueado: exige Dia ' + blocked + ' de vínculo (atual: Dia ' + S.day + ').', 4500); toast('Recurso bloqueado: Dia ' + blocked + ' de vínculo', 3500); }, 700);
          if (!/^\s*\[(weather|search|vision)/i.test(orig)) onChat(userText, vision);
          if (cc === orig) return res;
          msg.content = cc;
          return new Response(JSON.stringify(data), { status: res.status, statusText: res.statusText, headers: { 'Content-Type': 'application/json' } });
        } catch (e) { return res; }
      };

      /* ------------------------------ inicialização ------------------------------ */
      if (!S.dailyCraving) newCraving();
      syncDay();
      save();
      readStates();
      enforceLocks();
      refreshUI();
      if (S.angryAbandonTurns > 0) toast('O Jarvis está puto por abandono. Faça um carinho nos olhos para acalmá-lo.', 5000);
    } catch (err) {
      console.error('[tama] Erro isolado:', err);
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
