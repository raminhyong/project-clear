/* =========================================================
   CLEAR Space — Logic layer
   Room isolation, Spaces Hub (photo/link + e-book), card sizing,
   reactions, comments, reader, classroom-safe navigation.
   Depends on: student-map.js (CLEAR_ROOMS), shared.js, space-data.js
   ========================================================= */

/* ── Room resolution & isolation (Zero-Leak) ── */
function resolveRoom(raw) {
  if (!raw) return null;
  const v = String(raw).trim();
  const rooms = window.CLEAR_ROOMS || [];
  return rooms.find(r => r.slug === v || r.room === v || r.slug.toLowerCase() === v.toLowerCase()) || null;
}

function detectRoom() {
  // 1) Authoritative: the room of the currently logged-in student session.
  //    A spoofed ?room= can never override this (Zero-Leak).
  try {
    for (let i = 0; i < sessionStorage.length; i++) {
      const k = sessionStorage.key(i);
      const m = k && k.match(/^clear_auth_student_(.+)$/);
      if (m) {
        const r = resolveRoom(m[1]);
        if (r) return r;
      }
    }
  } catch (e) {}

  // 2) Room remembered from the classroom login.
  const fromLs = resolveRoom(localStorage.getItem('clear_current_room'));
  if (fromLs) return fromLs;

  // 3) Explicit ?room= (used when opening from the classroom / a direct link).
  const params = new URLSearchParams(window.location.search);
  const fromUrl = resolveRoom(params.get('room'));
  if (fromUrl) return fromUrl;

  // 4) Optional direct localStorage auth blob.
  try {
    const blob = JSON.parse(localStorage.getItem('clear_auth_student') || 'null');
    if (blob) {
      const r = resolveRoom(blob.room || blob.slug || blob.roomSlug);
      if (r) return r;
    }
  } catch (e) {}

  return null;
}

function getCurrentStudent() {
  if (!state.room) return { name: 'นักเรียน', code: '' };
  try {
    const s = JSON.parse(sessionStorage.getItem('clear_auth_student_' + state.room.room) || 'null');
    if (s) return { name: s.name || 'นักเรียน', code: String(s.code || '') };
  } catch (e) {}
  return { name: 'นักเรียน', code: '' };
}

/* ── Local persistence ── */
const LS = {
  posts: (slug, boardId) => 'clear_space_posts_v1_' + slug + '_' + boardId,
  comments: 'clear_space_comments_v1',
  reactions: 'clear_space_reactions_v1'
};
function readJson(key, fallback) {
  try { const v = JSON.parse(localStorage.getItem(key) || 'null'); return v == null ? fallback : v; }
  catch (e) { return fallback; }
}
function writeJson(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) {} }

function getReactions(postId) {
  const map = readJson(LS.reactions, {});
  return map[postId] || { counts: {}, mine: null };
}
function toggleReaction(postId, kind) {
  const map = readJson(LS.reactions, {});
  const cur = map[postId] || { counts: {}, mine: null };
  if (cur.mine === kind) {
    cur.counts[kind] = Math.max(0, (cur.counts[kind] || 1) - 1);
    cur.mine = null;
  } else {
    if (cur.mine) cur.counts[cur.mine] = Math.max(0, (cur.counts[cur.mine] || 1) - 1);
    cur.counts[kind] = (cur.counts[kind] || 0) + 1;
    cur.mine = kind;
  }
  map[postId] = cur;
  writeJson(LS.reactions, map);
  return cur;
}

function getComments(postId) {
  const map = readJson(LS.comments, {});
  if (map[postId]) return map[postId];
  return (SEED_COMMENTS[postId] || []).slice();
}
function saveComments(postId, list) {
  const map = readJson(LS.comments, {});
  map[postId] = list;
  writeJson(LS.comments, map);
}
function addComment(postId, data) {
  const list = getComments(postId);
  list.push({
    id: 'c' + Date.now(),
    author_name: data.name || 'นักเรียน',
    author_code: data.code || '',
    is_teacher: false,
    content: data.content || '',
    image: data.image || null,
    created_at: new Date().toISOString()
  });
  saveComments(postId, list);
  return list;
}
function deleteComment(postId, commentId, code) {
  const list = getComments(postId).filter(c => !(c.id === commentId && c.author_code && c.author_code === code));
  saveComments(postId, list);
  return list;
}

