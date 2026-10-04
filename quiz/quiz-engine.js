/**
 * ═══════════════════════════════════════════════════════════════
 * PROJECT CLEAR — CLEAR QUIZ ENGINE
 * Post-lesson micro-quiz (15 lessons x 3) with instant feedback and
 * PUM mastery rewards (3 / 2 / 1 by attempt, no double farming).
 * Data: project-clear-api (quiz_lessons / quiz_questions / quiz_responses).
 * ═══════════════════════════════════════════════════════════════
 */
(function () {
  const root = document.getElementById('quizRoot');
  if (!root) return;

  const OPT_KEYS = { A: 'ก', B: 'ข', C: 'ค', D: 'ง' };
  const state = { room: '', code: '', lessons: [], lesson: null, questions: [], index: 0, results: {}, lessonPum: 0, submitting: false };

  function esc(v) {
    return String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function detectRoom() {
    try { const r = localStorage.getItem('clear_current_room'); if (r) return r; } catch (e) {}
    try {
      for (let i = 0; i < sessionStorage.length; i++) {
        const k = sessionStorage.key(i);
        const m = k && k.match(/^clear_auth_student_(.+)$/);
        if (m) return m[1];
      }
    } catch (e) {}
    try { return (new URLSearchParams(window.location.search).get('room') || '').trim(); } catch (e) { return ''; }
  }
  function detectCode() {
    try {
      const c = (new URLSearchParams(window.location.search).get('code') || '').replace(/\D/g, '').slice(0, 5);
      if (c.length === 5) return c;
    } catch (e) {}
    try {
      for (let i = 0; i < sessionStorage.length; i++) {
        const k = sessionStorage.key(i);
        const m = k && k.match(/^clear_auth_student_(.+)$/);
        if (m) {
          const s = JSON.parse(sessionStorage.getItem(k) || 'null');
          if (s && s.code) return String(s.code);
        }
      }
    } catch (e) {}
    return '';
  }

  async function apiGet(action, params) {
    const url = new URL(CLEAR_API_BASE);
    url.searchParams.set('action', action);
    Object.entries(params || {}).forEach(([k, v]) => { if (v != null) url.searchParams.set(k, v); });
    const res = await fetch(url.toString(), { cache: 'no-store' });
    return res.json();
  }
  async function apiPost(action, body) {
    const res = await fetch(CLEAR_API_BASE, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(Object.assign({ action }, body || {})) });
    return res.json();
  }
  function setLoading(msg) {
    root.innerHTML = `<div class="clear-card" style="text-align:center; padding:3rem;"><i class="fa-solid fa-circle-notch fa-spin" style="font-size:2rem; color:#f59e0b;"></i><p style="color:var(--text-muted); margin-top:0.75rem;">${esc(msg)}</p></div>`;
  }

  async function init() {
    state.room = detectRoom();
    state.code = detectCode();
    setLoading('กำลังโหลดคลังคำถามท้ายคาบ...');
    try {
      const data = await apiGet('getQuizLessons', { room: state.room, studentCode: state.code });
      if (!data || !data.ok) throw new Error((data && data.error) || 'โหลดข้อมูลไม่สำเร็จ');
      state.lessons = data.lessons || [];
      state.passedLessons = data.passedLessons || 0;
      state.totalPum = data.totalPum || 0;
      renderHub();
    } catch (e) {
      root.innerHTML = `<div class="clear-card" style="text-align:center;padding:2.5rem;color:var(--brand-rose);">${esc(e.message)}</div>`;
    }
  }

  /* ── Screen 1: Lesson Hub ── */
  function renderHub() {
    const passed = state.lessons.filter(l => l.correctCount >= 3).length;
    const totalPum = state.lessons.reduce((s, l) => s + (l.pumEarned || 0), 0);
    const cards = state.lessons.map(l => {
      const stars = '★'.repeat(l.stars) + '☆'.repeat(3 - l.stars);
      const cls = l.isActive ? 'active' : 'locked';
      return `<button class="lesson-card ${cls}" data-lesson="${l.lessonNo}">
        <span class="lesson-no">คาบที่ ${l.lessonNo} · ${esc(l.part || '')}</span>
        <span class="lesson-title">${esc(l.title)}</span>
        <span class="lesson-foot">
          <span class="lesson-badge ${l.isActive ? 'open' : 'lock'}">${l.isActive ? '🔓 เปิดให้ทำ' : '🔒 รอครูเปิด'}</span>
          <span class="lesson-stars" title="${l.correctCount}/3">${stars}</span>
        </span>
      </button>`;
    }).join('');
    root.innerHTML = `
      <div class="quiz-hero">
        <div>
          <h1>CLEAR Quiz</h1>
          <p>คำถามท้ายคาบเรียน 15 คาบ · สะสมแต้มปั๊ม PUM</p>
        </div>
        <div class="stats">
          <div><strong>${passed}<span style="font-size:1rem;">/15</span></strong><span>ผ่านแล้ว (คาบ)</span></div>
          <div><strong>${totalPum}</strong><span>ปั๊มสะสม</span></div>
        </div>
      </div>
      <div class="lesson-grid">${cards || '<p style="color:var(--text-muted);">ยังไม่มีคาบเรียน</p>'}</div>`;
    root.scrollTop = 0;
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  /* ── Screen 2: Quiz ── */
  async function openLesson(no) {
    const l = state.lessons.find(x => x.lessonNo === Number(no));
    if (!l) return;
    if (!l.isActive) { showToast(`คาบที่ ${no} ยังไม่เปิดให้ทำ quiz ครับ`, 'warning'); return; }
    setLoading(`กำลังโหลดคำถาม คาบที่ ${no}...`);
    try {
      const data = await apiGet('getQuizQuestions', { lessonNo: no, studentCode: state.code });
      if (!data || !data.ok) throw new Error((data && data.error) || 'โหลดคำถามไม่สำเร็จ');
      state.lesson = l;
      state.questions = data.questions || [];
      state.index = 0;
      state.results = {};
      state.lessonPum = 0;
      renderQuiz();
    } catch (e) {
      showToast(e.message, 'error');
      renderHub();
    }
  }

  function renderQuiz() {
    const q = state.questions[state.index];
    if (!q) { finish(); return; }
    const r = state.results[q.id];
    const pct = Math.round((state.index / state.questions.length) * 100);
    const opts = ['A', 'B', 'C', 'D'].map(L => {
      let cls = '';
      if (r) { if (L === r.correctOption) cls = 'correct'; else if (L === r.chosen) cls = 'wrong'; }
      return `<button class="quiz-opt ${cls}" data-opt="${L}" ${r ? 'disabled' : ''}>
        <span class="opt-key">${OPT_KEYS[L]}</span><span>${esc(q.options[L] || '')}</span></button>`;
    }).join('');
    let feedback = '';
    if (r) {
      const reward = r.isCorrect
        ? (Number(r.rewardPum) > 0 ? `<span class="reward-badge"><i class="fa-solid fa-stamp"></i> +${r.rewardPum} ปั๊ม!</span>` : '<span style="opacity:.75;font-size:0.82rem;"> (ตอบถูกแล้ว ไม่ได้ปั๊มซ้ำ)</span>')
        : '';
      feedback = `<div class="quiz-feedback show ${r.isCorrect ? 'ok' : 'no'}">
        <strong>${r.isCorrect ? '✅ ถูกต้อง!' : '❌ ยังไม่ถูก — เฉลยข้อ ' + OPT_KEYS[r.correctOption]}</strong>${reward}
        <div>${esc(r.explanation || '')}</div>
      </div>`;
    }
    const actionBtn = r
      ? (state.index < state.questions.length - 1
        ? '<button class="clear-btn clear-btn-primary btn-metallic" data-action="next"><span>ข้อถัดไป</span> <i class="fa-solid fa-chevron-right"></i></button>'
        : '<button class="clear-btn clear-btn-primary btn-metallic" data-action="finish"><i class="fa-solid fa-flag-checkered"></i> <span>ดูสรุปผลคาบ</span></button>')
      : '';
    root.innerHTML = `
      <button class="clear-btn clear-btn-secondary" data-action="hub" style="margin-bottom:1rem;"><i class="fa-solid fa-chevron-left"></i> <span>กลับหน้าหลัก 15 คาบ</span></button>
      <div class="quiz-progress">
        <span class="count">ข้อที่ ${state.index + 1} / ${state.questions.length}</span>
        <div class="bar"><div style="width:${pct}%"></div></div>
      </div>
      <div class="clear-card quiz-qcard">
        <div class="quiz-qmeta">
          <span class="clear-badge badge-metallic">คาบที่ ${state.lesson.lessonNo}</span>
          <span class="clear-badge badge-blue">${esc(state.lesson.part || '')}</span>
        </div>
        <div class="quiz-qtext">${esc(q.text)}</div>
        <div class="quiz-opts">${opts}</div>
        ${feedback}
        <div class="quiz-actions">${actionBtn}</div>
      </div>`;
  }

  async function selectOption(L) {
    const q = state.questions[state.index];
    if (!q || state.results[q.id] || state.submitting) return;
    state.submitting = true;
    try {
      const res = await apiPost('submitQuizAnswer', { studentCode: state.code, room: state.room, lessonNo: state.lesson.lessonNo, questionId: q.id, chosenOption: L });
      if (!res || !res.ok) throw new Error((res && res.error) || 'ส่งคำตอบไม่สำเร็จ');
      state.results[q.id] = { chosen: L, isCorrect: res.isCorrect, correctOption: res.correctOption, explanation: res.explanation, rewardPum: res.rewardPum };
      state.lessonPum += Number(res.rewardPum || 0);
      if (res.isCorrect && Number(res.rewardPum) > 0) showToast(`ถูกต้อง! +${res.rewardPum} ปั๊ม`, 'success');
    } catch (e) {
      showToast(e.message, 'error');
    } finally {
      state.submitting = false;
      renderQuiz();
    }
  }

  /* ── Screen 3: Summary ── */
  function finish() {
    const total = state.questions.length;
    const correct = state.questions.filter(q => { const r = state.results[q.id]; return r && r.isCorrect; }).length;
    root.innerHTML = `
      <div class="clear-card quiz-summary card-metallic">
        <div class="big">${correct}/${total}</div>
        <div class="sub">คาบที่ ${state.lesson.lessonNo} · ได้รับ <strong style="color:#d97706;">+${state.lessonPum} ปั๊ม</strong> ในคาบนี้</div>
        <div style="display:flex;gap:0.75rem;justify-content:center;flex-wrap:wrap;">
          <button class="clear-btn clear-btn-primary btn-metallic" data-action="retake"><i class="fa-solid fa-rotate-right"></i> <span>ฝึกซ้ำอีกครั้ง (Mastery Retake)</span></button>
          <button class="clear-btn clear-btn-secondary" data-action="hub"><i class="fa-solid fa-layer-group"></i> <span>กลับหน้าหลัก 15 คาบ</span></button>
        </div>
      </div>`;
  }

  async function backToHub() {
    setLoading('กำลังกลับหน้าหลัก...');
    try {
      const data = await apiGet('getQuizLessons', { room: state.room, studentCode: state.code });
      if (data && data.ok) state.lessons = data.lessons || [];
    } catch (e) {}
    renderHub();
  }

  /* ── Events ── */
  root.addEventListener('click', (e) => {
    const card = e.target.closest('[data-lesson]');
    if (card) { openLesson(card.dataset.lesson); return; }
    const opt = e.target.closest('[data-opt]');
    if (opt) { selectOption(opt.dataset.opt); return; }
    const el = e.target.closest('[data-action]');
    if (!el) return;
    const a = el.dataset.action;
    if (a === 'hub') backToHub();
    else if (a === 'next') { state.index++; renderQuiz(); }
    else if (a === 'finish') finish();
    else if (a === 'retake') openLesson(state.lesson.lessonNo);
  });

  document.addEventListener('DOMContentLoaded', init);
})();
