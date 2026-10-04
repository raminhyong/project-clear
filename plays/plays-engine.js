/**
 * ═══════════════════════════════════════════════════════════════
 * PROJECT CLEAR — CLEAR PLAYS ENGINE (Arcade Prototype)
 * 5 mini-games (Match Rush, Chest Sort, Mystery Box, Verse Builder,
 * Speed Swipe) with a 60s timer, star ratings and PUM rewards.
 * Stars/PUM are stored in localStorage (prototype).
 * ═══════════════════════════════════════════════════════════════
 */
(function () {
  const root = document.getElementById('playsRoot');
  if (!root) return;

  const PROGRESS_KEY = 'clear_plays_progress_v1';
  const GAME_SECONDS = 60;

  const GAMES = [
    { key: 'match', title: 'Match Rush', desc: 'จับคู่คำสัมพันธ์ 4 คู่', icon: 'fa-shuffle', grad: 'linear-gradient(135deg,#0ea5e9,#2563eb)' },
    { key: 'chest', title: 'Chest Sort', desc: 'แยกคำสมาส vs คำสนธิ', icon: 'fa-box-open', grad: 'linear-gradient(135deg,#8b5cf6,#6d28d9)' },
    { key: 'mystery', title: 'Mystery Box', desc: 'เปิดกล่องปริศนา 6 กล่อง', icon: 'fa-gift', grad: 'linear-gradient(135deg,#f59e0b,#d97706)' },
    { key: 'verse', title: 'Verse Builder', desc: 'เรียงร้อยฉันทลักษณ์ 4 วรรค', icon: 'fa-scroll', grad: 'linear-gradient(135deg,#10b981,#047857)' },
    { key: 'speed', title: 'Speed Swipe', desc: 'ปัดไว จริงหรือเท็จ 6 ข้อ', icon: 'fa-bolt', grad: 'linear-gradient(135deg,#f43f5e,#be123c)' },
  ];

  const MATCH_PAIRS = [
    { a: 'ขุนแผน', b: 'ดาบฟ้าฟื้น' },
    { a: 'พลายงาม', b: 'จมื่นไวยวรนาถ' },
    { a: 'ขุนช้าง', b: 'ถวายฎีกา' },
    { a: 'วันทอง', b: 'สุบินนิมิตเสือคาบ' },
  ];
  const CHEST_WORDS = [
    { word: 'ราชการ', type: 'samas' },
    { word: 'ภัตตาหาร', type: 'samas' },
    { word: 'สุนทรพจน์', type: 'samas' },
    { word: 'ชลมารค', type: 'samas' },
    { word: 'วิทยาลัย', type: 'sandhi' },
    { word: 'เกษตรศาสตร์', type: 'sandhi' },
  ];
  const MYSTERY = [
    { q: 'ขุนแผนมีอาวุธคู่กายคือสิ่งใด?', opts: ['ดาบฟ้าฟื้น', 'หอกทอง', 'ธนูเงิน', 'ปี่แก้ว'], ans: 0 },
    { q: 'เรือพระที่นั่งในกาพย์เห่เรือที่มีโขนเรือรูปหงส์ทองคือ?', opts: ['เรือสุพรรณหงส์', 'เรือครุฑยุดนาค', 'เรืออสุรวายุภักษ์', 'เรือนาควัต'], ans: 0 },
    { q: 'ใครเป็นผู้ถวายฎีกาต่อสมเด็จพระพันวษา?', opts: ['ขุนช้าง', 'ขุนแผน', 'พลายงาม', 'วันทอง'], ans: 0 },
    { q: 'สุบินนิมิต (ความฝัน) ของวันทองหมายถึงสิ่งใด?', opts: ['ลางร้ายและพระราชพิโรธ', 'ข่าวดีเรื่องความรัก', 'การได้กลับไปอยู่กับขุนแผน', 'โชคลาภก้อนใหญ่'], ans: 0 },
    { q: 'โขนเรือรูปพญาครุฑกางปีกยุดจับนาค คือเรือใด?', opts: ['เรือครุฑยุดนาค', 'เรือสุพรรณหงส์', 'เรือครุฑ', 'เรือนาค'], ans: 0 },
    { q: 'กาพย์เห่เรือ ฉบับที่เรียน ประพันธ์โดยใคร?', opts: ['เจ้าฟ้าธรรมธิเบศร์ (เจ้าฟ้ากุ้ง)', 'สุนทรภู่', 'พระบาทสมเด็จพระพุทธเลิศหล้านภาลัย', 'กรมหมื่นพิทยาลงกรณ์'], ans: 0 },
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

  const state = { screen: 'lobby', game: null, g: null, timeLeft: GAME_SECONDS, timer: null, result: null };

  function esc(v) { return String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;'); }
  function shuffle(arr) { const a = arr.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
  function loadProgress() { try { const p = JSON.parse(localStorage.getItem(PROGRESS_KEY) || '{}'); return { stars: Object.assign({ match: 0, chest: 0, mystery: 0, verse: 0, speed: 0 }, p.stars || {}) }; } catch (e) { return { stars: { match: 0, chest: 0, mystery: 0, verse: 0, speed: 0 } }; } }
  function saveProgress(p) { try { localStorage.setItem(PROGRESS_KEY, JSON.stringify(p)); } catch (e) {} }
  const progress = loadProgress();
  const totalStars = () => Object.values(progress.stars).reduce((s, n) => s + (Number(n) || 0), 0);

  /* ── Timer ── */
  function startTimer() {
    stopTimer();
    state.timeLeft = GAME_SECONDS;
    paintTimer();
    state.timer = setInterval(() => {
      state.timeLeft--;
      paintTimer();
      if (state.timeLeft <= 0) { stopTimer(); finishGame(); }
    }, 1000);
  }
  function stopTimer() { if (state.timer) { clearInterval(state.timer); state.timer = null; } }
  function paintTimer() {
    const chip = document.getElementById('timerChip');
    const bar = document.getElementById('timerBar');
    if (chip) { chip.innerHTML = `<i class="fa-solid fa-clock"></i> ${Math.max(0, state.timeLeft)}s`; chip.classList.toggle('warn', state.timeLeft <= 10); }
    if (bar) bar.style.width = Math.max(0, (state.timeLeft / GAME_SECONDS) * 100) + '%';
  }

  /* ── Lobby ── */
  function renderLobby() {
    state.screen = 'lobby'; state.game = null; state.g = null;
    const tiles = GAMES.map(gm => {
      const s = Number(progress.stars[gm.key] || 0);
      const stars = '★'.repeat(s) + '☆'.repeat(3 - s);
      return `<button class="game-tile" data-game="${gm.key}">
        <span class="game-icon" style="background:${gm.grad};"><i class="fa-solid ${gm.icon}"></i></span>
        <h3>${esc(gm.title)}</h3>
        <p>${esc(gm.desc)}</p>
        <span class="tile-stars" title="${s}/3">${stars}</span>
      </button>`;
    }).join('');
    root.innerHTML = `
      <div class="plays-hero">
        <div><h1>🎮 CLEAR Plays</h1><p>มินิเกมทบทวนวรรณคดีไทย ม.6 · สะสมดาวและแต้มปั๊ม PUM</p></div>
        <div class="stats">
          <div><strong>${totalStars()}<span style="font-size:1rem;">/15</span></strong><span>ดาวสะสม ⭐</span></div>
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
    g.moves++;
    g.locked = true;
    const second = card;
    if (g.first.pair === second.pair) {
      const first = g.first;
      paintMatch();
      const sel = document.querySelector(`[data-card="${first.uid}"]`);
      const sel2 = document.querySelector(`[data-card="${second.uid}"]`);
      if (sel) sel.classList.add('ok'); if (sel2) sel2.classList.add('ok');
      setTimeout(() => {
        g.okUids.push(first.uid, second.uid); g.first = null; g.locked = false; g.pairs++;
        paintMatch();
        if (g.pairs === MATCH_PAIRS.length) finishGame();
      }, 450);
    } else {
      const sel2 = document.querySelector(`[data-card="${second.uid}"]`);
      const sel = document.querySelector(`[data-card="${g.first.uid}"]`);
      if (sel) sel.classList.add('bad'); if (sel2) sel2.classList.add('bad');
      setTimeout(() => { g.first = null; g.locked = false; paintMatch(); }, 550);
    }
  }

  /* ── Game 2: Chest Sort ── */
  function startChest() { state.g = { order: shuffle(CHEST_WORDS), index: 0, correct: 0, feedback: null }; }
  function paintChest() {
    const g = state.g;
    const area = document.getElementById('gameArea');
    if (g.index >= g.order.length) { finishGame(); return; }
    const item = g.order[g.index];
    const fb = g.feedback ? `<p style="text-align:center;font-weight:700;color:${g.feedback.ok ? '#065f46' : '#991b1b'};">${g.feedback.ok ? '✅ ถูกต้อง!' : '❌ ไม่ถูก — คำนี้เป็น ' + (item.type === 'samas' ? 'คำสมาส' : 'คำสนธิ')}</p>` : '';
    area.innerHTML = `
      <div class="clear-card" style="padding:1.25rem;">
        <p style="text-align:center;color:var(--text-muted);font-size:0.85rem;margin-bottom:0.3rem;">คำที่ ${g.index + 1} / ${g.order.length}</p>
        <div class="chest-word">${esc(item.word)}</div>
        ${fb}
        <div class="chest-btns">
          <button class="chest-btn samas" data-type="samas" ${g.feedback ? 'disabled' : ''}><i class="fa-solid fa-box"></i> คำสมาส</button>
          <button class="chest-btn sandhi" data-type="sandhi" ${g.feedback ? 'disabled' : ''}><i class="fa-solid fa-box"></i> คำสนธิ</button>
        </div>
      </div>`;
    setScore(`ถูก ${g.correct}/${g.order.length}`);
  }
  function handleChest(type) {
    const g = state.g;
    if (g.feedback) return;
    const item = g.order[g.index];
    const ok = type === item.type;
    if (ok) g.correct++;
    g.feedback = { ok };
    paintChest();
    setTimeout(() => { g.feedback = null; g.index++; paintChest(); }, 900);
  }

  /* ── Game 3: Mystery Box ── */
  function startMystery() { state.g = { results: {}, current: null, correct: 0 }; }
  function paintMystery() {
    const g = state.g;
    const boxes = MYSTERY.map((_, i) => {
      const done = g.results[i] !== undefined;
      const label = done ? '⭐' : (i + 1);
      return `<button class="mystery-box ${done ? 'done' : ''}" data-box="${i}" ${done ? 'disabled' : ''}>${label}</button>`;
    }).join('');
    let panel = '';
    if (g.current !== null) {
      const m = MYSTERY[g.current];
      const answered = g.results[g.current] !== undefined;
      const opts = m.opts.map((o, i) => {
        let cls = '';
        if (answered) { if (i === m.ans) cls = 'ok'; else if (i === g.results[g.current].chosen) cls = 'bad'; }
        return `<button class="mystery-opt ${cls}" data-opt="${i}" ${answered ? 'disabled' : ''}>${esc(o)}</button>`;
      }).join('');
      panel = `<div class="mystery-panel"><div class="mystery-q">🎁 ${esc(m.q)}</div><div class="mystery-opts">${opts}</div></div>`;
    } else {
      panel = `<p style="text-align:center;color:var(--text-muted);">แตะกล่องปริศนาเพื่อเปิดคำถาม</p>`;
    }
    document.getElementById('gameArea').innerHTML = `<div class="mystery-grid">${boxes}</div>${panel}`;
    setScore(`ถูก ${g.correct}/6`);
  }
  function openMystery(i) { state.g.current = i; paintMystery(); }
  function answerMystery(opt) {
    const g = state.g;
    const m = MYSTERY[g.current];
    if (g.results[g.current] !== undefined) return;
    const ok = opt === m.ans;
    if (ok) g.correct++;
    g.results[g.current] = { chosen: opt, ok };
    paintMystery();
    if (Object.keys(g.results).length === MYSTERY.length) setTimeout(finishGame, 700);
    else setTimeout(() => { g.current = null; paintMystery(); }, 800);
  }

  /* ── Game 4: Verse Builder ── */
  function startVerse() {
    const lines = VERSE_LINES.map((text, i) => ({ text, correctPos: i }));
    state.g = { lines: shuffle(lines), sel: null, checks: 0, solved: false, marks: [] };
  }
  function paintVerse() {
    const g = state.g;
    const rows = g.lines.map((l, pos) => {
      const isSel = g.sel === pos;
      const mark = g.marks[pos];
      const cls = isSel ? 'selected' : (mark === true ? 'correct' : (mark === false ? 'wrong' : ''));
      return `<button class="verse-line ${cls}" data-pos="${pos}"><span class="ln">${pos + 1}</span><span>${esc(l.text)}</span></button>`;
    }).join('');
    document.getElementById('gameArea').innerHTML = `
      <div class="clear-card" style="padding:1.25rem;">
        <p style="color:var(--text-muted);font-size:0.85rem;margin-bottom:0.75rem;">แตะวรรคแรก แล้วแตะวรรคที่สองเพื่อสลับตำแหน่ง → เรียงให้เป็นกาพย์เห่เรือที่ถูกต้อง</p>
        <div class="verse-list">${rows}</div>
        <div style="display:flex;justify-content:flex-end;gap:0.6rem;">
          <button class="clear-btn clear-btn-primary btn-metallic" data-action="check-verse" style="min-height:44px;background:linear-gradient(135deg,#10b981,#047857);"><i class="fa-solid fa-check"></i> <span>ตรวจคำตอบ</span></button>
        </div>
      </div>`;
    setScore(g.solved ? 'เรียงถูกแล้ว!' : `ตรวจแล้ว ${g.checks} ครั้ง`);
  }
  function selectVerse(pos) {
    const g = state.g;
    if (g.solved) return;
    g.marks = [];
    if (g.sel === null) { g.sel = pos; }
    else if (g.sel === pos) { g.sel = null; }
    else { const t = g.lines[g.sel]; g.lines[g.sel] = g.lines[pos]; g.lines[pos] = t; g.sel = null; }
    paintVerse();
  }
  function checkVerse() {
    const g = state.g;
    g.checks++;
    g.marks = g.lines.map((l, pos) => l.correctPos === pos);
    const all = g.marks.every(Boolean);
    if (all) { g.solved = true; paintVerse(); setTimeout(finishGame, 800); }
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
      </div>
      ${fb}
      <p style="text-align:center;color:var(--text-muted);font-size:0.82rem;margin-top:0.75rem;">ข้อ ${g.index + 1} / ${SPEED.length}</p>`;
    setScore(`ถูก ${g.correct}/${SPEED.length}`);
  }
  function answerSpeed(val) {
    const g = state.g;
    if (g.answered) return;
    const item = SPEED[g.index];
    g.lastOk = (val === item.answer);
    if (g.lastOk) g.correct++;
    g.answered = true;
    paintSpeed();
    setTimeout(() => { g.index++; g.answered = false; g.lastOk = null; paintSpeed(); }, 800);
  }

  /* ── Finish + Victory ── */
  function computeResult() {
    const g = state.g;
    let pct = 0;
    if (state.game === 'match') { pct = g.pairs === MATCH_PAIRS.length ? Math.round((MATCH_PAIRS.length / Math.max(g.moves, MATCH_PAIRS.length)) * 100) : Math.round((g.pairs / MATCH_PAIRS.length) * 100); }
    else if (state.game === 'chest') pct = Math.round((g.correct / g.order.length) * 100);
    else if (state.game === 'mystery') pct = Math.round((g.correct / MYSTERY.length) * 100);
    else if (state.game === 'verse') pct = g.solved ? (g.checks <= 1 ? 100 : g.checks <= 3 ? 80 : 60) : 0;
    else if (state.game === 'speed') pct = Math.round((g.correct / SPEED.length) * 100);
    pct = Math.max(0, Math.min(100, pct));
    const stars = pct >= 100 ? 3 : (pct >= 80 ? 2 : (pct >= 60 ? 1 : 0));
    return { pct, stars, timeUsed: GAME_SECONDS - Math.max(0, state.timeLeft) };
  }
  function finishGame() {
    stopTimer();
    if (state.screen === 'victory') return;
    const res = computeResult();
    state.result = res;
    const prev = Number(progress.stars[state.game] || 0);
    progress.stars[state.game] = Math.max(prev, res.stars);
    saveProgress(progress);
    renderVictory();
  }
  function renderVictory() {
    state.screen = 'victory';
    const gm = GAMES.find(x => x.key === state.game);
    const res = state.result;
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
        <p style="margin-top:1.25rem;font-size:0.82rem;color:var(--text-dim);">ดาวรวมสะสม ${totalStars()}/15 ⭐ · ปั๊มรวม +${totalStars()}</p>
      </div>`;
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  /* ── Start ── */
  function startGame(key) {
    state.game = key;
    if (key === 'match') startMatch();
    else if (key === 'chest') startChest();
    else if (key === 'mystery') startMystery();
    else if (key === 'verse') startVerse();
    else if (key === 'speed') startSpeed();
    renderArena();
  }

  /* ── Events ── */
  root.addEventListener('click', (e) => {
    const tile = e.target.closest('[data-game]');
    if (tile) { startGame(tile.dataset.game); return; }
    const card = e.target.closest('[data-card]');
    if (card) { handleMatch(card.dataset.card); return; }
    const chestBtn = e.target.closest('[data-type]');
    if (chestBtn) { handleChest(chestBtn.dataset.type); return; }
    const box = e.target.closest('[data-box]');
    if (box) { openMystery(Number(box.dataset.box)); return; }
    const opt = e.target.closest('[data-opt]');
    if (opt) { answerMystery(Number(opt.dataset.opt)); return; }
    const vline = e.target.closest('[data-pos]');
    if (vline) { selectVerse(Number(vline.dataset.pos)); return; }
    const swipe = e.target.closest('[data-answer]');
    if (swipe) { answerSpeed(swipe.dataset.answer === 'true'); return; }
    const el = e.target.closest('[data-action]');
    if (!el) return;
    const a = el.dataset.action;
    if (a === 'lobby') { stopTimer(); renderLobby(); }
    else if (a === 'retry') startGame(state.game);
    else if (a === 'check-verse') checkVerse();
  });

  document.addEventListener('DOMContentLoaded', renderLobby);
})();
