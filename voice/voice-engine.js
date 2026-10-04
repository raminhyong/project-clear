/**
 * ═══════════════════════════════════════════════════════════════
 * PROJECT CLEAR — CLEAR VOICE STUDENT WIZARD
 * No public-code box. Room-scoped: active evaluation -> wizard;
 * otherwise a warm standby card. Questions come from project-clear-api
 * (cv_* tables, 12 standard questions per category).
 * ═══════════════════════════════════════════════════════════════
 */
(function () {
  const body = document.getElementById('voiceBody');
  if (!body) return;

  const EMOJI = [
    ['😫', 'เครียด/ไม่สนุก'], ['😕', 'ค่อนข้างเหนื่อย'], ['😐', 'เรื่อย ๆ พอไหว'],
    ['🙂', 'มีความสุขดี'], ['🤩', 'สนุกและชอบมาก'],
  ];
  const CATEGORY_LABELS = {
    media: { label: '🎬 การประเมินสื่อการเรียนรู้', color: '#8b5cf6' },
    activity: { label: '🎯 การประเมินกิจกรรมการเรียนรู้', color: '#0ea5e9' },
    exit: { label: '🚪 Exit Ticket ท้ายคาบ', color: '#10b981' },
    semester: { label: '📖 การประเมินรายภาคเรียน', color: '#7c3aed' },
  };
  const SECTION_LABELS = {
    overall: { title: 'ความรู้สึกโดยรวม', icon: 'fa-face-smile' },
    impression: { title: 'ภาพจำครู', icon: 'fa-tags' },
    questions: { title: 'ข้อคำถามประเมิน', icon: 'fa-clipboard-list' },
    media: { title: 'ประเมินสื่อการเรียนรู้', icon: 'fa-photo-film' },
    activity: { title: 'ประเมินกิจกรรมการเรียนรู้', icon: 'fa-people-group' },
    exit: { title: 'สะท้อนหลังเรียน', icon: 'fa-door-open' },
    semester: { title: 'สะท้อนรายภาคเรียน', icon: 'fa-book' },
    classroom: { title: 'ห้องเรียนของเรา', icon: 'fa-chalkboard-user' },
    activities: { title: 'กิจกรรมที่ช่วยให้เรียนรู้ดีที่สุด', icon: 'fa-lightbulb' },
    self: { title: 'ส่องสะท้อนตัวเอง', icon: 'fa-user' },
    keep: { title: 'KEEP · สิ่งที่ควรทำต่อ', icon: 'fa-circle-check' },
    change: { title: 'CHANGE · สิ่งที่ควรปรับ', icon: 'fa-arrows-rotate' },
    less: { title: 'LESS · สิ่งที่มากเกินไป', icon: 'fa-circle-minus' },
    more: { title: 'MORE · สิ่งที่อยากให้เพิ่ม', icon: 'fa-circle-plus' },
  };

  const state = { evaluation: null, questions: [], groups: [], step: 0, answers: {}, startedAt: Date.now(), submitting: false };

  function esc(v) {
    return String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
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
  function roomLabel(room) {
    const r = (window.CLEAR_ROOMS || []).find(x => x.room === room);
    return r ? (r.title || room) : ('ม.' + room);
  }

  async function apiGet(paramsObj) {
    const url = new URL(CLEAR_API_BASE);
    url.searchParams.set('action', 'getVoiceEvaluation');
    Object.entries(paramsObj || {}).forEach(([k, v]) => { if (v != null) url.searchParams.set(k, v); });
    const res = await fetch(url.toString(), { cache: 'no-store' });
    return res.json();
  }
  async function apiPost(payload) {
    const res = await fetch(CLEAR_API_BASE, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(Object.assign({ action: 'submitVoiceEvaluation' }, payload || {})),
    });
    return res.json();
  }

  /* ── Load ── */
  async function init() {
    let codeParam = '';
    try { codeParam = (new URLSearchParams(window.location.search).get('code') || '').trim(); } catch (e) {}
    if (codeParam) {
      try {
        const data = await apiGet({ code: codeParam });
        if (data && data.ok && data.active) { start(data); return; }
      } catch (e) { /* fall through */ }
    }
    const room = detectRoom();
    if (!room) { renderStandby(''); return; }
    try {
      const data = await apiGet({ room });
      if (data && data.ok && data.active) { start(data); return; }
    } catch (e) { /* standby */ }
    renderStandby(room);
  }

  function renderStandby(room) {
    const who = room ? `ห้องเรียน ${esc(roomLabel(room))}` : 'ห้องเรียนของคุณ';
    body.innerHTML = `
      <div class="clear-card voice-card voice-thanks" style="background:linear-gradient(135deg, rgba(196,181,253,0.22), rgba(139,92,246,0.10));border:1px solid rgba(139,92,246,0.3);">
        <div style="font-size:3rem;line-height:1;margin-bottom:0.75rem;">🕊️</div>
        <h2 style="font-size:1.4rem;font-weight:800;margin-bottom:0.6rem;">ยังไม่มีการประเมินในตอนนี้</h2>
        <p style="color:var(--text-muted);max-width:460px;margin:0 auto 1.75rem;line-height:1.75;">
          ${who} ในขณะนี้ยังไม่มีแบบประเมินเปิดรับเสียงสะท้อนครับ<br>
          ขอให้นักเรียนพักผ่อนให้สบายใจ และรอฟังคำแนะนำจากครูรามิลในคาบเรียนนะ! 💜
        </p>
        <button type="button" class="clear-btn clear-btn-primary btn-metallic" onclick="returnToScores()" style="background:linear-gradient(135deg,#8b5cf6,#7c3aed);">
          <i class="fa-solid fa-house"></i> <span>กลับหน้าคะแนนของฉัน</span>
        </button>
      </div>`;
  }

  function start(data) {
    state.evaluation = data.evaluation || {};
    state.questions = data.questions || [];
    const order = [];
    const bySection = {};
    state.questions.forEach(q => {
      const key = q.sectionKey || 'questions';
      if (!bySection[key]) { bySection[key] = []; order.push(key); }
      bySection[key].push(q);
    });
    state.groups = order.map(key => Object.assign({ id: key, questions: bySection[key] }, SECTION_LABELS[key] || { title: key, icon: 'fa-circle-question' }));
    state.step = 0;
    state.answers = {};
    state.startedAt = Date.now();
    renderStep();
  }

  /* ── Render ── */
  function banner() {
    const ev = state.evaluation;
    const cat = CATEGORY_LABELS[ev.category] || { label: '💬 แบบประเมินเสียงสะท้อน', color: '#8b5cf6' };
    return `<div style="border-radius:16px;padding:1.1rem 1.25rem;margin-bottom:1.35rem;background:linear-gradient(135deg, ${cat.color}22, ${cat.color}11);border:1px solid ${cat.color}55;">
      <span style="display:inline-block;font-size:0.78rem;font-weight:800;color:${cat.color};background:rgba(255,255,255,0.55);padding:0.25rem 0.7rem;border-radius:999px;margin-bottom:0.5rem;">${esc(cat.label)}</span>
      <div style="font-size:1.15rem;font-weight:800;color:var(--text-main);">${esc(ev.title || '')}</div>
      ${ev.description ? `<p style="font-size:0.9rem;color:var(--text-muted);margin-top:0.35rem;white-space:pre-wrap;">${esc(ev.description)}</p>` : ''}
      <div style="font-size:0.78rem;color:var(--text-dim);margin-top:0.4rem;">${esc(ev.roomLabel || '')} · ตอบแบบไม่ระบุตัวตน 100%</div>
    </div>`;
  }

  function renderStep() {
    const g = state.groups[state.step];
    const total = state.groups.length;
    const segs = state.groups.map((_, i) =>
      `<div class="seg ${i < state.step ? 'done' : (i === state.step ? 'active' : '')}"></div>`).join('');
    const questionsHtml = g.questions.map(renderQuestion).join('');
    const isLast = state.step === total - 1;
    body.innerHTML = `
      <div class="clear-card voice-card">
        ${banner()}
        <div class="voice-progress">${segs}</div>
        <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:0.5rem;">
          <span style="font-size:0.8rem;color:var(--text-dim);font-weight:700;">ส่วนที่ ${state.step + 1} / ${total}</span>
          <span style="font-size:0.8rem;color:var(--text-dim);">${g.questions.length} ข้อ</span>
        </div>
        <h2 class="voice-step-title" style="margin-top:0.6rem;"><i class="fa-solid ${g.icon}"></i> ${esc(g.title)}</h2>
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
      const minL = (q.config && q.config.minLabel) || '1 · น้อย/ไม่จริง';
      const maxL = (q.config && q.config.maxLabel) || '5 · มาก/จริง';
      control = `<div class="scale-row">${[1, 2, 3, 4, 5].map(n =>
        `<button type="button" class="scale-btn ${val === n ? 'selected' : ''}" data-action="scale" data-q="${esc(q.id)}" data-val="${n}">
          <span class="num">${n}</span>${labels ? `<span class="cap">${esc(labels[n - 1] || '')}</span>` : ''}</button>`).join('')}</div>
        <div class="scale-hint"><span>${esc(minL)}</span><span>${esc(maxL)}</span></div>`;
    } else if (q.questionType === 'single_choice' || q.questionType === 'multiple_choice' || q.questionType === 'tag_select') {
      const opts = (q.config && Array.isArray(q.config.options)) ? q.config.options : [];
      const max = q.questionType === 'single_choice' ? 1 : ((q.config && Number(q.config.maxSelections)) || 1);
      const chosen = Array.isArray(val) ? val : [];
      control = `<div class="chip-wrap">${opts.map(o =>
        `<button type="button" class="chip ${chosen.includes(o) ? 'selected' : ''}" data-action="chip" data-q="${esc(q.id)}" data-opt="${esc(o)}" data-max="${max}">${esc(o)}</button>`).join('')}</div>
        <div class="chip-limit">${max === 1 ? 'เลือกได้ 1 ข้อ' : `เลือกได้สูงสุด ${max} รายการ`}</div>`;
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
  function syncTextInputs() { body.querySelectorAll('[data-text]').forEach(el => { state.answers[el.dataset.text] = el.value; }); }
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
      } else if (q.questionType === 'single_choice' || q.questionType === 'multiple_choice' || q.questionType === 'tag_select') {
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
          <i class="fa-solid fa-house"></i> <span>กลับหน้าคะแนนของฉัน</span>
        </button>
      </div>`;
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function doSubmit() {
    if (state.submitting) return;
    syncTextInputs();
    for (let i = 0; i < state.groups.length; i++) {
      const missing = validateGroup(state.groups[i]);
      if (missing) { state.step = i; renderStep(); showToast('กรุณาตอบข้อที่มีเครื่องหมาย * ให้ครบก่อนนะครับ', 'warning'); return; }
    }
    state.submitting = true;
    try {
      const result = await apiPost({ evaluationId: state.evaluation.id, answers: buildAnswers(), completionTime: Date.now() - state.startedAt });
      if (!result || !result.ok) throw new Error((result && result.error) || 'ส่งแบบประเมินไม่สำเร็จ');
      showToast('ส่งแบบประเมินเรียบร้อย ขอบคุณครับ', 'success');
      showThanks();
    } catch (e) { showToast(e.message, 'error'); }
    finally { state.submitting = false; }
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
      else if (max === 1) arr = [opt];
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

  document.addEventListener('DOMContentLoaded', init);
})();
