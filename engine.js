'use strict';
/* Шаховий рушій: правила, легальні ходи, мат/пат, нотація, ШІ */
(function (root) {
  const VALUE = { P: 100, N: 320, B: 330, R: 500, Q: 900, K: 0 };
  const inb = (r, c) => r >= 0 && r < 8 && c >= 0 && c < 8;
  const opp = (c) => (c === 'w' ? 'b' : 'w');
  const KN = [[1, 2], [2, 1], [-1, 2], [-2, 1], [1, -2], [2, -1], [-1, -2], [-2, -1]];
  const KG = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
  const DIAG = [[1, 1], [1, -1], [-1, 1], [-1, -1]];
  const ORTH = [[1, 0], [-1, 0], [0, 1], [0, -1]];

  function initialState() {
    const b = Array.from({ length: 8 }, () => Array(8).fill(null));
    const back = ['R', 'N', 'B', 'Q', 'K', 'B', 'N', 'R'];
    for (let c = 0; c < 8; c++) {
      b[0][c] = 'b' + back[c];
      b[1][c] = 'bP';
      b[6][c] = 'wP';
      b[7][c] = 'w' + back[c];
    }
    return { board: b, turn: 'w', castle: { wK: true, wQ: true, bK: true, bQ: true }, ep: null, half: 0 };
  }

  function fromFEN(fen) {
    const [pos, turn, cast, ep, half] = fen.split(' ');
    const b = Array.from({ length: 8 }, () => Array(8).fill(null));
    pos.split('/').forEach((row, r) => {
      let c = 0;
      for (const ch of row) {
        if (/\d/.test(ch)) c += +ch;
        else {
          b[r][c++] = (ch === ch.toUpperCase() ? 'w' : 'b') + ch.toUpperCase();
        }
      }
    });
    return {
      board: b,
      turn,
      castle: { wK: cast.includes('K'), wQ: cast.includes('Q'), bK: cast.includes('k'), bQ: cast.includes('q') },
      ep: ep && ep !== '-' ? [8 - +ep[1], ep.charCodeAt(0) - 97] : null,
      half: +(half || 0),
    };
  }

  function attacked(b, r, c, by) {
    const pd = by === 'w' ? 1 : -1;
    for (const dc of [-1, 1]) {
      const pr = r + pd, pc = c + dc;
      if (inb(pr, pc) && b[pr][pc] === by + 'P') return true;
    }
    for (const [dr, dc] of KN) {
      const nr = r + dr, nc = c + dc;
      if (inb(nr, nc) && b[nr][nc] === by + 'N') return true;
    }
    for (const [dr, dc] of KG) {
      const nr = r + dr, nc = c + dc;
      if (inb(nr, nc) && b[nr][nc] === by + 'K') return true;
    }
    for (const [dr, dc] of ORTH) {
      let nr = r + dr, nc = c + dc;
      while (inb(nr, nc)) {
        const p = b[nr][nc];
        if (p) {
          if (p === by + 'R' || p === by + 'Q') return true;
          break;
        }
        nr += dr; nc += dc;
      }
    }
    for (const [dr, dc] of DIAG) {
      let nr = r + dr, nc = c + dc;
      while (inb(nr, nc)) {
        const p = b[nr][nc];
        if (p) {
          if (p === by + 'B' || p === by + 'Q') return true;
          break;
        }
        nr += dr; nc += dc;
      }
    }
    return false;
  }

  function findKing(b, col) {
    for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) if (b[r][c] === col + 'K') return [r, c];
    return null;
  }

  function pseudo(s, r, c) {
    const b = s.board;
    const p = b[r][c];
    const col = p[0], t = p[1];
    const moves = [];
    const add = (tr, tc, extra) => moves.push(Object.assign({ from: [r, c], to: [tr, tc] }, extra));

    if (t === 'P') {
      const d = col === 'w' ? -1 : 1;
      const start = col === 'w' ? 6 : 1;
      const last = col === 'w' ? 0 : 7;
      if (inb(r + d, c) && !b[r + d][c]) {
        add(r + d, c, { promo: r + d === last });
        if (r === start && !b[r + 2 * d][c]) add(r + 2 * d, c, { double: true });
      }
      for (const dc of [-1, 1]) {
        const nr = r + d, nc = c + dc;
        if (!inb(nr, nc)) continue;
        const tp = b[nr][nc];
        if (tp && tp[0] !== col) add(nr, nc, { promo: nr === last });
        else if (!tp && s.ep && s.ep[0] === nr && s.ep[1] === nc) add(nr, nc, { ep: true });
      }
    } else if (t === 'N' || t === 'K') {
      for (const [dr, dc] of t === 'N' ? KN : KG) {
        const nr = r + dr, nc = c + dc;
        if (!inb(nr, nc)) continue;
        const tp = b[nr][nc];
        if (!tp || tp[0] !== col) add(nr, nc);
      }
      if (t === 'K') {
        const row = col === 'w' ? 7 : 0;
        const e = opp(col);
        if (r === row && c === 4 && !attacked(b, row, 4, e)) {
          if (s.castle[col + 'K'] && !b[row][5] && !b[row][6] && b[row][7] === col + 'R' &&
              !attacked(b, row, 5, e) && !attacked(b, row, 6, e)) add(row, 6, { castle: 'K' });
          if (s.castle[col + 'Q'] && !b[row][3] && !b[row][2] && !b[row][1] && b[row][0] === col + 'R' &&
              !attacked(b, row, 3, e) && !attacked(b, row, 2, e)) add(row, 2, { castle: 'Q' });
        }
      }
    } else {
      const dirs = t === 'B' ? DIAG : t === 'R' ? ORTH : DIAG.concat(ORTH);
      for (const [dr, dc] of dirs) {
        let nr = r + dr, nc = c + dc;
        while (inb(nr, nc)) {
          const tp = b[nr][nc];
          if (!tp) add(nr, nc);
          else {
            if (tp[0] !== col) add(nr, nc);
            break;
          }
          nr += dr; nc += dc;
        }
      }
    }
    return moves;
  }

  const CORNERS = { '7,0': 'wQ', '7,7': 'wK', '0,0': 'bQ', '0,7': 'bK' };

  function apply(s, m) {
    const b = s.board.map((row) => row.slice());
    const [fr, fc] = m.from, [tr, tc] = m.to;
    const orig = b[fr][fc];
    const col = orig[0];
    const captured = b[tr][tc] || (m.ep ? b[fr][tc] : null);
    b[fr][fc] = null;
    if (m.ep) b[fr][tc] = null;
    b[tr][tc] = m.promo ? col + (m.promoTo || 'Q') : orig;
    if (m.castle === 'K') { b[tr][5] = b[tr][7]; b[tr][7] = null; }
    if (m.castle === 'Q') { b[tr][3] = b[tr][0]; b[tr][0] = null; }
    const castle = Object.assign({}, s.castle);
    if (orig[1] === 'K') { castle[col + 'K'] = false; castle[col + 'Q'] = false; }
    const f = CORNERS[fr + ',' + fc]; if (f) castle[f] = false;
    const t = CORNERS[tr + ',' + tc]; if (t) castle[t] = false;
    return {
      board: b,
      turn: opp(s.turn),
      castle,
      ep: m.double ? [(fr + tr) / 2, fc] : null,
      half: orig[1] === 'P' || captured ? 0 : s.half + 1,
    };
  }

  function legalMoves(s) {
    const res = [];
    const col = s.turn;
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const p = s.board[r][c];
        if (!p || p[0] !== col) continue;
        for (const m of pseudo(s, r, c)) {
          const ns = apply(s, m);
          const k = findKing(ns.board, col);
          if (!attacked(ns.board, k[0], k[1], opp(col))) res.push(m);
        }
      }
    }
    return res;
  }

  function inCheck(s) {
    const k = findKing(s.board, s.turn);
    return !!k && attacked(s.board, k[0], k[1], opp(s.turn));
  }

  function insufficient(b) {
    const minors = [];
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const p = b[r][c];
        if (!p || p[1] === 'K') continue;
        if (p[1] === 'P' || p[1] === 'R' || p[1] === 'Q') return false;
        minors.push({ t: p[1], col: p[0], sq: (r + c) % 2 });
      }
    }
    if (minors.length <= 1) return true;
    if (minors.every((m) => m.t === 'B') && minors.every((m) => m.sq === minors[0].sq)) return true;
    return false;
  }

  function key(s) {
    const cs = ['wK', 'wQ', 'bK', 'bQ'].filter((k) => s.castle[k]).join('');
    return s.board.map((r) => r.map((p) => p || '--').join('')).join('/') + s.turn + cs + (s.ep ? s.ep.join('') : '');
  }

  /* keys — масив ключів позицій партії (для триразового повторення) */
  function analyse(s, keys) {
    const moves = legalMoves(s);
    const check = inCheck(s);
    if (!moves.length) return { over: true, result: check ? 'checkmate' : 'stalemate', check, moves };
    if (insufficient(s.board)) return { over: true, result: 'insufficient', check, moves };
    if (s.half >= 100) return { over: true, result: 'fifty', check, moves };
    if (keys) {
      const k = key(s);
      if (keys.filter((x) => x === k).length >= 3) return { over: true, result: 'repetition', check, moves };
    }
    return { over: false, result: null, check, moves };
  }

  const sqName = (r, c) => 'abcdefgh'[c] + (8 - r);

  function sanBase(s, m, legal) {
    if (m.castle) return m.castle === 'K' ? 'O-O' : 'O-O-O';
    const p = s.board[m.from[0]][m.from[1]];
    const t = p[1];
    const cap = s.board[m.to[0]][m.to[1]] || m.ep;
    let str = '';
    if (t === 'P') {
      if (cap) str += 'abcdefgh'[m.from[1]] + 'x';
      str += sqName(m.to[0], m.to[1]);
      if (m.promo) str += '=' + (m.promoTo || 'Q');
    } else {
      str += t;
      const others = legal.filter((o) => o !== m && s.board[o.from[0]][o.from[1]] === p &&
        o.to[0] === m.to[0] && o.to[1] === m.to[1] && !(o.from[0] === m.from[0] && o.from[1] === m.from[1]));
      if (others.length) {
        const sameFile = others.some((o) => o.from[1] === m.from[1]);
        const sameRank = others.some((o) => o.from[0] === m.from[0]);
        const file = 'abcdefgh'[m.from[1]], rank = 8 - m.from[0];
        if (!sameFile) str += file;
        else if (!sameRank) str += rank;
        else str += file + rank;
      }
      if (cap) str += 'x';
      str += sqName(m.to[0], m.to[1]);
    }
    return str;
  }

  /* ---------- ШІ ---------- */
  function evaluate(s) {
    let sc = 0;
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const p = s.board[r][c];
        if (!p) continue;
        const col = p[0], t = p[1];
        let v = VALUE[t];
        const center = (3.5 - Math.abs(r - 3.5)) + (3.5 - Math.abs(c - 3.5));
        if (t === 'P') {
          const adv = col === 'w' ? 6 - r : r - 1;
          v += adv * 8 + center * 2;
        } else if (t === 'N' || t === 'B') v += center * 6;
        else if (t === 'Q') v += center * 2;
        else if (t === 'K') {
          const home = col === 'w' ? r === 7 : r === 0;
          v += home ? 10 : -center * 4;
        }
        sc += col === 'w' ? v : -v;
      }
    }
    return sc;
  }

  function orderMoves(s, moves) {
    return moves
      .map((m) => {
        const victim = s.board[m.to[0]][m.to[1]];
        const mover = s.board[m.from[0]][m.from[1]];
        let sc = 0;
        if (victim) sc += 10 * VALUE[victim[1]] - VALUE[mover[1]] / 10;
        if (m.promo) sc += 800;
        return { m, sc };
      })
      .sort((a, b) => b.sc - a.sc)
      .map((x) => x.m);
  }

  function negamax(s, d, a, b) {
    const moves = legalMoves(s);
    if (!moves.length) return inCheck(s) ? -100000 - d : 0;
    if (d === 0) return (s.turn === 'w' ? 1 : -1) * evaluate(s);
    let best = -Infinity;
    for (const m of orderMoves(s, moves)) {
      const sc = -negamax(apply(s, m), d - 1, -b, -a);
      if (sc > best) best = sc;
      if (best > a) a = best;
      if (a >= b) break;
    }
    return best;
  }

  function bestMove(s, depth) {
    const moves = orderMoves(s, legalMoves(s));
    if (!moves.length) return null;
    let best = null, bestScore = -Infinity;
    const jitter = depth <= 1 ? 60 : depth === 2 ? 8 : 2;
    for (const m of moves) {
      const sc = -negamax(apply(s, m), depth - 1, -Infinity, Infinity) + Math.random() * jitter;
      if (sc > bestScore) { bestScore = sc; best = m; }
    }
    return best;
  }

  function perft(s, d) {
    if (d === 0) return 1;
    let n = 0;
    for (const m of legalMoves(s)) {
      if (m.promo) {
        for (const t of ['Q', 'R', 'B', 'N']) n += perft(apply(s, Object.assign({}, m, { promoTo: t })), d - 1);
      } else n += perft(apply(s, m), d - 1);
    }
    return n;
  }

  const api = { VALUE, opp, initialState, fromFEN, legalMoves, apply, analyse, key, sanBase, sqName, bestMove, perft, inCheck, findKing };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Chess = api;
})(typeof window !== 'undefined' ? window : globalThis);