/* ── Boards, reactions, state ── */
function getBoards() {
  return [
    {
      id: 'photo-wall', type: 'blog',
      title: 'บอร์ดรูปภาพและลิงก์',
      desc: 'กระดานรวมโปสเตอร์ ผลงานภาพ และลิงก์สรุปวรรณคดีของห้อง',
      badge: 'รูปภาพ / ลิงก์', icon: 'fa-images',
      grad: 'linear-gradient(135deg, #0ea5e9, #2563eb)'
    },
    {
      id: 'ebook-library', type: 'book',
      title: 'คลังอีบุ๊ก 3D',
      desc: 'คลังหนังสือการ์ตูนช่องวรรณคดี 3D เปิดอ่านแบบพลิกหน้า',
      badge: 'E-Book 3D', icon: 'fa-book-open',
      grad: 'linear-gradient(135deg, #10b981, #047857)'
    }
  ];
}

const REACTIONS = [
  { kind: 'like', emoji: '👍', label: 'ถูกใจ' },
  { kind: 'love', emoji: '❤️', label: 'รักเลย' },
  { kind: 'laugh', emoji: '😂', label: 'ฮามาก' },
  { kind: 'wow', emoji: '😮', label: 'ว้าว' },
  { kind: 'sad', emoji: '😢', label: 'ซึ้ง' }
];

const state = {
  room: null,
  student: { name: 'นักเรียน', code: '' },
  view: 'hub',
  board: null,
  cardSize: 'normal',
  posts: [],
  activePost: null,
  openComments: {},
  workType: 'image'
};

const root = document.getElementById('spaceRoot');

/* ── Views ── */
function renderGuard() {
  root.innerHTML = `
    <div class="clear-card guard-card">
      <div class="guard-icon"><i class="fa-solid fa-lock"></i></div>
      <h2 style="font-size: 1.35rem; font-weight: 800; margin-bottom: 0.5rem;">ไม่พบข้อมูลห้องเรียนของคุณ</h2>
      <p style="color: var(--text-muted); font-size: 0.95rem; margin-bottom: 1.5rem;">
        CLEAR Space แสดงผลงานเฉพาะห้องเรียนของเจ้าของบัญชีเท่านั้น เพื่อความปลอดภัยและป้องกันข้อมูลรั่วไหล<br>
        กรุณาเปิดใช้งานจากหน้าห้องเรียนของคุณอีกครั้ง
      </p>
      <button class="clear-btn clear-btn-secondary" onclick="goHome()">
        <i class="fa-solid fa-arrow-left"></i> <span>กลับสู่ห้องเรียนของฉัน</span>
      </button>
    </div>`;
}

function renderHub() {
  state.view = 'hub';
  const room = state.room;
  const cards = getBoards().map(b => {
    const count = loadPosts(b).length;
    const unit = b.type === 'book' ? 'เล่ม' : 'ผลงาน';
    return `
      <button type="button" class="folder-card" data-action="open-board" data-board="${b.id}">
        <div class="folder-icon" style="background:${b.grad};"><i class="fa-solid ${b.icon}"></i></div>
        <span class="folder-type-badge"><i class="fa-solid ${b.type === 'book' ? 'fa-book' : 'fa-image'}"></i> ${esc(b.badge)}</span>
        <h3 style="font-size: 1.15rem; font-weight: 800; margin: 0;">${esc(b.title)}</h3>
        <p style="font-size: 0.85rem; color: var(--text-muted); margin: 0;">${esc(b.desc)}</p>
        <div class="folder-meta">
          <span><i class="fa-solid fa-layer-group"></i> ${count} ${unit}</span>
          <span><i class="fa-solid fa-door-open"></i> ห้อง ${esc(room.room)}</span>
        </div>
      </button>`;
  }).join('');

  root.innerHTML = `
    <div class="space-banner">
      <span class="badge-metallic" style="width: fit-content; margin-bottom: 0.5rem;">
        <i class="fa-solid fa-folder-tree"></i> CLEAR Space · โฟลเดอร์ประจำห้อง ${esc(room.room)}
      </span>
      <h1 style="font-size: 1.9rem; font-weight: 800; margin-bottom: 0.35rem;">CLEAR Space</h1>
      <p style="opacity: 0.92; font-size: 0.98rem;">${esc(room.title)} — เลือกโฟลเดอร์เพื่อดูผลงานรูปภาพ ลิงก์ และคลังอีบุ๊ก 3D ของห้องคุณ</p>
    </div>

    <h2 class="section-title"><i class="fa-solid fa-folder-open" style="color: var(--brand-emerald);"></i> <span>โฟลเดอร์ผลงานทั้งหมด</span></h2>
    <div class="hub-grid">${cards}</div>`;
}

