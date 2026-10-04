/**
 * ═══════════════════════════════════════════════════════════════
 * PROJECT CLEAR — CLEAR PREP EXAM ENGINE
 * Catalog -> test (sub-set tabs, navigator pills, per-question check)
 * -> result stage. Data comes from exam-data.js (real exam bank).
 * ═══════════════════════════════════════════════════════════════
 */
(function () {
  const root = document.getElementById('prepRoot');
  if (!root) return;

  const state = {
    view: 'catalog',
    exam: null,
    subsetId: 'all',
    list: [],
    answers: {},
    revealed: {},
    index: 0
  };

  function esc(v) {
    return String(v == null ? '' : v)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function setExamTheme() {
    if (state.exam && state.exam.kind === 'final') root.setAttribute('data-exam', 'final');
    else root.removeAttribute('data-exam');
  }

  function buildList() {
    const exam = state.exam;
    if (!exam) { state.list = []; return; }
    if (state.subsetId === 'all') { state.list = exam.questions.slice(); return; }
    const sub = exam.subsets.find(s => s.id === state.subsetId);
    state.list = exam.questions.filter(q => sub && q.num >= sub.from && q.num <= sub.to);
  }

  function subsetLabel() {
    if (!state.exam) return '';
    if (state.subsetId === 'all') return 'ทำทั้งหมดต่อเนื่อง';
    const sub = state.exam.subsets.find(s => s.id === state.subsetId);
    return sub ? sub.title : '';
  }

  function optionLetter(i) { return String.fromCharCode(65 + i); }

  /* ── Catalog ── */
  function renderCatalog() {
    state.view = 'catalog';
    state.exam = null;
    setExamTheme();
    const m = window.MIDTERM_EXAM;
    const f = window.FINAL_EXAM;
    root.innerHTML = `
      <div class="prep-catalog-hero">
        <span class="clear-badge badge-metallic" style="margin-bottom: 0.6rem;"><i class="fa-solid fa-file-pen"></i> CLEAR Prep · คลังข้อสอบและแบบฝึกหัด ท33101</span>
        <h1 style="font-size: 1.9rem; font-weight: 800; margin-bottom: 0.5rem;">เลือกชุดข้อสอบจำลอง</h1>
        <p style="color: var(--text-muted); font-size: 0.98rem;">เลือกชุดข้อสอบจำลองเพื่อเริ่มต้นการฝึกฝนทบทวนความรู้</p>
      </div>
      <div class="prep-grid">
        ${m ? cardHtml(m) : ''}
        ${f ? cardHtml(f) : ''}
      </div>`;
    if (!m && !f) {
      root.querySelector('.prep-grid').innerHTML = '<div class="empty-state" style="grid-column:1/-1;text-align:center;color:var(--text-muted);padding:2rem;">ไม่พบคลังข้อสอบ (exam-data.js)</div>';
    }
  }

  function cardHtml(exam) {
    const isFinal = exam.kind === 'final';
    const grad = isFinal ? 'linear-gradient(135deg, #6366f1, #4f46e5)' : 'linear-gradient(135deg, #f59e0b, #d97706)';
    const icon = isFinal ? 'fa-graduation-cap' : 'fa-book-bookmark';
    const badges = isFinal
      ? [`${exam.count} ข้อ · 4 ตอน`, 'มาตรฐาน: A-Level / ข้อสอบวัดผลปลายภาค']
      : [`${exam.count} ข้อ · 3 ชุดย่อย`, 'ระดับ: ปานกลาง–ท้าทาย'];
    const body = isFinal
      ? 'การอ่านจับใจความ, การเขียนและการสื่อสาร, การฟัง/ดู/พูด, วรรณศิลป์ และวิเคราะห์สื่อสารสนเทศ'
      : 'กาพย์เห่เรือ, ขุนช้างขุนแผน, วรรณศิลป์ และหลักการใช้ภาษาไทย (คำยืม/คำสมาส)';
    const btn = isFinal ? 'เริ่มทำแบบฝึกหัดปลายภาค' : 'เริ่มทำแบบฝึกหัดกลางภาค';
    return `
      <button class="prep-card" data-action="start" data-exam="${exam.kind}">
        <div class="prep-card-head" style="background: ${grad};">
          <i class="fa-solid ${icon}"></i>
          <span class="prep-badges">${badges.map(b => `<span class="badge-metallic">${esc(b)}</span>`).join('')}</span>
        </div>
        <div class="prep-card-body">
          <h3>${esc(exam.title)}</h3>
          <p>${esc(body)}</p>
          <span class="prep-btn" style="background: ${grad};"><i class="fa-solid fa-pen-to-square"></i> ${esc(btn)}</span>
        </div>
      </button>`;
  }

  /* ── Test ── */
  function startExam(kind) {
    const exam = (kind === 'final' ? window.FINAL_EXAM : window.MIDTERM_EXAM);
    if (!exam) { showToast('ไม่พบชุดข้อสอบนี้', 'error'); return; }
    state.exam = exam;
    state.subsetId = 'all';
    state.answers = {};
    state.revealed = {};
    state.index = 0;
    buildList();
    renderTest();
  }

  function renderTest() {
    state.view = 'test';
    setExamTheme();
    root.innerHTML = `
      <div class="prep-test">
        <div class="prep-test-head">
          <button class="prep-back" data-action="back-catalog"><i class="fa-solid fa-arrow-left"></i> กลับหน้าเลือกชุดข้อสอบ</button>
          <div class="prep-test-title">${esc(state.exam.title)}</div>
          <div class="prep-progress" id="prepProgress"></div>
        </div>
        <div class="subset-tabs">
          <button class="subset-tab ${state.subsetId === 'all' ? 'active' : ''}" data-action="subset" data-subset="all">ทำทั้งหมดต่อเนื่อง (${state.exam.count} ข้อ)</button>
          ${state.exam.subsets.map(s => `<button class="subset-tab ${state.subsetId === s.id ? 'active' : ''}" data-action="subset" data-subset="${s.id}">${esc(s.title)} (${s.to - s.from + 1})</button>`).join('')}
        </div>
        <div class="prep-progressbar"><div id="prepProgressBar"></div></div>
        <div class="clear-card qcard" id="qcard"></div>
        <div class="prep-submit">
          <button class="clear-btn clear-btn-primary btn-metallic" data-action="submit"><i class="fa-solid fa-flag-checkered"></i> ส่งคำตอบ / ดูสรุปคะแนน</button>
        </div>
      </div>`;
    paint();
  }

  function feedbackHtml(q, chosen) {
    const correct = chosen === q.ans;
    const head = correct
      ? '<strong>✅ ตอบถูกต้อง!</strong>'
      : `<strong>❌ ตอบไม่ถูกต้อง — เฉลยข้อ ${optionLetter(q.ans)}</strong>`;
    const detail = q.explain ? esc(q.explain) : ('คำตอบที่ถูกต้องคือ ' + optionLetter(q.ans) + '. ' + esc(q.opts[q.ans] || ''));
    return head + '<div>' + detail + '</div>';
  }

  function paint() {
    if (!state.list.length) {
      root.querySelector('#qcard').innerHTML = '<p style="text-align:center;color:var(--text-muted);padding:2rem;">ไม่มีข้อสอบในชุดนี้</p>';
      return;
    }
    const q = state.list[state.index];
    const answeredCount = state.list.filter(x => state.answers[x.num] != null).length;

    root.querySelectorAll('.subset-tab').forEach(t => {
      t.classList.toggle('active', (t.dataset.subset || 'all') === state.subsetId);
    });

    const progress = root.querySelector('#prepProgress');
    if (progress) progress.innerHTML = `<span class="clear-badge badge-metallic">ข้อที่ ${state.index + 1} จาก ${state.list.length}</span> · ตอบแล้ว ${answeredCount} ข้อ`;
    const bar = root.querySelector('#prepProgressBar');
    if (bar) bar.style.width = Math.round((answeredCount / state.list.length) * 100) + '%';

    const revealed = !!state.revealed[q.num];
    const chosen = state.answers[q.num];
    const passage = q.passage ? `<div class="verse-quote">${esc(q.passage)}</div>` : '';
    const opts = q.opts.map((text, i) => {
      let cls = '';
      if (revealed) {
        if (i === q.ans) cls = 'correct';
        else if (i === chosen) cls = 'wrong';
      } else if (i === chosen) {
        cls = 'selected';
      }
      return `<button class="option-btn ${cls}" data-action="select" data-opt="${i}" ${revealed ? 'disabled' : ''}>
        <span class="opt-num">${optionLetter(i)}</span><span>${esc(text)}</span>
      </button>`;
    }).join('');

    root.querySelector('#qcard').innerHTML = `
      <div class="qcard-meta">
        <span class="qmeta-chip">ข้อ ${q.num}</span>
        ${q.topic ? `<span class="qmeta-chip">${esc(q.topic)}</span>` : ''}
        ${q.standard ? `<span class="qmeta-chip">${esc(q.standard)}</span>` : ''}
        ${q.levelLabel ? `<span class="qmeta-chip">${esc(q.levelLabel)}</span>` : ''}
      </div>
      ${passage}
      <div class="qtext">${esc(q.q)}</div>
      <div class="q-opts">${opts}</div>
      <div id="qFeedback" class="qfeedback ${revealed ? (chosen === q.ans ? 'ok' : 'no') : ''} ${revealed ? 'show' : ''}">
        ${revealed ? feedbackHtml(q, chosen) : ''}
      </div>
      <div class="qcard-controls">
        <button class="clear-btn clear-btn-secondary" data-action="prev" ${state.index <= 0 ? 'disabled' : ''}>
          <i class="fa-solid fa-chevron-left"></i> <span>ข้อย้อนหลัง</span>
        </button>
        <button class="clear-btn clear-btn-primary" data-action="check" ${revealed ? 'disabled' : ''}>
          <i class="fa-solid fa-check"></i> <span>ตรวจคำตอบ</span>
        </button>
        <button class="clear-btn clear-btn-secondary" data-action="next" ${state.index >= state.list.length - 1 ? 'disabled' : ''}>
          <span>ข้อถัดไป</span> <i class="fa-solid fa-chevron-right"></i>
        </button>
      </div>`;
  }

  /* ── Result ── */
  function renderResult() {
    state.view = 'result';
    const total = state.list.length;
    let score = 0;
    state.list.forEach(q => { if (state.answers[q.num] === q.ans) score++; });
    const pct = total ? Math.round((score / total) * 100) : 0;
    const level = pct >= 85 ? { e: '🌟', t: 'ยอดเยี่ยม', c: '#10b981' }
      : pct >= 70 ? { e: '🟢', t: 'ผ่านเกณฑ์ดีมาก', c: '#22c55e' }
        : pct >= 50 ? { e: '🟡', t: 'ควรทบทวนเพิ่ม', c: '#f59e0b' }
          : { e: '🔴', t: 'ต้องทบทวนอย่างจริงจัง', c: '#ef4444' };
    const R = 78;
    const C = 2 * Math.PI * R;
    const offset = C * (1 - pct / 100);
    const isFinal = state.exam.kind === 'final';
    const c1 = isFinal ? '#6366f1' : '#f59e0b';
    const c2 = isFinal ? '#4f46e5' : '#d97706';

    root.innerHTML = `
      <div class="result-stage">
        <div class="score-circle">
          <svg width="190" height="190" viewBox="0 0 190 190">
            <defs><linearGradient id="scoreGrad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stop-color="${c1}"/><stop offset="100%" stop-color="${c2}"/>
            </linearGradient></defs>
            <circle class="track" cx="95" cy="95" r="${R}"></circle>
            <circle class="meter" cx="95" cy="95" r="${R}" stroke-dasharray="${C.toFixed(1)}" stroke-dashoffset="${C.toFixed(1)}"></circle>
          </svg>
          <div class="score-inner"><span class="score-num">${score}</span><small>/ ${total} คะแนน</small></div>
        </div>
        <div class="result-level" style="color:${level.c}">${level.e} ${level.t}</div>
        <div class="result-sub">${esc(state.exam.title)} · ${esc(subsetLabel())} · คิดเป็น ${pct}%</div>
        <div class="result-actions">
          <button class="clear-btn clear-btn-primary btn-metallic" data-action="retry"><i class="fa-solid fa-rotate-right"></i> <span>ทำใหม่อีกครั้ง</span></button>
          <button class="clear-btn clear-btn-secondary" data-action="back-catalog"><i class="fa-solid fa-layer-group"></i> <span>กลับหน้าเลือกชุดข้อสอบ</span></button>
        </div>
      </div>`;

    requestAnimationFrame(() => {
      const meter = root.querySelector('.meter');
      if (meter) meter.style.strokeDashoffset = String(offset);
    });
  }

  /* ── Events ── */
  root.addEventListener('click', (e) => {
    const el = e.target.closest('[data-action]');
    if (!el) return;
    const action = el.dataset.action;

    if (action === 'start') {
      startExam(el.dataset.exam);
    } else if (action === 'back-catalog') {
      renderCatalog();
    } else if (action === 'subset') {
      state.subsetId = el.dataset.subset || 'all';
      state.index = 0;
      buildList();
      renderTest();
    } else if (action === 'goto') {
      state.index = Number(el.dataset.index) || 0;
      paint();
    } else if (action === 'select') {
      const q = state.list[state.index];
      if (state.revealed[q.num]) return;
      state.answers[q.num] = Number(el.dataset.opt);
      paint();
    } else if (action === 'check') {
      const q = state.list[state.index];
      if (state.answers[q.num] == null) { showToast('กรุณาเลือกคำตอบก่อนตรวจ', 'warning'); return; }
      state.revealed[q.num] = true;
      paint();
    } else if (action === 'prev') {
      if (state.index > 0) { state.index--; paint(); }
    } else if (action === 'next') {
      if (state.index < state.list.length - 1) { state.index++; paint(); }
    } else if (action === 'submit') {
      renderResult();
    } else if (action === 'retry') {
      state.list.forEach(q => { delete state.answers[q.num]; delete state.revealed[q.num]; });
      state.index = 0;
      renderTest();
    }
  });

  document.addEventListener('DOMContentLoaded', renderCatalog);
})();
