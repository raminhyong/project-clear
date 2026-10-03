import { useCallback, useEffect, useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import { Icon } from './icons.tsx';
import { Field, Modal, ReorderableImageSlots } from './ui.tsx';

// A close port of the real CLEAR Space's own per-post PostCard chrome (App.tsx: POST_COLOR_HEX,
// POST_COLOR_OPTIONS, the "⋮" kebab menu with แก้ไข/เปลี่ยนสี/ลบ) — shared by the student Wall and
// the teacher's post view since the original uses one PostCard component for both.

export type PostColor = 'pink' | 'blue' | 'green' | 'yellow' | 'purple';
export const POST_COLOR_HEX: Record<PostColor, string> = {
  pink: '#fde2ec',
  blue: '#dbeafe',
  green: '#dcfce7',
  yellow: '#fef9c3',
  purple: '#ede9fe',
};
export const POST_COLOR_LABEL: Record<PostColor, string> = {
  pink: 'ชมพู',
  blue: 'ฟ้า',
  green: 'เขียว',
  yellow: 'เหลือง',
  purple: 'ม่วง',
};
export const POST_COLOR_OPTIONS = Object.keys(POST_COLOR_HEX) as PostColor[];

/** The "⋮" menu on a post's own card: แก้ไข / เปลี่ยนสี / แชร์ / ลบ. "แชร์" is always available;
 *  the manage-only items appear only when the viewer may manage the post (own post via edit token
 *  for a student, any post in the Space for its teacher). */
export function PostKebabMenu({
  color,
  canManage = true,
  onEdit,
  onColorChange,
  onDelete,
  onShare,
}: {
  color: PostColor | null;
  canManage?: boolean;
  onEdit: () => void;
  onColorChange: (color: PostColor | null) => void;
  onDelete: () => void;
  onShare?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [showColors, setShowColors] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDocPointerDown(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
        setShowColors(false);
      }
    }
    document.addEventListener('mousedown', onDocPointerDown);
    return () => document.removeEventListener('mousedown', onDocPointerDown);
  }, [open]);

  function close() {
    setOpen(false);
    setShowColors(false);
  }

  return (
    <div className="post-kebab-wrap" ref={wrapRef} onClick={(e) => e.stopPropagation()}>
      <button
        type="button"
        className="post-kebab-button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="true"
        aria-expanded={open}
        aria-label="เมนูผลงาน"
      >
        ⋮
      </button>
      {open && (
        <div className="post-kebab-menu" role="menu">
          {!showColors ? (
            <>
              {canManage && <button type="button" className="post-kebab-item" role="menuitem" onClick={() => { close(); onEdit(); }}>แก้ไข</button>}
              {canManage && <button type="button" className="post-kebab-item" role="menuitem" onClick={() => setShowColors(true)}>เปลี่ยนสี</button>}
              <button type="button" className="post-kebab-item" role="menuitem" onClick={() => { close(); onShare?.(); }}>แชร์</button>
              {canManage && <button type="button" className="post-kebab-item danger" role="menuitem" onClick={() => { close(); onDelete(); }}>ลบ</button>}
            </>
          ) : (
            <div className="post-color-row">
              {POST_COLOR_OPTIONS.map((c) => (
                <button
                  key={c}
                  type="button"
                  className={`post-color-swatch${color === c ? ' active' : ''}`}
                  style={{ background: POST_COLOR_HEX[c] }}
                  aria-label={POST_COLOR_LABEL[c]}
                  title={POST_COLOR_LABEL[c]}
                  onClick={() => { onColorChange(c); close(); }}
                />
              ))}
              <button type="button" className="post-color-clear" aria-label="ล้างสี" title="ล้างสี" onClick={() => { onColorChange(null); close(); }}>✕</button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export interface EditImageItem {
  id: string;
  existingId?: number;
  file?: File;
  url: string;
}

export interface EditWorkSubmitData {
  topic: string;
  content: string;
  external_url: string;
  files?: File[];
  manifest?: ({ type: 'existing'; id: number } | { type: 'new'; index: number })[];
}

/** Edit a post's topic/description, and its link when it has one, or manage its uploaded images (add, delete, reorder). */
export function EditWorkModal({
  initial,
  kind = 'book',
  onClose,
  onSubmit,
}: {
  initial: {
    topic: string;
    content: string;
    external_url: string | null;
    images?: { id: number; url: string }[];
  };
  kind?: 'blog' | 'book';
  onClose: () => void;
  onSubmit: (data: EditWorkSubmitData) => Promise<void>;
}) {
  const maxPages = kind === 'book' ? 15 : 1;
  const hasImages = (initial.images && initial.images.length > 0) || kind === 'book';

  const [topic, setTopic] = useState(initial.topic);
  const [content, setContent] = useState(initial.content);
  const [link, setLink] = useState(initial.external_url ?? '');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const hasLink = !hasImages && initial.external_url !== null;

  const [items, setItems] = useState<EditImageItem[]>(() =>
    (initial.images ?? []).map((img) => ({
      id: `existing-${img.id}`,
      existingId: img.id,
      url: img.url,
    })),
  );

  const itemsRef = useRef(items);
  itemsRef.current = items;
  useEffect(() => {
    return () => {
      itemsRef.current.forEach((it) => {
        if (it.file) URL.revokeObjectURL(it.url);
      });
    };
  }, []);

  const handleClose = useCallback(() => {
    if (!busy) onClose();
  }, [busy, onClose]);

  function selectImages(e: ChangeEvent<HTMLInputElement>) {
    const chosen = Array.from(e.target.files ?? []);
    if (chosen.length === 0) return;
    const remaining = maxPages - items.length;
    if (remaining <= 0) {
      setError(`แนบได้ไม่เกิน ${maxPages} ภาพ`);
      e.target.value = '';
      return;
    }
    const toAdd = chosen.slice(0, remaining);
    if (chosen.length > remaining) {
      setError(`เลือกได้อีกเพียง ${remaining} ภาพ (สูงสุด ${maxPages} ภาพ)`);
    } else {
      setError(null);
    }
    const newItems: EditImageItem[] = toAdd.map((f, idx) => ({
      id: `new-${Date.now()}-${idx}-${Math.random().toString(36).slice(2, 7)}`,
      file: f,
      url: URL.createObjectURL(f),
    }));
    setItems((prev) => [...prev, ...newItems]);
    e.target.value = '';
  }

  function reorder(from: number, to: number) {
    setItems((prev) => {
      const next = [...prev];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return next;
    });
  }

  function remove(index: number) {
    setItems((prev) => {
      const it = prev[index];
      if (it?.file) URL.revokeObjectURL(it.url);
      return prev.filter((_, i) => i !== index);
    });
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!topic.trim() || !content.trim()) {
      setError('กรอกหัวข้อและคำอธิบายให้ครบ');
      return;
    }
    if (hasLink && !link.trim()) {
      setError('กรุณาใส่ลิงก์ผลงาน');
      return;
    }
    if (hasImages && items.length === 0) {
      setError('กรุณาเลือกภาพอย่างน้อย 1 ภาพ');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      if (hasImages) {
        const files: File[] = [];
        const manifest: ({ type: 'existing'; id: number } | { type: 'new'; index: number })[] = [];
        for (const it of items) {
          if (it.existingId !== undefined) {
            manifest.push({ type: 'existing', id: it.existingId });
          } else if (it.file) {
            const idx = files.length;
            files.push(it.file);
            manifest.push({ type: 'new', index: idx });
          }
        }
        await onSubmit({
          topic: topic.trim(),
          content: content.trim(),
          external_url: hasLink ? link.trim() : '',
          files,
          manifest,
        });
      } else {
        await onSubmit({
          topic: topic.trim(),
          content: content.trim(),
          external_url: hasLink ? link.trim() : '',
        });
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title="แก้ไขผลงาน" onClose={handleClose}>
      <form className="stack" onSubmit={submit}>
        <Field label="หัวข้อ">
          <input value={topic} onChange={(e) => setTopic(e.target.value)} maxLength={200} disabled={busy} autoFocus required />
        </Field>

        {hasImages && (
          <div className="stack" style={{ gap: 8 }}>
            <div className="row between" style={{ alignItems: 'center' }}>
              <span className="small"><strong>ภาพผลงาน ({items.length} / {maxPages} ภาพ)</strong></span>
              <label className="btn small" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, cursor: busy || items.length >= maxPages ? 'not-allowed' : 'pointer' }}>
                <Icon name="download" size={16} style={{ transform: 'rotate(180deg)' }} />
                <span>แนบภาพเพิ่ม</span>
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  multiple={maxPages > 1}
                  disabled={busy || items.length >= maxPages}
                  onChange={selectImages}
                  style={{ display: 'none' }}
                />
              </label>
            </div>
            {items.length > 0 ? (
              <>
                <p className="muted small" style={{ margin: 0 }}>ลากภาพไปยังตำแหน่งที่ต้องการ หรือใช้ปุ่ม ← → เพื่อเลื่อนทีละตำแหน่ง</p>
                <ReorderableImageSlots items={items} onReorder={reorder} onRemove={remove} disabled={busy} />
              </>
            ) : (
              <div className="alert warn small" style={{ margin: 0 }}>
                ยังไม่มีภาพในผลงาน กรุณาแนบภาพอย่างน้อย 1 ภาพ
              </div>
            )}
          </div>
        )}

        {hasLink && (
          <Field label="ลิงก์ผลงาน">
            <input type="url" value={link} onChange={(e) => setLink(e.target.value)} disabled={busy} required />
          </Field>
        )}

        <Field label="คำอธิบายใต้งาน">
          <textarea value={content} onChange={(e) => setContent(e.target.value)} rows={3} disabled={busy} required />
        </Field>

        {error && <div className="alert" role="alert">{error}</div>}
        <button className="btn primary" disabled={busy}>{busy ? 'กำลังบันทึก…' : 'บันทึก'}</button>
      </form>
    </Modal>
  );
}