function loadPosts(board) {
  const key = LS.posts(state.room.slug, board.id);
  const stored = readJson(key, null);
  if (stored) return stored;
  const seeds = board.type === 'book' ? buildSeedBookPosts(state.room) : buildSeedPhotoPosts(state.room);
  writeJson(key, seeds);
  return seeds;
}
function savePosts(boardId, list) { writeJson(LS.posts(state.room.slug, boardId), list); }

function openBoard(boardId) {
  state.board = getBoards().find(b => b.id === boardId) || null;
  if (!state.board) return;
  state.posts = loadPosts(state.board);
  state.openComments = {};
  renderBoard();
}

function backToHub() {
  state.board = null;
  state.posts = [];
  renderHub();
}

function renderBoard() {
  state.view = 'board';
  const board = state.board;
  const isBlog = board.type === 'blog';

  const sizeControls = isBlog ? `
    <div class="card-size-controls" role="group" aria-label="ขนาดการ์ด">
      <span class="size-label"><i class="fa-solid fa-border-all"></i> ขนาดการ์ด</span>
      <button type="button" class="size-btn ${state.cardSize === 'compact' ? 'active' : ''}" data-action="set-size" data-size="compact">เล็ก</button>
      <button type="button" class="size-btn ${state.cardSize === 'normal' ? 'active' : ''}" data-action="set-size" data-size="normal">กลาง</button>
      <button type="button" class="size-btn ${state.cardSize === 'large' ? 'active' : ''}" data-action="set-size" data-size="large">ใหญ่</button>
    </div>` : '';

  const emptyMsg = isBlog
    ? { icon: 'fa-images', text: 'ยังไม่มีผลงานในบอร์ดนี้' }
    : { icon: 'fa-book-open', text: 'ยังไม่มีอีบุ๊กในคลังนี้' };

  const postsHtml = state.posts.length
    ? state.posts.map(p => isBlog ? renderBlogCard(p) : renderBookCard(p)).join('')
    : `<div class="empty-state" style="grid-column: 1 / -1;"><i class="fa-solid ${emptyMsg.icon}"></i>${esc(emptyMsg.text)}</div>`;

  root.innerHTML = `
    <button type="button" class="space-breadcrumb" data-action="back-hub">
      <i class="fa-solid fa-chevron-left"></i> กลับสู่โฟลเดอร์ Space ทั้งหมด
    </button>

    <div class="board-toolbar">
      <div>
        <span class="folder-type-badge"><i class="fa-solid ${isBlog ? 'fa-image' : 'fa-book'}"></i> ${esc(board.badge)}</span>
        <h2 style="font-size: 1.5rem; font-weight: 800; margin: 0.4rem 0 0.2rem;">${esc(board.title)}</h2>
        <p style="color: var(--text-muted); font-size: 0.9rem; margin: 0;">${esc(board.desc)}</p>
      </div>
      <div style="display:flex; align-items:center; gap:0.75rem; flex-wrap:wrap;">
        ${sizeControls}
        <button type="button" class="clear-btn clear-btn-primary" style="background: linear-gradient(135deg, #10b981, #047857);" data-action="open-compose">
          <i class="fa-solid fa-plus"></i> <span>เพิ่มผลงาน</span>
        </button>
      </div>
    </div>

    <div class="post-grid size-${state.cardSize}" id="spacePostGrid">${postsHtml}</div>`;
}

