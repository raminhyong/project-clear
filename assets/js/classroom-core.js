/**
 * ═══════════════════════════════════════════════════════════════
 * PROJECT CLEAR 2.0 — CLASSROOM CORE (PERSONAL SCORE WORKSPACE)
 * Logged-out: mounts only the room login box (no shell / zero-leak)
 * Logged-in : personal score dashboard + integrated activity modals
 * ═══════════════════════════════════════════════════════════════
 */

document.addEventListener('DOMContentLoaded', () => {
  const config = window.CLEAR_ROOM_CONFIG;
  if (!config || !config.room) {
    console.error('Missing window.CLEAR_ROOM_CONFIG');
    return;
  }

  document.title = `${config.title} | Project CLEAR`;

  // Pre-fill student code from Smart Gatekeeper (?code=xxxxx)
  const params = new URLSearchParams(window.location.search);
  const incomingCode = (params.get('code') || '').replace(/\D/g, '').slice(0, 5);
  window.__CLEAR_INCOMING_CODE = incomingCode;

  checkLoginState(config);
});

function getSessionKey(room) {
  return `clear_auth_student_${encodeURIComponent(room)}`;
}

function escapeHtml(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

async function checkLoginState(config) {
  const sessionData = sessionStorage.getItem(getSessionKey(config.room));
  if (sessionData) {
    try {
      const student = JSON.parse(sessionData);
      await loadAndRenderStudentScore(config, student.code);
      return;
    } catch (e) {
      sessionStorage.removeItem(getSessionKey(config.room));
    }
  }

  renderLoginForm(config);
}

/* ─────────────────────────────────────────────────────────────
   LOGGED-OUT STATE — only the room's login box is mounted.
   No navbar, no footer, no cross-room links, no teacher links.
   ───────────────────────────────────────────────────────────── */
function renderLoginForm(config) {
  const appContainer = document.getElementById('classroomApp');
  if (!appContainer) return;

  const incomingCode = window.__CLEAR_INCOMING_CODE || '';
  const prefillHint = incomingCode
    ? `<div style="margin-bottom: 1.25rem; padding: 0.7rem 0.9rem; border-radius: 12px; background: var(--brand-blue-light); color: var(--brand-blue); font-size: 0.85rem; font-weight: 600; text-align: left;">
         <i class="fa-solid fa-wand-magic-sparkles" style="margin-right: 0.35rem;"></i>
         ตรวจพบรหัสประจำตัว <strong>${escapeHtml(incomingCode)}</strong> แล้ว กรอกเลข 4 ตัวท้ายเพื่อปลดล็อกได้เลย
       </div>`
    : '';

  appContainer.innerHTML = `
    <div style="max-width: 440px; margin: 3rem auto 0; text-align: center;">
      <div class="clear-card" style="padding: 2.25rem 2rem;">
        <div style="width: 60px; height: 60px; border-radius: 18px; background: linear-gradient(135deg, #0284c7, #2563eb); color: white; display: grid; place-items: center; margin: 0 auto 1.25rem; font-size: 1.6rem; box-shadow: 0 8px 20px rgba(37,99,235,0.3);">
          <i class="fa-solid fa-lock"></i>
        </div>

        <h2 style="font-size: 1.45rem; font-weight: 700; margin-bottom: 0.35rem;">เข้าสู่ระบบดูคะแนน</h2>
        <p style="color: var(--text-muted); font-size: 0.95rem; margin-bottom: 1.5rem;">${escapeHtml(config.title)}</p>

        ${prefillHint}

        <form id="studentLoginForm" onsubmit="handleLoginSubmit(event)" autocomplete="off">
          <div class="clear-input-group">
            <label class="clear-label" for="studentCode">รหัสประจำตัวนักเรียน (5 หลัก)</label>
            <input type="text" id="studentCode" class="clear-input" placeholder="เช่น 24252" maxlength="5" inputmode="numeric" pattern="\\d{5}" value="${escapeHtml(incomingCode)}" required autocomplete="username" ${incomingCode ? '' : 'autofocus'}>
          </div>

          <div class="clear-input-group">
            <label class="clear-label" for="studentPass">รหัสผ่าน (รหัส 4 ตัวท้ายของรหัส 5 หลัก)</label>
            <input type="password" id="studentPass" class="clear-input" placeholder="เช่น 4252" maxlength="4" inputmode="numeric" pattern="\\d{4}" required autocomplete="current-password" ${incomingCode ? 'autofocus' : ''}>
          </div>

          <div id="loginErrorMsg" style="display: none; background: var(--brand-rose-light); color: var(--brand-rose); border: 1px solid rgba(244,63,94,0.3); padding: 0.75rem 1rem; border-radius: 10px; font-size: 0.875rem; margin-bottom: 1.25rem; text-align: left;">
            <i class="fa-solid fa-triangle-exclamation" style="margin-right: 0.4rem;"></i>
            <span id="errorText">รหัสประจำตัวหรือรหัสผ่านไม่ถูกต้อง</span>
          </div>

          <button type="submit" id="loginBtn" class="clear-btn clear-btn-primary" style="width: 100%; padding: 0.85rem; font-size: 1rem;">
            <span>เข้าสู่ระบบ</span>
            <i class="fa-solid fa-arrow-right"></i>
          </button>
        </form>

        <div style="margin-top: 1.75rem; padding-top: 1.25rem; border-top: 1px solid var(--border-subtle); font-size: 0.85rem; color: var(--text-dim); text-align: center;">
          <i class="fa-solid fa-shield-halved" style="margin-right: 0.3rem;"></i>
          ระบบตรวจสอบสิทธิ์รายบุคคล ป้องกันการดูคะแนนระหว่างกัน
        </div>
      </div>
    </div>
  `;
}

async function handleLoginSubmit(event) {
  event.preventDefault();
  const config = window.CLEAR_ROOM_CONFIG;
  const codeInput = document.getElementById('studentCode');
  const passInput = document.getElementById('studentPass');
  const errBox = document.getElementById('loginErrorMsg');
  const errText = document.getElementById('errorText');
  const btn = document.getElementById('loginBtn');

  const code = (codeInput?.value || '').trim();
  const pass = (passInput?.value || '').trim();

  errBox.style.display = 'none';

  if (code.length !== 5 || !/^\d{5}$/.test(code)) {
    errText.textContent = 'กรุณากรอกรหัสประจำตัว 5 หลักให้ถูกต้อง';
    errBox.style.display = 'block';
    return;
  }

  // Check last 4 digits
  const expectedPass = code.slice(-4);
  if (pass !== expectedPass) {
    errText.textContent = 'รหัสผ่าน 4 ตัวท้ายไม่ตรงกับรหัสประจำตัว';
    errBox.style.display = 'block';
    return;
  }

  btn.disabled = true;
  btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> กำลังตรวจสอบ...`;

  try {
    const data = await fetchClearApi('get', { room: config.room }, true);
    if (!data.ok || !Array.isArray(data.students)) {
      throw new Error(data.error || 'ไม่พบข้อมูลห้องเรียน');
    }

    const student = data.students.find(s => String(s.code).trim() === code);
    if (!student) {
      errText.textContent = 'ไม่พบรหัสประจำตัวนี้ในห้องเรียนนี้';
      errBox.style.display = 'block';
      btn.disabled = false;
      btn.innerHTML = `<span>เข้าสู่ระบบ</span> <i class="fa-solid fa-arrow-right"></i>`;
      return;
    }

    // Success login!
    sessionStorage.setItem(getSessionKey(config.room), JSON.stringify({ code: student.code, name: student.name }));
    showToast(`ยินดีต้อนรับ ${student.name}`, 'success');
    await renderStudentDashboard(config, student, data);
  } catch (err) {
    errText.textContent = `เกิดข้อผิดพลาดในการโหลดข้อมูล: ${err.message}`;
    errBox.style.display = 'block';
    btn.disabled = false;
    btn.innerHTML = `<span>เข้าสู่ระบบ</span> <i class="fa-solid fa-arrow-right"></i>`;
  }
}

async function loadAndRenderStudentScore(config, studentCode) {
  const appContainer = document.getElementById('classroomApp');
  appContainer.innerHTML = `
    <div style="text-align: center; padding: 4rem 1rem;">
      <i class="fa-solid fa-circle-notch fa-spin" style="font-size: 2.5rem; color: var(--brand-blue); margin-bottom: 1rem;"></i>
      <p style="color: var(--text-muted);">กำลังโหลดคะแนนส่วนบุคคล...</p>
    </div>
  `;

  try {
    const data = await fetchClearApi('get', { room: config.room }, true);
    if (!data.ok) throw new Error(data.error || 'โหลดข้อมูลไม่สำเร็จ');

    const student = data.students.find(s => String(s.code).trim() === studentCode);
    if (!student) {
      sessionStorage.removeItem(getSessionKey(config.room));
      renderLoginForm(config);
      return;
    }

    // Load PUM data if available
    let pumTotal = 0;
    try {
      const pumData = await fetchClearApi('getPumSummary', { room: config.room }, true);
      if (pumData.ok && pumData.rooms) {
        const rData = pumData.rooms.find(r => r.room === config.room);
        if (rData) {
          const st = rData.students.find(s => s.code === student.code);
          if (st) pumTotal = st.total || 0;
        }
      }
    } catch (e) {
      console.warn('PUM error:', e);
    }
    student.pum = pumTotal;

    await renderStudentDashboard(config, student, data);
  } catch (err) {
    appContainer.innerHTML = `
      <div class="clear-card" style="max-width: 500px; margin: 3rem auto; text-align: center;">
        <i class="fa-solid fa-triangle-exclamation" style="font-size: 2.5rem; color: var(--brand-rose); margin-bottom: 1rem;"></i>
        <h3 style="font-size: 1.25rem; font-weight: 700; margin-bottom: 0.5rem;">เกิดข้อผิดพลาด</h3>
        <p style="color: var(--text-muted); margin-bottom: 1.5rem;">${escapeHtml(err.message)}</p>
        <button onclick="checkLoginState(window.CLEAR_ROOM_CONFIG)" class="clear-btn clear-btn-secondary">ลองใหม่อีกครั้ง</button>
      </div>
    `;
  }
}

/* ─────────────────────────────────────────────────────────────
   LOGGED-IN STATE — personal dashboard + activity hub
   ───────────────────────────────────────────────────────────── */
async function renderStudentDashboard(config, student, fullData) {
  const appContainer = document.getElementById('classroomApp');

  const maxScores = [5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5];
  const defaultWorkLinks = [
    "https://padlet.com/raminhyong/inspired-by-6-1-2569-7f3xmg9g8nvrpqdv",
    "https://padlet.com/raminhyong/6-1-ps5b6csw1mtnnbww",
    "https://youtu.be/tKxtgNLDJkE"
  ];

  const tasks = (fullData.grading && fullData.grading.tasks) ? fullData.grading.tasks : maxScores.map((m, idx) => ({
    taskIndex: idx,
    title: `งานที่ ${idx + 1}`,
    maxScore: m,
    workUrl: defaultWorkLinks[idx] || ''
  }));

  const studentScores = Array.isArray(student.scores) ? student.scores : [];
  let tasksTotal = 0;
  let tasksMaxTotal = 0;

  const taskRowsHtml = tasks.map(t => {
    const score = Number(studentScores[t.taskIndex] || 0);
    tasksTotal += score;
    tasksMaxTotal += t.maxScore;
    const isFull = score >= t.maxScore && t.maxScore > 0;
    const isSubmitted = score > 0;

    const badgeClass = isFull ? 'badge-emerald' : (isSubmitted ? 'badge-blue' : 'badge-amber');
    const badgeText = isFull ? 'คะแนนเต็ม' : (isSubmitted ? 'ส่งแล้ว' : 'ยังไม่ส่ง / รอตรวจ');

    return `
      <div class="clear-card hover-lift" style="padding: 1.15rem; display: flex; flex-direction: column; justify-content: space-between;">
        <div>
          <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 0.6rem; gap: 0.5rem;">
            <h4 style="font-size: 1rem; font-weight: 700;">${escapeHtml(t.title)}</h4>
            <span class="clear-badge ${badgeClass}">${badgeText}</span>
          </div>
          <div style="display: flex; align-items: baseline; gap: 0.3rem; margin-bottom: 0.75rem;">
            <span style="font-size: 1.75rem; font-weight: 800; color: ${isSubmitted ? 'var(--brand-blue)' : 'var(--text-dim)'};">${score}</span>
            <span style="font-size: 0.95rem; color: var(--text-muted);">/ ${t.maxScore} คะแนน</span>
          </div>
        </div>
        <div style="border-top: 1px solid var(--border-subtle); padding-top: 0.75rem; display: flex; justify-content: space-between; align-items: center;">
          <span style="font-size: 0.8rem; color: var(--text-dim);">ชิ้นงานที่ ${t.taskIndex + 1}</span>
          ${t.workUrl ? `<a href="${escapeHtml(t.workUrl)}" target="_blank" rel="noopener noreferrer" style="font-size: 0.8rem; color: var(--brand-blue); font-weight: 600; display: inline-flex; align-items: center; gap: 0.25rem;">ส่งงาน / ดูโจทย์ <i class="fa-solid fa-arrow-up-right-from-square" style="font-size: 0.7rem;"></i></a>` : ''}
        </div>
      </div>
    `;
  }).join('');

  const midtermScore = student.midterm != null ? Number(student.midterm) : 0;
  const midtermBonus = Number(student.midtermBonus || 0);
  const totalAccumulated = tasksTotal + midtermScore + midtermBonus;

  const code = String(student.code);
  const activityCards = [
    { key: 'traveler', title: 'Traveler', desc: 'สะสมไอเทมกาพย์เห่เรือ', icon: 'fa-compass', grad: 'linear-gradient(135deg,#10b981,#059669)', url: '../../traveler/index.html' },
    { key: 'exam', title: 'ข้อสอบเสริมก่อนสอบ', desc: 'แบบทดสอบพร้อมเฉลยทันที', icon: 'fa-file-pen', grad: 'linear-gradient(135deg,#f59e0b,#d97706)', url: '../../exam-prep/index.html' },
    { key: 'selfpoint', title: 'Self Point', desc: 'รับแต้มและสแกน QR Code', icon: 'fa-gem', grad: 'linear-gradient(135deg,#10b981,#0ea5e9)', url: `../../self-point/index.html?code=${encodeURIComponent(code)}` },
    { key: 'ar', title: 'สื่อ AR กาพย์เห่เรือ', desc: 'สแกนการ์ด AR 3D', icon: 'fa-cube', grad: 'linear-gradient(135deg,#0284c7,#06b6d4)', url: '../../ar/index.html' },
    { key: 'space', title: 'CLEAR Space', desc: 'คลัง E-Book และผลงาน', icon: 'fa-book-open', grad: 'linear-gradient(135deg,#6366f1,#a855f7)', url: '../../space/index.html' },
    { key: 'voice', title: 'CLEAR Voice', desc: 'ประเมินครูผู้สอน', icon: 'fa-comment-dots', grad: 'linear-gradient(135deg,#8b5cf6,#7c3aed)', url: `../../voice/index.html?room=${encodeURIComponent(config.room)}` }
  ];

  const activityCardsHtml = activityCards.map(a => `
    <button type="button" class="activity-hub-card" data-url="${escapeHtml(a.url)}" data-title="${escapeHtml(a.title)}">
      <span class="activity-hub-icon" style="background:${a.grad};"><i class="fa-solid ${a.icon}"></i></span>
      <span class="activity-hub-text">
        <strong>${escapeHtml(a.title)}</strong>
        <span>${escapeHtml(a.desc)}</span>
      </span>
    </button>
  `).join('');

  appContainer.innerHTML = `
    <!-- Top Student Profile Banner -->
    <div class="clear-card" style="margin-bottom: 2rem; background: linear-gradient(135deg, rgba(37,99,235,0.08) 0%, rgba(139,92,246,0.08) 100%);">
      <div style="display: flex; flex-wrap: wrap; justify-content: space-between; align-items: center; gap: 1.25rem;">
        <div style="display: flex; align-items: center; gap: 1.25rem;">
          <div style="width: 64px; height: 64px; border-radius: 20px; background: linear-gradient(135deg, #0284c7, #2563eb); color: white; display: grid; place-items: center; font-size: 1.75rem; box-shadow: 0 6px 16px rgba(37,99,235,0.3);">
            <i class="fa-solid fa-user-graduate"></i>
          </div>
          <div>
            <div style="display: flex; align-items: center; gap: 0.6rem; flex-wrap: wrap; margin-bottom: 0.25rem;">
              <h2 style="font-size: 1.5rem; font-weight: 800;">${escapeHtml(student.name)}</h2>
              <span class="clear-badge badge-blue">เลขที่ ${escapeHtml(student.id || student.student_no || '-')}</span>
              <span class="clear-badge badge-purple">รหัส ${escapeHtml(code)}</span>
            </div>
            <p style="color: var(--text-muted); font-size: 0.95rem;">${escapeHtml(config.title)}</p>
          </div>
        </div>

        <button onclick="handleLogout('${escapeHtml(config.room)}')" class="clear-btn clear-btn-secondary" style="font-size: 0.875rem;">
          <i class="fa-solid fa-right-from-bracket"></i>
          <span>ออกจากระบบ</span>
        </button>
      </div>
    </div>

    <!-- Summary Metrics Grid -->
    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(210px, 1fr)); gap: 1.25rem; margin-bottom: 2.25rem;">
      <div class="clear-card">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem;">
          <span style="color: var(--text-muted); font-size: 0.9rem; font-weight: 600;">คะแนนงานสะสม</span>
          <i class="fa-solid fa-clipboard-check" style="color: var(--brand-blue); font-size: 1.2rem;"></i>
        </div>
        <div style="display: flex; align-items: baseline; gap: 0.4rem;">
          <span style="font-size: 2.25rem; font-weight: 800; color: var(--brand-blue);">${tasksTotal}</span>
          <span style="font-size: 1rem; color: var(--text-muted);">/ ${tasksMaxTotal}</span>
        </div>
        <div style="height: 6px; background: rgba(37,99,235,0.12); border-radius: 99px; margin-top: 0.85rem; overflow: hidden;">
          <div style="height: 100%; width: ${Math.min(100, Math.round((tasksTotal / (tasksMaxTotal || 1)) * 100))}%; background: var(--brand-blue); border-radius: 99px;"></div>
        </div>
      </div>

      <div class="clear-card">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem;">
          <span style="color: var(--text-muted); font-size: 0.9rem; font-weight: 600;">คะแนนกลางภาค</span>
          <i class="fa-solid fa-pen-nib" style="color: var(--brand-amber); font-size: 1.2rem;"></i>
        </div>
        <div style="display: flex; align-items: baseline; gap: 0.4rem;">
          <span style="font-size: 2.25rem; font-weight: 800; color: var(--brand-amber);">${student.midterm != null ? student.midterm : '-'}</span>
          <span style="font-size: 1rem; color: var(--text-muted);">/ 20</span>
          ${midtermBonus > 0 ? `<span class="clear-badge badge-emerald" style="margin-left: 0.35rem;">+${midtermBonus} โบนัส</span>` : ''}
        </div>
        <p style="font-size: 0.8rem; color: var(--text-dim); margin-top: 0.85rem;">วัดผลความรู้กลางภาคเรียน</p>
      </div>

      <div class="clear-card">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem;">
          <span style="color: var(--text-muted); font-size: 0.9rem; font-weight: 600;">แต้มปั๊มสะสม (PUM)</span>
          <i class="fa-solid fa-stamp" style="color: var(--brand-purple); font-size: 1.2rem;"></i>
        </div>
        <div style="display: flex; align-items: baseline; gap: 0.4rem;">
          <span style="font-size: 2.25rem; font-weight: 800; color: var(--brand-purple);">${student.pum || 0}</span>
          <span style="font-size: 1rem; color: var(--text-muted);">ดวง</span>
        </div>
        <p style="font-size: 0.8rem; color: var(--text-dim); margin-top: 0.85rem;">ใช้แลกไอเทมและคะแนนพิเศษ</p>
      </div>

      <div class="clear-card" style="background: linear-gradient(135deg, rgba(16,185,129,0.1) 0%, rgba(6,182,212,0.1) 100%);">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem;">
          <span style="color: var(--brand-emerald); font-size: 0.9rem; font-weight: 700;">คะแนนรวมทั้งหมด</span>
          <i class="fa-solid fa-award" style="color: var(--brand-emerald); font-size: 1.2rem;"></i>
        </div>
        <div style="display: flex; align-items: baseline; gap: 0.4rem;">
          <span style="font-size: 2.25rem; font-weight: 800; color: var(--brand-emerald);">${totalAccumulated}</span>
          <span style="font-size: 1rem; color: var(--text-muted);">คะแนน</span>
        </div>
        <p style="font-size: 0.8rem; color: var(--text-muted); margin-top: 0.85rem;">งานสะสม + กลางภาค + โบนัส</p>
      </div>
    </div>

    <!-- Activity Hub -->
    <div style="margin-bottom: 2.25rem;">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem; flex-wrap: wrap; gap: 0.5rem;">
        <h3 class="section-title" style="margin-bottom: 0;">
          <i class="fa-solid fa-shapes" style="color: var(--brand-cyan);"></i>
          <span>กิจกรรมการเรียนรู้ประจำห้อง</span>
        </h3>
        <span style="font-size: 0.85rem; color: var(--text-dim);">เปิดเป็นหน้าต่างเต็มจอ ปิดแล้วกลับมาที่คะแนนของฉันทันที</span>
      </div>

      <div class="activity-hub-grid">
        ${activityCardsHtml}
      </div>
    </div>

    <!-- Task Breakdown Section -->
    <div style="margin-bottom: 2rem;">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.25rem;">
        <h3 class="section-title" style="margin-bottom: 0;">
          <i class="fa-solid fa-list-check" style="color: var(--brand-blue);"></i>
          <span>รายละเอียดคะแนนงาน (12 ชิ้นงาน)</span>
        </h3>
        <span style="font-size: 0.9rem; color: var(--text-muted);">แสดงเฉพาะข้อมูลของคุณ</span>
      </div>

      <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 1.25rem;">
        ${taskRowsHtml}
      </div>
    </div>
  `;

  // Bind activity hub buttons to the integrated full-screen modal
  appContainer.querySelectorAll('.activity-hub-card').forEach(btn => {
    btn.addEventListener('click', () => {
      openClearActivityModal(btn.dataset.url, btn.dataset.title);
    });
  });
}

function handleLogout(room) {
  sessionStorage.removeItem(getSessionKey(room));
  showToast('ออกจากระบบเรียบร้อยแล้ว', 'info');
  renderLoginForm(window.CLEAR_ROOM_CONFIG);
}
