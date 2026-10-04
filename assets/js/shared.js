/**
 * ═══════════════════════════════════════════════════════════════
 * PROJECT CLEAR — SHARED UTILITIES & API CLIENT
 * ═══════════════════════════════════════════════════════════════
 */

const CLEAR_API_BASE = 'https://project-clear-api.raminhyong.workers.dev/';

// ── Toast Notification ──
function showToast(message, type = 'info', title = '') {
  let container = document.getElementById('clearToastContainer');
  if (!container) {
    container = document.createElement('div');
    container.id = 'clearToastContainer';
    container.className = 'clear-toast-container';
    document.body.appendChild(container);
  }

  const toast = document.createElement('div');
  toast.className = `clear-toast ${type}`;

  const iconMap = {
    success: 'fa-circle-check',
    error: 'fa-circle-xmark',
    warning: 'fa-triangle-exclamation',
    info: 'fa-circle-info'
  };
  const icon = iconMap[type] || 'fa-bell';

  toast.innerHTML = `
    <i class="fa-solid ${icon}" style="font-size: 1.25rem;"></i>
    <div style="flex: 1;">
      ${title ? `<strong style="display:block; font-size: 0.95rem; margin-bottom: 2px;">${title}</strong>` : ''}
      <span>${message}</span>
    </div>
  `;

  container.appendChild(toast);

  setTimeout(() => {
    toast.style.transition = 'all 0.3s ease';
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(-10px)';
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}

// ── Theme Manager ──
function toggleTheme() {
  document.body.classList.toggle('dark-mode');
  const isDark = document.body.classList.contains('dark-mode');
  try { localStorage.setItem('clear_theme', isDark ? 'dark' : 'light'); } catch (e) {}
  updateThemeIcon();
}

function initTheme() {
  const saved = localStorage.getItem('clear_theme');
  if (saved === 'dark' || (!saved && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
    document.body.classList.add('dark-mode');
  }

  const toggleBtn = document.getElementById('themeToggleBtn');
  if (toggleBtn) {
    // Avoid double-toggling when a page already wires onclick="toggleTheme()".
    if (!toggleBtn.hasAttribute('onclick')) {
      toggleBtn.addEventListener('click', toggleTheme);
    }
    updateThemeIcon();
  }
}

function updateThemeIcon() {
  const icon = document.getElementById('themeIcon');
  if (!icon) return;
  const isDark = document.body.classList.contains('dark-mode');
  icon.className = isDark ? 'fa-solid fa-sun' : 'fa-solid fa-moon';
}

// ── API Fetcher with Cache ──
async function fetchClearApi(action, params = {}, useCache = true) {
  const url = new URL(CLEAR_API_BASE);
  url.searchParams.set('action', action);
  url.searchParams.set('t', Date.now().toString());

  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null) {
      url.searchParams.set(k, v);
    }
  });

  const cacheKey = `clear_cache_${action}_${JSON.stringify(params)}`;

  if (useCache) {
    try {
      const cached = JSON.parse(localStorage.getItem(cacheKey) || 'null');
      if (cached && Date.now() - cached.time < 5 * 60 * 1000) {
        return cached.data;
      }
    } catch (e) {}
  }

  const res = await fetch(url.toString());
  if (!res.ok) {
    throw new Error(`API error: ${res.status}`);
  }
  const data = await res.json();

  if (data.ok && useCache) {
    try {
      localStorage.setItem(cacheKey, JSON.stringify({ data, time: Date.now() }));
    } catch (e) {}
  }

  return data;
}

// ── Clipboard Helper (works on local http server too) ──
function copyTextToClipboard(text) {
  if (navigator.clipboard && window.isSecureContext) {
    return navigator.clipboard.writeText(text);
  }
  return new Promise((resolve, reject) => {
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.top = '-9999px';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.focus();
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      resolve();
    } catch (err) {
      reject(err);
    }
  });
}

// ── Integrated Activity Modal (full-screen, frameless single workspace) ──
// NOTE: The old dark top bar with the red "ปิดหน้าต่าง" button was removed by
// design. Closing is handled by each sub-app's own navbar "หน้าหลัก" button
// (returnToScores -> CLOSE_WORKSPACE_MODAL), by Esc, or by the parent page.
function openClearActivityModal(url, title = 'กิจกรรมการเรียนรู้') {
  let overlay = document.getElementById('clearActivityOverlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'clearActivityOverlay';
    overlay.className = 'clear-activity-overlay';
    overlay.innerHTML = `
      <div class="clear-activity-frame">
        <iframe id="clearActivityFrame" title="กิจกรรมการเรียนรู้" allow="camera; microphone; fullscreen; clipboard-write" allowfullscreen></iframe>
      </div>
    `;
    document.body.appendChild(overlay);
  }

  const frame = document.getElementById('clearActivityFrame');
  if (frame) frame.src = url;

  document.body.classList.add('clear-modal-open');
  requestAnimationFrame(() => overlay.classList.add('open'));
}

function closeClearActivityModal() {
  const overlay = document.getElementById('clearActivityOverlay');
  if (!overlay) return;
  overlay.classList.remove('open');
  document.body.classList.remove('clear-modal-open');
  const frame = document.getElementById('clearActivityFrame');
  if (frame) {
    setTimeout(() => { frame.src = 'about:blank'; }, 250);
  }
}

// ── Standard sub-app navigation (used by every sub-app navbar "หน้าหลัก") ──
const CLEAR_ROOM_SLUGS = {
  '6/1': '61-k9f2', '6/2': '62-m4x7', '6/5': '65-w1c8', '6/5 Add': '65a-j4d9',
  '6/6': '66-k8n3', '6/7': '67-s5e6', '6/8': '68-p7y2', '6/9': '69-h3m5'
};

function clearResolveRoomSlug(value) {
  if (!value) return '';
  const v = String(value).trim();
  const slugs = Object.values(CLEAR_ROOM_SLUGS);
  if (slugs.indexOf(v) !== -1) return v;
  return CLEAR_ROOM_SLUGS[v] || '';
}

function returnToScores() {
  // 1) Opened inside the classroom workspace modal -> ask the parent to close it.
  if (window.parent && window.parent !== window) {
    try { window.parent.postMessage({ type: 'CLOSE_WORKSPACE_MODAL' }, '*'); } catch (e) {}
    return;
  }
  // 2) Standalone: return to this student's own room score page (never the login page).
  let raw = null;
  try { raw = localStorage.getItem('clear_current_room'); } catch (e) {}
  if (!raw) {
    try { raw = new URLSearchParams(window.location.search).get('room'); } catch (e) {}
  }
  const slug = clearResolveRoomSlug(raw);
  if (slug) { window.location.href = '../rooms/' + slug + '/'; return; }

  // 3) Recover the room from the student code when available.
  try {
    const code = new URLSearchParams(window.location.search).get('code');
    if (code && typeof window.findRoomByStudentCode === 'function') {
      const rec = window.findRoomByStudentCode(code);
      if (rec && rec.slug) { window.location.href = '../rooms/' + rec.slug + '/'; return; }
    }
  } catch (e) {}

  if (typeof showToast === 'function') showToast('กรุณาเปิดใช้งานจากหน้าห้องเรียนของคุณ', 'warning');
}

// ── Init on load ──
document.addEventListener('DOMContentLoaded', () => {
  initTheme();

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeClearActivityModal();
  });

  // Embedded workspace pages (e.g. CLEAR Space) can ask to be closed.
  window.addEventListener('message', (e) => {
    if (e && e.data && e.data.type === 'CLOSE_WORKSPACE_MODAL') {
      closeClearActivityModal();
    }
  });
});