function renderReactionsHtml(postId) {
  const r = getReactions(postId);
  return `
    <div class="reactions-bar">
      ${REACTIONS.map(x => {
        const n = r.counts[x.kind] || 0;
        const active = r.mine === x.kind;
        return `<button type="button" class="reaction-btn ${active ? 'active' : ''}" data-action="react" data-post="${esc(postId)}" data-kind="${x.kind}" title="${x.label}">
          <span>${x.emoji}</span>${n > 0 ? `<span class="rcount">${n}</span>` : ''}
        </button>`;
      }).join('')}
    </div>`;
}

function renderCommentsHtml(post) {
  const open = !!state.openComments[post.id];
  const comments = getComments(post.id);
  const isMine = (c) => c.author_code && state.student.code && c.author_code === state.student.code;
  const items = comments.length ? comments.map(c => `
    <div class="comment-item">
      <div class="comment-head">
        <span class="comment-author">${esc(c.is_teacher ? 'ครู ' + c.author_name : c.author_name)}${c.is_teacher ? ' <span class="teacher-badge"><i class="fa-solid fa-graduation-cap"></i> ครูผู้สอน</span>' : ''}</span>
        ${isMine(c) ? `<button type="button" class="comment-delete" data-action="delete-comment" data-post="${esc(post.id)}" data-comment="${esc(c.id)}">ลบ</button>` : ''}
      </div>
      ${c.content ? `<p class="comment-text">${esc(c.content)}</p>` : ''}
      ${c.image && c.image.url ? `<img class="comment-img" src="${esc(c.image.url)}" alt="" loading="lazy">` : ''}
      <span class="comment-time">${formatRelativeTimeTH(c.created_at)}</span>
    </div>`).join('') : '<p class="comment-empty">ยังไม่มีความคิดเห็น</p>';

  return `
    <div class="comments-section ${open ? 'open' : ''}" id="comments-${esc(post.id)}">
      ${items}
      <form class="comment-form" data-comment-form="${esc(post.id)}">
        <input type="text" name="content" placeholder="แสดงความคิดเห็น..." aria-label="แสดงความคิดเห็น">
        <label class="comment-attach" title="แนบรูปภาพ">📷
          <input type="file" name="file" accept="image/*" style="display:none">
        </label>
        <button type="submit" class="comment-send">ส่ง</button>
      </form>
    </div>`;
}

function renderBlogCard(p) {
  const color = p.color && p.color.indexOf('card-') === 0 ? p.color : '';
  const media = p.image
    ? `<img class="post-image" src="${esc(p.image)}" alt="" loading="lazy">`
    : (p.external_url
      ? `<a class="post-link" href="${esc(p.external_url)}" target="_blank" rel="noopener noreferrer"><i class="fa-solid fa-arrow-up-right-from-square"></i> ${esc(p.external_url)}</a>`
      : '');
  const commentCount = getComments(p.id).length;
  return `
    <article class="space-post-card ${color}">
      <div class="post-head">
        <span class="post-author">${esc(p.author_name)}${p.is_teacher ? ' <span class="teacher-badge"><i class="fa-solid fa-graduation-cap"></i> ครูผู้สอน</span>' : ''}</span>
        <span class="post-time">${formatRelativeTimeTH(p.created_at)}</span>
      </div>
      <h3 class="card-title">${esc(p.topic)}</h3>
      ${media}
      ${p.content ? `<p class="card-excerpt">${esc(p.content)}</p>` : ''}
      ${renderReactionsHtml(p.id)}
      <div class="card-footer-row">
        <button type="button" class="comment-toggle" data-action="toggle-comments" data-post="${esc(p.id)}">
          <i class="fa-solid fa-comment-dots"></i> ความคิดเห็น${commentCount > 0 ? ` (${commentCount})` : ''}
        </button>
      </div>
      ${renderCommentsHtml(p)}
    </article>`;
}

