const { useState } = React;

const FILES = "abcdefgh";
const SYMBOL = {K:"♔",Q:"♕",R:"♖",B:"♗",N:"♘",P:"♙",k:"♚",q:"♛",r:"♜",b:"♝",n:"♞",p:"♟"};
const KNIGHT = [[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]];
const KING = [[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]];
const DIAG = [[-1,-1],[-1,1],[1,-1],[1,1]], STRAIGHT = [[-1,0],[1,0],[0,-1],[0,1]];
const inside = (r,c) => r>=0 && r<8 && c>=0 && c<8;
const pieceColor = p => p === p.toUpperCase() ? "w" : "b";
const other = c => c === "w" ? "b" : "w";
const squareName = s => FILES[s[1]] + (8-s[0]);
const sameSquare = (a,b) => a && b && a[0]===b[0] && a[1]===b[1];
const clone = value => JSON.parse(JSON.stringify(value));

function positionKey(g) {
  return g.board.map(row => row.join("")).join("/") + " " + g.turn + " " +
    [...g.castling].sort().join("") + " " + (g.ep ? g.ep.join("") : "-");
}
function newPosition() {
  const board = Array.from({length:8}, () => Array(8).fill(""));
  const back = "rnbqkbnr";
  for (let c=0;c<8;c++) { board[0][c]=back[c]; board[1][c]="p"; board[6][c]="P"; board[7][c]=back[c].toUpperCase(); }
  const g = {board,turn:"w",castling:"KQkq",ep:null,halfmove:0,fullmove:1,repetitions:{}};
  g.repetitions[positionKey(g)] = 1;
  return g;
}
function isAttacked(g,r,c,by) {
  const pawnRow = r + (by === "w" ? 1 : -1);
  for (const dc of [-1,1]) if (inside(pawnRow,c+dc) && g.board[pawnRow][c+dc] === (by === "w" ? "P" : "p")) return true;
  for (const [dr,dc] of KNIGHT) { const rr=r+dr,cc=c+dc; if (inside(rr,cc)) { const p=g.board[rr][cc]; if (p && pieceColor(p)===by && p.toUpperCase()==="N") return true; } }
  for (const [dr,dc] of KING) { const rr=r+dr,cc=c+dc; if (inside(rr,cc)) { const p=g.board[rr][cc]; if (p && pieceColor(p)===by && p.toUpperCase()==="K") return true; } }
  for (const [dirs,types] of [[DIAG,"BQ"],[STRAIGHT,"RQ"]]) for (const [dr,dc] of dirs) {
    let rr=r+dr,cc=c+dc;
    while (inside(rr,cc)) { const p=g.board[rr][cc]; if (p) { if (pieceColor(p)===by && types.includes(p.toUpperCase())) return true; break; } rr+=dr; cc+=dc; }
  }
  return false;
}
function inCheck(g,side) {
  const king = side === "w" ? "K" : "k";
  for (let r=0;r<8;r++) for (let c=0;c<8;c++) if (g.board[r][c]===king) return isAttacked(g,r,c,other(side));
  return false;
}
function addPawnMoves(g,r,c,p,out) {
  const side=pieceColor(p),step=side==="w"?-1:1,last=side==="w"?0:7,start=side==="w"?6:1;
  const add=(rr,cc)=>{ if(rr===last) for(const q of "QRBN") out.push({from:[r,c],to:[rr,cc],promotion:side==="w"?q:q.toLowerCase()}); else out.push({from:[r,c],to:[rr,cc]}); };
  const nr=r+step;
  if(inside(nr,c)&&!g.board[nr][c]) { add(nr,c); if(r===start&&!g.board[r+2*step][c]) out.push({from:[r,c],to:[r+2*step,c]}); }
  for(const dc of [-1,1]) { const rr=r+step,cc=c+dc; if(!inside(rr,cc)) continue; const target=g.board[rr][cc];
    if(target&&pieceColor(target)!==side&&target.toUpperCase()!=="K") add(rr,cc);
    else if(g.ep&&sameSquare(g.ep,[rr,cc])&&g.board[r][cc]===(side==="w"?"p":"P")) out.push({from:[r,c],to:[rr,cc]});
  }
}
function castleMoves(g,r,c,side,out) {
  const row=side==="w"?7:0,king=side==="w"?"K":"k",enemy=other(side);
  if(r!==row||c!==4||g.board[r][c]!==king||inCheck(g,side)) return;
  const safeTransit=col=>{const t=clone(g);t.board[r][c]="";t.board[r][col]=king;return !isAttacked(t,r,col,enemy);};
  const short=side==="w"?"K":"k",long=side==="w"?"Q":"q",rook=side==="w"?"R":"r";
  if(g.castling.includes(short)&&g.board[r][7]===rook&&!g.board[r][5]&&!g.board[r][6]&&safeTransit(5)&&!isAttacked(g,r,6,enemy)) out.push({from:[r,c],to:[r,6]});
  if(g.castling.includes(long)&&g.board[r][0]===rook&&!g.board[r][1]&&!g.board[r][2]&&!g.board[r][3]&&safeTransit(3)&&!isAttacked(g,r,2,enemy)) out.push({from:[r,c],to:[r,2]});
}
function pseudoMoves(g,side) {
  const out=[];
  for(let r=0;r<8;r++) for(let c=0;c<8;c++) { const p=g.board[r][c]; if(!p||pieceColor(p)!==side) continue; const kind=p.toUpperCase();
    if(kind==="P") { addPawnMoves(g,r,c,p,out); continue; }
    if(kind==="N"||kind==="K") { for(const [dr,dc] of (kind==="N"?KNIGHT:KING)) { const rr=r+dr,cc=c+dc; if(inside(rr,cc)&&(!g.board[rr][cc]||(pieceColor(g.board[rr][cc])!==side&&g.board[rr][cc].toUpperCase()!=="K"))) out.push({from:[r,c],to:[rr,cc]}); } if(kind==="K") castleMoves(g,r,c,side,out); continue; }
    const dirs=kind==="B"?DIAG:kind==="R"?STRAIGHT:KING;
    for(const [dr,dc] of dirs) { let rr=r+dr,cc=c+dc; while(inside(rr,cc)) { const target=g.board[rr][cc]; if(target) { if(pieceColor(target)!==side&&target.toUpperCase()!=="K") out.push({from:[r,c],to:[rr,cc]}); break; } out.push({from:[r,c],to:[rr,cc]}); rr+=dr; cc+=dc; } }
  }
  return out;
}
function applyMove(g,m,record=true) {
  const [r,c]=m.from,[rr,cc]=m.to,p=g.board[r][c],side=pieceColor(p); let captured=g.board[rr][cc];
  g.board[r][c]="";
  if(p.toUpperCase()==="P"&&g.ep&&sameSquare(g.ep,[rr,cc])&&c!==cc) { captured=g.board[r][cc]; g.board[r][cc]=""; }
  const removeRookRight=(x,y)=>{ const right=({"7,0":"Q","7,7":"K","0,0":"q","0,7":"k"})[x+","+y]; if(right)g.castling=g.castling.replace(right,""); };
  removeRookRight(r,c); removeRookRight(rr,cc);
  if(p.toUpperCase()==="K") g.castling=g.castling.replace(side==="w"?/[KQ]/g:/[kq]/g,"");
  g.board[rr][cc]=m.promotion||p;
  if(p.toUpperCase()==="K"&&Math.abs(cc-c)===2) { const rookStart=cc===6?7:0,rookEnd=cc===6?5:3; g.board[r][rookEnd]=g.board[r][rookStart];g.board[r][rookStart]=""; }
  g.ep=null; if(p.toUpperCase()==="P"&&Math.abs(rr-r)===2)g.ep=[(r+rr)>>1,c];
  g.halfmove=(p.toUpperCase()==="P"||captured)?0:g.halfmove+1; if(g.turn==="b")g.fullmove++; g.turn=other(g.turn);
  if(record){const k=positionKey(g);g.repetitions[k]=(g.repetitions[k]||0)+1;}
  return captured?"x":"-";
}
function legalMoves(g,side=g.turn) { const out=[]; for(const move of pseudoMoves(g,side)){const trial=clone(g);applyMove(trial,move,false);if(!inCheck(trial,side))out.push(move);}return out; }
function insufficientMaterial(g) {
  const pieces=[];for(let r=0;r<8;r++)for(let c=0;c<8;c++){const p=g.board[r][c];if(p&&p.toUpperCase()!=="K")pieces.push([[r,c],p.toUpperCase()]);}
  if(!pieces.length)return true;if(pieces.length===1&&"BN".includes(pieces[0][1]))return true;
  return pieces.length>0&&pieces.every(x=>x[1]==="B")&&new Set(pieces.map(x=>(x[0][0]+x[0][1])%2)).size===1;
}
function gameOutcome(g) {
  if(!legalMoves(g).length)return inCheck(g,g.turn)?`Мат. Перемогли ${g.turn==="b"?"білі":"чорні"}!`:"Пат. Нічия.";
  if(g.repetitions[positionKey(g)]>=3)return"Нічия: позиція повторилася тричі.";
  if(g.halfmove>=100)return"Нічия: 50 ходів без взяття або ходу пішака.";
  if(insufficientMaterial(g))return"Нічия: недостатньо фігур для мату.";
  return null;
}

