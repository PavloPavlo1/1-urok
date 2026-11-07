'use strict';
/* Інтерфейс гри: дошка, перетягування, ходи, ШІ, збереження партії */
(function () {
  const C = window.Chess;
  const VS = '︎'; // змушує показувати символ як текст, а не емодзі
  const GLYPH = { K: '♚', Q: '♛', R: '♜', B: '♝', N: '♞', P: '♟' };
  const PV = { P: 1, N: 3, B: 3, R: 5, Q: 9, K: 0 };
  const LEVELS = { 1: 'Новачок', 2: 'Середній', 3: 'Сильний' };
  const SAVE_KEY = 'chess.save.v1';

  const $ = (id) => document.getElementById(id);
  const els = {
    board: $('board'), status: $('status'), moves: $('moves'),
    topName: $('topName'), botName: $('botName'), topCaps: $('topCaps'), botCaps: $('botCaps'),
    mode: $('mode'), modeBtn: $('modeBtn'), side: $('side'), level: $('level'),
    newBtn: $('newBtn'), undoBtn: $('undoBtn'), hintBtn: $('hintBtn'),
    promo: $('promo'), promoChoices: $('promoChoices'),
    over: $('over'), overTitle: $('overTitle'), overText: $('overText'),
    overNew: $('overNew'), overClose: $('overClose'),
  };
  const settingsBox = document.querySelector('.settings');
  const actionsBox = document.querySelector('.actions');

  const settings = { mode: 'ai', side: 'w', level: 2 };
  let humanSide = 'w';
  let flipped = false;
  let g = null;          // партія
  let sel = null;        // вибрана клітинка [r, c]
  let targets = [];      // легальні ходи вибраної фігури
  let hint = null;       // підказка
  let busy = false;      // комп'ютер думає
  let aiToken = 0;
  let pendingPromo = null;

  const same = (a, b) => a[0] === b[0] && a[1] === b[1];
  const cur = () => g.states[g.states.length - 1];
  const analysis = () => g.an || (g.an = C.analyse(cur(), g.keys));
  const isAI = () => settings.mode === 'ai';
  const humanTurn = () => !isAI() || cur().turn === humanSide;
  const colorName = (c) => (c === 'w' ? 'Білі' : 'Чорні');

  /* ---------- Стан партії ---------- */
  function resetGame() {
    const s = C.initialState();
    g = { states: [s], moves: [], sans: [], caps: [], keys: [C.key(s)], an: null, overShown: false };
    sel = null; targets = []; hint = null; pendingPromo = null;
  }

  function pushMove(m) {
    const s = cur();
    const legal = C.legalMoves(s);
    let san = C.sanBase(s, m, legal);
    const cap = s.board[m.to[0]][m.to[1]] || (m.ep ? s.board[m.from[0]][m.to[1]] : null);
    const ns = C.apply(s, m);
    const key = C.key(ns);
    g.keys.push(key);
    const a = C.analyse(ns, g.keys);
    if (a.result === 'checkmate') san += '#';
    else if (a.check) san += '+';
    g.states.push(ns);
    g.moves.push(m);
    g.sans.push(san);
    g.caps.push(cap);
    g.an = a;
    if (isAI()) flipped = !flipped;
    hint = null;
  }

  function popMove() {
    g.states.pop(); g.moves.pop(); g.sans.pop(); g.caps.pop(); g.keys.pop();
    if (isAI()) flipped = !flipped;
    g.an = null; g.overShown = false;
  }

  /* ---------- Збереження ---------- */
  function save() {
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify({
        settings, humanSide, flipped,
        moves: g.moves.map((m) => ({ f: m.from, t: m.to, p: m.promoTo || null })),
      }));
    } catch (e) { /* приватний режим — ігноруємо */ }
  }

  function restore() {
    try {
      const d = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null');
      if (!d || !Array.isArray(d.moves)) return false;
      Object.assign(settings, d.settings || {});
      humanSide = d.humanSide === 'b' ? 'b' : 'w';
      resetGame();
      for (const x of d.moves) {
        const m = C.legalMoves(cur()).find((o) => same(o.from, x.f) && same(o.to, x.t));
        if (!m) throw new Error('bad save');
        if (x.p) m.promoTo = x.p;
        pushMove(m);
      }
      flipped = !!d.flipped;
      g.overShown = analysis().over; // не показувати вікно результату повторно
      return true;
    } catch (e) {
      return false;
    }
  }

  /* ---------- Дії ---------- */
  function startNew() {
    settings.mode = els.mode.value;
    settings.side = els.side.value;
    settings.level = +els.level.value;
    humanSide = settings.side === 'r' ? (Math.random() < 0.5 ? 'w' : 'b') : settings.side;
    flipped = false;
    aiToken++; busy = false;
    resetGame();
    afterMove();
  }

  function afterMove() {
    save();
    render();
    const a = analysis();
    if (a.over) {
      if (!g.overShown) { g.overShown = true; setTimeout(showOver, 350); }
      return;
    }
    maybeAI();
  }

  function maybeAI() {
    if (!isAI() || analysis().over || cur().turn === humanSide) return;
    const token = ++aiToken;
    busy = true;
    render();
    setTimeout(() => {
      if (token !== aiToken) return;
      let m = null;
      try { m = C.bestMove(cur(), settings.level); } catch (e) { console.error(e); }
      if (token !== aiToken) return;
      busy = false;
      if (m) {
        if (m.promo) m.promoTo = 'Q';
        pushMove(m);
        afterMove();
      } else render();
    }, 60);
  }

  function undo() {
    if (!g.moves.length) return;
    aiToken++; busy = false;
    els.over.hidden = true;
    if (isAI()) {
      do { popMove(); } while (g.moves.length && cur().turn !== humanSide);
    } else {
      popMove();
    }
    sel = null; targets = []; hint = null;
    afterMove();
  }

  function showHint() {
    if (busy || analysis().over || !humanTurn()) return;
    const at = g.moves.length;
    els.status.textContent = 'Шукаю підказку…';
    setTimeout(() => {
      if (at !== g.moves.length) return;
      const m = C.bestMove(cur(), 3);
      if (m) { hint = m; render(); }
    }, 30);
  }

  /* ---------- Ходи гравця ---------- */
  function select(r, c) {
    sel = [r, c];
    targets = analysis().moves.filter((m) => m.from[0] === r && m.from[1] === c);
    render();
  }

  function clearSel() { sel = null; targets = []; }

  function tryMove(to) {
    const ms = targets.filter((m) => same(m.to, to));
    if (!ms.length) return false;
    const m = ms[0];
    if (m.promo) { askPromo(m); return true; }
    playHuman(m);
    return true;
  }

  function playHuman(m) {
    clearSel();
    pushMove(m);
    afterMove();
  }

  function askPromo(m) {
    pendingPromo = m;
    const col = cur().turn;
    els.promoChoices.innerHTML = ['Q', 'R', 'B', 'N']
      .map((t) => `<button type="button" data-t="${t}" aria-label="${t}"><span class="piece ${col}">${GLYPH[t]}${VS}</span></button>`)
      .join('');
    els.promo.hidden = false;
  }

  els.promoChoices.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b || !pendingPromo) return;
    const m = pendingPromo;
    pendingPromo = null;
    m.promoTo = b.dataset.t;
    els.promo.hidden = true;
    playHuman(m);
  });
  els.promo.addEventListener('click', (e) => {
    if (e.target === els.promo) { pendingPromo = null; els.promo.hidden = true; }
  });

  /* ---------- Вказівник: клік та перетягування ---------- */
  els.board.addEventListener('pointerdown', onDown);

  function onDown(e) {
    if (e.button !== undefined && e.button !== 0) return;
    if (busy || analysis().over || !humanTurn() || !els.promo.hidden) return;
    const sqEl = e.target.closest('.sq');
    if (!sqEl) return;
    e.preventDefault();
    const r = +sqEl.dataset.r, c = +sqEl.dataset.c;
    const s = cur();
    const p = s.board[r][c];

    if (sel && targets.some((m) => m.to[0] === r && m.to[1] === c)) {
      tryMove([r, c]);
      return;
    }
    if (p && p[0] === s.turn) {
      const wasSelected = !!sel && sel[0] === r && sel[1] === c;
      select(r, c);
      beginDrag(e, r, c, p, wasSelected);
    } else {
      clearSel();
      render();
    }
  }

  function beginDrag(e, r, c, p, wasSelected) {
    const size = els.board.clientWidth / 8;
    const origin = els.board.querySelector(`.sq[data-r="${r}"][data-c="${c}"] .piece`);
    if (origin) origin.classList.add('ghosted');

    const ghost = document.createElement('div');
    ghost.className = 'piece drag ' + p[0];
    ghost.textContent = GLYPH[p[1]] + VS;
    ghost.style.width = size + 'px';
    ghost.style.height = size + 'px';
    ghost.style.fontSize = size * 0.8 + 'px';
    const place = (x, y) => { ghost.style.transform = `translate(${x - size / 2}px, ${y - size / 2}px)`; };
    place(e.clientX, e.clientY);
    document.body.appendChild(ghost);

    const startX = e.clientX, startY = e.clientY;
    let moved = false;

    const onMove = (ev) => {
      if (Math.abs(ev.clientX - startX) + Math.abs(ev.clientY - startY) > 6) moved = true;
      place(ev.clientX, ev.clientY);
    };
    const finish = (ev, cancelled) => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onCancel);
      ghost.remove();
      if (origin) origin.classList.remove('ghosted');
      if (cancelled) return;
      const el = document.elementFromPoint(ev.clientX, ev.clientY);
      const sq = el && el.closest ? el.closest('.sq') : null;
      if (!sq) return;
      const tr = +sq.dataset.r, tc = +sq.dataset.c;
      if (tr === r && tc === c) {
        if (!moved && wasSelected) { clearSel(); render(); } // повторний клік знімає вибір
        return;
      }
      if (targets.some((m) => m.to[0] === tr && m.to[1] === tc)) tryMove([tr, tc]);
    };
    const onUp = (ev) => finish(ev, false);
    const onCancel = (ev) => finish(ev, true);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onCancel);
  }

  /* ---------- Відображення ---------- */
  function render() {
    const s = cur();
    const a = analysis();
    const last = g.moves[g.moves.length - 1];
    const kingSq = a.check ? C.findKing(s.board, s.turn) : null;

    let html = '';
    for (let i = 0; i < 8; i++) {
      for (let j = 0; j < 8; j++) {
        const r = flipped ? 7 - i : i;
        const c = flipped ? 7 - j : j;
        const p = s.board[r][c];
        let cls = 'sq ' + ((r + c) % 2 === 0 ? 'l' : 'd');
        if (last && (same(last.from, [r, c]) || same(last.to, [r, c]))) cls += ' last';
        if (sel && sel[0] === r && sel[1] === c) cls += ' sel';
        if (hint && (same(hint.from, [r, c]) || same(hint.to, [r, c]))) cls += ' hint';
        if (kingSq && kingSq[0] === r && kingSq[1] === c) cls += ' check';
        const t = targets.find((m) => m.to[0] === r && m.to[1] === c);
        if (t) cls += (p || t.ep) ? ' cap' : ' tgt';
        html += `<div class="${cls}" data-r="${r}" data-c="${c}">`
          + (j === 0 ? `<span class="rk">${8 - i}</span>` : '')
          + (i === 7 ? `<span class="fl">${'abcdefgh'[j]}</span>` : '')
          + (p ? `<span class="piece ${p[0]}">${GLYPH[p[1]]}${VS}</span>` : '')
          + '</div>';
      }
    }
    els.board.innerHTML = html;

    renderPlayers();
    renderMoves();
    renderStatus();
    els.undoBtn.disabled = g.moves.length === 0;
    els.hintBtn.disabled = busy || a.over || !humanTurn();

    settingsBox.classList.toggle('local', els.mode.value === 'local');
    actionsBox.classList.toggle('local', !isAI());
  }

  function capturedBy(col) {
    const list = [];
    g.caps.forEach((cap, i) => {
      if (cap && g.states[i].turn === col) list.push(cap[1]);
    });
    const order = { Q: 0, R: 1, B: 2, N: 3, P: 4 };
    return list.sort((x, y) => order[x] - order[y]);
  }

  function renderPlayers() {
    const bottom = flipped ? 'b' : 'w';
    const top = flipped ? 'w' : 'b';
    const who = (col) => {
      if (!isAI()) return colorName(col);
      return col === humanSide ? `${colorName(col)} · Ви` : `${colorName(col)} · Комп’ютер (${LEVELS[settings.level]})`;
    };
    const mat = (col) => capturedBy(col).reduce((n, t) => n + PV[t], 0);
    const fill = (nameEl, capsEl, col) => {
      nameEl.innerHTML = `<span class="dot ${col}"></span>${who(col)}`;
      const opp = col === 'w' ? 'b' : 'w';
      const diff = mat(col) - mat(opp);
      capsEl.innerHTML = capturedBy(col)
        .map((t) => `<span class="piece ${opp}">${GLYPH[t]}${VS}</span>`)
        .join('') + (diff > 0 ? `<span class="adv">+${diff}</span>` : '');
    };
    fill(els.botName, els.botCaps, bottom);
    fill(els.topName, els.topCaps, top);
  }

  function renderMoves() {
    let h = '';
    for (let i = 0; i < g.sans.length; i += 2) {
      const a = g.sans[i], b = g.sans[i + 1] || '';
      h += `<div class="mv"><span class="n">${i / 2 + 1}.</span>`
        + `<span class="m${i === g.sans.length - 1 ? ' cur' : ''}">${a}</span>`
        + `<span class="m${i + 1 === g.sans.length - 1 ? ' cur' : ''}">${b}</span></div>`;
    }
    els.moves.innerHTML = h || '<div class="empty">Ходів ще немає</div>';
    els.moves.scrollTop = els.moves.scrollHeight;
  }

  function resultInfo(a) {
    const s = cur();
    if (a.result === 'checkmate') {
      const winner = C.opp(s.turn);
      if (isAI()) {
        return winner === humanSide
          ? ['Мат! Ви перемогли', 'Чудова гра — ви поставили мат комп’ютеру.']
          : ['Мат. Комп’ютер переміг', 'Спробуйте ще раз або оберіть нижчу складність.'];
      }
      return [`Мат! Перемогли ${winner === 'w' ? 'білі' : 'чорні'}`, 'Гру завершено матом.'];
    }
    const draws = {
      stalemate: 'Пат: у гравця немає легальних ходів, а король не під шахом.',
      insufficient: 'Недостатньо фігур для мату.',
      fifty: 'Правило 50 ходів: 50 ходів без взяття і руху пішака.',
      repetition: 'Триразове повторення позиції.',
    };
    return ['Нічия', draws[a.result] || ''];
  }

  function renderStatus() {
    const a = analysis();
    const st = els.status;
    st.classList.remove('alert');
    if (a.over) {
      st.textContent = resultInfo(a)[0];
      return;
    }
    if (busy) { st.textContent = 'Комп’ютер думає…'; return; }
    const s = cur();
    if (isAI()) {
      st.textContent = a.check ? 'Вам шах!' : 'Ваш хід';
    } else {
      const who = s.turn === 'w' ? 'білих' : 'чорних';
      st.textContent = a.check ? `Шах! Хід ${who}` : `Хід ${who}`;
    }
    if (a.check) st.classList.add('alert');
  }

  function showOver() {
    const a = analysis();
    if (!a.over) return;
    const [title, text] = resultInfo(a);
    els.overTitle.textContent = title;
    els.overText.textContent = text;
    els.over.hidden = false;
  }

  /* ---------- Події інтерфейсу ---------- */
  els.newBtn.addEventListener('click', () => {
    if (g.moves.length && !analysis().over && !confirm('Почати нову гру? Поточна партія буде втрачена.')) return;
    startNew();
  });
  els.undoBtn.addEventListener('click', undo);
  els.hintBtn.addEventListener('click', showHint);
  els.modeBtn.addEventListener('click', () => {
    aiToken++; busy = false;
    els.mode.value = isAI() ? 'local' : 'ai';
    settings.mode = els.mode.value;
    flipped = false;
    els.modeBtn.textContent = `Режим: ${isAI() ? 'Соло' : 'Дуо'}`;
    settingsBox.classList.toggle('local', !isAI());
    actionsBox.classList.toggle('local', !isAI());
    afterMove();
  });
  els.overNew.addEventListener('click', () => { els.over.hidden = true; startNew(); });
  els.overClose.addEventListener('click', () => { els.over.hidden = true; });
  els.over.addEventListener('click', (e) => { if (e.target === els.over) els.over.hidden = true; });
  els.mode.addEventListener('change', () => {
    settingsBox.classList.toggle('local', els.mode.value === 'local');
  });

  /* ---------- Старт ---------- */
  if (!restore()) {
    resetGame();
    flipped = false;
  }
  els.mode.value = settings.mode;
  els.modeBtn.textContent = `Режим: ${isAI() ? 'Соло' : 'Дуо'}`;
  els.side.value = settings.side;
  els.level.value = String(settings.level);
  render();
  maybeAI(); // якщо збережена партія чекає на хід комп'ютера
})();