function renderBookCard(p) {
  const color = p.color && p.color.indexOf('card-') === 0 ? p.color : '';
  const urls = getPostPageUrls(p);
  const cover = urls[0] || '';
  const commentCount = getComments(p.id).length;
  return `
    <article class="space-post-card ${color}">
      <div class="post-head">
        <span class="post-author">${esc(p.author_name)}</span>
        <span class="post-time">${formatRelativeTimeTH(p.created_at)}</span>
      </div>
      <button type="button" class="book-cover" data-action="open-book" data-post="${esc(p.id)}" title="เปิดอ่าน ${esc(p.topic)}">
        <img src="${esc(cover)}" alt="${esc(p.topic)}" loading="lazy">
        <span class="book-cover-hint">📖 ${urls.length} หน้า</span>
      </button>
      <h3 class="card-title">${esc(p.topic)}</h3>
      ${p.content ? `<p class="card-excerpt">${esc(p.content)}</p>` : ''}
      ${renderReactionsHtml(p.id)}
      <div class="card-footer-row">
        <button type="button" class="comment-toggle" data-action="toggle-comments" data-post="${esc(p.id)}">
          <i class="fa-solid fa-comment-dots"></i> ความคิดเห็น${commentCount > 0 ? ` (${commentCount})` : ''}
        </button>
        <button type="button" class="read-now-btn" data-action="open-book" data-post="${esc(p.id)}">
          <span>เปิดอ่าน</span> <i class="fa-solid fa-arrow-right"></i>
        </button>
      </div>
      ${renderCommentsHtml(p)}
    </article>`;
}

/* ── Events (delegated) ── */
root.addEventListener('click', (e) => {
  const el = e.target.closest('[data-action]');
  if (!el) return;
  const action = el.dataset.action;

  if (action === 'open-board') openBoard(el.dataset.board);
  else if (action === 'back-hub') backToHub();
  else if (action === 'set-size') { state.cardSize = el.dataset.size; renderBoard(); }
  else if (action === 'react') { toggleReaction(el.dataset.post, el.dataset.kind); renderBoard(); }
  else if (action === 'open-book') openReader(el.dataset.post);
  else if (action === 'open-compose') openCompose();
  else if (action === 'delete-comment') {
    deleteComment(el.dataset.post, el.dataset.comment, state.student.code);
    state.openComments[el.dataset.post] = true;
    renderBoard();
  } else if (action === 'toggle-comments') {
    const id = el.dataset.post;
    state.openComments[id] = !state.openComments[id];
    const section = document.getElementById('comments-' + id);
    if (section) section.classList.toggle('open', state.openComments[id]);
  }
});

root.addEventListener('submit', async (e) => {
  const form = e.target.closest('form[data-comment-form]');
  if (!form) return;
  e.preventDefault();
  const postId = form.dataset.commentForm;
  const content = (form.querySelector('input[name="content"]') || {}).value || '';
  const fileInput = form.querySelector('input[name="file"]');
  const file = fileInput && fileInput.files && fileInput.files[0] ? fileInput.files[0] : null;

  if (!content.trim() && !file) return;

  let image = null;
  if (file) {
    const url = await readFileAsDataURL(file);
    image = { url: url };
  }
  addComment(postId, { content: content.trim(), image: image, name: state.student.name, code: state.student.code });
  state.openComments[postId] = true;
  renderBoard();
  if (typeof showToast === 'function') showToast('ส่งความคิดเห็นแล้ว', 'success');
});

/* ── Compose modal ── */
const composeModal = document.getElementById('composeModal');

function setWorkType(type) {
  state.workType = type;
  const imageBtn = document.getElementById('workTypeImageBtn');
  const linkBtn = document.getElementById('workTypeLinkBtn');
  document.getElementById('singleImageGroup').style.display = type === 'image' ? 'block' : 'none';
  document.getElementById('linkGroup').style.display = type === 'link' ? 'block' : 'none';
  imageBtn.className = 'clear-btn ' + (type === 'image' ? 'clear-btn-primary' : 'clear-btn-secondary');
  linkBtn.className = 'clear-btn ' + (type === 'link' ? 'clear-btn-primary' : 'clear-btn-secondary');
}

