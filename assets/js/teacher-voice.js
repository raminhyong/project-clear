/**
 * ═══════════════════════════════════════════════════════════════
 * PROJECT CLEAR — TEACHER CLEAR VOICE DASHBOARD
 * Voice Analytics Command Center: stats, emoji distribution, 10
 * classroom dimensions, impression cloud, self-reflection, best
 * activities, and the 4-column moderation board.
 * Depends on shared.js (showToast) and the teacher page global TEACHER_PIN.
 * ═══════════════════════════════════════════════════════════════
 */
(function () {
  const CATEGORIES = [
    { type: 'media', name: '🎬 การประเมินสื่อการเรียนรู้' },
    { type: 'activity', name: '🎯 การประเมินกิจกรรมการเรียนรู้' },
    { type: 'exit', name: '🚪 Exit Ticket ท้ายคาบ' },
    { type: 'semester', name: '📖 การประเมินรายภาคเรียน' },
  ];
  const CATEGORY_LABEL = { media: '🎬 สื่อการเรียนรู้', activity: '🎯 กิจกรรม', exit: '🚪 Exit Ticket', semester: '📖 รายภาคเรียน' };
  function allRooms() {
    const rooms = (window.CLEAR_ROOMS || []).map(r => r.room);
    return rooms.length ? rooms : ['6/1', '6/2', '6/5', '6/5 Add', '6/6', '6/7', '6/8', '6/9'];
  }
  const state = { data: null, initialized: false };
  let posterStyleInjected = false;

  function pin() {
    try { return (typeof TEACHER_PIN !== 'undefined' && TEACHER_PIN) ? TEACHER_PIN : '142536'; }
    catch (e) { return '142536'; }
  }
  function esc(v) {
    return String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function roomLabel(key) {
    const r = (window.CLEAR_ROOMS || []).find(x => x.room === key);
    if (r) return r.title || r.room;
    return key === '6/5 Add' ? 'ม.6/5 เพิ่มเติม' : 'ม.' + key;
  }
  function fmt(n, d) { return Number(n || 0).toFixed(d == null ? 2 : d); }
  function setStatus(t) { const el = document.getElementById('voiceStatus'); if (el) el.textContent = t || ''; }

  async function apiGet(paramsObj) {
    const url = new URL(CLEAR_API_BASE);
    url.searchParams.set('action', 'getVoiceTeacherSummary');
    url.searchParams.set('pin', pin());
    Object.entries(paramsObj || {}).forEach(([k, v]) => { if (v != null) url.searchParams.set(k, v); });
    const res = await fetch(url.toString(), { cache: 'no-store' });
    return res.json();
  }
  async function apiPost(payload) {
    const res = await fetch(CLEAR_API_BASE, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(Object.assign({ pin: pin() }, payload || {})),
    });
    return res.json();
  }

  function initVoiceDashboard() {
    const roomSel = document.getElementById('voiceRoomFilter');
    if (!roomSel) return;
    if (!state.initialized) {
      const rooms = (window.CLEAR_ROOMS || []).map(r => r.room);
      const list = rooms.length ? rooms : ['6/1', '6/2', '6/5', '6/5 Add', '6/6', '6/7', '6/8', '6/9'];
      roomSel.innerHTML = '<option value="all">ทุกห้องเรียน (ม.6 ภาพรวม)</option>' +
        list.map(r => `<option value="${esc(r)}">${esc(roomLabel(r))}</option>`).join('');
      state.initialized = true;
    }
    loadVoiceDashboard();
  }

  async function loadVoiceDashboard() {
    const roomSel = document.getElementById('voiceRoomFilter');
    const evalSel = document.getElementById('voiceEvalFilter');
    const room = roomSel ? roomSel.value : 'all';
    const evaluationId = evalSel ? evalSel.value : 'all';
    setStatus('กำลังโหลดข้อมูลเสียงสะท้อน...');
    try {
      const data = await apiGet({ room, evaluationId });
      if (!data || !data.ok) throw new Error((data && data.error) || 'โหลดข้อมูลไม่สำเร็จ');
      state.data = data;
      if (evalSel) {
        const current = evalSel.value;
        evalSel.innerHTML = '<option value="all">ทุกรอบ</option>' +
          data.evaluations.map(e => `<option value="${esc(e.id)}">${esc(e.title)}${e.roomLabel ? ' · ' + esc(e.roomLabel) : ''} (${e.responseCount})</option>`).join('');
        if ([...evalSel.options].some(o => o.value === current)) evalSel.value = current;
      }
      render();
      setStatus(`อัปเดตล่าสุด: ${new Date().toLocaleTimeString('th-TH')} · ${data.evaluations.length} รอบการประเมิน`);
    } catch (e) {
      setStatus('');
      document.getElementById('voiceReportArea').innerHTML =
        `<div class="clear-card" style="text-align:center;padding:2.5rem;color:var(--brand-rose);">${esc(e.message)}</div>`;
    }
  }

  /* ── Render ── */
  function render() {
    const area = document.getElementById('voiceReportArea');
    const d = state.data;
    const s = d.summary;
    if (!s.totalResponses) {
      area.innerHTML = `<div class="clear-card" style="text-align:center; padding:3rem 2rem;">
        <i class="fa-solid fa-inbox" style="font-size:2.5rem;color:var(--text-dim);margin-bottom:1rem;display:block;"></i>
        <h3 style="font-size:1.15rem;font-weight:700;margin-bottom:0.35rem;">ยังไม่มีคำตอบในช่วงที่เลือก</h3>
        <p style="color:var(--text-muted);font-size:0.9rem;">เมื่อนักเรียนส่งแบบประเมิน ผลวิเคราะห์จะแสดงที่นี่</p></div>`;
      return;
    }
    const hasDims = s.dimensions && s.dimensions.some(d => d.count > 0);
    area.innerHTML = activeSwitcher(s) + quickStats(s) + emojiAndImpressions(s) + ratingsBlock(s) + choicesBlock(s) + (hasDims ? dimensionsBlock(s) : '') + selfAndActivities(s) + voiceBoard(s);
  }

  function activeSwitcher(s) {
    const rooms = allRooms();
    const activeMap = {};
    (s.activeByRoom || []).forEach(a => { activeMap[a.room] = a; });
    const cards = rooms.map(r => {
      const cvKey = r.replace(/^6\//, '');
      const a = activeMap[cvKey] || activeMap[r];
      const active = !!a;
      return `<div class="clear-card" style="padding:0.9rem;border-left:4px solid ${active ? '#10b981' : 'var(--border-subtle)'};">
        <div style="display:flex;justify-content:space-between;align-items:center;gap:0.5rem;">
          <strong style="font-size:0.95rem;">${esc(roomLabel(r))}</strong>
          <span class="clear-badge ${active ? 'badge-emerald' : 'badge-amber'}">${active ? 'เปิดอยู่' : 'ปิดรับ'}</span>
        </div>
        <p style="font-size:0.8rem;color:var(--text-muted);margin-top:0.35rem;min-height:2.4em;">${active ? esc((CATEGORY_LABEL[a.category] || '') + ' · ' + a.title) : 'ปิดรับการประเมิน'}</p>
        ${active ? `<button class="clear-btn clear-btn-secondary" style="width:100%;font-size:0.78rem;color:var(--brand-rose);" onclick="toggleVoiceRoomStatus('${esc(r)}','closed')"><i class="fa-solid fa-stop"></i> ปิดการประเมิน</button>` : ''}
      </div>`;
    }).join('');
    return `<div class="clear-card" style="margin-bottom:1.5rem;">
      <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:0.6rem;">
        <h4 style="font-size:1rem;font-weight:800;margin:0;"><i class="fa-solid fa-toggle-on" style="color:#10b981;"></i> สถานะการเปิดประเมินรายห้อง</h4>
        <button class="clear-btn clear-btn-secondary" style="font-size:0.8rem;color:var(--brand-rose);" onclick="closeAllVoiceEvaluations()"><i class="fa-solid fa-stop"></i> ปิดทุกห้อง</button>
      </div>
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:0.75rem;margin-top:1rem;">${cards}</div>
    </div>`;
  }

  function ratingsBlock(s) {
    if (!s.ratings || !s.ratings.length) return '';
    const rows = s.ratings.map(r => {
      const pct = Math.round((r.avg / 5) * 100);
      return `<div style="margin-bottom:0.7rem;">
        <div style="display:flex;justify-content:space-between;font-size:0.82rem;margin-bottom:3px;"><span>${esc(r.question)}</span><span style="font-weight:700;color:var(--brand-purple);">${fmt(r.avg, 2)}/5</span></div>
        <div style="height:9px;border-radius:99px;background:var(--border-subtle);overflow:hidden;"><div style="height:100%;width:${pct}%;background:linear-gradient(90deg,#a78bfa,#7c3aed);border-radius:99px;"></div></div>
      </div>`;
    }).join('');
    return `<div class="clear-card" style="margin-bottom:1.5rem;"><h4 style="font-size:1rem;font-weight:800;margin-bottom:1rem;"><i class="fa-solid fa-star-half-stroke" style="color:#8b5cf6;"></i> คะแนนเฉลี่ยรายข้อ (สเกล 1–5)</h4>${rows}</div>`;
  }

  function choicesBlock(s) {
    if (!s.choices || !s.choices.length) return '';
    const blocks = s.choices.map(c => {
      const total = c.options.reduce((a, o) => a + o.count, 0) || 1;
      const rows = c.options.map(o => {
        const pct = Math.round((o.count / total) * 100);
        return `<div style="display:flex;align-items:center;gap:0.5rem;margin-bottom:0.4rem;">
          <span style="font-size:0.8rem;flex:1;">${esc(o.label)}</span>
          <span style="font-size:0.78rem;font-weight:700;color:#0ea5e9;min-width:52px;text-align:right;">${o.count} (${pct}%)</span>
        </div><div style="height:7px;border-radius:99px;background:var(--border-subtle);overflow:hidden;margin-bottom:0.5rem;"><div style="height:100%;width:${pct}%;background:#0ea5e9;"></div></div>`;
      }).join('');
      return `<div style="margin-bottom:1rem;"><div style="font-size:0.85rem;font-weight:700;margin-bottom:0.5rem;">${esc(c.question)}</div>${rows}</div>`;
    }).join('');
    return `<div class="clear-card" style="margin-bottom:1.5rem;"><h4 style="font-size:1rem;font-weight:800;margin-bottom:1rem;"><i class="fa-solid fa-list-ul" style="color:#0ea5e9;"></i> ผลการเลือกตอบ</h4>${blocks}</div>`;
  }

  function quickStats(s) {
    const emojiTotal = s.emoji.total || 0;
    const happy = emojiTotal ? (s.emoji.counts.reduce((acc, c, i) => acc + c * (i + 1), 0) / emojiTotal) : 0;
    const dimAvg = s.dimensions.length ? s.dimensions.reduce((a, d) => a + d.avg, 0) / s.dimensions.length : 0;
    const cards = [
      { v: s.totalResponses, l: 'ผู้ตอบทั้งหมด', sub: `จาก ${s.studentCount} คน (${s.responseRate}%)`, c: '#8b5cf6' },
      { v: fmt(happy, 2) + '/5', l: 'ดัชนีความสุขในห้องเรียน', sub: 'จาก Emoji Scale', c: '#10b981' },
      { v: fmt(dimAvg, 2) + '/5', l: 'คะแนนเฉลี่ย 10 มิติ', sub: 'ภาพรวมห้องเรียน', c: '#0ea5e9' },
      { v: (state.data.evaluations || []).length, l: 'รอบการประเมิน', sub: `${s.totalResponses} คำตอบ`, c: '#f59e0b' },
    ];
    return `<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:1rem;margin-bottom:1.5rem;">${cards.map(c => `
      <div class="clear-card card-metallic" style="text-align:center;">
        <div style="font-size:1.9rem;font-weight:800;color:${c.c};">${esc(c.v)}</div>
        <div style="font-size:0.85rem;font-weight:700;color:var(--text-main);margin-top:0.2rem;">${esc(c.l)}</div>
        <div style="font-size:0.74rem;color:var(--text-muted);">${esc(c.sub)}</div>
      </div>`).join('')}</div>`;
  }

  function emojiAndImpressions(s) {
    const emojis = ['😫', '😕', '😐', '🙂', '🤩'];
    const total = s.emoji.total || 1;
    const colors = ['#ef4444', '#f97316', '#facc15', '#4ade80', '#10b981'];
    const emojiHtml = s.emoji.counts.map((c, i) => {
      const pct = Math.round((c / total) * 100);
      return `<div style="display:flex;align-items:center;gap:0.6rem;margin-bottom:0.5rem;">
        <span style="font-size:1.3rem;width:26px;">${emojis[i]}</span>
        <div style="flex:1;">
          <div style="display:flex;justify-content:space-between;font-size:0.78rem;margin-bottom:2px;">
            <span>${esc(s.emoji.labels[i] || '')}</span><span style="font-weight:700;">${c} (${pct}%)</span>
          </div>
          <div style="height:9px;border-radius:99px;background:var(--border-subtle);overflow:hidden;">
            <div style="height:100%;width:${pct}%;background:${colors[i]};border-radius:99px;"></div>
          </div>
        </div>
      </div>`;
    }).join('');

    const max = s.impressions.length ? s.impressions[0].count : 1;
    const cloud = s.impressions.length
      ? s.impressions.map(t => {
        const size = 0.85 + (t.count / max) * 0.75;
        const alpha = 0.5 + (t.count / max) * 0.5;
        return `<span style="display:inline-block;margin:4px;padding:5px 12px;border-radius:999px;font-weight:700;font-size:${size.toFixed(2)}rem;background:rgba(139,92,246,${(alpha * 0.18).toFixed(2)});color:var(--brand-purple);border:1px solid rgba(139,92,246,0.3);">${esc(t.tag)} <small style="opacity:0.7;">${t.count}</small></span>`;
      }).join('')
      : '<p style="color:var(--text-dim);font-size:0.85rem;">ไม่มีข้อมูลแท็ก</p>';

    return `<div class="teacher-grid" style="margin-bottom:1.5rem;">
      <div class="clear-card"><h4 style="font-size:1rem;font-weight:800;margin-bottom:0.9rem;"><i class="fa-solid fa-face-smile" style="color:#10b981;"></i> สัดส่วนความรู้สึก (Emoji Scale)</h4>${emojiHtml}</div>
      <div class="clear-card"><h4 style="font-size:1rem;font-weight:800;margin-bottom:0.9rem;"><i class="fa-solid fa-cloud" style="color:#8b5cf6;"></i> ภาพจำครู (Teacher Impression)</h4><div>${cloud}</div></div>
    </div>`;
  }

  function dimensionsBlock(s) {
    const sorted = [...s.dimensions].sort((a, b) => b.avg - a.avg);
    const top3 = new Set(sorted.slice(0, 3).map(d => d.dimension));
    const worst = sorted[sorted.length - 1];
    const rows = s.dimensions.map(d => {
      const pct = Math.round((d.avg / 5) * 100);
      const mark = top3.has(d.dimension) ? ' <span title="จุดเด่น">⭐</span>' : (d.dimension === worst.dimension ? ' <span title="ควรหนุนเสริม">⚠️</span>' : '');
      return `<div class="dim-row" style="margin-bottom:0.7rem;">
        <div style="display:flex;justify-content:space-between;font-size:0.82rem;margin-bottom:3px;">
          <span>${esc(d.label)}${mark}</span><span style="font-weight:700;color:var(--brand-purple);">${fmt(d.avg, 2)}/5</span>
        </div>
        <div style="height:9px;border-radius:99px;background:var(--border-subtle);overflow:hidden;">
          <div style="height:100%;width:${pct}%;background:linear-gradient(90deg,#a78bfa,#7c3aed);border-radius:99px;"></div>
        </div>
      </div>`;
    }).join('');
    const topNames = sorted.slice(0, 3).map(d => d.label).join(' · ');
    return `<div class="clear-card" style="margin-bottom:1.5rem;">
      <h4 style="font-size:1rem;font-weight:800;margin-bottom:0.35rem;"><i class="fa-solid fa-chalkboard-user" style="color:#8b5cf6;"></i> ห้องเรียนของเรา 10 มิติ</h4>
      <p style="font-size:0.8rem;color:var(--text-muted);margin-bottom:1rem;">จุดเด่นสูงสุด 3 ด้าน: <strong style="color:var(--brand-purple);">${esc(topNames)}</strong>${worst ? ` · ควรหนุนเสริม: <strong style="color:var(--brand-amber);">${esc(worst.label)}</strong>` : ''}</p>
      ${rows}
    </div>`;
  }

  function listText(items) {
    if (!items || !items.length) return '<p style="color:var(--text-dim);font-size:0.82rem;">—</p>';
    return items.slice(0, 6).map(v => `<div style="font-size:0.84rem;padding:0.4rem 0;border-bottom:1px dashed var(--border-subtle);">${esc(v.text)}</div>`).join('');
  }

  function selfAndActivities(s) {
    const self = s.self;
    const activities = s.activities.length
      ? s.activities.slice(0, 8).map((a, i) => `<div style="display:flex;justify-content:space-between;font-size:0.85rem;padding:0.35rem 0;border-bottom:1px dashed var(--border-subtle);"><span>${i + 1}. ${esc(a.name)}</span><strong style="color:#0ea5e9;">${a.count}</strong></div>`).join('')
      : '<p style="color:var(--text-dim);font-size:0.82rem;">ไม่มีข้อมูล</p>';
    return `<div class="teacher-grid" style="margin-bottom:1.5rem;">
      <div class="clear-card">
        <h4 style="font-size:1rem;font-weight:800;margin-bottom:0.5rem;"><i class="fa-solid fa-user" style="color:#8b5cf6;"></i> ส่องสะท้อนตัวเอง</h4>
        <div style="display:flex;gap:1rem;margin-bottom:0.75rem;">
          <div style="flex:1;background:var(--brand-purple-light);border-radius:10px;padding:0.6rem;text-align:center;">
            <div style="font-size:1.4rem;font-weight:800;color:var(--brand-purple);">${fmt(self.selfAvg, 2)}/5</div>
            <div style="font-size:0.72rem;color:var(--text-muted);">ความพยายามเฉลี่ย</div>
          </div>
          <div style="flex:1;background:var(--brand-emerald-light);border-radius:10px;padding:0.6rem;text-align:center;">
            <div style="font-size:1.4rem;font-weight:800;color:var(--brand-emerald);">${fmt(self.selfRatingAvg, 2)}/5</div>
            <div style="font-size:0.72rem;color:var(--text-muted);">คะแนนประเมินตนเอง</div>
          </div>
        </div>
        <div style="font-size:0.78rem;font-weight:700;color:var(--brand-emerald);margin-bottom:0.2rem;">ภูมิใจในตัวเอง</div>${listText(self.proud)}
        <div style="font-size:0.78rem;font-weight:700;color:var(--brand-amber);margin:0.6rem 0 0.2rem;">อยากปรับปรุง</div>${listText(self.change)}
      </div>
      <div class="clear-card">
        <h4 style="font-size:1rem;font-weight:800;margin-bottom:0.75rem;"><i class="fa-solid fa-lightbulb" style="color:#f59e0b;"></i> กิจกรรมที่ช่วยให้เรียนรู้ดีที่สุด</h4>
        ${activities}
      </div>
    </div>`;
  }

  function voiceBoard(s) {
    const cols = [
      { key: 'keep', title: 'KEEP', icon: 'fa-circle-check', color: '#10b981', bg: 'rgba(16,185,129,0.08)' },
      { key: 'change', title: 'CHANGE', icon: 'fa-arrows-rotate', color: '#f59e0b', bg: 'rgba(245,158,11,0.08)' },
      { key: 'less', title: 'LESS', icon: 'fa-circle-minus', color: '#f43f5e', bg: 'rgba(244,63,94,0.08)' },
      { key: 'more', title: 'MORE', icon: 'fa-circle-plus', color: '#6366f1', bg: 'rgba(99,102,241,0.08)' },
    ];
    const colHtml = cols.map(c => {
      const items = s.voice[c.key] || [];
      const cards = items.length ? items.map(v => `
        <div class="vb-item" data-text="${esc(v.text)}" style="background:var(--surface-card);border:1px solid var(--border-subtle);border-left:3px solid ${c.color};border-radius:10px;padding:0.7rem 0.8rem;margin-bottom:0.6rem;position:relative;${v.isHidden ? 'opacity:0.45;' : ''}">
          <p style="font-size:0.84rem;line-height:1.55;margin:0 0 0.4rem;white-space:pre-wrap;">${esc(v.text)}</p>
          <div style="display:flex;justify-content:space-between;align-items:center;">
            <span style="font-size:0.68rem;color:${v.isHidden ? '#f43f5e' : 'var(--text-dim)'};">${v.isHidden ? '🚫 ซ่อนอยู่' : ''}</span>
            <button type="button" class="clear-btn clear-btn-secondary" style="padding:0.25rem 0.55rem;font-size:0.7rem;" onclick="toggleVoiceHidden('${v.id}', ${v.isHidden ? 'false' : 'true'})">
              <i class="fa-solid ${v.isHidden ? 'fa-eye' : 'fa-eye-slash'}"></i> ${v.isHidden ? 'คืนข้อความ' : 'ซ่อน'}
            </button>
          </div>
        </div>`).join('') : '<p style="font-size:0.8rem;color:var(--text-dim);">— ไม่มีข้อความ —</p>';
      return `<div style="background:${c.bg};border-radius:14px;padding:0.9rem;min-width:0;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:0.7rem;">
          <strong style="color:${c.color};font-size:0.9rem;"><i class="fa-solid ${c.icon}"></i> ${c.title}</strong>
          <span class="clear-badge" style="background:${c.bg};color:${c.color};font-weight:700;">${items.length}</span>
        </div>${cards}</div>`;
    }).join('');
    return `<div class="clear-card">
      <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:0.6rem;margin-bottom:1rem;">
        <h4 style="font-size:1rem;font-weight:800;margin:0;"><i class="fa-solid fa-comments" style="color:#8b5cf6;"></i> กระดานเสียงสะท้อน 4 หมวด</h4>
        <input type="text" class="clear-input" placeholder="🔍 ค้นหาข้อความ..." style="max-width:260px;padding:0.45rem 0.7rem;font-size:0.85rem;" oninput="filterVoiceBoard(this.value)">
      </div>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:0.9rem;">${colHtml}</div>
    </div>`;
  }

  function filterVoiceBoard(q) {
    const term = String(q || '').trim().toLowerCase();
    document.querySelectorAll('#voiceReportArea .vb-item').forEach(el => {
      el.style.display = (!term || (el.dataset.text || '').toLowerCase().includes(term)) ? 'block' : 'none';
    });
  }

  async function toggleVoiceHidden(answerId, isHidden) {
    try {
      const res = await apiPost({ action: 'toggleVoiceAnswerVisibility', answerId, isHidden });
      if (!res || !res.ok) throw new Error((res && res.error) || 'อัปเดตไม่สำเร็จ');
      showToast(isHidden ? 'ซ่อนข้อความแล้ว' : 'คืนข้อความแล้ว', 'success');
      await loadVoiceDashboard();
    } catch (e) { showToast(e.message, 'error'); }
  }

  /* ── Create round modal ── */
  function openVoiceRoundModal() {
    const rooms = allRooms();
    const modal = document.createElement('div');
    modal.id = 'voiceRoundModal';
    modal.className = 'clear-modal-backdrop open';
    modal.innerHTML = `
      <div class="clear-modal-content" style="max-width:560px;max-height:90vh;overflow-y:auto;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1.25rem;">
          <h3 style="margin:0;font-size:1.15rem;font-weight:800;"><i class="fa-solid fa-plus" style="color:#8b5cf6;"></i> สร้างการประเมินใหม่</h3>
          <button onclick="closeVoiceRoundModal()" style="background:none;border:none;font-size:1.3rem;cursor:pointer;color:var(--text-dim);">&times;</button>
        </div>
        <div class="clear-input-group"><label class="clear-label">ประเภทการประเมิน</label>
          <select id="vrCategory" class="clear-input">${CATEGORIES.map(c => `<option value="${c.type}">${esc(c.name)}</option>`).join('')}</select></div>
        <div class="clear-input-group"><label class="clear-label">ชื่อเรื่อง / ชื่อสื่อ / ชื่อกิจกรรม</label>
          <input type="text" id="vrTitle" class="clear-input" placeholder="เช่น วิดีโอถอดคำประพันธ์ ขุนช้างขุนแผน"></div>
        <div class="clear-input-group"><label class="clear-label">คำชี้แจงจากครู (ทางเลือก)</label>
          <textarea id="vrDesc" class="clear-input" rows="2" placeholder="เช่น ดูคลิปแล้วช่วยสะท้อนว่าสื่อนี้ช่วยให้เข้าใจบทเรียนแค่ไหน"></textarea></div>
        <div class="clear-input-group"><label class="clear-label">ห้องเรียนที่เปิดประเมิน</label>
          <div style="display:flex;gap:0.5rem;margin-bottom:0.6rem;">
            <button type="button" class="clear-btn clear-btn-secondary" style="padding:0.35rem 0.7rem;font-size:0.8rem;" onclick="voiceSelectAllRooms(true)">✅ เลือกทุกห้อง</button>
            <button type="button" class="clear-btn clear-btn-secondary" style="padding:0.35rem 0.7rem;font-size:0.8rem;" onclick="voiceSelectAllRooms(false)">❌ ล้างการเลือก</button>
          </div>
          <div id="vrRooms" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(130px,1fr));gap:0.4rem;font-size:0.9rem;">
            ${rooms.map(r => `<label style="display:flex;align-items:center;gap:0.4rem;"><input type="checkbox" class="vr-room" value="${esc(r)}" checked> ${esc(roomLabel(r))}</label>`).join('')}
          </div>
        </div>
        <div style="display:flex;justify-content:flex-end;gap:0.75rem;margin-top:1.25rem;">
          <button class="clear-btn clear-btn-secondary" onclick="closeVoiceRoundModal()">ยกเลิก</button>
          <button class="clear-btn clear-btn-primary" style="background:linear-gradient(135deg,#8b5cf6,#7c3aed);" onclick="createVoiceRound()"><i class="fa-solid fa-check"></i> บันทึกและเปิดใช้งานทันที</button>
        </div>
      </div>`;
    document.body.appendChild(modal);
  }
  function closeVoiceRoundModal() { const m = document.getElementById('voiceRoundModal'); if (m) m.remove(); }
  function voiceSelectAllRooms(on) { document.querySelectorAll('#vrRooms .vr-room').forEach(cb => { cb.checked = on; }); }

  async function createVoiceRound() {
    const templateType = document.getElementById('vrCategory').value;
    const title = document.getElementById('vrTitle').value.trim();
    const description = document.getElementById('vrDesc').value.trim();
    const targetRooms = Array.from(document.querySelectorAll('#vrRooms .vr-room:checked')).map(cb => cb.value);
    if (!title) { showToast('กรุณาระบุชื่อเรื่อง/ชื่อสื่อ', 'warning'); return; }
    if (!targetRooms.length) { showToast('กรุณาเลือกห้องเรียนอย่างน้อย 1 ห้อง', 'warning'); return; }
    try {
      const res = await apiPost({ action: 'createVoiceEvaluation', templateType, title, description, targetRooms, activateImmediately: true });
      if (!res || !res.ok) throw new Error((res && res.error) || 'สร้างการประเมินไม่สำเร็จ');
      showToast('เปิดการประเมิน ' + res.count + ' ห้องเรียนแล้ว', 'success');
      closeVoiceRoundModal();
      const evalSel = document.getElementById('voiceEvalFilter');
      if (evalSel) evalSel.value = 'all';
      await loadVoiceDashboard();
    } catch (e) { showToast(e.message, 'error'); }
  }

  async function toggleVoiceRoomStatus(room, status) {
    try {
      const res = await apiPost({ action: 'toggleVoiceEvaluationStatus', room, status });
      if (!res || !res.ok) throw new Error((res && res.error) || 'อัปเดตสถานะไม่สำเร็จ');
      showToast(status === 'closed' ? 'ปิดการประเมินแล้ว' : 'เปิดการประเมินแล้ว', 'success');
      await loadVoiceDashboard();
    } catch (e) { showToast(e.message, 'error'); }
  }
  async function closeAllVoiceEvaluations() {
    if (!window.confirm('ปิดการประเมินที่เปิดอยู่ทุกห้องใช่หรือไม่?')) return;
    try {
      const res = await apiPost({ action: 'toggleVoiceEvaluationStatus', all: true, status: 'closed' });
      if (!res || !res.ok) throw new Error((res && res.error) || 'ปิดไม่สำเร็จ');
      showToast('ปิดการประเมินทุกห้องแล้ว', 'success');
      await loadVoiceDashboard();
    } catch (e) { showToast(e.message, 'error'); }
  }

  /* ── QR poster ── */
  function injectPosterStyle() {
    if (posterStyleInjected) return;
    const st = document.createElement('style');
    st.textContent = '@media print { body * { visibility: hidden !important; } #voicePoster, #voicePoster * { visibility: visible !important; } #voicePoster { position: absolute; inset: 0 auto auto 0; width: 100%; } }';
    document.head.appendChild(st);
    posterStyleInjected = true;
  }
  function showVoicePoster() {
    const evals = (state.data && state.data.evaluations) || [];
    const evalSel = document.getElementById('voiceEvalFilter');
    const chosenId = evalSel && evalSel.value !== 'all' ? evalSel.value : null;
    const target = evals.find(e => e.id === chosenId) || evals[0];
    if (!target) { showToast('ยังไม่มีรอบการประเมินให้สร้างแผ่นป้าย', 'warning'); return; }
    const url = new URL('../voice/index.html?code=' + encodeURIComponent(target.publicCode), window.location.href).href;
    let qr = '';
    try { if (typeof qrcode === 'function') { const q = qrcode(0, 'M'); q.addData(url); q.make(); qr = q.createSvgTag({ cellSize: 6, margin: 2, scalable: true }); } } catch (e) {}
    injectPosterStyle();
    const modal = document.createElement('div');
    modal.id = 'voicePosterModal';
    modal.className = 'clear-modal-backdrop open';
    modal.innerHTML = `
      <div class="clear-modal-content" style="max-width:420px;">
        <div id="voicePoster" style="text-align:center;padding:1.5rem;background:#fff;border-radius:16px;color:#1e293b;">
          <div style="font-weight:800;font-size:1.3rem;color:#7c3aed;">CLEAR Voice</div>
          <div style="font-size:0.95rem;font-weight:700;margin:0.2rem 0 0.15rem;">${esc(target.title)}</div>
          <div style="font-size:0.85rem;color:#64748b;margin-bottom:1rem;">${esc(target.roomLabel || '')}</div>
          <div style="width:240px;height:240px;margin:0 auto;">${qr}</div>
          <div style="margin-top:0.75rem;font-weight:800;font-size:1.1rem;letter-spacing:0.1em;">${esc(target.publicCode)}</div>
          <p style="font-size:0.82rem;color:#475569;margin-top:0.5rem;">สแกน QR หรือกรอกรหัสนี้ที่หน้า CLEAR Voice<br>เพื่อส่งเสียงสะท้อนของคุณ (ไม่ระบุตัวตน)</p>
          <p style="font-size:0.72rem;color:#94a3b8;margin-top:0.75rem;">รายวิชาภาษาไทย ครูรามิล ปัญญพัทธ์</p>
        </div>
        <div style="display:flex;justify-content:flex-end;gap:0.75rem;margin-top:1rem;">
          <button class="clear-btn clear-btn-secondary" onclick="closeVoicePoster()">ปิด</button>
          <button class="clear-btn clear-btn-primary" style="background:linear-gradient(135deg,#8b5cf6,#7c3aed);" onclick="window.print()"><i class="fa-solid fa-print"></i> พิมพ์แผ่นป้าย</button>
        </div>
      </div>`;
    document.body.appendChild(modal);
  }
  function closeVoicePoster() { const m = document.getElementById('voicePosterModal'); if (m) m.remove(); }

  window.initVoiceDashboard = initVoiceDashboard;
  window.loadVoiceDashboard = loadVoiceDashboard;
  window.toggleVoiceHidden = toggleVoiceHidden;
  window.filterVoiceBoard = filterVoiceBoard;
  window.openVoiceRoundModal = openVoiceRoundModal;
  window.closeVoiceRoundModal = closeVoiceRoundModal;
  window.voiceSelectAllRooms = voiceSelectAllRooms;
  window.createVoiceRound = createVoiceRound;
  window.toggleVoiceRoomStatus = toggleVoiceRoomStatus;
  window.closeAllVoiceEvaluations = closeAllVoiceEvaluations;
  window.showVoicePoster = showVoicePoster;
  window.closeVoicePoster = closeVoicePoster;
})();
