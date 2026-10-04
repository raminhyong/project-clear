/**
 * ═══════════════════════════════════════════════════════════════
 * PROJECT CLEAR — TEACHER COUPON TOOL
 * Generates real task/PUM codes from the API and renders a printable
 * A4 sheet (10 x 16 = 160) with real QR codes (qrcode-generator).
 * Depends on shared.js (fetchClearApi, showToast) and the teacher
 * page global TEACHER_PIN.
 * ═══════════════════════════════════════════════════════════════
 */
(function () {
  const PUM_CATEGORIES = {
    attribute: {
      A1: 'รักชาติ ศาสน์ กษัตริย์', A2: 'ซื่อสัตย์สุจริต', A3: 'มีวินัย', A4: 'ใฝ่เรียนรู้',
      A5: 'อยู่อย่างพอเพียง', A6: 'มุ่งมั่นในการทำงาน', A7: 'รักความเป็นไทย', A8: 'มีจิตสาธารณะ'
    },
    competency: {
      C1: 'ความสามารถในการสื่อสาร', C2: 'ความสามารถในการคิด', C3: 'ความสามารถในการแก้ปัญหา',
      C4: 'ความสามารถในการใช้ทักษะชีวิต', C5: 'ความสามารถในการใช้เทคโนโลยี'
    }
  };
  const PER_SHEET = 160;
  let couponTasks = [];
  let couponInitialized = false;

  function pin() {
    try { return (typeof TEACHER_PIN !== 'undefined' && TEACHER_PIN) ? TEACHER_PIN : '142536'; }
    catch (e) { return '142536'; }
  }
  function esc(v) {
    return String(v == null ? '' : v)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function setStatus(text) {
    const el = document.getElementById('couponStatus');
    if (el) el.textContent = text || '';
  }

  /* ── Setup ── */
  function initCouponTools() {
    const roomSel = document.getElementById('couponRoom');
    if (!roomSel) return;
    if (!couponInitialized) {
      const rooms = (window.CLEAR_ROOMS || []).map(r => r.room);
      const list = rooms.length ? rooms : ['6/1', '6/2', '6/5', '6/5 Add', '6/6', '6/7', '6/8', '6/9'];
      roomSel.innerHTML = list.map(r => `<option value="${esc(r)}">${esc(r === '6/5 Add' ? '6/5+' : r)}</option>`).join('');
      onPumKindChange();
      couponInitialized = true;
    }
    onCouponKindChange();
    onCouponRoomChange();
  }

  function onCouponKindChange() {
    const kind = document.getElementById('couponKind').value;
    const taskFields = document.getElementById('couponTaskFields');
    const pumFields = document.getElementById('couponPumFields');
    if (taskFields) taskFields.style.display = kind === 'coupon' ? 'flex' : 'none';
    if (pumFields) pumFields.style.display = kind === 'pum' ? 'flex' : 'none';
  }

  async function onCouponRoomChange() {
    const room = document.getElementById('couponRoom').value;
    const taskSel = document.getElementById('couponTask');
    if (!taskSel) return;
    taskSel.innerHTML = '<option value="0">กำลังโหลด...</option>';
    try {
      const data = await fetchClearApi('get', { room }, false);
      const tasks = (data && data.grading && data.grading.tasks) ? data.grading.tasks : [];
      if (tasks.length) {
        couponTasks = tasks;
        taskSel.innerHTML = tasks.map(t => `<option value="${Number(t.taskIndex)}">${esc(t.title)} (เต็ม ${Number(t.maxScore)})</option>`).join('');
        onCouponTaskChange();
        return;
      }
    } catch (e) { /* fall through to default */ }
    couponTasks = Array.from({ length: 12 }, (_, i) => ({ taskIndex: i, title: 'งานที่ ' + (i + 1), maxScore: 5 }));
    taskSel.innerHTML = couponTasks.map(t => `<option value="${t.taskIndex}">${esc(t.title)} (เต็ม ${t.maxScore})</option>`).join('');
    onCouponTaskChange();
  }

  function onCouponTaskChange() {
    const taskIndex = Number(document.getElementById('couponTask').value);
    const task = couponTasks.find(t => Number(t.taskIndex) === taskIndex);
    const scoreInput = document.getElementById('couponScore');
    if (!task || !scoreInput) return;
    const max = Number(task.maxScore) || 5;
    scoreInput.max = String(max);
    const current = Number(scoreInput.value) || 5;
    scoreInput.value = String(Math.max(1, Math.min(max, current)));
  }

  function onPumKindChange() {
    const kind = document.getElementById('pumKind').value;
    const generalWrap = document.getElementById('pumGeneralWrap');
    const categoryWrap = document.getElementById('pumCategoryWrap');
    const categorySel = document.getElementById('pumCategory');
    if (kind === 'general') {
      if (generalWrap) generalWrap.style.display = 'block';
      if (categoryWrap) categoryWrap.style.display = 'none';
    } else {
      if (generalWrap) generalWrap.style.display = 'none';
      if (categoryWrap) categoryWrap.style.display = 'block';
      const cats = PUM_CATEGORIES[kind] || {};
      categorySel.innerHTML = Object.entries(cats).map(([code, label]) => `<option value="${code}">${code} · ${esc(label)}</option>`).join('');
    }
  }

  /* ── QR + sheet rendering ── */
  function qrSvg(text) {
    try {
      if (typeof qrcode !== 'function') return '';
      const qr = qrcode(0, 'M');
      qr.addData(text);
      qr.make();
      return qr.createSvgTag({ cellSize: 2, margin: 0, scalable: true });
    } catch (e) { return ''; }
  }
  function cellHtml(code, meta) {
    const isPum = meta.kind === 'pum';
    return `<div class="coupon-cell ${isPum ? 'pum' : 'coupon'}">
      <div class="coupon-qr">${qrSvg(code)}</div>
      <div class="coupon-code">${esc(code)}</div>
      <div class="coupon-label">${esc(meta.label)}</div>
    </div>`;
  }
  function renderCouponSheets(codes, meta, sheets) {
    const area = document.getElementById('couponPrintArea');
    let html = '';
    const total = Math.min(sheets, Math.ceil(codes.length / PER_SHEET));
    for (let s = 0; s < total; s++) {
      const slice = codes.slice(s * PER_SHEET, (s + 1) * PER_SHEET);
      if (!slice.length) break;
      html += `<div class="coupon-sheet">${slice.map(c => cellHtml(c, meta)).join('')}</div>`;
    }
    area.innerHTML = html;
  }

  /* ── Generate real codes ── */
  async function generateRealCoupons() {
    const kind = document.getElementById('couponKind').value;
    const sheets = Math.max(1, Math.min(5, parseInt(document.getElementById('couponSheets').value, 10) || 1));
    const btn = document.getElementById('couponGenBtn');
    const printBtn = document.getElementById('couponPrintBtn');
    const codes = [];
    let meta = null;
    btn.disabled = true;
    printBtn.disabled = true;
    try {
      for (let s = 0; s < sheets; s++) {
        setStatus(`กำลังสร้างรหัสจริง แผ่นที่ ${s + 1}/${sheets}...`);
        let res;
        if (kind === 'coupon') {
          const room = document.getElementById('couponRoom').value;
          const taskIndex = Number(document.getElementById('couponTask').value);
          const score = Number(document.getElementById('couponScore').value);
          res = await fetchClearApi('generateCoupons', { room, taskIndex, score, quantity: PER_SHEET, password: pin() }, false);
          if (!res || !res.ok) throw new Error((res && res.error) || 'สร้างคูปองไม่สำเร็จ');
          meta = { kind: 'coupon', label: `งาน ${Number(res.taskIndex) + 1} · ${Number(res.score)} คะแนน` };
        } else {
          const pumType = document.getElementById('pumKind').value;
          const params = { pumType, quantity: PER_SHEET, password: pin() };
          if (pumType === 'general') params.value = Number(document.getElementById('pumValue').value);
          else params.categoryCode = document.getElementById('pumCategory').value;
          res = await fetchClearApi('generatePum', params, false);
          if (!res || !res.ok) throw new Error((res && res.error) || 'สร้างรหัสปั๊มไม่สำเร็จ');
          meta = { kind: 'pum', label: res.pumType === 'general' ? `PUM ${Number(res.value)} แต้ม` : `${res.categoryCode} · 1 PUM` };
        }
        (res.codes || []).forEach(c => codes.push(c));
      }
      if (!codes.length) throw new Error('ไม่ได้รับรหัสจากเซิร์ฟเวอร์');
      renderCouponSheets(codes, meta, sheets);
      setStatus(`✅ สร้างรหัสจริงสำเร็จ ${codes.length} ดวง (${Math.ceil(codes.length / PER_SHEET)} แผ่น) — กด "พิมพ์คูปอง" ได้เลย`);
      printBtn.disabled = false;
      showToast(`สร้างรหัสจริงสำเร็จ ${codes.length} ดวง`, 'success');
    } catch (e) {
      setStatus('❌ ' + e.message);
      showToast(e.message, 'error');
    } finally {
      btn.disabled = false;
    }
  }

  window.initCouponTools = initCouponTools;
  window.onCouponKindChange = onCouponKindChange;
  window.onCouponRoomChange = onCouponRoomChange;
  window.onCouponTaskChange = onCouponTaskChange;
  window.onPumKindChange = onPumKindChange;
  window.generateRealCoupons = generateRealCoupons;
})();