function openCompose() {
  const isBook = state.board && state.board.type === 'book';
  const student = state.student;
  document.getElementById('composeTitle').innerHTML = isBook
    ? '<i class="fa-solid fa-book"></i> เพิ่มอีบุ๊กใหม่'
    : '<i class="fa-solid fa-circle-plus" style="color: var(--brand-emerald, #10b981);"></i> เพิ่มผลงานใหม่';
  document.getElementById('blogComposeFields').style.display = isBook ? 'none' : 'block';
  document.getElementById('bookComposeFields').style.display = isBook ? 'block' : 'none';
  document.getElementById('workAuthor').value = student.name && student.name !== 'นักเรียน' ? student.name : '';
  setWorkType('image');
  composeModal.classList.add('open');
}

function closeComposeModal() { composeModal.classList.remove('open'); }

async function handleComposeSubmit(e) {
  e.preventDefault();
  const isBook = state.board && state.board.type === 'book';
  const topic = document.getElementById('workTopic').value.trim();
  const author = document.getElementById('workAuthor').value.trim() || state.student.name || 'นักเรียน';
  const desc = document.getElementById('workDesc').value.trim();

  const base = {
    id: 'u' + Date.now(), topic: topic, content: desc, author_name: author,
    author_code: state.student.code, is_teacher: false, is_mine: true,
    external_url: null, created_at: new Date().toISOString(), color: ''
  };

  let post;
  if (isBook) {
    const fileInput = document.getElementById('workBookPages');
    const files = fileInput.files ? Array.from(fileInput.files).slice(0, 15) : [];
    let pages;
    if (files.length) {
      pages = [];
      for (let i = 0; i < files.length; i++) {
        const url = await readFileAsDataURL(files[i]);
        pages.push({ url: url, isCover: i === 0, title: i === 0 ? topic : 'หน้า ' + (i + 1), author: author });
      }
    } else {
      pages = [{
        isCover: true, title: topic, subtitle: desc || 'ผลงานสร้างสรรค์วิชาภาษาไทย', author: author,
        themeGrad: '<stop offset="0%" stop-color="#064e3b"/><stop offset="60%" stop-color="#047857"/><stop offset="100%" stop-color="#022c22"/>',
        accentColor: '#10b981', verses: 'สร้างสรรค์วรรณกรรมดิจิทัล สานศิลป์ภาษาไทย ม.6', iconFa: '✨'
      }];
      for (let p = 2; p <= 6; p++) {
        pages.push({
          title: 'บทที่ ' + (p - 1) + ': เนื้อหาผลงาน', subtitle: 'บันทึกการเรียนรู้โดย ' + author, chapter: 'ส่วนที่ ' + (p - 1),
          bodyTexts: ['นี่คือหน้าเนื้อหาที่ ' + p + ' ของผลงานเรื่อง "' + topic + '"', 'จัดทำโดยนักเรียน ' + author + ' ชั้นมัธยมศึกษาปีที่ 6', 'เปิดพลิกอ่านด้วยเอฟเฟกต์ 3D ราวกับหนังสือกระดาษจริง', 'นักเรียนสามารถแนบภาพวาดหรือคอมมิกของตนเองได้'],
          verses: 'ความรู้คู่คุณธรรม นำวรรณคดีสู่ยุคดิจิทัล', pageNum: p, totalPages: 6, author: author
        });
      }
    }
    post = Object.assign(base, { type: 'book', pages: pages, images: [] });
  } else {
    post = Object.assign(base, { type: 'blog', image: null });
    if (state.workType === 'link') {
      post.external_url = document.getElementById('workLink').value.trim();
      if (!post.external_url) { if (typeof showToast === 'function') showToast('กรุณาใส่ลิงก์ผลงาน', 'warning'); return; }
    } else {
      const fileInput = document.getElementById('workImage');
      const file = fileInput.files && fileInput.files[0] ? fileInput.files[0] : null;
      if (!file) { if (typeof showToast === 'function') showToast('กรุณาแนบภาพผลงาน', 'warning'); return; }
      post.image = await readFileAsDataURL(file);
    }
  }

  const list = loadPosts(state.board);
  list.unshift(post);
  savePosts(state.board.id, list);
  state.posts = list;
  composeModal.classList.remove('open');
  document.getElementById('composeForm').reset();
  renderBoard();
  if (typeof showToast === 'function') showToast('เพิ่มผลงาน "' + topic + '" เรียบร้อยแล้ว!', 'success');
}

