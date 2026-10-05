/**
 * ═══════════════════════════════════════════════════════════════
 * PROJECT CLEAR — TEACHER CLEAR QUIZ CONTROL
 * Toggle the 15 post-lesson quizzes on/off from Teacher Command Center.
 * Depends on shared.js (showToast) and the teacher page global TEACHER_PIN.
 * ═══════════════════════════════════════════════════════════════
 */
(function () {
  function pin() {
    try { return (typeof TEACHER_PIN !== 'undefined' && TEACHER_PIN) ? TEACHER_PIN : '142536'; }
    catch (e) { return '142536'; }
  }
  function esc(v) {
    return String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  async function apiGet(action, params) {
    const url = new URL(CLEAR_API_BASE);
    url.searchParams.set('action', action);
    Object.entries(params || {}).forEach(([k, v]) => { if (v != null) url.searchParams.set(k, v); });
    const res = await fetch(url.toString(), { cache: 'no-store' });
    return res.json();
  }
  async function apiPost(action, body) {
    const res = await fetch(CLEAR_API_BASE, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(Object.assign({ action, pin: pin() }, body || {})) });
    return res.json();
  }

  async function loadQuizAdmin() {
    const grid = document.getElementById('quizLessonGrid');
    if (!grid) return;
    grid.innerHTML = '<div class="clear-card" style="text-align:center;padding:2rem;grid-column:1/-1;"><i class="fa-solid fa-circle-notch fa-spin" style="font-size:1.5rem;color:#f59e0b;"></i></div>';
    try {
      const data = await apiGet('getQuizLessons', {});
      if (!data || !data.ok) throw new Error((data && data.error) || 'โหลดไม่สำเร็จ');
      renderQuizGrid(data.lessons || []);
    } catch (e) {
      grid.innerHTML = `<div class="clear-card" style="text-align:center;padding:2rem;color:var(--brand-rose);grid-column:1/-1;">${esc(e.message)}</div>`;
    }
  }

  function renderQuizGrid(lessons) {
    const grid = document.getElementById('quizLessonGrid');
    if (!lessons.length) { grid.innerHTML = '<p style="color:var(--text-muted);">ยังไม่มีคาบเรียน</p>'; return; }
    grid.innerHTML = lessons.map(l => {
      const active = !!l.isActive;
      return `<div class="clear-card" style="display:flex;justify-content:space-between;align-items:center;gap:0.75rem;padding:0.85rem 1rem;border-left:4px solid ${active ? '#10b981' : 'var(--border-subtle)'};">
        <div style="min-width:0;">
          <strong style="font-size:0.9rem;">คาบที่ ${l.lessonNo}</strong>
          <p style="font-size:0.76rem;color:var(--text-muted);margin-top:0.2rem;line-height:1.4;">${esc(l.title)}</p>
          <span style="font-size:0.72rem;font-weight:700;color:${active ? 'var(--brand-emerald)' : 'var(--text-dim)'};">${active ? '🔓 เปิดให้ทำ' : '🔒 ปิดอยู่'}</span>
        </div>
        <button type="button" class="clear-btn ${active ? 'clear-btn-secondary' : 'clear-btn-primary'}" style="padding:0.4rem 0.85rem;font-size:0.78rem;white-space:nowrap;${active ? 'color:var(--brand-rose);' : 'background:linear-gradient(135deg,#10b981,#059669);'}" onclick="toggleQuizLesson(${l.lessonNo}, ${active ? 'false' : 'true'})">
          <i class="fa-solid ${active ? 'fa-lock' : 'fa-lock-open'}"></i> ${active ? 'ปิด' : 'เปิด'}
        </button>
      </div>`;
    }).join('');
  }

  async function toggleQuizLesson(lessonNo, active) {
    try {
      const res = await apiPost('toggleQuizLesson', { lessonNo, status: active ? 1 : 0 });
      if (!res || !res.ok) throw new Error((res && res.error) || 'อัปเดตไม่สำเร็จ');
      showToast(`คาบที่ ${lessonNo} ${active ? 'เปิด' : 'ปิด'}ให้ทำแล้ว`, 'success');
      await loadQuizAdmin();
    } catch (e) { showToast(e.message, 'error'); }
  }

  async function toggleAllQuiz(active) {
    if (!window.confirm(`${active ? 'เปิด' : 'ปิด'} CLEAR Quiz ทุก 15 คาบ ใช่หรือไม่?`)) return;
    try {
      const res = await apiPost('toggleQuizLesson', { all: true, status: active ? 1 : 0 });
      if (!res || !res.ok) throw new Error((res && res.error) || 'อัปเดตไม่สำเร็จ');
      showToast(`${active ? 'เปิด' : 'ปิด'}ทุกคาบแล้ว`, 'success');
      await loadQuizAdmin();
    } catch (e) { showToast(e.message, 'error'); }
  }

  window.loadQuizAdmin = loadQuizAdmin;
  window.toggleQuizLesson = toggleQuizLesson;
  window.toggleAllQuiz = toggleAllQuiz;
})();
