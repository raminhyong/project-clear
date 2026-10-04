/**
 * ═══════════════════════════════════════════════════════════════
 * PROJECT CLEAR — CLEAR AR TEACHER ADMIN
 * Card resources, room permissions, target image upload, and the
 * in-browser MindAR (.mind) compiler.
 * Depends on shared.js (CLEAR_API_BASE, showToast) and the teacher
 * page globals (TEACHER_PIN).
 * ═══════════════════════════════════════════════════════════════
 */
(function () {
  const AR_ROOMS = [
    { key: '6/1', label: '6/1' }, { key: '6/2', label: '6/2' },
    { key: '6/5', label: '6/5' }, { key: '6/5 Add', label: '6/5+' },
    { key: '6/6', label: '6/6' }, { key: '6/7', label: '6/7' },
    { key: '6/8', label: '6/8' }, { key: '6/9', label: '6/9' }
  ];
  const MINDAR_COMPILER_URL = 'https://cdn.jsdelivr.net/npm/mind-ar@1.2.5/dist/mindar-image.prod.js';

  const arState = { loaded: false, cards: [], targetsReady: false, editingId: null, pendingImage: null, compiling: false };

  function pin() {
    try { return (typeof TEACHER_PIN !== 'undefined' && TEACHER_PIN) ? TEACHER_PIN : '142536'; }
    catch (e) { return '142536'; }
  }

  function esc(v) {
    return String(v == null ? '' : v)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  async function arApi(action, data, isPost) {
    if (isPost) {
      const res = await fetch(CLEAR_API_BASE, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(Object.assign({ action, password: pin() }, data || {}))
      });
      return res.json();
    }
    const url = new URL(CLEAR_API_BASE);
    url.searchParams.set('action', action);
    url.searchParams.set('password', pin());
    Object.entries(data || {}).forEach(([k, v]) => { if (v != null) url.searchParams.set(k, v); });
    const res = await fetch(url.toString(), { cache: 'no-store' });
    return res.json();
  }

  /* ── Room permission checkboxes ── */
  function buildRoomChecks(selected) {
    const wrap = document.getElementById('arRoomChecks');
    if (!wrap) return;
    const list = Array.isArray(selected) ? selected : (selected && selected !== 'all' ? String(selected).split(',') : []);
    const set = new Set(list.map(s => String(s).trim()));
    const isAll = !list.length || selected === 'all';
    wrap.innerHTML = AR_ROOMS.map(r => `
      <label style="display:flex; align-items:center; gap:0.4rem;">
        <input type="checkbox" class="ar-room-check" value="${r.key}" ${(isAll || set.has(r.key)) ? 'checked' : ''} ${isAll ? 'disabled' : ''} onchange="onArRoomCheckChange()"> ${r.label}
      </label>`).join('');
    const all = document.getElementById('arRoomAll');
    if (all) all.checked = isAll;
  }
  function toggleArAllRooms() {
    const all = document.getElementById('arRoomAll').checked;
    document.querySelectorAll('#arRoomChecks input').forEach(i => { i.disabled = all; if (all) i.checked = true; });
  }
  function onArRoomCheckChange() {
    const boxes = Array.from(document.querySelectorAll('#arRoomChecks input'));
    document.getElementById('arRoomAll').checked = boxes.length > 0 && boxes.every(b => b.checked);
  }
  function collectRooms() {
    if (document.getElementById('arRoomAll').checked) return 'all';
    const picked = Array.from(document.querySelectorAll('#arRoomChecks input:checked')).map(i => i.value);
    return picked.length ? picked.join(',') : 'all';
  }
  function roomsLabel(rooms) {
    if (!rooms || rooms === 'all') return 'ทุกห้อง';
    return rooms.split(',').map(s => s.trim() === '6/5 Add' ? '6/5+' : s.trim()).join(', ');
  }

  /* ── Load + render ── */
  async function loadArAdmin() {
    const tbody = document.getElementById('arTableBody');
    if (!tbody) return;
    tbody.innerHTML = '<tr><td colspan="7" style="padding:2rem; color:var(--text-muted);">กำลังโหลดข้อมูล...</td></tr>';
    try {
      const data = await arApi('getAdminArCards', {}, false);
      if (!data || !data.ok) throw new Error(data && data.error ? data.error : 'โหลดข้อมูลไม่สำเร็จ');
      arState.cards = data.cards || [];
      arState.targetsReady = !!data.targetsReady;
      arState.loaded = true;
      renderArStats();
      renderArTable();
    } catch (e) {
      tbody.innerHTML = `<tr><td colspan="7" style="padding:2rem; color:var(--brand-rose);">${esc(e.message)}</td></tr>`;
    }
  }

  function renderArStats() {
    const total = arState.cards.length;
    const ready = arState.cards.filter(c => c.targetImageUrl).length;
    const totalEl = document.getElementById('arStatTotal');
    const readyEl = document.getElementById('arStatReady');
    const compileEl = document.getElementById('arStatCompile');
    if (totalEl) totalEl.textContent = total;
    if (readyEl) readyEl.textContent = ready;
    if (compileEl) {
      compileEl.textContent = arState.targetsReady ? 'พร้อม' : 'ยังไม่คอมไพล์';
      compileEl.style.fontSize = arState.targetsReady ? '1.3rem' : '1rem';
    }
    const info = document.getElementById('arTargetsInfo');
    if (info) info.textContent = arState.targetsReady ? 'ไฟล์สแกน targets.mind พร้อมใช้งานแล้ว' : 'ยังไม่มีไฟล์ targets.mind — กดคอมไพล์เพื่อสร้าง';
  }

  function renderArTable() {
    const tbody = document.getElementById('arTableBody');
    if (!tbody) return;
    if (!arState.cards.length) {
      tbody.innerHTML = '<tr><td colspan="7" style="padding:2rem; color:var(--text-muted);">ยังไม่มีสื่อ AR — กด "+ เพิ่มสื่อ AR ใหม่"</td></tr>';
      return;
    }
    tbody.innerHTML = arState.cards.map(card => {
      const thumb = card.targetImageUrl
        ? `<img src="${esc(card.targetImageUrl)}" alt="" style="width:64px; height:64px; object-fit:cover; border-radius:8px; display:block;">`
        : `<div style="width:64px; height:64px; border-radius:8px; background:var(--brand-blue-light); display:grid; place-items:center; color:var(--text-dim);"><i class="fa-solid fa-image"></i></div>`;
      const status = card.targetImageUrl
        ? '<span class="clear-badge badge-emerald">พร้อมใช้งาน</span>'
        : '<span class="clear-badge badge-amber">รออัปโหลดภาพ</span>';
      const publish = card.status === 'draft' ? ' <span class="clear-badge badge-purple">ฉบับร่าง</span>' : '';
      return `<tr>
        <td>${thumb}</td>
        <td><strong>${esc(card.code || '-')}</strong></td>
        <td style="text-align:left; padding-left:1rem; font-weight:600;">${esc(card.title)}</td>
        <td>${esc(roomsLabel(card.rooms))}</td>
        <td>${status}${publish}</td>
        <td>${Number(card.points) > 0 ? `<span class="clear-badge badge-amber">+${card.points}</span>` : '-'}</td>
        <td style="white-space:nowrap;">
          <button class="clear-btn clear-btn-secondary" style="padding:0.35rem 0.6rem; font-size:0.78rem;" onclick="openArCardModal('${card.id}')" title="แก้ไข"><i class="fa-solid fa-pen"></i></button>
          <button class="clear-btn clear-btn-secondary" style="padding:0.35rem 0.6rem; font-size:0.78rem; color:var(--brand-rose);" onclick="deleteArCard('${card.id}')" title="ลบ"><i class="fa-solid fa-trash"></i></button>
        </td>
      </tr>`;
    }).join('');
  }

  /* ── Editor modal ── */
  function openArCardModal(id) {
    arState.editingId = id || null;
    arState.pendingImage = null;
    const card = id ? arState.cards.find(c => c.id === id) : null;
    document.getElementById('arModalTitle').innerHTML = card
      ? '<i class="fa-solid fa-pen" style="color:var(--brand-emerald);"></i> แก้ไขสื่อ AR'
      : '<i class="fa-solid fa-vr-cardboard" style="color:var(--brand-emerald);"></i> เพิ่มสื่อ AR';
    document.getElementById('arCardId').value = card ? card.id : '';
    document.getElementById('arCode').value = card ? card.code : '';
    document.getElementById('arTitle').value = card ? card.title : '';
    document.getElementById('arDesc').value = card ? card.description : '';
    document.getElementById('arPrompt').value = card ? card.prompt : '';
    document.getElementById('arPoints').value = card ? card.points : 0;
    const preview = document.getElementById('arImagePreview');
    preview.innerHTML = card && card.targetImageUrl
      ? `<img src="${esc(card.targetImageUrl)}" style="width:100%; height:100%; object-fit:cover;">`
      : '<i class="fa-solid fa-image"></i>';
    document.getElementById('arImageInput').value = '';
    buildRoomChecks(card ? card.rooms : 'all');
    document.getElementById('arCardModal').classList.add('open');
  }
  function closeArCardModal() { document.getElementById('arCardModal').classList.remove('open'); }

  async function onArImageSelected() {
    const input = document.getElementById('arImageInput');
    const file = input.files && input.files[0];
    if (!file) return;
    const dataUrl = await new Promise((resolve, reject) => {
      const fr = new FileReader();
      fr.onload = () => resolve(fr.result);
      fr.onerror = reject;
      fr.readAsDataURL(file);
    });
    arState.pendingImage = { dataUrl, contentType: file.type || 'image/jpeg' };
    document.getElementById('arImagePreview').innerHTML = `<img src="${dataUrl}" style="width:100%; height:100%; object-fit:cover;">`;
  }

  async function saveArCardForm() {
    const id = document.getElementById('arCardId').value;
    const title = document.getElementById('arTitle').value.trim();
    if (!title) { showToast('กรุณาระบุชื่อสื่อ', 'warning'); return; }
    let targetImageUrl = '';
    if (id) { const found = arState.cards.find(x => x.id === id); targetImageUrl = found ? found.targetImageUrl : ''; }
    try {
      if (arState.pendingImage) {
        showToast('กำลังอัปโหลดภาพเป้าหมาย...', 'info');
        const up = await arApi('uploadArTarget', { data: arState.pendingImage.dataUrl, contentType: arState.pendingImage.contentType }, true);
        if (!up || !up.ok) throw new Error(up && up.error ? up.error : 'อัปโหลดภาพไม่สำเร็จ');
        targetImageUrl = up.url;
      }
      const body = {
        id: id || undefined,
        code: document.getElementById('arCode').value.trim(),
        title,
        description: document.getElementById('arDesc').value,
        prompt: document.getElementById('arPrompt').value,
        points: Number(document.getElementById('arPoints').value || 0),
        rooms: collectRooms(),
        targetImageUrl,
        status: 'published'
      };
      const res = await arApi('saveArCard', body, true);
      if (!res || !res.ok) throw new Error(res && res.error ? res.error : 'บันทึกไม่สำเร็จ');
      showToast('บันทึกสื่อ AR แล้ว', 'success');
      closeArCardModal();
      await loadArAdmin();
    } catch (e) {
      showToast(e.message, 'error');
    }
  }

  async function deleteArCard(id) {
    if (!window.confirm('ต้องการลบสื่อ AR นี้ใช่หรือไม่?')) return;
    try {
      const res = await arApi('deleteArCard', { id }, true);
      if (!res || !res.ok) throw new Error(res && res.error ? res.error : 'ลบไม่สำเร็จ');
      showToast('ลบสื่อ AR แล้ว', 'success');
      await loadArAdmin();
    } catch (e) {
      showToast(e.message, 'error');
    }
  }

  /* ── In-browser MindAR compiler ── */
  function loadImageCross(url) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('โหลดภาพเป้าหมายไม่สำเร็จ: ' + url));
      img.src = url;
    });
  }
  function u8ToBase64(u8) {
    let binary = '';
    const chunk = 0x8000;
    for (let i = 0; i < u8.length; i += chunk) {
      binary += String.fromCharCode.apply(null, u8.subarray(i, i + chunk));
    }
    return btoa(binary);
  }
  function setCompileProgress(text, percent) {
    const wrap = document.getElementById('arCompileProgress');
    if (!wrap) return;
    wrap.style.display = 'block';
    if (text != null) document.getElementById('arCompileText').textContent = text;
    if (percent != null) document.getElementById('arCompileBar').style.width = Math.max(0, Math.min(100, percent)) + '%';
  }

  async function compileArTargets() {
    if (arState.compiling) return;
    const cards = arState.cards
      .filter(c => c.targetImageUrl)
      .sort((a, b) => (Number(a.targetIndex) || 0) - (Number(b.targetIndex) || 0));
    if (!cards.length) { showToast('ยังไม่มีสื่อที่มีภาพเป้าหมายสำหรับคอมไพล์', 'warning'); return; }
    const btn = document.getElementById('arCompileBtn');
    arState.compiling = true;
    if (btn) btn.disabled = true;
    setCompileProgress('กำลังโหลดตัวคอมไพล์ MindAR…', 3);
    try {
      let mod;
      try { mod = await import(MINDAR_COMPILER_URL); }
      catch (e) { throw new Error('โหลดตัวคอมไพล์ MindAR ไม่สำเร็จ (ตรวจสอบอินเทอร์เน็ต)'); }
      const Compiler = mod.Compiler || (window.MINDAR && window.MINDAR.IMAGE && window.MINDAR.IMAGE.Compiler);
      if (!Compiler) throw new Error('ไม่พบตัวคอมไพล์ MindAR');
      setCompileProgress('กำลังโหลดรูปเป้าหมาย…', 8);
      const images = await Promise.all(cards.map(c => loadImageCross(c.targetImageUrl)));
      const compiler = new Compiler();
      setCompileProgress(`กำลังคอมไพล์ ${cards.length} รูป…`, 12);
      await compiler.compileImageTargets(images, (percent) => {
        setCompileProgress(`กำลังคอมไพล์ ${cards.length} รูป… ${Math.round(percent)}% (อย่าปิดหน้านี้)`, 12 + Math.round(percent * 0.78));
      });
      setCompileProgress('กำลังอัปโหลดไฟล์ targets.mind…', 94);
      const data = compiler.exportData();
      const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
      const res = await arApi('saveArTargets', { mind: u8ToBase64(bytes), order: cards.map(c => c.id) }, true);
      if (!res || !res.ok) throw new Error(res && res.error ? res.error : 'อัปโหลดไฟล์สแกนไม่สำเร็จ');
      setCompileProgress('คอมไพล์เสร็จสมบูรณ์!', 100);
      showToast('คอมไพล์ targets.mind สำเร็จ พร้อมให้นักเรียนสแกน', 'success');
      await loadArAdmin();
      setTimeout(() => { const p = document.getElementById('arCompileProgress'); if (p) p.style.display = 'none'; }, 1500);
    } catch (e) {
      setCompileProgress(e.message);
      showToast(e.message, 'error');
      const bar = document.getElementById('arCompileBar');
      if (bar) bar.style.width = '0%';
    } finally {
      arState.compiling = false;
      if (btn) btn.disabled = false;
    }
  }

  document.addEventListener('DOMContentLoaded', () => {
    const input = document.getElementById('arImageInput');
    if (input) input.addEventListener('change', onArImageSelected);
    buildRoomChecks('all');
  });

  /* Expose for inline handlers */
  window.loadArAdmin = loadArAdmin;
  window.openArCardModal = openArCardModal;
  window.closeArCardModal = closeArCardModal;
  window.saveArCardForm = saveArCardForm;
  window.deleteArCard = deleteArCard;
  window.compileArTargets = compileArTargets;
  window.toggleArAllRooms = toggleArAllRooms;
  window.onArRoomCheckChange = onArRoomCheckChange;
})();