/* ── 3D Reader ── */
let flipInstance = null;
let readerFullscreen = false;

function openReader(postId) {
  const post = state.posts.find(p => p.id === postId);
  if (!post) return;
  state.activePost = post;
  document.getElementById('readerBookTitle').textContent = post.topic + ' — ' + post.author_name;
  const backdrop = document.getElementById('anyFlipReader');
  backdrop.classList.add('open');
  const hint = document.getElementById('swipeHint');
  hint.classList.remove('fade-out');
  hint.style.display = 'flex';
  setTimeout(() => hint.classList.add('fade-out'), 3500);
  setupPageFlip(getPostPageUrls(post));
}

function closeReader() {
  const backdrop = document.getElementById('anyFlipReader');
  backdrop.classList.remove('open');
  if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
  if (flipInstance) { flipInstance.destroy(); flipInstance = null; }
  document.getElementById('flipContainer').innerHTML = '';
}

function setupPageFlip(urls) {
  const container = document.getElementById('flipContainer');
  const stageFrame = document.getElementById('stageFrame');
  const spineShadow = document.getElementById('spineShadow');
  const loading = document.getElementById('readerLoading');

  container.innerHTML = '';
  loading.style.display = 'grid';

  const isDesktop = window.innerWidth >= 768;
  if (isDesktop) { stageFrame.classList.add('spread'); spineShadow.style.display = 'block'; }
  else { stageFrame.classList.remove('spread'); spineShadow.style.display = 'none'; }

  const rect = stageFrame.getBoundingClientRect();
  let pageWidth, pageHeight;
  if (isDesktop) {
    pageWidth = Math.floor((rect.width - 28) / 2);
    pageHeight = Math.floor(pageWidth / A4_RATIO);
    if (pageHeight > rect.height - 28) { pageHeight = Math.floor(rect.height - 28); pageWidth = Math.floor(pageHeight * A4_RATIO); }
  } else {
    pageWidth = Math.floor(rect.width - 24);
    pageHeight = Math.floor(pageWidth / A4_RATIO);
    if (pageHeight > rect.height - 24) { pageHeight = Math.floor(rect.height - 24); pageWidth = Math.floor(pageHeight * A4_RATIO); }
  }
  pageWidth = Math.max(160, Math.min(600, pageWidth));
  pageHeight = Math.max(226, Math.min(850, pageHeight));

  const mount = document.createElement('div');
  mount.style.width = '100%';
  mount.style.height = '100%';
  container.appendChild(mount);

  try {
    if (window.St && window.St.PageFlip) {
      flipInstance = new window.St.PageFlip(mount, {
        width: pageWidth, height: pageHeight, size: 'stretch',
        minWidth: 160, maxWidth: 600,
        minHeight: Math.round(160 / A4_RATIO), maxHeight: Math.round(600 / A4_RATIO),
        showCover: true, maxShadowOpacity: 0.5, mobileScrollSupport: false, usePortrait: !isDesktop
      });
      flipInstance.on('flip', (ev) => {
        const pg = typeof ev.data === 'number' ? ev.data : 0;
        updateControlsState(pg, urls.length);
        const hint = document.getElementById('swipeHint');
        if (pg > 0 && hint) hint.classList.add('fade-out');
      });
      flipInstance.on('init', () => { loading.style.display = 'none'; });
      flipInstance.loadFromImages(urls);
      updateControlsState(0, urls.length);
    } else {
      loading.innerHTML = '<span style="color:#fca5a5;">กำลังโหลดไลบรารี 3D Flip...</span>';
    }
  } catch (err) {
    console.error('PageFlip Error:', err);
    loading.innerHTML = '<span style="color:#fca5a5;">ไม่สามารถแสดงผล 3D ได้: ' + esc(err.message) + '</span>';
  }
}

