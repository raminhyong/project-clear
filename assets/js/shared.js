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
function initTheme() {
  const saved = localStorage.getItem('clear_theme');
  if (saved === 'dark' || (!saved && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
    document.body.classList.add('dark-mode');
  }

  const toggleBtn = document.getElementById('themeToggleBtn');
  if (toggleBtn) {
    toggleBtn.addEventListener('click', () => {
      document.body.classList.toggle('dark-mode');
      const isDark = document.body.classList.contains('dark-mode');
      localStorage.setItem('clear_theme', isDark ? 'dark' : 'light');
      updateThemeIcon();
    });
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

// ── Integrated Activity Modal (full-screen overlay / single workspace) ──
function openClearActivityModal(url, title = 'กิจกรรมการเรียนรู้') {
  let overlay = document.getElementById('clearActivityOverlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'clearActivityOverlay';
    overlay.className = 'clear-activity-overlay';
    overlay.innerHTML = `
      <div class="clear-activity-bar">
        <div class="clear-activity-bar-title">
          <i class="fa-solid fa-graduation-cap"></i>
          <span id="clearActivityTitle"></span>
        </div>
        <button type="button" class="clear-btn clear-activity-close" onclick="closeClearActivityModal()">
          <i class="fa-solid fa-xmark"></i>
          <span>ปิดหน้าต่าง / กลับสู่คะแนนของฉัน</span>
        </button>
      </div>
      <div class="clear-activity-frame">
        <iframe id="clearActivityFrame" title="กิจกรรมการเรียนรู้" allow="camera; microphone; fullscreen; clipboard-write" allowfullscreen></iframe>
      </div>
    `;
    document.body.appendChild(overlay);
  }

  const titleEl = document.getElementById('clearActivityTitle');
  const frame = document.getElementById('clearActivityFrame');
  if (titleEl) titleEl.textContent = title;
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
