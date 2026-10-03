import { useCallback, useEffect, useRef, useState } from 'react';
import { PageFlip } from 'page-flip';
import { get } from './api.ts';
import { Modal } from './ui.tsx';

// A faithful port of the real CLEAR Space's own book-reading experience
// (CLEAR Space/apps/web/src/App.tsx: A4_RATIO, fitImageToA4Page, BookPageFlipViewer) — every
// page is letterboxed onto a consistent A4-ratio canvas first, since page-flip needs uniform
// page dimensions to animate a believable page turn, then the `page-flip` library drives the
// actual flip animation. Kept as a click-to-open reader per post (not a whole-Space viewer),
// matching how the original only ever flips through one post's own pages at a time.

const A4_WIDTH_MM = 210;
const A4_HEIGHT_MM = 297;
const A4_RATIO = A4_WIDTH_MM / A4_HEIGHT_MM; // single page (portrait)

function BookPageFlipViewer({ urls, onClose }: { urls: string[]; onClose?: () => void }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<HTMLDivElement>(null);
  const flipRef = useRef<PageFlip | null>(null);
  const [pageIndex, setPageIndex] = useState(0);
  const [preparing, setPreparing] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  // two-page spread on a wide screen, a single page on a phone — decided once when the reader opens
  const [isDesktop] = useState(() => typeof window !== 'undefined' && window.innerWidth >= 768);
  // the "swipe to read" hand hint: shown until the reader flips a page or 4 seconds pass
  const [hint, setHint] = useState<'show' | 'fading' | 'gone'>('show');

  useEffect(() => {
    const onFs = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', onFs);
    return () => document.removeEventListener('fullscreenchange', onFs);
  }, []);

  useEffect(() => {
    const fade = setTimeout(() => setHint('fading'), 3500);
    const gone = setTimeout(() => setHint('gone'), 4000);
    return () => {
      clearTimeout(fade);
      clearTimeout(gone);
    };
  }, []);

  useEffect(() => {
    if (pageIndex > 0 && hint === 'show') setHint('fading');
  }, [pageIndex, hint]);

  useEffect(() => {
    if (hint !== 'fading') return;
    const t = setTimeout(() => setHint('gone'), 500);
    return () => clearTimeout(t);
  }, [hint]);

  const toggleFullscreen = async () => {
    try {
      if (!document.fullscreenElement) {
        if (viewerRef.current?.requestFullscreen) await viewerRef.current.requestFullscreen();
      } else if (document.exitFullscreen) {
        await document.exitFullscreen();
      }
    } catch {
      // fullscreen can be denied; ignore
    }
  };

  useEffect(() => {
    if (urls.length === 0 || !containerRef.current) return;
    let cancelled = false;
    const wrapper = containerRef.current;
    const rect = wrapper.getBoundingClientRect();
    const mount = document.createElement('div');
    mount.style.width = '100%';
    mount.style.height = '100%';
    wrapper.appendChild(mount);
    setPreparing(true);
    setPageIndex(0);
    setLoadError(null);

    try {
      // `width`/`height` are a SINGLE page's size: in spread mode the library shows two pages
      // side by side (total `width * 2`), so a single page must be half the stage, not the whole
      // stage, or the book doubles in size and overflows the wooden frame.
      let pageWidth: number;
      let pageHeight: number;
      if (isDesktop) {
        pageWidth = Math.floor((rect.width - 20) / 2);
        pageHeight = Math.floor(pageWidth / A4_RATIO);
        if (pageHeight > rect.height) {
          pageHeight = Math.floor(rect.height);
          pageWidth = Math.floor(pageHeight * A4_RATIO);
        }
      } else {
        pageWidth = Math.floor(rect.width);
        pageHeight = Math.floor(pageWidth / A4_RATIO);
      }
      const flip = new PageFlip(mount, {
        width: pageWidth,
        height: pageHeight,
        size: 'stretch',
        minWidth: 160,
        maxWidth: 600,
        minHeight: Math.round(160 / A4_RATIO),
        maxHeight: Math.round(600 / A4_RATIO),
        showCover: true,
        maxShadowOpacity: 0.5,
        mobileScrollSupport: false,
        usePortrait: !isDesktop,
      });

      flip.on('flip', (event) => setPageIndex(typeof event.data === 'number' ? event.data : 0));
      flip.on('init', () => {
        if (!cancelled) setPreparing(false);
      });
      flip.loadFromImages(urls);
      flipRef.current = flip;

      // Check if cover image is already cached or loads fast
      const firstImg = new Image();
      firstImg.onload = () => { if (!cancelled) setPreparing(false); };
      firstImg.onerror = () => { if (!cancelled) setPreparing(false); };
      firstImg.src = urls[0];
      if (firstImg.complete) {
        setPreparing(false);
      }
    } catch (error) {
      if (!cancelled) {
        setLoadError(error instanceof Error ? error.message : 'โหลดหน้าเล่มไม่สำเร็จ');
        setPreparing(false);
      }
    }

    return () => {
      cancelled = true;
      flipRef.current?.destroy();
      flipRef.current = null;
      mount.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urls]);

  if (loadError) return <p className="alert" role="alert">{loadError}</p>;

  return (
    <div className="book-viewer" ref={viewerRef}>
      <div className={`book-viewer-stage-frame${isDesktop ? ' spread' : ''}`}>
        <div className="book-viewer-stage" ref={containerRef} />
        {isDesktop && <div className="book-viewer-spine" aria-hidden="true" />}
        {preparing && <p className="book-viewer-loading">กำลังโหลดหนังสือ…</p>}
        {hint !== 'gone' && (
          <div className={`book-swipe-hint${hint === 'fading' ? ' fade-out' : ''}`} aria-hidden="true">
            <svg viewBox="0 0 24 24"><path d="M9 11V6a2 2 0 0 1 4 0v5m0-3a2 2 0 0 1 4 0v3m0-2a2 2 0 0 1 4 0v6a7 7 0 0 1-7 7H12a7 7 0 0 1-5.6-2.8L4.3 14.8a1.5 1.5 0 0 1 2.3-1.9L9 15" fill="currentColor" /></svg>
            <span>ปัดเพื่อเปิดอ่าน</span>
          </div>
        )}
      </div>
      {!preparing && (
        <div className="book-viewer-controls">
          <button type="button" className="btn" onClick={() => flipRef.current?.flipPrev()} disabled={pageIndex <= 0} aria-label="หน้าก่อนหน้า">‹</button>
          <span className="book-viewer-page-count">หน้า {pageIndex + 1} / {urls.length}</span>
          <button type="button" className="btn" onClick={() => flipRef.current?.flipNext()} disabled={pageIndex >= urls.length - 1} aria-label="หน้าถัดไป">›</button>
          <button type="button" className="btn" onClick={toggleFullscreen} title={isFullscreen ? 'ย่อหน้าจอ' : 'อ่านเต็มจอ'} aria-label={isFullscreen ? 'ย่อหน้าจอ' : 'อ่านเต็มจอ'}>
            {isFullscreen ? (
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 14h6v6M20 14h-6v6M14 4v6h6M10 4v6H4" /></svg>
            ) : (
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 8V4h4M20 8V4h-4M4 16v4h4M20 16v4h-4" /></svg>
            )}
          </button>
          {onClose && <button type="button" className="btn book-viewer-close" onClick={onClose} aria-label="ปิด">✕</button>}
        </div>
      )}
    </div>
  );
}

/** A post's book cover on the wall: its first page shown full-size, opening the real page-flip
 *  reader on click — a block, not a strip of thumbnails. Preloads images on hover for instant open. */
export function BookPages({ images, title }: { images: { id: number; url: string }[]; title: string }) {
  const [open, setOpen] = useState(false);
  const handleClose = useCallback(() => setOpen(false), []);

  const preloadImages = useCallback(() => {
    images.forEach((img) => {
      const i = new Image();
      i.src = img.url;
    });
  }, [images]);

  if (images.length === 0) return null;
  const cover = images[0];
  return (
    <>
      <button
        type="button"
        className="book-cover"
        onClick={() => setOpen(true)}
        onMouseEnter={preloadImages}
        onTouchStart={preloadImages}
        onFocus={preloadImages}
      >
        <img src={cover.url} alt="" loading="lazy" />
        <span className="book-cover-hint">📖 {images.length} หน้า</span>
      </button>
      {open && (
        <Modal title={title || 'อ่านหนังสือ'} onClose={handleClose}>
          <BookPageFlipViewer urls={images.map((i) => i.url)} onClose={handleClose} />
        </Modal>
      )}
    </>
  );
}

interface StandaloneBookData {
  topic: string;
  space_id: number;
  images: { id: number; url: string }[];
}

/** A shared link (/s/:token/book/:postId) opens the book full-screen, without the classroom shell
 *  and without a login — the section's own share token is the only gate, matching the media route. */
export function StandaloneBookPage({ token, postId }: { token: string; postId: number }) {
  const [data, setData] = useState<StandaloneBookData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    get<StandaloneBookData>(`/api/public/space/book/${postId}?token=${token}`)
      .then(setData)
      .catch((e) => setError((e as Error).message));
  }, [token, postId]);

  const back = data ? `/s/${token}/space/${data.space_id}` : `/s/${token}`;

  return (
    <div className="standalone-book">
      <div className="standalone-book-bar">
        <span className="standalone-book-title">{data?.topic || 'อ่านหนังสือ'}</span>
        <a className="btn small" href={back} style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 6 }}>✕ ปิด</a>
      </div>
      <div className="standalone-book-body">
        {error ? (
          <div className="alert" role="alert">{error}</div>
        ) : data ? (
          <BookPageFlipViewer urls={data.images.map((i) => i.url)} onClose={() => { window.location.href = back; }} />
        ) : (
          <p className="muted" role="status">กำลังโหลดหนังสือ…</p>
        )}
      </div>
    </div>
  );
}