function flipPrev() { if (flipInstance) flipInstance.flipPrev(); }
function flipNext() { if (flipInstance) flipInstance.flipNext(); }

function updateControlsState(pageIndex, totalPages) {
  document.getElementById('readerPageCounter').textContent = 'หน้า ' + (pageIndex + 1) + ' / ' + totalPages;
  const prevBtn = document.getElementById('prevPageBtn');
  const nextBtn = document.getElementById('nextPageBtn');
  if (prevBtn) prevBtn.disabled = (pageIndex <= 0);
  if (nextBtn) nextBtn.disabled = (pageIndex >= totalPages - 1);
}

function toggleReaderFullscreen() {
  const reader = document.getElementById('anyFlipReader');
  const fsIcon = document.getElementById('fsIcon');
  const ctrlFsBtn = document.getElementById('ctrlFsBtn');
  if (!document.fullscreenElement) {
    reader.requestFullscreen().then(() => {
      readerFullscreen = true;
      if (fsIcon) fsIcon.className = 'fa-solid fa-compress';
      if (ctrlFsBtn) ctrlFsBtn.innerHTML = '<i class="fa-solid fa-compress" style="font-size: 0.95rem;"></i>';
      setTimeout(() => { if (flipInstance) flipInstance.update(); }, 200);
    }).catch(() => {});
  } else {
    document.exitFullscreen().then(() => {
      readerFullscreen = false;
      if (fsIcon) fsIcon.className = 'fa-solid fa-expand';
      if (ctrlFsBtn) ctrlFsBtn.innerHTML = '<i class="fa-solid fa-expand" style="font-size: 0.95rem;"></i>';
      setTimeout(() => { if (flipInstance) flipInstance.update(); }, 200);
    }).catch(() => {});
  }
}

document.addEventListener('fullscreenchange', () => {
  readerFullscreen = !!document.fullscreenElement;
  const fsIcon = document.getElementById('fsIcon');
  const ctrlFsBtn = document.getElementById('ctrlFsBtn');
  if (fsIcon) fsIcon.className = readerFullscreen ? 'fa-solid fa-compress' : 'fa-solid fa-expand';
  if (ctrlFsBtn) ctrlFsBtn.innerHTML = readerFullscreen
    ? '<i class="fa-solid fa-compress" style="font-size: 0.95rem;"></i>'
    : '<i class="fa-solid fa-expand" style="font-size: 0.95rem;"></i>';
});

window.addEventListener('keydown', (e) => {
  const reader = document.getElementById('anyFlipReader');
  if (!reader.classList.contains('open')) return;
  if (e.key === 'ArrowRight' || e.key === ' ') flipNext();
  else if (e.key === 'ArrowLeft') flipPrev();
  else if (e.key === 'Escape') closeReader();
});

/* ── Classroom-safe navigation ── */
function goHome() {
  // Delegate to the shared standard navigation when available.
  if (typeof returnToScores === 'function') { returnToScores(); return; }
  if (state.room) { window.location.href = '../rooms/' + state.room.slug + '/'; }
}

function logoutStudent() {
  try {
    localStorage.removeItem('clear_auth_student');
    localStorage.removeItem('clear_current_room');
    const rm = [];
    for (let i = 0; i < sessionStorage.length; i++) {
      const k = sessionStorage.key(i);
      if (k && k.indexOf('clear_auth_student') === 0) rm.push(k);
    }
    rm.forEach(k => sessionStorage.removeItem(k));
  } catch (e) {}
  if (typeof showToast === 'function') showToast('ออกจากระบบแล้ว', 'info');
  const target = state.room ? '../rooms/' + state.room.slug + '/' : '../rooms/';
  setTimeout(() => { window.location.href = target; }, 600);
}

/* ── Init ── */
document.addEventListener('DOMContentLoaded', () => {
  state.room = detectRoom();
  state.student = getCurrentStudent();
  if (!state.room) { renderGuard(); return; }
  renderHub();
});
