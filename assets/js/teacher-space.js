/**
 * ═══════════════════════════════════════════════════════════════
 * PROJECT CLEAR — TEACHER SPACE CURATOR HUB (Two-Tier Architecture)
 * Tier 1: Space / Album cards (one album = one work per classroom)
 * Tier 2: Album drill-down showing the individual student items.
 * Albums aggregate BOOKS_DATA seeds + every room's CLEAR Space
 * localStorage, plus teacher-created albums persisted in
 * localStorage under `clear_teacher_custom_spaces_v1`.
 * Depends on: student-map.js (CLEAR_ROOMS), shared.js, space-data.js,
 * page-flip.browser.js (window.St.PageFlip).
 * ═══════════════════════════════════════════════════════════════
 */
(function () {
  const SPACE_BOARDS = [
    { id: 'photo-wall', type: 'blog' },
    { id: 'ebook-library', type: 'book' }
  ];
  const LS_REACTIONS = 'clear_space_reactions_v1';
  const CUSTOM_KEY = 'clear_teacher_custom_spaces_v1';
  const lsPostsKey = (slug, boardId) => 'clear_space_posts_v1_' + slug + '_' + boardId;

  const TYPE_META = {
    book: { label: 'E-Book 3D', icon: 'fa-book-open', badge: 'curator-badge-book', title: 'คลัง E-Book 3D', desc: 'รวมหนังสือการ์ตูนช่องวรรณคดีแบบพลิกหน้า 3D' },
    image: { label: 'รูปภาพ/โปสเตอร์', icon: 'fa-images', badge: 'curator-badge-image', title: 'ผลงานรูปภาพ/โปสเตอร์', desc: 'รวมผลงานภาพวาด โปสเตอร์ และงานออกแบบของห้อง' },
    link: { label: 'ลิงก์', icon: 'fa-link', badge: 'curator-badge-link', title: 'ลิงก์ผลงาน', desc: 'รวมลิงก์ผลงาน Canva / Padlet / Google Docs ของห้อง' }
  };
  const ALBUM_TYPES = ['book', 'image', 'link'];
  const ROOM_ACCENT = {
    '61-k9f2': '#10b981', '62-m4x7': '#0ea5e9', '65-w1c8': '#8b5cf6', '65a-j4d9': '#a855f7',
    '66-k8n3': '#f59e0b', '67-s5e6': '#f43f5e', '68-p7y2': '#6366f1', '69-h3m5': '#f97316'
  };
  const COLOR_CHOICES = [
    { key: 'emerald', hex: '#10b981' }, { key: 'blue', hex: '#0ea5e9' }, { key: 'purple', hex: '#8b5cf6' },
    { key: 'amber', hex: '#f59e0b' }, { key: 'rose', hex: '#f43f5e' }, { key: 'indigo', hex: '#6366f1' }
  ];

  const curator = { initialized: false, eventsWired: false, albums: [], type: 'all', room: 'all', view: 'albums', currentAlbumId: null };
  const reader = { flip: null, fullscreen: false };

  function roomLabel(room) { return room === '6/5 Add' ? '6/5+' : room; }
  function readJson(key, fallback) {
    try { const v = JSON.parse(localStorage.getItem(key) || 'null'); return v == null ? fallback : v; }
    catch (e) { return fallback; }
  }
  function writeJson(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) {} }
  function reactionTotal(id) {
    const map = readJson(LS_REACTIONS, {});
    const rec = map[id];
    if (!rec || !rec.counts) return 0;
    return Object.values(rec.counts).reduce((sum, n) => sum + Number(n || 0), 0);
  }
  function accentForRoom(slug) { return ROOM_ACCENT[slug] || '#10b981'; }

  function classify(post) {
    if (post.type === 'book') return 'book';
    if (post.image) return 'image';
    if (post.external_url) return 'link';
    return 'image';
  }

  function collectPosts() {
    const rooms = window.CLEAR_ROOMS || [];
    const items = [];
    rooms.forEach(rd => {
      SPACE_BOARDS.forEach(board => {
        const stored = readJson(lsPostsKey(rd.slug, board.id), null);
        const posts = Array.isArray(stored) ? stored
          : (board.type === 'book' ? buildSeedBookPosts(rd) : buildSeedPhotoPosts(rd));
        posts.forEach(p => {
          items.push(Object.assign({}, p, {
            _room: rd.room, _roomTitle: rd.title, _slug: rd.slug,
            _kind: classify(p), _reactions: reactionTotal(p.id)
          }));
        });
      });
    });
    return items;
  }

  function loadCustomSpaces() { const list = readJson(CUSTOM_KEY, []); return Array.isArray(list) ? list : []; }
  function saveCustomSpaces(list) { writeJson(CUSTOM_KEY, list); }

  /* ── Tier 1 build: aggregate items into per-room, per-type albums ── */
  function buildAlbums() {
    const rooms = window.CLEAR_ROOMS || [];
    const all = collectPosts();
    const albums = [];
    rooms.forEach(rd => {
      ALBUM_TYPES.forEach(type => {
        const items = all.filter(it => it._slug === rd.slug && it._kind === type);
        if (!items.length) return;
        const newest = items.reduce((m, it) => { const t = new Date(it.created_at || 0).getTime(); return t > m ? t : m; }, 0);
        albums.push({
          id: 'auto:' + rd.slug + ':' + type,
          type, room: rd.room, roomSlug: rd.slug,
          title: TYPE_META[type].title + ' · ' + roomLabel(rd.room),
          subtitle: rd.title || '', desc: TYPE_META[type].desc,
          colorClass: '', accent: accentForRoom(rd.slug), icon: TYPE_META[type].icon,
          createdAt: newest ? new Date(newest).toISOString() : new Date().toISOString(),
          items, custom: false
        });
      });
    });
    loadCustomSpaces().forEach(rec => {
      const type = TYPE_META[rec.type] ? rec.type : 'book';
      albums.push({
        id: rec.id || ('custom:' + Date.now()),
        type, room: rec.room, roomSlug: rec.roomSlug,
        title: rec.title || 'อัลบั้มใหม่', subtitle: rec.subtitle || '', desc: rec.desc || '',
        colorClass: rec.colorClass || '', accent: rec.accent || accentForRoom(rec.roomSlug),
        icon: rec.icon || TYPE_META[type].icon,
        createdAt: rec.createdAt || new Date().toISOString(),
        items: [], custom: true
      });
    });
    return albums;
  }

  function findAlbum(id) { return curator.albums.find(a => String(a.id) === String(id)); }
  function findAlbumItem(id) {
    for (const a of curator.albums) {
      const it = a.items.find(x => String(x.id) === String(id));
      if (it) return it;
    }
    return null;
  }

  function emptyStateHtml(icon, text) {
    return `<div class="clear-card" style="text-align:center;padding:3rem;grid-column:1/-1;color:var(--text-muted);"><i class="fa-solid ${icon}" style="font-size:2.2rem;color:var(--text-dim);display:block;margin-bottom:0.75rem;"></i>${text}</div>`;
  }

  /* ── Filter bars ── */
  function buildFilterBars() {
    const typeBar = document.getElementById('spaceTypeFilter');
    if (typeBar) {
      const options = [['all', 'ทั้งหมด']].concat(ALBUM_TYPES.map(t => [t, '📖 ' + TYPE_META[t].label]));
      typeBar.innerHTML = options.map(([v, l]) =>
        `<button type="button" class="room-pill${curator.type === v ? ' active' : ''}" data-type="${v}">${l}</button>`).join('');
    }
    const roomBar = document.getElementById('spaceRoomFilter');
    if (roomBar) {
      const rooms = window.CLEAR_ROOMS || [];
      const pills = [`<button type="button" class="room-pill${curator.room === 'all' ? ' active' : ''}" data-room="all">ทั้งหมด</button>`]
        .concat(rooms.map(rd =>
          `<button type="button" class="room-pill${curator.room === rd.room ? ' active' : ''}" data-room="${esc(rd.room)}">${esc(roomLabel(rd.room))}</button>`));
      roomBar.innerHTML = pills.join('');
    }
  }

  /* ── Tier 1 render: album cards ── */
  function getFilteredAlbums() {
    const q = (((document.getElementById('spaceCuratorSearch') || {}).value) || '').trim().toLowerCase();
    return curator.albums.filter(a => {
      if (curator.type !== 'all' && a.type !== curator.type) return false;
      if (curator.room !== 'all' && a.room !== curator.room) return false;
      if (!q) return true;
      return String(a.title || '').toLowerCase().includes(q) ||
        String(a.subtitle || '').toLowerCase().includes(q) ||
        String(a.desc || '').toLowerCase().includes(q);
    });
  }

  function albumCard(a) {
    const meta = TYPE_META[a.type] || TYPE_META.book;
    return `
      <article class="space-album-card" data-action="open-album" data-album-id="${esc(a.id)}" style="--album-accent:${esc(a.accent)};">
        <div class="album-card-top">
          <span class="album-icon" style="background:${esc(a.accent)};"><i class="fa-solid ${esc(a.icon)}"></i></span>
          <div class="album-badges">
            <span class="curator-badge ${meta.badge}">${meta.label}</span>
            <span class="album-room-badge" style="color:${esc(a.accent)};">ห้อง ${esc(roomLabel(a.room))}</span>
          </div>
        </div>
        <h4 class="album-title">${esc(a.title || 'ไม่มีชื่ออัลบั้ม')}</h4>
        ${a.desc ? `<p class="album-desc">${esc(a.desc)}</p>` : ''}
        <div class="album-card-foot">
          <span class="album-count"><i class="fa-solid fa-layer-group"></i> ${a.items.length} ชิ้นงาน</span>
          <span class="album-time">${esc(formatRelativeTimeTH(a.createdAt))}</span>
        </div>
      </article>`;
  }

  function renderSpaceCurator() {
    if (!curator.initialized) { initSpaceCurator(); return; }
    if (curator.view === 'detail') { renderAlbumDetail(); return; }
    const grid = document.getElementById('spaceCuratorGrid');
    if (!grid) return;
    const sort = ((document.getElementById('spaceCuratorSort') || {}).value) || 'newest';
    const list = getFilteredAlbums();
    const byDate = (a, b) => new Date(a.createdAt || 0) - new Date(b.createdAt || 0);
    if (sort === 'oldest') list.sort(byDate);
    else if (sort === 'most') list.sort((a, b) => (b.items.length - a.items.length) || (-byDate(a, b)));
    else list.sort((a, b) => byDate(b, a));

    const totalItems = list.reduce((sum, a) => sum + a.items.length, 0);
    const status = document.getElementById('spaceCuratorStatus');
    if (status) status.textContent = `แสดง ${list.length} จากทั้งหมด ${curator.albums.length} อัลบั้ม · รวม ${totalItems} ชิ้นงาน`;

    grid.innerHTML = list.length ? list.map(albumCard).join('') : emptyStateHtml('fa-folder-open', 'ไม่พบอัลบั้มตามเงื่อนไขที่เลือก');
  }

  /* ── Tier 2: album drill-down ── */
  function openAlbumDetail(albumId) {
    const album = findAlbum(albumId);
    if (!album) return;
    curator.view = 'detail';
    curator.currentAlbumId = album.id;
    const albumsView = document.getElementById('spaceAlbumsView');
    const detail = document.getElementById('spaceAlbumDetail');
    if (albumsView) albumsView.style.display = 'none';
    if (detail) detail.style.display = 'block';
    renderAlbumDetail();
  }

  function backToSpaceAlbums() {
    curator.view = 'albums';
    curator.currentAlbumId = null;
    const albumsView = document.getElementById('spaceAlbumsView');
    const detail = document.getElementById('spaceAlbumDetail');
    if (detail) detail.style.display = 'none';
    if (albumsView) albumsView.style.display = 'block';
    renderSpaceCurator();
  }

  function coverHtml(it) {
    if (it._kind === 'book') {
      const urls = getPostPageUrls(it);
      const cover = urls[0] || '';
      return `<div class="curator-cover curator-cover-book"><img src="${esc(cover)}" alt="${esc(it.topic)}" loading="lazy"><span class="curator-cover-hint">📖 ${urls.length} หน้า</span></div>`;
    }
    if (it._kind === 'image' && it.image) {
      return `<div class="curator-cover"><img src="${esc(it.image)}" alt="${esc(it.topic)}" loading="lazy"></div>`;
    }
    return `<div class="curator-cover curator-cover-empty"><i class="fa-solid fa-link"></i></div>`;
  }

  function itemActionHtml(it) {
    if (it._kind === 'book') {
      return `<button type="button" class="clear-btn clear-btn-primary curator-action" data-action="read" data-id="${esc(it.id)}"><i class="fa-solid fa-book-open-reader"></i> เปิดอ่าน 3D</button>`;
    }
    if (it._kind === 'link' && it.external_url) {
      return `<a class="clear-btn clear-btn-secondary curator-action" href="${esc(it.external_url)}" target="_blank" rel="noopener noreferrer"><i class="fa-solid fa-arrow-up-right-from-square"></i> เปิดลิงก์</a>`;
    }
    if (it._kind === 'image' && it.image) {
      return `<button type="button" class="clear-btn clear-btn-secondary curator-action" data-action="image" data-id="${esc(it.id)}"><i class="fa-solid fa-up-right-and-down-left-from-center"></i> ดูรูปเต็ม</button>`;
    }
    return '';
  }

  function itemCard(it) {
    const reactBadge = it._reactions > 0 ? `<span class="curator-react"><i class="fa-solid fa-heart"></i> ${it._reactions}</span>` : '';
    return `
      <article class="curator-card">
        ${coverHtml(it)}
        <div class="curator-card-body">
          <div class="curator-card-top">
            <span class="curator-time">${esc(formatRelativeTimeTH(it.created_at))}</span>
          </div>
          <h4 class="curator-title">${esc(it.topic || 'ไม่มีชื่อเรื่อง')}</h4>
          ${it.content ? `<p class="curator-excerpt">${esc(it.content)}</p>` : ''}
          <div class="curator-card-foot">
            <span class="curator-author"><i class="fa-solid fa-user-pen"></i> ${esc(it.author_name || 'ไม่ระบุ')}</span>
            ${reactBadge}
          </div>
          ${itemActionHtml(it)}
        </div>
      </article>`;
  }

  function renderAlbumDetail() {
    const album = findAlbum(curator.currentAlbumId);
    const detail = document.getElementById('spaceAlbumDetail');
    if (!detail || !album) return;
    const meta = TYPE_META[album.type] || TYPE_META.book;
    const itemsHtml = album.items.length
      ? album.items.map(itemCard).join('')
      : emptyStateHtml('fa-inbox', 'ยังไม่มีผลงานในอัลบั้มนี้');
    detail.innerHTML = `
      <button class="clear-btn clear-btn-secondary" onclick="backToSpaceAlbums()" style="margin-bottom:1rem;"><i class="fa-solid fa-arrow-left"></i> <span>กลับสู่คลัง Space ทั้งหมด</span></button>
      <div class="album-header-banner" style="--album-accent:${esc(album.accent)};">
        <div class="album-banner-icon" style="background:${esc(album.accent)};"><i class="fa-solid ${esc(album.icon)}"></i></div>
        <div class="album-banner-body">
          <div class="album-badges">
            <span class="curator-badge ${meta.badge}">${meta.label}</span>
            <span class="album-room-badge" style="color:${esc(album.accent)};">ห้อง ${esc(roomLabel(album.room))}</span>
          </div>
          <h3 class="album-banner-title">${esc(album.title)}</h3>
          ${album.subtitle ? `<p class="album-banner-sub">${esc(album.subtitle)}</p>` : ''}
          ${album.desc ? `<p class="album-banner-desc">${esc(album.desc)}</p>` : ''}
          <span class="album-count"><i class="fa-solid fa-layer-group"></i> ${album.items.length} ชิ้นงาน</span>
        </div>
      </div>
      <div class="space-curator-grid">${itemsHtml}</div>`;
  }

  /* ── Create Space / Album modal ── */
  function openCreateSpaceModal() {
    const modal = document.getElementById('createSpaceModal');
    if (!modal) return;
    const roomSel = document.getElementById('createSpaceRoom');
    if (roomSel && !roomSel.options.length) {
      const rooms = window.CLEAR_ROOMS || [];
      roomSel.innerHTML = rooms.map(rd =>
        `<option value="${esc(rd.room)}" data-slug="${esc(rd.slug)}">${esc(roomLabel(rd.room))} — ${esc(rd.title || '')}</option>`).join('');
    }
    const colorSel = document.getElementById('createSpaceColor');
    if (colorSel && !colorSel.options.length) {
      colorSel.innerHTML = COLOR_CHOICES.map(c => `<option value="${c.hex}">${c.key}</option>`).join('');
    }
    const form = document.getElementById('createSpaceForm');
    if (form) form.reset();
    modal.classList.add('open');
  }

  function closeCreateSpaceModal() {
    const modal = document.getElementById('createSpaceModal');
    if (modal) modal.classList.remove('open');
  }

  function saveNewSpace() {
    const typeEl = document.getElementById('createSpaceType');
    const roomSel = document.getElementById('createSpaceRoom');
    const titleEl = document.getElementById('createSpaceTitle');
    const descEl = document.getElementById('createSpaceDesc');
    const colorEl = document.getElementById('createSpaceColor');
    if (!typeEl || !roomSel || !titleEl) return false;
    const type = TYPE_META[typeEl.value] ? typeEl.value : 'book';
    const room = roomSel.value || '';
    const roomSlug = roomSel.selectedOptions[0] ? (roomSel.selectedOptions[0].dataset.slug || '') : '';
    const title = (titleEl.value || '').trim();
    const desc = descEl ? (descEl.value || '').trim() : '';
    const accent = (colorEl && colorEl.value) || accentForRoom(roomSlug);
    if (!title) { showToast('กรุณากรอกชื่ออัลบั้ม', 'warning'); return false; }

    const list = loadCustomSpaces();
    list.push({
      id: 'custom:' + Date.now(), type, room, roomSlug, title, subtitle: '', desc,
      colorClass: '', accent, icon: TYPE_META[type].icon, createdAt: new Date().toISOString()
    });
    saveCustomSpaces(list);

    curator.albums = buildAlbums();
    closeCreateSpaceModal();
    showToast('สร้าง Space "' + title + '" เรียบร้อยแล้ว', 'success');
    backToSpaceAlbums();
    return false;
  }

  function initSpaceCurator() {
    buildFilterBars();
    curator.albums = buildAlbums();
    curator.initialized = true;
    renderSpaceCurator();
  }

  /* ── 3D A4 E-Book Reader ── */
  function openSpaceReader(id) {
    const post = findAlbumItem(id);
    const modal = document.getElementById('spaceReaderModal');
    if (!post || !modal) return;
    const urls = getPostPageUrls(post);
    document.getElementById('spaceReaderTitle').textContent = (post.topic || 'E-Book') + ' — ' + (post.author_name || '');
    modal.classList.add('open');
    document.body.classList.add('clear-modal-open');
    setupSpacePageFlip(urls);
  }

  function closeSpaceReader() {
    const modal = document.getElementById('spaceReaderModal');
    if (!modal) return;
    modal.classList.remove('open');
    document.body.classList.remove('clear-modal-open');
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    if (reader.flip) { try { reader.flip.destroy(); } catch (e) {} reader.flip = null; }
    const container = document.getElementById('spaceReaderFlip');
    if (container) container.innerHTML = '';
  }

  function setupSpacePageFlip(urls) {
    const container = document.getElementById('spaceReaderFlip');
    const stageFrame = document.getElementById('spaceReaderStageFrame');
    const spine = document.getElementById('spaceReaderSpine');
    const loading = document.getElementById('spaceReaderLoading');
    if (!container || !stageFrame || !loading) return;

    if (reader.flip) { try { reader.flip.destroy(); } catch (e) {} reader.flip = null; }
    container.innerHTML = '';
    loading.style.display = 'grid';

    const isDesktop = window.innerWidth >= 768;
    stageFrame.classList.toggle('spread', isDesktop);
    if (spine) spine.style.display = isDesktop ? 'block' : 'none';

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
        reader.flip = new window.St.PageFlip(mount, {
          width: pageWidth, height: pageHeight, size: 'stretch',
          minWidth: 160, maxWidth: 600,
          minHeight: Math.round(160 / A4_RATIO), maxHeight: Math.round(600 / A4_RATIO),
          showCover: true, maxShadowOpacity: 0.5, mobileScrollSupport: false, usePortrait: !isDesktop
        });
        reader.flip.on('flip', (ev) => {
          const pg = typeof ev.data === 'number' ? ev.data : 0;
          updateSpaceReaderControls(pg, urls.length);
        });
        reader.flip.on('init', () => { loading.style.display = 'none'; });
        reader.flip.loadFromImages(urls);
        updateSpaceReaderControls(0, urls.length);
      } else {
        loading.innerHTML = '<span style="color:#fca5a5;">กำลังโหลดไลบรารี 3D Flip...</span>';
      }
    } catch (err) {
      loading.innerHTML = '<span style="color:#fca5a5;">ไม่สามารถแสดงผล 3D ได้: ' + esc(err.message) + '</span>';
    }
  }

  function updateSpaceReaderControls(pageIndex, totalPages) {
    const counter = document.getElementById('spaceReaderCounter');
    if (counter) counter.textContent = 'หน้า ' + (pageIndex + 1) + ' / ' + totalPages;
    const prevBtn = document.getElementById('spaceReaderPrev');
    const nextBtn = document.getElementById('spaceReaderNext');
    if (prevBtn) prevBtn.disabled = (pageIndex <= 0);
    if (nextBtn) nextBtn.disabled = (pageIndex >= totalPages - 1);
  }

  function spaceReaderPrev() { if (reader.flip) reader.flip.flipPrev(); }
  function spaceReaderNext() { if (reader.flip) reader.flip.flipNext(); }

  function toggleSpaceReaderFullscreen() {
    const modal = document.getElementById('spaceReaderModal');
    const fsBtn = document.getElementById('spaceReaderFs');
    if (!modal) return;
    if (!document.fullscreenElement) {
      modal.requestFullscreen().then(() => {
        reader.fullscreen = true;
        if (fsBtn) fsBtn.innerHTML = '<i class="fa-solid fa-compress" style="font-size: 0.95rem;"></i>';
        setTimeout(() => { if (reader.flip) reader.flip.update(); }, 200);
      }).catch(() => {});
    } else {
      document.exitFullscreen().then(() => {
        reader.fullscreen = false;
        if (fsBtn) fsBtn.innerHTML = '<i class="fa-solid fa-expand" style="font-size: 0.95rem;"></i>';
        setTimeout(() => { if (reader.flip) reader.flip.update(); }, 200);
      }).catch(() => {});
    }
  }

  /* ── Image preview modal ── */
  function openItemPreview(id) {
    const it = findAlbumItem(id);
    const modal = document.getElementById('spaceImagePreview');
    const img = document.getElementById('spaceImagePreviewImg');
    if (!it || !it.image || !modal || !img) return;
    img.src = it.image;
    const title = document.getElementById('spaceImagePreviewTitle');
    if (title) title.textContent = it.topic || '';
    modal.classList.add('open');
    document.body.classList.add('clear-modal-open');
  }

  function closeImagePreview() {
    const modal = document.getElementById('spaceImagePreview');
    if (!modal) return;
    modal.classList.remove('open');
    document.body.classList.remove('clear-modal-open');
    const img = document.getElementById('spaceImagePreviewImg');
    if (img) img.src = '';
  }

  function wireEvents() {
    if (curator.eventsWired) return;
    curator.eventsWired = true;

    const tab = document.getElementById('tab-space');
    if (tab) {
      tab.addEventListener('click', (e) => {
        const target = e.target.closest('[data-action]');
        if (!target) return;
        const action = target.dataset.action;
        if (action === 'open-album') openAlbumDetail(target.dataset.albumId);
        else if (action === 'read') openSpaceReader(target.dataset.id);
        else if (action === 'image') openItemPreview(target.dataset.id);
      });
    }

    const searchInput = document.getElementById('spaceCuratorSearch');
    if (searchInput) searchInput.addEventListener('input', () => { if (curator.view === 'albums') renderSpaceCurator(); });

    const typeBar = document.getElementById('spaceTypeFilter');
    if (typeBar) {
      typeBar.addEventListener('click', (e) => {
        const pill = e.target.closest('.room-pill');
        if (!pill) return;
        curator.type = pill.dataset.type || 'all';
        typeBar.querySelectorAll('.room-pill').forEach(b => b.classList.toggle('active', b.dataset.type === curator.type));
        renderSpaceCurator();
      });
    }

    const roomBar = document.getElementById('spaceRoomFilter');
    if (roomBar) {
      roomBar.addEventListener('click', (e) => {
        const pill = e.target.closest('.room-pill');
        if (!pill) return;
        curator.room = pill.dataset.room || 'all';
        roomBar.querySelectorAll('.room-pill').forEach(b => b.classList.toggle('active', b.dataset.room === curator.room));
        renderSpaceCurator();
      });
    }

    document.addEventListener('fullscreenchange', () => {
      reader.fullscreen = !!document.fullscreenElement;
      const fsBtn = document.getElementById('spaceReaderFs');
      if (fsBtn) fsBtn.innerHTML = '<i class="fa-solid fa-' + (reader.fullscreen ? 'compress' : 'expand') + '" style="font-size: 0.95rem;"></i>';
    });

    document.addEventListener('keydown', (e) => {
      const readerModal = document.getElementById('spaceReaderModal');
      if (readerModal && readerModal.classList.contains('open')) {
        if (e.key === 'ArrowRight' || e.key === ' ') spaceReaderNext();
        else if (e.key === 'ArrowLeft') spaceReaderPrev();
        else if (e.key === 'Escape') closeSpaceReader();
        return;
      }
      if (e.key === 'Escape') {
        closeCreateSpaceModal();
        closeImagePreview();
      }
    });
  }

  document.addEventListener('DOMContentLoaded', wireEvents);

  window.initSpaceCurator = initSpaceCurator;
  window.renderSpaceCurator = renderSpaceCurator;
  window.openAlbumDetail = openAlbumDetail;
  window.backToSpaceAlbums = backToSpaceAlbums;
  window.openCreateSpaceModal = openCreateSpaceModal;
  window.closeCreateSpaceModal = closeCreateSpaceModal;
  window.saveNewSpace = saveNewSpace;
  window.openItemPreview = openItemPreview;
  window.closeImagePreview = closeImagePreview;
  window.openSpaceReader = openSpaceReader;
  window.closeSpaceReader = closeSpaceReader;
  window.spaceReaderPrev = spaceReaderPrev;
  window.spaceReaderNext = spaceReaderNext;
  window.toggleSpaceReaderFullscreen = toggleSpaceReaderFullscreen;
})();
