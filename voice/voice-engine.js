/**
 * ═══════════════════════════════════════════════════════════════
 * PROJECT CLEAR — CLEAR VOICE STUDENT WIZARD
 * 6-section reflection flow driven by the evaluation questions
 * served from project-clear-api (cv_* tables in project-clear-db).
 * ═══════════════════════════════════════════════════════════════
 */
(function () {
  const root = document.getElementById('voiceRoot');
  const body = document.getElementById('voiceBody');
  if (!body) return;

  const EMOJI = [
    ['😫', 'เครียดมาก'], ['😕', 'ค่อนข้างเหนื่อย'], ['😐', 'เรื่อย ๆ พอไหว'],
    ['🙂', 'มีความสุขดี'], ['🤩', 'สนุกและชอบมาก'],
  ];
  const GROUPS = [
    { id: 'overall', title: 'ความรู้สึกโดยรวม', icon: 'fa-face-smile', sub: 'เริ่มจากความรู้สึกจริง ๆ ของเราในห้องเรียนนี้', keys: ['overall'] },
    { id: 'impression', title: 'ภาพจำครู', icon: 'fa-tags', sub: 'เลือกคำที่ตรงกับความรู้สึกของเราที่สุด', keys: ['impression'] },
    { id: 'classroom', title: 'ห้องเรียนของเรา 10 มิติ', icon: 'fa-chalkboard-user', sub: 'ให้คะแนนว่าแต่ละข้อจริงกับห้องเรียนเราแค่ไหน', keys: ['classroom'] },
    { id: 'self', title: 'ส่องสะท้อนตัวเอง', icon: 'fa-user', sub: 'ไม่มีการตัดสิน แค่อยากให้เรารู้จักตัวเองมากขึ้น', keys: ['self', 'self_proud', 'self_change', 'self_next'] },
    { id: 'activities', title: 'กิจกรรมที่ช่วยให้เรียนรู้ดีที่สุด', icon: 'fa-lightbulb', sub: 'เลือกสิ่งที่ช่วยให้เราเข้าใจบทเรียนได้ดี', keys: ['activities'] },
    { id: 'voice', title: 'เสียงสะท้อนปลายเปิด', icon: 'fa-comment-dots', sub: 'บอกครูได้เต็มที่ คำตอบไม่ระบุตัวตน', keys: ['keep', 'change', 'less', 'more'] },
  ];

  const state = {
    evaluation: null,
    questions: [],
    groups: [],
    step: 0,
    answers: {},
    startedAt: Date.now(),
    submitting: false,
  };

  function esc(v) {
    return String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function detectRoom() {
    try {
      for (let i = 0; i < sessionStorage.length; i++) {
        const k = sessionStorage.key(i);
        const m = k && k.match(/^clear_auth_student_(.+)$/);
        if (m) return m[1];
      }
    } catch (e) {}
    try { const r = localStorage.getItem('clear_current_room'); if (r) return r; } catch (e) {}
    try { return (new URLSearchParams(window.location.search).get('room') || '').trim(); } catch (e) { return ''; }
  }

  async function apiGet(action, paramsObj) {
    const url = new URL(CLEAR_API_BASE);
    url.searchParams.set('action', action);
    Object.entries(paramsObj || {}).forEach(([k, v]) => { if (v != null) url.searchParams.set(k, v); });
    const res = await fetch(url.toString(), { cache: 'no-store' });
    return res.json();
  }
  async function apiPost(action, payload) {
    const res = await fetch(CLEAR_API_BASE, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(Object.assign({ action }, payload || {})),
    });
    return res.json();
  }

  /* ── Load ── */
  async function init() {
    let codeParam = '';
    try { codeParam = (new URLSearchParams(window.location.search).get('code') || '').trim(); } catch (e) {}
    if (codeParam) {
      try {
        const data = await apiGet('getVoiceEvaluation', { code: codeParam });
        if (data && data.ok) { start(data); return; }
      } catch (e) { /* fall through */ }
    }
    const room = detectRoom();
    if (room) {
      try {
        const data = await apiGet('getVoiceEvaluation', { room });
        if (data && data.ok) { start(data); return; }
      } catch (e) { /* fall through to code form */ }
    }
    renderCodeForm(room ? `ไม่พบรอบการประเมินที่เปิดอยู่สำหรับห้อง ${room} — กรุณากรอกรหัสสาธารณะจากครู` : '');
  }

  function renderCodeForm(note) {
    state.evaluation = null;
    body.innerHTML = `
      <div class="clear-card voice-card voice-code-box">
        <div style="width:64px;height:64px;border-radius:18px;background:linear-gradient(135deg,#8b5cf6,#7c3aed);color:#fff;display:grid;place-items:center;font-size:1.6rem;margin:0 auto 1.25rem;">
          <i class="fa-solid fa-key"></i>
        </div>
        <h2 style="font-size:1.25rem;font-weight:800;margin-bottom:0.35rem;">เข้าร่วมการประเมิน</h2>
        <p style="color:var(--text-muted);font-size:0.9rem;margin-bottom:1.25rem;">กรอกรหัสสาธารณะที่ครูแจกให้ เช่น DEMO2569</p>
        ${note ? `<div class="ar-note" style="background:rgba(245,158,11,0.12);border:1px solid rgba(245,158,11,0.4);color:#b45309;border-radius:12px;padding:0.7rem 0.9rem;font-size:0.85rem;margin-bottom:1.25rem;">${esc(note)}</div>` : ''}
        <form data-code-form>
          <div class="clear-input-group">
            <input type="text" id="voicePublicCode" class="clear-input" placeholder="รหัสสาธารณะ" style="text-align:center;text-transform:uppercase;letter-spacing:0.12em;font-weight:700;" autocomplete="off" required>
          </div>
          <button type="submit" class="clear-btn clear-btn-primary btn-metallic" style="width:100%;background:linear-gradient(135deg,#8b5cf6,#7c3aed);">
            <i class="fa-solid fa-arrow-right-to-bracket"></i> <span>เริ่มทำแบบประเมิน</span>
          </button>
        </form>
      </div>`;
  }

  function start(data) {
    state.evaluation = data.evaluation;
    state.questions = data.questions || [];
    const keysPresent = new Set(state.questions.map(q => q.sectionKey));
    state.groups = GROUPS.map(g => ({ ...g, questions: state.questions.filter(q => g.keys.includes(q.sectionKey)) }))
      .filter(g => g.questions.length > 0);
    state.step = 0;
    state.answers = {};
    state.startedAt = Date.now();
    renderStep();
  }

  /* ── Render ── */
  function renderStep() {
    const g = state.groups[state.step];
    const total = state.groups.length;
    const segs = state.groups.map((_, i) =>
      `<div class="seg ${i < state.step ? 'done' : (i === state.step ? 'active' : '')}"></div>`).join('');
    const questionsHtml = g.questions.map(renderQuestion).join('');
    const isLast = state.step === total - 1;
    body.innerHTML = `
      <div class="clear-card voice-card">
        <div class="voice-progress">${segs}</div>
        <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:0.5rem;">
          <span style="font-size:0.8rem;color:var(--text-dim);font-weight:700;">ส่วนที่ ${state.step + 1} / ${total}</span>
          <span style="font-size:0.8rem;color:var(--text-dim);">${esc(state.evaluation.title)}${state.evaluation.roomLabel ? ' · ' + esc(state.evaluation.roomLabel) : ''}</span>
        </div>
        <h2 class="voice-step-title" style="margin-top:0.6rem;"><i class="fa-solid ${g.icon}"></i> ${esc(g.title)}</h2>
        <p class="voice-step-sub">${esc(g.sub)}</p>
        ${questionsHtml}
        <div class="voice-nav">
          ${state.step > 0
            ? '<button type="button" class="clear-btn clear-btn-secondary" data-action="back"><i class="fa-solid fa-chevron-left"></i> <span>ย้อนกลับ</span></button>'
            : '<span></span>'}
          ${isLast
            ? '<button type="button" class="clear-btn clear-btn-primary btn-metallic" data-action="submit" style="background:linear-gradient(135deg,#8b5cf6,#7c3aed);"><i class="fa-solid fa-paper-plane"></i> <span>ส่งแบบประเมิน</span></button>'
            : '<button type="button" class="clear-btn clear-btn-primary" data-action="next" style="background:linear-gradient(135deg,#8b5cf6,#7c3aed);"><span>ถัดไป</span> <i class="fa-solid fa-chevron-right"></i></button>'}
        </div>
      </div>`;
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function renderQuestion(q) {
    const val = state.answers[q.id];
    const req = q.required ? '<span class="voice-q-req">*</span>' : '';
    let control = '';
    if (q.questionType === 'emoji_scale') {
      control = `<div class="emoji-row">${EMOJI.map(([e, l], i) =>
        `<button type="button" class="emoji-btn ${val === i + 1 ? 'selected' : ''}" data-action="emoji" data-q="${esc(q.id)}" data-val="${i + 1}">
          <span class="emoji">${e}</span><span class="emoji-label">${l}</span></button>`).join('')}</div>`;
    } else if (q.questionType === 'rating_scale') {
      const labels = q.config && Array.isArray(q.config.labels) ? q.config.labels : null;
      control = `<div class="scale-row">${[1, 2, 3, 4, 5].map(n =>
        `<button type="button" class="scale-btn ${val === n ? 'selected' : ''}" data-action="scale" data-q="${esc(q.id)}" data-val="${n}">
          <span class="num">${n}</span>${labels ? `<span class="cap">${esc(labels[n - 1] || '')}</span>` : ''}</button>`).join('')}</div>`;
      if (!labels) control += '<div class="scale-hint"><span>1 · ไม่จริงเลย</span><span>5 · จริงมาก</span></div>';
    } else if (q.questionType === 'tag_select' || q.questionType === 'multiple_choice') {
      const opts = (q.config && Array.isArray(q.config.options)) ? q.config.options : [];
      const max = (q.config && Number(q.config.maxSelections)) || 1;
      const chosen = Array.isArray(val) ? val : [];
      control = `<div class="chip-wrap">${opts.map(o =>
        `<button type="button" class="chip ${chosen.includes(o) ? 'selected' : ''}" data-action="chip" data-q="${esc(q.id)}" data-opt="${esc(o)}" data-max="${max}">${esc(o)}</button>`).join('')}</div>
        <div class="chip-limit">เลือกได้สูงสุด ${max} รายการ</div>`;
    } else {
      const isLong = q.questionType === 'long_text';
      control = isLong
        ? `<textarea class="clear-input voice-textarea" data-text="${esc(q.id)}" placeholder="พิมพ์คำตอบของคุณ...">${esc(val || '')}</textarea>`
        : `<input type="text" class="clear-input" data-text="${esc(q.id)}" value="${esc(val || '')}" placeholder="พิมพ์คำตอบของคุณ...">`;
    }
    return `<div class="voice-q">
      <div class="voice-q-label">${esc(q.title)}${req}</div>
      ${q.description ? `<p style="font-size:0.82rem;color:var(--text-muted);margin:-0.35rem 0 0.6rem;">${esc(q.description)}</p>` : ''}
      ${control}
    </div>`;
  }

  /* ── Validation + submit ── */
  function syncTextInputs() {
    body.querySelectorAll('[data-text]').forEach(el => { state.answers[el.dataset.text] = el.value; });
  }
  function validateGroup(g) {
    for (const q of g.questions) {
      if (!q.required) continue;
      const v = state.answers[q.id];
      const has = Array.isArray(v) ? v.length > 0 : (v != null && String(v).trim() !== '');
      if (!has) return q;
    }
    return null;
  }
  function buildAnswers() {
    const out = [];
    for (const q of state.questions) {
      const v = state.answers[q.id];
      if (q.questionType === 'emoji_scale' || q.questionType === 'rating_scale') {
        if (v != null && v !== '') out.push({ questionId: q.id, numericValue: Number(v) });
      } else if (q.questionType === 'tag_select' || q.questionType === 'multiple_choice') {
        if (Array.isArray(v) && v.length) out.push({ questionId: q.id, jsonValue: v });
      } else if (v != null && String(v).trim() !== '') {
        out.push({ questionId: q.id, textValue: String(v).trim() });
      }
    }
    return out;
  }

  function showThanks() {
    body.innerHTML = `
      <div class="clear-card voice-thanks">
        <div class="heart">💜</div>
        <h2 style="font-size:1.4rem;font-weight:800;margin-bottom:0.5rem;">ขอบคุณสำหรับเสียงสะท้อนของคุณ</h2>
        <p style="color:var(--text-muted);max-width:440px;margin:0 auto 1.75rem;line-height:1.7;">
          ทุกความคิดเห็นมีค่ามากครับ ครูจะนำไปพัฒนาห้องเรียนของเราให้ดีขึ้น<br>คำตอบของคุณถูกบันทึกแบบไม่ระบุตัวตนอย่างปลอดภัย
        </p>
        <button type="button" class="clear-btn clear-btn-primary btn-metallic" onclick="returnToScores()" style="background:linear-gradient(135deg,#8b5cf6,#7c3aed);">
          <i class="fa-solid fa-chart-simple"></i> <span>ดูคะแนนของฉัน</span>
        </button>
      </div>`;
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function doSubmit() {
    if (state.submitting) return;
    syncTextInputs();
    for (let i = 0; i < state.groups.length; i++) {
      const missing = validateGroup(state.groups[i]);
      if (missing) {
        state.step = i; renderStep();
        showToast('กรุณาตอบข้อที่มีเครื่องหมาย * ให้ครบก่อนนะครับ', 'warning');
        return;
      }
    }
    state.submitting = true;
    try {
      const result = await apiPost('submitVoiceEvaluation', {
        evaluationId: state.evaluation.id,
        answers: buildAnswers(),
        completionTime: Date.now() - state.startedAt,
      });
      if (!result || !result.ok) throw new Error((result && result.error) || 'ส่งแบบประเมินไม่สำเร็จ');
      showToast('ส่งแบบประเมินเรียบร้อย ขอบคุณครับ', 'success');
      showThanks();
    } catch (e) {
      showToast(e.message, 'error');
    } finally {
      state.submitting = false;
    }
  }

  /* ── Events ── */
  body.addEventListener('click', (e) => {
    const el = e.target.closest('[data-action]');
    if (!el) return;
    const action = el.dataset.action;
    if (action === 'emoji' || action === 'scale') {
      state.answers[el.dataset.q] = Number(el.dataset.val);
      renderStep();
    } else if (action === 'chip') {
      const qid = el.dataset.q;
      const opt = el.dataset.opt;
      const max = Number(el.dataset.max) || 1;
      let arr = Array.isArray(state.answers[qid]) ? state.answers[qid].slice() : [];
      const idx = arr.indexOf(opt);
      if (idx >= 0) arr.splice(idx, 1);
      else if (arr.length >= max) { showToast(`เลือกได้สูงสุด ${max} รายการ`, 'warning'); return; }
      else arr.push(opt);
      state.answers[qid] = arr;
      renderStep();
    } else if (action === 'back') {
      syncTextInputs();
      if (state.step > 0) { state.step--; renderStep(); }
    } else if (action === 'next') {
      syncTextInputs();
      const missing = validateGroup(state.groups[state.step]);
      if (missing) { showToast('กรุณาตอบข้อที่มีเครื่องหมาย * ให้ครบก่อนนะครับ', 'warning'); return; }
      if (state.step < state.groups.length - 1) { state.step++; renderStep(); }
    } else if (action === 'submit') {
      doSubmit();
    }
  });
  body.addEventListener('input', (e) => {
    const t = e.target.closest('[data-text]');
    if (t) state.answers[t.dataset.text] = t.value;
  });
  body.addEventListener('submit', async (e) => {
    const form = e.target.closest('[data-code-form]');
    if (!form) return;
    e.preventDefault();
    const code = (document.getElementById('voicePublicCode').value || '').trim();
    if (!code) return;
    try {
      const data = await apiGet('getVoiceEvaluation', { code });
      if (!data || !data.ok) throw new Error((data && data.error) || 'ไม่พบรหัสนี้');
      start(data);
    } catch (err) {
      showToast(err.message, 'error');
    }
  });

  document.addEventListener('DOMContentLoaded', init);
})();