function ChessApp() {
  const [game,setGame]=useState(newPosition),[selected,setSelected]=useState(null),[targets,setTargets]=useState([]);
  const [lastMove,setLastMove]=useState(null),[flipped,setFlipped]=useState(false),[undoStack,setUndoStack]=useState([]);
  const [moveLog,setMoveLog]=useState([]),[promotion,setPromotion]=useState(null);
  const result=gameOutcome(game);

  function play(move) {
    const before=clone(game),next=clone(game),marker=applyMove(next,move);
    const notation=`${squareName(move.from)} ${marker} ${squareName(move.to)}${move.promotion?"="+move.promotion.toUpperCase():""}`;
    setUndoStack(stack=>[...stack,{state:before,move}]);setGame(next);setLastMove(move);setSelected(null);setTargets([]);setPromotion(null);setMoveLog(log=>[...log,notation]);
  }
  function clickSquare(sq) {
    if(result)return;
    if(selected) { const candidates=targets.filter(m=>sameSquare(m.to,sq)); if(candidates.length) { if(candidates[0].promotion&&candidates.length>1){setPromotion(candidates);return;} play(candidates[0]);return; } }
    const p=game.board[sq[0]][sq[1]];
    if(p&&pieceColor(p)===game.turn){setSelected(sq);setTargets(legalMoves(game).filter(m=>sameSquare(m.from,sq)));}
    else{setSelected(null);setTargets([]);}
  }
  function undo() {
    if(!undoStack.length)return;
    const entry=undoStack[undoStack.length-1],rest=undoStack.slice(0,-1);
    setGame(entry.state);setUndoStack(rest);setMoveLog(log=>log.slice(0,-1));setLastMove(rest.length?rest[rest.length-1].move:null);setSelected(null);setTargets([]);setPromotion(null);
  }
  function reset() {
    if(moveLog.length&&!window.confirm("Почати нову гру?"))return;
    setGame(newPosition());setSelected(null);setTargets([]);setLastMove(null);setUndoStack([]);setMoveLog([]);setPromotion(null);
  }
  function displaySquare(dr,dc){return flipped?[7-dr,7-dc]:[dr,dc];}

  return <main className="app">
    <div className="board" role="grid" aria-label="Шахова дошка">
      {Array.from({length:8},(_,dr)=>Array.from({length:8},(_,dc)=>{
        const [r,c]=displaySquare(dr,dc),sq=[r,c],piece=game.board[r][c],isTarget=targets.some(m=>sameSquare(m.to,sq));
        const capture=!!piece||(game.board[selected?.[0]]?.[selected?.[1]]?.toUpperCase()==="P"&&game.ep&&sameSquare(game.ep,sq));
        const checked=inCheck(game,game.turn)&&piece===(game.turn==="w"?"K":"k");
        let cls="sq "+((r+c)%2===0?"light":"dark");
        if(lastMove&&(sameSquare(lastMove.from,sq)||sameSquare(lastMove.to,sq)))cls+=" last";
        if(selected&&sameSquare(selected,sq))cls+=" selected";if(checked)cls+=" checked";if(isTarget&&capture)cls+=" capture";
        return <button type="button" role="gridcell" aria-label={`${squareName(sq)}${piece?", "+(pieceColor(piece)==="w"?"біла":"чорна")+" фігура":""}`} className={cls} key={`${dr}-${dc}`} onClick={()=>clickSquare(sq)}>
          {piece&&<span className={`piece ${pieceColor(piece)==="w"?"white":"black"}`}>{SYMBOL[piece]}</span>}
          {(dc===0||dr===7)&&<span className="coord">{dc===0?8-r:FILES[c]}</span>}
          {isTarget&&!capture&&<i className="dot"/>}
        </button>;
      }))}
    </div>
    <aside className="side">
      <div className="title">ШАХИ</div>
      <div className={`status ${result?(result.startsWith("Мат")?"mate":"draw"):""}`}>{result||<>Хід {game.turn==="w"?"білих":"чорних"}{inCheck(game,game.turn)&&<><br/>Шах!</>}</>}</div>
      <div className="label">ІСТОРІЯ ХОДІВ</div>
      <div className="history">{moveLog.map((text,i)=><div className="history-row" key={i}>{Math.floor(i/2)+1}{i%2===0?". ":"… "}{text}</div>)}</div>
      <div className="buttons"><button onClick={reset}>Нова гра</button><button onClick={undo}>Скасувати хід</button><button onClick={()=>setFlipped(v=>!v)}>Перевернути дошку</button></div>
      <div className="help">Клацни свою фігуру, а потім клітинку призначення. Можливі ходи підсвічуються. Гра для двох людей за одним комп’ютером.</div>
    </aside>
    {promotion&&<div className="overlay" onClick={e=>{if(e.target===e.currentTarget)setPromotion(null);}}><section className="promo" aria-label="Перетворення пішака"><h3>Обери фігуру</h3><div className="promo-buttons">{[["q","Ферзь"],["r","Тура"],["b","Слон"],["n","Кінь"]].map(([kind,label])=>{const move=promotion.find(m=>m.promotion=== (game.turn==="w"?kind.toUpperCase():kind));return <button key={kind} onClick={()=>play(move)}><span className="symbol">{SYMBOL[move.promotion]}</span>{label}</button>;})}</div></section></div>}
  </main>;
}

ReactDOM.createRoot(document.getElementById("root")).render(<ChessApp/>);

