/**
 * ═══════════════════════════════════════════════════════════════
 * PROJECT CLEAR — CLEAR PLAYS ENGINE (6 Arcade Prototypes)
 * Match Rush · Chest Sort · Mystery Box (3x3 memory + bomb) ·
 * Verse Builder · Speed Swipe · Sky Fall Catcher (drag boat).
 * Stars/PUM stored in localStorage (prototype).
 * ═══════════════════════════════════════════════════════════════
 */
(function () {
  const root = document.getElementById('playsRoot');
  if (!root) return;

  const FAST = !!window.CLEAR_PLAYS_FAST;   // test seam only; off in production
  const GAME_SECONDS = FAST ? 6 : 60;
  const ROUND_SECONDS = FAST ? 1 : 10;
  const SKY_ROUNDS = 6;
  const PROGRESS_KEY = 'clear_plays_progress_v1';
  const STAR_KEYS = ['match', 'chest', 'mystery', 'verse', 'speed', 'sky'];

  const GAMES = [
    { key: 'match', title: 'Match Rush', desc: 'จับคู่คำสัมพันธ์ 4 คู่', icon: 'fa-shuffle', grad: 'linear-gradient(135deg,#0ea5e9,#2563eb)' },
    { key: 'chest', title: 'Chest Sort', desc: 'หีบแยกคำสมาส vs คำสนธิ', icon: 'fa-box-open', grad: 'linear-gradient(135deg,#8b5cf6,#6d28d9)' },
    { key: 'mystery', title: 'Mystery Box', desc: 'จับคู่ภาพ-คำ 3×3 ระวังระเบิด 💣', icon: 'fa-gift', grad: 'linear-gradient(135deg,#f59e0b,#d97706)' },
    { key: 'verse', title: 'Verse Builder', desc: 'เรียงร้อยกาพย์เห่เรือ 4 วรรค', icon: 'fa-scroll', grad: 'linear-gradient(135deg,#10b981,#047857)' },
    { key: 'speed', title: 'Speed Swipe', desc: 'ปัดไว จริงหรือเท็จ 6 ข้อ', icon: 'fa-bolt', grad: 'linear-gradient(135deg,#f43f5e,#be123c)' },
    { key: 'sky', title: 'Sky Fall Catcher', desc: 'ลากเรือเก็บของร่วง + หลบระเบิด 💣', icon: 'fa-sailboat', grad: 'linear-gradient(135deg,#0ea5e9,#0f766e)' },
  ];

  const MATCH_PAIRS = [
    { a: 'ขุนแผน', b: 'ดาบฟ้าฟื้น' }, { a: 'พลายงาม', b: 'จมื่นไวยวรนาถ' },
    { a: 'ขุนช้าง', b: 'ถวายฎีกา' }, { a: 'วันทอง', b: 'นิมิตเสือคาบ' },
  ];
  const CHEST_WORDS = [
    { word: 'ราชการ', type: 'samas' }, { word: 'ภัตตาหาร', type: 'samas' },
    { word: 'สุนทรพจน์', type: 'samas' }, { word: 'ชลมารค', type: 'samas' },
    { word: 'วิทยาลัย', type: 'sandhi' }, { word: 'เกษตรศาสตร์', type: 'sandhi' },
  ];
  const MYSTERY_PAIRS = [
    { pair: 0, label: 'ดาบฟ้าฟื้น', emoji: '🗡️' },
    { pair: 1, label: 'เรือสุพรรณหงส์', emoji: '⛵' },
    { pair: 2, label: 'ม้าสีหมอก', emoji: '🐎' },
    { pair: 3, label: 'ดอกสายหยุด', emoji: '🌸' },
  ];
  const VERSE_LINES = ['สุพรรณหงส์ทรงพู่ห้อย', 'งามชดช้อยลอยหลังสินธุ์', 'เพียงหงส์ทรงพรหมินทร์', 'ลินลาศเลื่อนเตือนตาชม'];
  const SPEED = [
    { text: 'เรือสุพรรณหงส์เปรียบเหมือนพาหนะของพระพรหม', answer: true },
    { text: 'ขุนช้างฟ้องร้องเพราะต้องการชิงตัวพลายงาม', answer: false },
    { text: 'พลายงามมีตำแหน่งเป็นจมื่นไวยวรนาถ', answer: true },
    { text: 'นางวันทองถูกตัดสินประหารชีวิตในตอนท้าย', answer: true },
    { text: 'กาพย์เห่เรือเป็นพระราชนิพนธ์ของ ร.2', answer: false },
    { text: 'ดาบฟ้าฟื้นเป็นอาวุธประจำกายของขุนแผน', answer: true },
  ];
  const SKY_ROUND_DATA = [
    { prompt: 'ของวิเศษของขุนแผน', target: 'ดาบฟ้าฟื้น', emoji: '🗡️', decoys: ['หอกทอง', 'ธนูเงิน', 'ปี่แก้ว'] },
    { prompt: 'ปลาในกาพย์เห่เรือ', target: 'ปลานวลจันทร์', emoji: '🐟', decoys: ['นกยูง', 'เรือ', 'ดอกไม้'] },
    { prompt: 'พาหนะในกาพย์เห่เรือ', target: 'เรือสุพรรณหงส์', emoji: '⛵', decoys: ['ม้า', 'ช้าง', 'เกวียน'] },
    { prompt: 'ม้าของขุนแผน', target: 'ม้าสีหมอก', emoji: '🐎', decoys: ['ช้างเผือก', 'เรือ', 'นก'] },
    { prompt: 'นกในกาพย์เห่เรือ', target: 'นกยูง', emoji: '🦚', decoys: ['ปลา', 'ดอกไม้', 'เรือ'] },
    { prompt: 'พันธุ์ไม้ในวรรณคดี', target: 'ดอกสายหยุด', emoji: '🌸', decoys: ['เรือ', 'ปลา', 'ม้า'] },
  ];

  const state = { screen: 'lobby', game: null, g: null, timeLeft: GAME_SECONDS, timer: null, result: null, elapsed: 0 };

  function esc(v) { return String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;'); }
  function shuffle(arr) { const a = arr.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
  function loadProgress() { try { const p = JSON.parse(localStorage.getItem(PROGRESS_KEY) || '{}'); const stars = {}; STAR_KEYS.forEach(k => { stars[k] = Number((p.stars || {})[k] || 0); }); return { stars }; } catch (e) { const stars = {}; STAR_KEYS.forEach(k => { stars[k] = 0; }); return { stars }; } }
  function saveProgress(p) { try { localStorage.setItem(PROGRESS_KEY, JSON.stringify(p)); } catch (e) {} }
  const progress = loadProgress();
  const totalStars = () => STAR_KEYS.reduce((s, k) => s + (Number(progress.stars[k]) || 0), 0);

  /* ── Timer ── */
  function startTimer() {
    stopTimer();
    state.timeLeft = GAME_SECONDS; state.elapsed = 0;
    paintTimer();
    state.timer = setInterval(() => {
      state.timeLeft--; state.elapsed++;
      paintTimer();
      if (state.timeLeft <= 0) { stopTimer(); finishGame(); }
    }, 1000);
  }
  function stopTimer() { if (state.timer) { clearInterval(state.timer); state.timer = null; } }
  function paintTimer() {
    const chip = document.getElementById('timerChip'); const bar = document.getElementById('timerBar');
    if (chip) { chip.innerHTML = `<i class="fa-solid fa-clock"></i> ${Math.max(0, state.timeLeft)}s`; chip.classList.toggle('warn', state.timeLeft <= 10); }
    if (bar) bar.style.width = Math.max(0, (state.timeLeft / GAME_SECONDS) * 100) + '%';
  }

  /* ── Lobby ── */
  function renderLobby() {
    stopSky();
    state.screen = 'lobby'; state.game = null; state.g = null;
    const tiles = GAMES.map(gm => {
      const s = Number(progress.stars[gm.key] || 0);
      const stars = '★'.repeat(s) + '☆'.repeat(3 - s);
      return `<button class="game-tile" data-game="${gm.key}">
        <span class="game-icon" style="background:${gm.grad};"><i class="fa-solid ${gm.icon}"></i></span>
        <h3>${esc(gm.title)}</h3><p>${esc(gm.desc)}</p>
        <span class="tile-stars" title="${s}/3">${stars}</span></button>`;
    }).join('');
    root.innerHTML = `
      <div class="plays-hero">
        <div><h1>🎮 CLEAR Plays</h1><p>มินิเกมทบทวนวรรณคดีไทย ม.6 · สะสมดาวและแต้มปั๊ม PUM</p></div>
        <div class="stats">
          <div><strong>${totalStars()}<span style="font-size:1rem;">/18</span></strong><span>ดาวสะสม ⭐</span></div>
          <div><strong>🪙 +${totalStars()}</strong><span>ปั๊ม PUM</span></div>
        </div>
      </div>
      <div class="game-grid">${tiles}</div>`;
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  /* ── Arena shell ── */
  function renderArena() {
    state.screen = 'arena';
    const gm = GAMES.find(x => x.key === state.game);
    root.innerHTML = `
      <div class="arena-head">
        <button class="clear-btn clear-btn-secondary" data-action="lobby" style="min-height:44px;"><i class="fa-solid fa-chevron-left"></i> <span>ย้อนกลับ</span></button>
        <span class="arena-title">${esc(gm.title)}</span>
        <span class="arena-chip" id="scoreChip"></span>
        <span class="arena-chip" id="timerChip"></span>
      </div>
      <div class="arena-bar"><div id="timerBar"></div></div>
      <div id="gameArea"></div>`;
    paintGame();
    startTimer();
  }
  function setScore(text) { const c = document.getElementById('scoreChip'); if (c) c.textContent = text; }
  function paintGame() {
    if (state.game === 'match') paintMatch();
    else if (state.game === 'chest') paintChest();
    else if (state.game === 'mystery') paintMystery();
    else if (state.game === 'verse') paintVerse();
    else if (state.game === 'speed') paintSpeed();
    else if (state.game === 'sky') paintSky();
  }

  /* ── Game 1: Match Rush ── */
  function startMatch() {
    const cards = [];
    MATCH_PAIRS.forEach((p, i) => { cards.push({ uid: 'a' + i, pair: i, text: p.a }); cards.push({ uid: 'b' + i, pair: i, text: p.b }); });
    state.g = { cards: shuffle(cards), first: null, moves: 0, pairs: 0, locked: false, okUids: [] };
  }
  function paintMatch() {
    const g = state.g;
    const html = g.cards.map(c => {
      const cls = g.okUids.includes(c.uid) ? 'done' : (g.first && g.first.uid === c.uid ? 'selected' : '');
      return `<button class="match-card ${cls}" data-card="${c.uid}">${esc(c.text)}</button>`;
    }).join('');
    document.getElementById('gameArea').innerHTML = `<div class="match-grid">${html}</div>`;
    setScore(`คู่ ${g.pairs}/4 · ตา ${g.moves}`);
  }
  function handleMatch(uid) {
    const g = state.g;
    if (g.locked || g.okUids.includes(uid)) return;
    const card = g.cards.find(c => c.uid === uid);
    if (!g.first) { g.first = card; paintMatch(); return; }
    if (g.first.uid === uid) { g.first = null; paintMatch(); return; }
    g.moves++; g.locked = true;
    if (g.first.pair === card.pair) {
      const first = g.first; paintMatch();
      const a = document.querySelector(`[data-card="${first.uid}"]`); const b = document.querySelector(`[data-card="${card.uid}"]`);
      if (a) a.classList.add('ok'); if (b) b.classList.add('ok');
      setTimeout(() => { g.okUids.push(first.uid, card.uid); g.first = null; g.locked = false; g.pairs++; paintMatch(); if (g.pairs === MATCH_PAIRS.length) finishGame(); }, 450);
    } else {
      const a = document.querySelector(`[data-card="${g.first.uid}"]`); const b = document.querySelector(`[data-card="${card.uid}"]`);
      if (a) a.classList.add('bad'); if (b) b.classList.add('bad');
      setTimeout(() => { g.first = null; g.locked = false; paintMatch(); }, 550);
    }
  }

  /* ── Game 2: Chest Sort ── */
  function startChest() { state.g = { order: shuffle(CHEST_WORDS), index: 0, correct: 0, feedback: null }; }
  function paintChest() {
    const g = state.g;
    if (g.index >= g.order.length) { finishGame(); return; }
    const item = g.order[g.index];
    const fb = g.feedback ? `<p style="text-align:center;font-weight:700;color:${g.feedback.ok ? '#065f46' : '#991b1b'};">${g.feedback.ok ? '✅ ถูกต้อง!' : '❌ ไม่ถูก — คำนี้เป็น ' + (item.type === 'samas' ? 'คำสมาส' : 'คำสนธิ')}</p>` : '';
    document.getElementById('gameArea').innerHTML = `
      <div class="clear-card" style="padding:1.25rem;">
        <p style="text-align:center;color:var(--text-muted);font-size:0.85rem;margin-bottom:0.3rem;">คำที่ ${g.index + 1} / ${g.order.length}</p>
        <div class="chest-word">${esc(item.word)}</div>${fb}
        <div class="chest-btns">
          <button class="chest-btn samas" data-type="samas" ${g.feedback ? 'disabled' : ''}><i class="fa-solid fa-box"></i> คำสมาส</button>
          <button class="chest-btn sandhi" data-type="sandhi" ${g.feedback ? 'disabled' : ''}><i class="fa-solid fa-box"></i> คำสนธิ</button>
        </div>
      </div>`;
    setScore(`ถูก ${g.correct}/${g.order.length}`);
  }
  function handleChest(type) {
    const g = state.g; if (g.feedback) return;
    const item = g.order[g.index]; const ok = type === item.type;
    if (ok) g.correct++;
    g.feedback = { ok }; paintChest();
    setTimeout(() => { g.feedback = null; g.index++; paintChest(); }, 900);
  }

  /* ── Game 3: Mystery Box (3x3 memory + bomb) ── */
  function startMystery() {
    const cells = [];
    MYSTERY_PAIRS.forEach(p => { cells.push({ uid: 'p' + p.pair, pair: p.pair, kind: 'img', label: p.label, emoji: p.emoji }); cells.push({ uid: 'w' + p.pair, pair: p.pair, kind: 'word', label: p.label, emoji: '❔' }); });
    cells.push({ uid: 'bomb', pair: -1, kind: 'bomb', label: 'ระเบิด', emoji: '💣' });
    state.g = { cells: shuffle(cells), revealed: [], matched: [], first: null, bombs: 0, locked: false };
  }
  function paintMystery() {
    const g = state.g;
    const cells = g.cells.map(c => {
      const isMatched = g.matched.includes(c.pair) && c.pair >= 0;
      const isOpen = g.revealed.includes(c.uid);
      let cls = 'back', inner = '<span class="mem-back">?</span>';
      if (isMatched) { cls = 'matched face'; inner = `<div><span class="mem-emoji">${c.emoji}</span><span class="mem-label">${esc(c.label)}</span></div>`; }
      else if (isOpen) { if (c.kind === 'bomb') { cls = 'bomb face'; inner = '<span class="mem-emoji">💣</span>'; } else { cls = 'face'; inner = `<div><span class="mem-emoji">${c.emoji}</span><span class="mem-label">${esc(c.label)}</span></div>`; } }
      return `<button class="mem-cell ${cls}" data-mem="${c.uid}">${inner}</button>`;
    }).join('');
    document.getElementById('gameArea').innerHTML = `<div class="mem-grid" id="memGrid">${cells}</div>`;
    setScore(`จับคู่ ${g.matched.length}/4 · 💣 ${g.bombs}`);
  }
  function tapMystery(uid) {
    const g = state.g;
    if (g.locked) return;
    const cell = g.cells.find(c => c.uid === uid);
    if (!cell || g.matched.includes(cell.pair) && cell.pair >= 0 || g.revealed.includes(uid)) return;
    if (cell.kind === 'bomb') {
      g.bombs++;
      const grid = document.getElementById('memGrid'); if (grid) { grid.classList.add('shake'); setTimeout(() => grid && grid.classList.remove('shake'), 420); }
      g.matched = []; g.revealed = [uid]; g.first = null;
      paintMystery();
      setTimeout(() => { g.revealed = []; paintMystery(); }, 650);
      return;
    }
    if (!g.first) { g.first = cell; g.revealed = [uid]; paintMystery(); return; }
    const first = g.first;
    g.revealed = [first.uid, uid];
    if (first.pair === cell.pair && first.kind !== cell.kind) {
      g.matched.push(cell.pair); g.first = null;
      paintMystery();
      setTimeout(() => { g.revealed = []; paintMystery(); }, 300);
      if (g.matched.length === MYSTERY_PAIRS.length) setTimeout(finishGame, 700);
    } else {
      g.locked = true; paintMystery();
      setTimeout(() => { g.locked = false; g.revealed = []; g.first = null; paintMystery(); }, 750);
    }
  }

  /* ── Game 4: Verse Builder ── */
  function startVerse() { const lines = VERSE_LINES.map((text, i) => ({ text, correctPos: i })); state.g = { lines: shuffle(lines), sel: null, checks: 0, solved: false, marks: [] }; }
  function paintVerse() {
    const g = state.g;
    const rows = g.lines.map((l, pos) => {
      const isSel = g.sel === pos; const mark = g.marks[pos];
      const cls = isSel ? 'selected' : (mark === true ? 'correct' : (mark === false ? 'wrong' : ''));
      return `<button class="verse-line ${cls}" data-pos="${pos}"><span class="ln">${pos + 1}</span><span>${esc(l.text)}</span></button>`;
    }).join('');
    document.getElementById('gameArea').innerHTML = `
      <div class="clear-card" style="padding:1.25rem;">
        <p style="color:var(--text-muted);font-size:0.85rem;margin-bottom:0.75rem;">แตะวรรคแรก แล้วแตะวรรคที่สองเพื่อสลับตำแหน่ง → เรียงให้เป็นกาพย์เห่เรือที่ถูกต้อง</p>
        <div class="verse-list">${rows}</div>
        <div style="display:flex;justify-content:flex-end;"><button class="clear-btn clear-btn-primary btn-metallic" data-action="check-verse" style="min-height:44px;background:linear-gradient(135deg,#10b981,#047857);"><i class="fa-solid fa-check"></i> <span>ตรวจคำตอบ</span></button></div>
      </div>`;
    setScore(g.solved ? 'เรียงถูกแล้ว!' : `ตรวจแล้ว ${g.checks} ครั้ง`);
  }
  function selectVerse(pos) {
    const g = state.g; if (g.solved) return; g.marks = [];
    if (g.sel === null) g.sel = pos;
    else if (g.sel === pos) g.sel = null;
    else { const t = g.lines[g.sel]; g.lines[g.sel] = g.lines[pos]; g.lines[pos] = t; g.sel = null; }
    paintVerse();
  }
  function checkVerse() {
    const g = state.g; g.checks++;
    g.marks = g.lines.map((l, pos) => l.correctPos === pos);
    if (g.marks.every(Boolean)) { g.solved = true; paintVerse(); setTimeout(finishGame, 800); }
    else paintVerse();
  }

  /* ── Game 5: Speed Swipe ── */
  function startSpeed() { state.g = { index: 0, correct: 0, answered: false, lastOk: null }; }
  function paintSpeed() {
    const g = state.g;
    if (g.index >= SPEED.length) { finishGame(); return; }
    const item = SPEED[g.index];
    const fb = g.answered ? `<p class="swipe-feedback" style="color:${g.lastOk ? '#065f46' : '#991b1b'};">${g.lastOk ? '✅ ถูกต้อง!' : '❌ ไม่ถูก — ข้อนี้เป็น ' + (item.answer ? 'จริง' : 'เท็จ')}</p>` : '';
    document.getElementById('gameArea').innerHTML = `
      <div class="swipe-card">${esc(item.text)}</div>
      <div class="swipe-btns">
        <button class="swipe-btn false" data-answer="false" ${g.answered ? 'disabled' : ''}><i class="fa-solid fa-xmark"></i> เท็จ</button>
        <button class="swipe-btn true" data-answer="true" ${g.answered ? 'disabled' : ''}><i class="fa-solid fa-check"></i> จริง</button>
      </div>${fb}
      <p style="text-align:center;color:var(--text-muted);font-size:0.82rem;margin-top:0.75rem;">ข้อ ${g.index + 1} / ${SPEED.length}</p>`;
    setScore(`ถูก ${g.correct}/${SPEED.length}`);
  }
  function answerSpeed(val) {
    const g = state.g; if (g.answered) return;
    const item = SPEED[g.index]; g.lastOk = (val === item.answer); if (g.lastOk) g.correct++;
    g.answered = true; paintSpeed();
    setTimeout(() => { g.index++; g.answered = false; g.lastOk = null; paintSpeed(); }, 800);
  }

  /* ── Game 6: Sky Fall Catcher ── */
  function startSky() {
    state.g = { roundIndex: 0, cleared: new Array(SKY_ROUNDS).fill(false), boatX: 0, items: [], spawnTimer: 9, dragging: false, stunUntil: 0, raf: null, lastTs: 0, running: true };
  }
  function paintSky() {
    const g = state.g;
    document.getElementById('gameArea').innerHTML = `
      <div class="sky-prompt" id="skyPrompt">รอบ 1/6 · 🎯 ${esc(SKY_ROUND_DATA[0].prompt)}: <strong>${esc(SKY_ROUND_DATA[0].target)}</strong></div>
      <div class="sky-stage" id="skyStage">
        <div class="sky-boat" id="skyBoat" style="left:50%;">⛵</div>
      </div>
      <p style="text-align:center;color:var(--text-muted);font-size:0.82rem;margin-top:0.5rem;" id="skyHud"></p>`;
    const stage = document.getElementById('skyStage');
    const boat = document.getElementById('skyBoat');
    if (stage && boat) {
      const rect = stage.getBoundingClientRect();
      g.boatX = (rect.width || 300) / 2;
      boat.style.left = g.boatX + 'px';
      const down = (e) => { skySetBoat(e.clientX); g.dragging = true; try { stage.setPointerCapture(e.pointerId); } catch (err) {} };
      const move = (e) => { if (g.dragging) skySetBoat(e.clientX); };
      const up = () => { g.dragging = false; };
      stage.addEventListener('pointerdown', down);
      stage.addEventListener('pointermove', move);
      stage.addEventListener('pointerup', up);
      stage.addEventListener('pointercancel', up);
      stage.addEventListener('touchstart', (e) => { if (e.touches[0]) { skySetBoat(e.touches[0].clientX); g.dragging = true; } }, { passive: true });
      stage.addEventListener('touchmove', (e) => { if (g.dragging && e.touches[0]) skySetBoat(e.touches[0].clientX); }, { passive: true });
      stage.addEventListener('touchend', up);
    }
    g.running = true; g.lastTs = 0;
    g.raf = requestAnimationFrame(skyLoop);
  }
  function skySetBoat(clientX) {
    const g = state.g; if (!g) return;
    if (performance.now() < g.stunUntil) return;
    const stage = document.getElementById('skyStage'); if (!stage) return;
    const rect = stage.getBoundingClientRect();
    const w = rect.width || 300;
    let x = clientX - rect.left; x = Math.max(40, Math.min(w - 40, x));
    g.boatX = x;
    const boat = document.getElementById('skyBoat'); if (boat) boat.style.left = x + 'px';
  }
  function spawnSkyItem(W, ri) {
    const r = SKY_ROUND_DATA[ri]; const roll = Math.random();
    let kind, label, emoji;
    if (FAST) { kind = 'target'; label = r.target; emoji = r.emoji; }
    else if (roll < 0.16) { kind = 'bomb'; label = ''; emoji = '💣'; }
    else if (roll < 0.58) { kind = 'target'; label = r.target; emoji = r.emoji; }
    else { kind = 'decoy'; label = r.decoys[Math.floor(Math.random() * r.decoys.length)]; emoji = '❔'; }
    const x = 40 + Math.random() * Math.max(40, W - 80);
    const el = document.createElement('div');
    el.className = 'sky-item' + (kind === 'bomb' ? ' bomb' : '');
    el.style.left = x + 'px'; el.style.top = '-60px';
    el.innerHTML = `<span>${emoji}</span>${label ? `<span class="sky-item-label">${esc(label)}</span>` : ''}`;
    const stage = document.getElementById('skyStage'); if (stage) stage.appendChild(el);
    const vy = (FAST ? 430 : 110) + Math.random() * 80;
    state.g.items.push({ el, x, y: -60, vy, kind });
  }
  function removeSkyItem(idx) { const it = state.g.items[idx]; if (it && it.el) it.el.remove(); state.g.items.splice(idx, 1); }
  function catchSkyItem(it, idx) {
    const g = state.g;
    if (it.kind === 'target') { g.cleared[g.roundIndex] = true; }
    else if (it.kind === 'bomb') {
      g.cleared[g.roundIndex] = false; g.stunUntil = performance.now() + (FAST ? 300 : 1000);
      const stage = document.getElementById('skyStage'); if (stage) { stage.classList.add('shake'); setTimeout(() => stage && stage.classList.remove('shake'), 400); }
    }
    removeSkyItem(idx);
  }
  function skyLoop(ts) {
    const g = state.g; if (!g || !g.running) return;
    const stage = document.getElementById('skyStage');
    if (!stage) { g.running = false; return; }
    const dt = g.lastTs ? Math.min(0.05, (ts - g.lastTs) / 1000) : 0; g.lastTs = ts;
    const W = stage.clientWidth || 300; const H = stage.clientHeight || 400;
    const elapsed = GAME_SECONDS - Math.max(0, state.timeLeft);
    const ri = Math.min(SKY_ROUNDS - 1, Math.floor(elapsed / ROUND_SECONDS));
    if (ri !== g.roundIndex) {
      g.roundIndex = ri;
      const pr = document.getElementById('skyPrompt');
      if (pr) pr.innerHTML = `รอบ ${ri + 1}/6 · 🎯 ${esc(SKY_ROUND_DATA[ri].prompt)}: <strong>${esc(SKY_ROUND_DATA[ri].target)}</strong>`;
    }
    g.spawnTimer += dt;
    if (g.spawnTimer >= (FAST ? 0.25 : 1.05)) { g.spawnTimer = 0; spawnSkyItem(W, ri); }
    const now = performance.now(); const stunned = now < g.stunUntil;
    for (let i = g.items.length - 1; i >= 0; i--) {
      const it = g.items[i]; it.y += it.vy * dt; it.el.style.top = it.y + 'px';
      const boatTop = H - 60;
      if (!stunned && it.y + 60 >= boatTop && Math.abs(it.x - g.boatX) < 48) catchSkyItem(it, i);
      else if (it.y > H + 70) removeSkyItem(i);
    }
    const boat = document.getElementById('skyBoat'); if (boat) boat.classList.toggle('stun', stunned);
    const hud = document.getElementById('skyHud');
    if (hud) hud.textContent = `รอบ ${ri + 1}/6 · เหลือ ${Math.max(0, Math.ceil(ROUND_SECONDS - (elapsed % ROUND_SECONDS)))}s · ผ่าน ${g.cleared.filter(Boolean).length}/6`;
    if (g.cleared.every(Boolean)) { g.running = false; finishGame(); return; }
    g.raf = requestAnimationFrame(skyLoop);
  }
  function stopSky() { if (state.g && state.g.raf) { cancelAnimationFrame(state.g.raf); state.g.raf = null; state.g.running = false; } }

  /* ── Finish + Victory ── */
  function computeResult() {
    const g = state.g; let pct = 0;
    if (state.game === 'match') pct = g.pairs === MATCH_PAIRS.length ? Math.round((MATCH_PAIRS.length / Math.max(g.moves, MATCH_PAIRS.length)) * 100) : Math.round((g.pairs / MATCH_PAIRS.length) * 100);
    else if (state.game === 'chest') pct = Math.round((g.correct / g.order.length) * 100);
    else if (state.game === 'mystery') { const m = g.matched.length; pct = m === 4 ? (g.bombs === 0 ? 100 : (g.bombs === 1 ? 90 : 70)) : Math.round((m / 4) * 100); }
    else if (state.game === 'verse') pct = g.solved ? (g.checks <= 1 ? 100 : g.checks <= 3 ? 80 : 60) : 0;
    else if (state.game === 'speed') pct = Math.round((g.correct / SPEED.length) * 100);
    else if (state.game === 'sky') { const c = g.cleared.filter(Boolean).length; pct = Math.round((c / SKY_ROUNDS) * 100); }
    pct = Math.max(0, Math.min(100, pct));
    const stars = pct >= 100 ? 3 : (pct >= 80 ? 2 : (pct >= 60 ? 1 : 0));
    return { pct, stars, timeUsed: GAME_SECONDS - Math.max(0, state.timeLeft) };
  }
  function finishGame() {
    stopTimer(); stopSky();
    if (state.screen === 'victory') return;
    const res = computeResult(); state.result = res;
    progress.stars[state.game] = Math.max(Number(progress.stars[state.game] || 0), res.stars);
    saveProgress(progress);
    renderVictory();
  }
  function renderVictory() {
    state.screen = 'victory';
    const gm = GAMES.find(x => x.key === state.game); const res = state.result;
    const starsHtml = [0, 1, 2].map(i => `<span class="${i < res.stars ? '' : 'off'}">⭐</span>`).join('');
    root.innerHTML = `
      <div class="clear-card card-metallic victory-card">
        <div style="font-size:2.5rem;margin-bottom:0.25rem;">🎉</div>
        <h2 style="font-size:1.35rem;font-weight:800;margin-bottom:0.35rem;">${esc(gm.title)} — จบเกม!</h2>
        <div class="victory-stars">${starsHtml}</div>
        <p style="color:var(--text-muted);font-size:0.92rem;">ความแม่นยำ ${res.pct}% · ใช้เวลา ${res.timeUsed} วินาที</p>
        <div class="victory-pum"><i class="fa-solid fa-coins"></i> +${res.stars} ปั๊ม PUM ถูกเพิ่มเข้ากระเป๋าของคุณแล้ว!</div>
        <div style="display:flex;gap:0.75rem;justify-content:center;flex-wrap:wrap;">
          <button class="clear-btn clear-btn-primary btn-metallic" data-action="retry" style="min-height:44px;background:${gm.grad};"><i class="fa-solid fa-rotate-right"></i> <span>เล่นใหม่อีกครั้ง</span></button>
          <button class="clear-btn clear-btn-secondary" data-action="lobby" style="min-height:44px;"><i class="fa-solid fa-gamepad"></i> <span>กลับหน้ารวมเกม</span></button>
        </div>
        <p style="margin-top:1.25rem;font-size:0.82rem;color:var(--text-dim);">ดาวรวมสะสม ${totalStars()}/18 ⭐ · ปั๊มรวม +${totalStars()}</p>
      </div>`;
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function startGame(key) {
    state.game = key;
    if (key === 'match') startMatch();
    else if (key === 'chest') startChest();
    else if (key === 'mystery') startMystery();
    else if (key === 'verse') startVerse();
    else if (key === 'speed') startSpeed();
    else if (key === 'sky') startSky();
    renderArena();
  }

  /* ── Events ── */
  root.addEventListener('click', (e) => {
    const tile = e.target.closest('[data-game]'); if (tile) { startGame(tile.dataset.game); return; }
    const card = e.target.closest('[data-card]'); if (card) { handleMatch(card.dataset.card); return; }
    const chestBtn = e.target.closest('[data-type]'); if (chestBtn) { handleChest(chestBtn.dataset.type); return; }
    const mem = e.target.closest('[data-mem]'); if (mem) { tapMystery(mem.dataset.mem); return; }
    const vline = e.target.closest('[data-pos]'); if (vline) { selectVerse(Number(vline.dataset.pos)); return; }
    const swipe = e.target.closest('[data-answer]'); if (swipe) { answerSpeed(swipe.dataset.answer === 'true'); return; }
    const el = e.target.closest('[data-action]'); if (!el) return;
    const a = el.dataset.action;
    if (a === 'lobby') { stopTimer(); stopSky(); renderLobby(); }
    else if (a === 'retry') startGame(state.game);
    else if (a === 'check-verse') checkVerse();
  });

  document.addEventListener('DOMContentLoaded', renderLobby);
})();
