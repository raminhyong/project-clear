/**
 * ═══════════════════════════════════════════════════════════════
 * PROJECT CLEAR — TEACHER SPACE CURATOR HUB
 * Aggregates every classroom's CLEAR Space posts (BOOKS_DATA seeds +
 * each room's localStorage) into one teacher grid with search, sort,
 * type/room filters, and a 3D A4 E-Book reader.
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
  const lsPostsKey = (slug, boardId) => 'clear_space_posts_v1_' + slug + '_' + boardId;

  const curator = { initialized: false, eventsWired: false, items: [], type: 'all', room: 'all' };
  const reader = { flip: null, fullscreen: false };

  function roomLabel(room) { return room === '6/5 Add' ? '6/5+' : room; }

  function readJson(key, fallback) {
    try { const v = JSON.parse(localStorage.getItem(key) || 'null'); return v == null ? fallback : v; }
    catch (e) { return fallback; }
  }

  function reactionTotal(id) {
    const map = readJson(LS_REACTIONS, {});
    const rec = map[id];
    if (!rec || !rec.counts) return 0;
    return Object.values(rec.counts).reduce((sum, n) => sum + Number(n || 0), 0);
  }

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

  function buildFilterBars() {
    const typeBar = document.getElementById('spaceTypeFilter');
    if (typeBar) {
      const types = [['all', 'ทั้งหมด'], ['book', '📖 E-Book 3D'], ['image', '🖼️ รูปภาพ'], ['link', '🔗 ลิงก์']];
      typeBar.innerHTML = types.map(([v, l]) =>
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

  function actionHtml(it) {
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

  function curatorCard(it) {
    const badge = it._kind === 'book' ? 'E-Book 3D' : it._kind === 'link' ? 'ลิงก์' : 'รูปภาพ';
    const badgeClass = it._kind === 'book' ? 'curator-badge-book' : it._kind === 'link' ? 'curator-badge-link' : 'curator-badge-image';
    const reactBadge = it._reactions > 0 ? `<span class="curator-react"><i class="fa-solid fa-heart"></i> ${it._reactions}</span>` : '';
    return `
      <article class="curator-card">
        ${coverHtml(it)}
        <div class="curator-card-body">
          <div class="curator-card-top">
            <span class="curator-badge ${badgeClass}">${badge}</span>
            <span class="curator-room">ห้อง ${esc(roomLabel(it._room))}</span>
          </div>
          <h4 class="curator-title">${esc(it.topic || 'ไม่มีชื่อเรื่อง')}</h4>
          ${it.content ? `<p class="curator-excerpt">${esc(it.content)}</p>` : ''}
          <div class="curator-card-foot">
            <span class="curator-author"><i class="fa-solid fa-user-pen"></i> ${esc(it.author_name || 'ไม่ระบุ')}</span>
            <span class="curator-time">${esc(formatRelativeTimeTH(it.created_at))}</span>
            ${reactBadge}
          </div>
          ${actionHtml(it)}
        </div>
      </article>`;
  }

  function renderSpaceCurator() {
    if (!curator.initialized) { initSpaceCurator(); return; }
    const grid = document.getElementById('spaceCuratorGrid');
    if (!grid) return;
    const q = ((document.getElementById('spaceCuratorSearch') || {}).value || '').trim().toLowerCase();
    const sort = ((document.getElementById('spaceCuratorSort') || {}).value) || 'newest';

    const list = curator.items.filter(it => {
      if (curator.type !== 'all' && it._kind !== curator.type) return false;
      if (curator.room !== 'all' && it._room !== curator.room) return false;
      if (!q) return true;
      return String(it.topic || '').toLowerCase().includes(q) ||
        String(it.author_name || '').toLowerCase().includes(q) ||
        String(it.content || '').toLowerCase().includes(q);
    });

    const byDate = (a, b) => new Date(a.created_at || 0) - new Date(b.created_at || 0);
    if (sort === 'oldest') list.sort(byDate);
    else if (sort === 'popular') list.sort((a, b) => (b._reactions - a._reactions) || (-byDate(a, b)));
    else list.sort((a, b) => byDate(b, a));

    const status = document.getElementById('spaceCuratorStatus');
    if (status) status.textContent = `แสดง ${list.length} จากทั้งหมด ${curator.items.length} รายการ`;

    grid.innerHTML = list.length
      ? list.map(curatorCard).join('')
      : `<div class="clear-card" style="text-align:center;padding:3rem;grid-column:1/-1;color:var(--text-muted);"><i class="fa-solid fa-folder-open" style="font-size:2.2rem;color:var(--text-dim);display:block;margin-bottom:0.75rem;"></i>ไม่พบผลงานตามเงื่อนไขที่เลือก</div>`;
  }

  function initSpaceCurator() {
    buildFilterBars();
    curator.items = collectPosts();
    curator.initialized = true;
    renderSpaceCurator();
  }

  /* ── 3D A4 E-Book Reader ── */
  function openSpaceReader(id) {
    const post = curator.items.find(p => String(p.id) === String(id));
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
    const icon = '<i class="fa-solid fa-{0}" style="font-size: 0.95rem;"></i>';
    if (!modal) return;
    if (!document.fullscreenElement) {
      modal.requestFullscreen().then(() => {
        reader.fullscreen = true;
        if (fsBtn) fsBtn.innerHTML = icon.replace('{0}', 'compress');
        setTimeout(() => { if (reader.flip) reader.flip.update(); }, 200);
      }).catch(() => {});
    } else {
      document.exitFullscreen().then(() => {
        reader.fullscreen = false;
        if (fsBtn) fsBtn.innerHTML = icon.replace('{0}', 'expand');
        setTimeout(() => { if (reader.flip) reader.flip.update(); }, 200);
      }).catch(() => {});
    }
  }

  function wireEvents() {
    if (curator.eventsWired) return;
    curator.eventsWired = true;

    const grid = document.getElementById('spaceCuratorGrid');
    if (grid) {
      grid.addEventListener('click', (e) => {
        const target = e.target.closest('[data-action]');
        if (!target) return;
        if (target.dataset.action === 'read') openSpaceReader(target.dataset.id);
        else if (target.dataset.action === 'image') {
          const it = curator.items.find(p => String(p.id) === String(target.dataset.id));
          if (it && it.image) window.open(it.image, '_blank', 'noopener');
        }
      });
    }

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
      const modal = document.getElementById('spaceReaderModal');
      if (!modal || !modal.classList.contains('open')) return;
      if (e.key === 'ArrowRight' || e.key === ' ') spaceReaderNext();
      else if (e.key === 'ArrowLeft') spaceReaderPrev();
      else if (e.key === 'Escape') closeSpaceReader();
    });
  }

  document.addEventListener('DOMContentLoaded', wireEvents);

  window.initSpaceCurator = initSpaceCurator;
  window.renderSpaceCurator = renderSpaceCurator;
  window.openSpaceReader = openSpaceReader;
  window.closeSpaceReader = closeSpaceReader;
  window.spaceReaderPrev = spaceReaderPrev;
  window.spaceReaderNext = spaceReaderNext;
  window.toggleSpaceReaderFullscreen = toggleSpaceReaderFullscreen;
})();
