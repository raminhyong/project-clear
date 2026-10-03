import { useCallback, useState, type ChangeEvent, type FormEvent } from 'react';
import { Link, useLocation } from 'wouter';
import { del, get, patch, patchForm, post, postForm, useLoad } from '../api.ts';
import { BookPages } from '../bookFlip.tsx';
import { Icon } from '../icons.tsx';
import { EditWorkModal, PostKebabMenu, POST_COLOR_HEX, type EditWorkSubmitData, type PostColor } from '../postCard.tsx';
import { Qr } from '../qr.tsx';
import { useSession } from '../session.tsx';
import { preparePostImage } from '../spaceMedia.ts';
import { formatRelativeTimeTH } from '../time.ts';
import { ErrorBox, Field, Loading, Modal, ReorderableImageSlots, useToast } from '../ui.tsx';

const BOOK_MAX_PAGES = 15;

// Phase 1 (Foundation): teacher-only Space CRUD. Phase 2 (Posting) added the student-facing Wall
// (SpaceStudent.tsx) plus this page's post viewer. Phase 3 (Interaction) added comments/reactions
// to that viewer. Phase 4 (Moderation & Organization) added the approval queue (approve button on
// a pending post), a bookmark pin, and trash/restore/purge — no folders, since Raminest already
// groups Spaces by section (the original CLEAR Space had no such grouping, hence its folders).
// Phase 5 (Book type) added multi-image posts; a 'book' Space's pages open in the real animated
// page-flip reader (BookPages/bookFlip.tsx, shared with SpaceStudent.tsx) instead of listing every
// page inline. Phase 6 (Polish) added a per-Space accent color and a generous feed row cap.

type Kind = 'blog' | 'book';
type Status = 'draft' | 'open' | 'frozen' | 'archived';
type Color = 'brand' | 'amber' | 'sky' | 'rose' | 'violet' | 'slate';

interface SpaceSummary {
  id: number;
  section_id: number;
  title: string;
  description: string;
  kind: Kind;
  status: Status;
  require_approval: boolean;
  allow_comments: boolean;
  allow_reactions: boolean;
  is_bookmarked: boolean;
  color: Color;
  deleted_at: string | null;
  room: string;
  course_code: string;
  course_name: string;
  share_token?: string | null;
}
interface SectionOption {
  id: number;
  room: string;
  course_code: string;
  course_name: string;
}

const STATUS_LABEL: Record<Status, string> = { draft: 'ฉบับร่าง', open: 'เปิดใช้งาน', frozen: 'หยุดรับงานชั่วคราว', archived: 'เก็บเข้าคลัง' };
const KIND_LABEL: Record<Kind, string> = { blog: 'กระดานผนัง', book: 'หนังสือ' };
const COLOR_HEX: Record<Color, string> = { brand: '#0e9f7a', amber: '#f59e0b', sky: '#0ea5e9', rose: '#f43f5e', violet: '#8b5cf6', slate: '#64748b' };
const COLOR_LABEL: Record<Color, string> = { brand: 'เขียวมรกต', amber: 'เหลืองอำพัน', sky: 'ฟ้า', rose: 'ชมพูกุหลาบ', violet: 'ม่วง', slate: 'เทาหิน' };
const COLORS = Object.keys(COLOR_HEX) as Color[];

const COLOR_GRADIENT: Record<Color, string> = {
  brand: 'linear-gradient(135deg, #10b981 0%, #047857 60%, #064e3b 100%)',
  amber: 'linear-gradient(135deg, #f59e0b 0%, #d97706 60%, #78350f 100%)',
  sky: 'linear-gradient(135deg, #38bdf8 0%, #0284c7 60%, #0c4a6e 100%)',
  rose: 'linear-gradient(135deg, #fb7185 0%, #e11d48 60%, #881337 100%)',
  violet: 'linear-gradient(135deg, #a78bfa 0%, #7c3aed 60%, #4c1d95 100%)',
  slate: 'linear-gradient(135deg, #94a3b8 0%, #475569 60%, #1e293b 100%)',
};

const GREETINGS = [
  'ไอเดียดีๆ เริ่มต้นที่นี่',
  'มาเริ่มต้นวันใหม่ที่สดใสกันเถอะ',
  'วันนี้พร้อมสร้างแรงบันดาลใจแล้วหรือยัง',
  'ยินดีต้อนรับกลับสู่พื้นที่สร้างสรรค์ของคุณ',
  'มาเติมพลังบวกให้ห้องเรียนกันเถอะ',
  'อีกหนึ่งวันที่จะได้สร้างสิ่งดีๆ ให้เด็กๆ',
  'พร้อมแล้วใช่ไหม มาสร้างบอร์ดใหม่กัน',
  'ขอให้วันนี้เป็นวันที่สอนสนุกนะ',
  'พื้นที่ของคุณพร้อมแล้ว เริ่มสร้างได้เลย',
  'มาเปลี่ยนไอเดียให้เป็นผลงานนักเรียนกัน',
  'วันดีๆ เริ่มที่ห้องเรียนดีๆ',
  'มาเติมสีสันให้การเรียนรู้กันเถอะ',
  'ยิ้มรับวันใหม่ ใจพร้อมสอน',
  'ห้องเรียนออนไลน์ของคุณรออยู่',
  'มาร่วมกันสร้างคลาสที่น่าจดจำ',
  'วันแห่งการเรียนรู้เริ่มแล้ว',
  'มาแชร์ไอเดียดีๆ ให้เด็กๆ กัน',
  'เปิดพื้นที่การเรียนรู้ได้เลยตอนนี้',
  'มาเปลี่ยนห้องเรียนให้มีชีวิตกัน',
  'พร้อมสร้างบอร์ดใหม่สุดปังแล้วหรือยัง',
];

interface SpaceFolder {
  id: string;
  name: string;
}

const FOLDERS_KEY = 'rn_space_folders';
const FOLDER_MAP_KEY = 'rn_space_folder_map';

function loadStoredFolders(): SpaceFolder[] {
  try {
    const raw = localStorage.getItem(FOLDERS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveStoredFolders(folders: SpaceFolder[]) {
  try {
    localStorage.setItem(FOLDERS_KEY, JSON.stringify(folders));
  } catch {}
}

function loadStoredFolderMap(): Record<string, string[]> {
  try {
    const raw = localStorage.getItem(FOLDER_MAP_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveStoredFolderMap(map: Record<string, string[]>) {
  try {
    localStorage.setItem(FOLDER_MAP_KEY, JSON.stringify(map));
  } catch {}
}

function ColorPicker({ value, onChange }: { value: Color; onChange: (c: Color) => void }) {
  return (
    <div className="row" role="radiogroup" aria-label="สี" style={{ gap: 8 }}>
      {COLORS.map((c) => (
        <button
          key={c}
          type="button"
          aria-label={COLOR_LABEL[c]}
          title={COLOR_LABEL[c]}
          onClick={() => onChange(c)}
          style={{
            width: 28,
            height: 28,
            borderRadius: '50%',
            background: COLOR_HEX[c],
            border: value === c ? '3px solid var(--ink)' : '1px solid var(--line)',
            cursor: 'pointer',
            padding: 0,
          }}
        />
      ))}
    </div>
  );
}

const sectionLabel = (s: { room: string; course_code: string; course_name: string }) => `ห้อง ${s.room} · ${[s.course_code, s.course_name].filter(Boolean).join(' ') || 'ไม่ระบุวิชา'}`;

// Creation is just title + description (a close match to the original's own "+ สร้างพื้นที่ใหม่"
// form) — the format (blog/book) and accent color are chosen afterward, in settings, matching
// where the original puts its own "ประเภทของงานในพื้นที่นี้" picker.
function NewSpaceModal({ sections, onClose, onDone }: { sections: SectionOption[]; onClose: () => void; onDone: () => void }) {
  const [f, setF] = useState({ section_id: sections[0]?.id ?? 0, title: '', description: '' });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!f.section_id) return setError('ยังไม่มีห้อง/วิชาให้เลือก สร้างห้องในหน้า Nest ก่อน');
    setBusy(true);
    setError(null);
    try {
      await post(`/api/sections/${f.section_id}/spaces`, { title: f.title, description: f.description });
      onDone();
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <Modal title="+ สร้างพื้นที่ใหม่" onClose={onClose}>
      <form className="stack" onSubmit={submit}>
        <Field label="ห้อง/วิชา">
          <select value={f.section_id} onChange={(e) => setF({ ...f, section_id: Number(e.target.value) })} required>
            {sections.map((s) => <option key={s.id} value={s.id}>{sectionLabel(s)}</option>)}
          </select>
        </Field>
        <Field label="ชื่อพื้นที่"><input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder="เช่น สะท้อนความคิดวันนี้" required autoFocus /></Field>
        <Field label="คำอธิบาย (ถ้ามี)"><textarea value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} rows={3} /></Field>
        {error && <div className="alert" role="alert">{error}</div>}
        <div className="row"><button className="btn primary" disabled={busy}>สร้างพื้นที่</button><button type="button" className="btn" onClick={onClose}>ยกเลิก</button></div>
      </form>
    </Modal>
  );
}

function EditSpaceModal({ src, onClose, onDone }: { src: SpaceSummary; onClose: () => void; onDone: () => void }) {
  const [f, setF] = useState({
    title: src.title,
    description: src.description,
    status: src.status,
    kind: src.kind,
    require_approval: src.require_approval,
    allow_comments: src.allow_comments,
    allow_reactions: src.allow_reactions,
    color: src.color,
  });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await patch(`/api/spaces/${src.id}`, f);
      onDone();
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <Modal title="ตั้งค่าพื้นที่" onClose={onClose}>
      <form className="stack" onSubmit={submit}>
        <p className="muted small" style={{ margin: 0 }}>{sectionLabel(src)}</p>
        <Field label="ชื่อพื้นที่"><input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} required autoFocus /></Field>
        <Field label="คำอธิบาย"><textarea value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} rows={3} /></Field>
        <Field label="สถานะ">
          <select value={f.status} onChange={(e) => setF({ ...f, status: e.target.value as Status })}>
            {(Object.keys(STATUS_LABEL) as Status[]).map((st) => <option key={st} value={st}>{STATUS_LABEL[st]}</option>)}
          </select>
        </Field>
        <div>
          <span className="muted small">ประเภทของงานในพื้นที่นี้</span>
          <div className="row" role="radiogroup" aria-label="ประเภท" style={{ marginTop: 6 }}>
            {(['blog', 'book'] as const).map((k) => (
              <button
                key={k}
                type="button"
                className={`btn small${f.kind === k ? ' primary' : ''}`}
                onClick={() => setF({ ...f, kind: k })}
              >
                {k === 'blog' ? 'บล็อก — ภาพหรือลิงก์ 1 ชิ้น + คำอธิบาย' : `อีบุ๊ก — อัปโหลดได้สูงสุด ${BOOK_MAX_PAGES} ภาพ พลิกอ่านแบบหนังสือ`}
              </button>
            ))}
          </div>
        </div>
        <label className="row small"><input type="checkbox" checked={f.require_approval} onChange={(e) => setF({ ...f, require_approval: e.target.checked })} /> ต้องอนุมัติโพสต์ก่อนเผยแพร่</label>
        <label className="row small"><input type="checkbox" checked={f.allow_comments} onChange={(e) => setF({ ...f, allow_comments: e.target.checked })} /> เปิดคอมเมนต์</label>
        <label className="row small"><input type="checkbox" checked={f.allow_reactions} onChange={(e) => setF({ ...f, allow_reactions: e.target.checked })} /> เปิดปฏิกิริยา</label>
        <Field label="สี"><ColorPicker value={f.color} onChange={(color) => setF({ ...f, color })} /></Field>
        {error && <div className="alert" role="alert">{error}</div>}
        <div className="row"><button className="btn primary" disabled={busy}>บันทึก</button><button type="button" className="btn" onClick={onClose}>ยกเลิก</button></div>
      </form>
    </Modal>
  );
}

const REACTION_EMOJI: Record<string, string> = { like: '👍', love: '❤️', laugh: '😂', wow: '😮', sad: '😢' };

interface SpacePostImage {
  id: number;
  url: string;
  width: number | null;
  height: number | null;
}
interface SpacePost {
  id: number;
  author_name: string;
  is_teacher: boolean;
  topic: string;
  content: string | null;
  external_url: string | null;
  color: PostColor | null;
  images: SpacePostImage[];
  created_at: string;
  comments_count: number;
  reactions: { counts: Record<string, number>; mine: string | null };
  pending: boolean;
}
interface SpaceComment {
  id: number;
  author_name: string;
  is_teacher: boolean;
  content: string | null;
  image: { url: string; width: number | null; height: number | null } | null;
  created_at: string;
}

/** A post's comment thread, teacher side: read, post comments (text/image), and delete. */
function TeacherComments({ spaceId, post: initialPost }: { spaceId: number; post: SpacePost }) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [comments, setComments] = useState<SpaceComment[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [content, setContent] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [commentCount, setCommentCount] = useState(initialPost.comments_count);

  async function loadComments() {
    setLoading(true);
    try {
      const r = await get<{ comments: SpaceComment[] }>(`/api/spaces/${spaceId}/posts/${initialPost.id}/comments`);
      setComments(r.comments);
      setCommentCount(r.comments.length);
    } catch (err) {
      toast((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  function toggle() {
    const next = !open;
    setOpen(next);
    if (next && comments === null) void loadComments();
  }

  async function removeComment(commentId: number) {
    if (!window.confirm('ลบความคิดเห็นนี้?')) return;
    try {
      await del(`/api/spaces/${spaceId}/comments/${commentId}`);
      await loadComments();
      toast('ลบความคิดเห็นแล้ว');
    } catch (err) {
      toast((err as Error).message);
    }
  }

  async function submitComment(e: FormEvent) {
    e.preventDefault();
    if (!content.trim() && !file) return;
    setBusy(true);
    try {
      if (file) {
        const form = new FormData();
        form.append('content', content.trim());
        form.append('file', file);
        const r = await postForm<{ id: number; comments: SpaceComment[] }>(`/api/spaces/${spaceId}/posts/${initialPost.id}/comments`, form);
        setComments(r.comments);
        setCommentCount(r.comments.length);
      } else {
        const r = await post<{ id: number; comments: SpaceComment[] }>(`/api/spaces/${spaceId}/posts/${initialPost.id}/comments`, { content: content.trim() });
        setComments(r.comments);
        setCommentCount(r.comments.length);
      }
      setContent('');
      setFile(null);
      toast('ส่งความคิดเห็นแล้ว');
    } catch (err) {
      toast((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <button type="button" className="btn small" onClick={toggle}>
        ความคิดเห็น{commentCount > 0 ? ` (${commentCount})` : ''}
      </button>
      {open && (
        <div className="stack" style={{ marginTop: 8, paddingLeft: 12, borderLeft: '2px solid var(--border, #e5e5e5)' }}>
          {loading && <Loading />}
          {comments?.length === 0 && <p className="muted small" style={{ margin: 0 }}>ยังไม่มีความคิดเห็น</p>}
          {comments?.map((cm) => (
            <div key={cm.id} className="stack" style={{ gap: 2 }}>
              <div className="row between">
                <strong className="small">{cm.is_teacher ? `ครู ${cm.author_name}` : cm.author_name}</strong>
                <button type="button" className="btn small danger" onClick={() => removeComment(cm.id)}>ลบ</button>
              </div>
              {cm.content && <p className="small" style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{cm.content}</p>}
              {cm.image && <img src={cm.image.url} alt="" style={{ maxWidth: 200, borderRadius: 8, display: 'block' }} loading="lazy" />}
              <span className="muted small">{formatRelativeTimeTH(cm.created_at)}</span>
            </div>
          ))}
          <form className="row" style={{ gap: 6, marginTop: 8 }} onSubmit={submitComment}>
            <input
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="แสดงความคิดเห็นของครู..."
              disabled={busy}
              style={{ flex: 1, minHeight: 38 }}
            />
            <label className="btn small" style={{ cursor: busy ? 'not-allowed' : 'pointer', minHeight: 38, display: 'inline-flex', alignItems: 'center' }} title="แนบรูป">
              📷
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                style={{ display: 'none' }}
                disabled={busy}
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />
            </label>
            <button className="btn small primary" disabled={busy || (!content.trim() && !file)} style={{ minHeight: 38 }}>
              {busy ? '…' : 'ส่ง'}
            </button>
          </form>
          {file && (
            <div className="row" style={{ gap: 6, alignItems: 'center' }}>
              <p className="muted small" style={{ margin: 0 }}>แนบรูป: {file.name}</p>
              <button type="button" className="btn small" onClick={() => setFile(null)} style={{ padding: '0 6px', minHeight: 22, fontSize: '0.75rem' }}>✕</button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** The teacher's own "เพิ่มงาน" modal — same shape as the student's "เพิ่มงานของฉัน" one, a close
 *  port of the original's add-work form (topic required, image/link toggle or multi-image book
 *  picker, description required). */
function TeacherAddWorkModal({
  kind,
  onClose,
  onSubmit,
}: {
  kind: Kind;
  onClose: () => void;
  onSubmit: (data: { topic: string; content: string; link: string; files: File[] }) => Promise<void>;
}) {
  const [topic, setTopic] = useState('');
  const [content, setContent] = useState('');
  const [link, setLink] = useState('');
  const [workType, setWorkType] = useState<'image' | 'link'>('image');
  const [files, setFiles] = useState<File[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function selectSingleImage(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    setFiles(file ? [file] : []);
  }

  function selectBookImages(e: ChangeEvent<HTMLInputElement>) {
    const chosen = Array.from(e.target.files ?? []);
    e.target.value = '';
    if (chosen.length === 0) return;
    setFiles((current) => {
      const room = BOOK_MAX_PAGES - current.length;
      if (room <= 0) {
        setError(`เพิ่มภาพได้สูงสุด ${BOOK_MAX_PAGES} ภาพต่อเล่ม`);
        return current;
      }
      return [...current, ...chosen.slice(0, room)];
    });
  }

  function removeFile(index: number) {
    setFiles((current) => current.filter((_, i) => i !== index));
  }

  function reorderFiles(from: number, to: number) {
    setFiles((current) => {
      const next = [...current];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return next;
    });
  }

  const handleClose = useCallback(() => {
    if (!busy) onClose();
  }, [busy, onClose]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!topic.trim() || !content.trim()) {
      setError('กรอกหัวข้อและคำอธิบายให้ครบ');
      return;
    }
    if (kind === 'book' && files.length === 0) {
      setError('กรุณาเลือกภาพอย่างน้อย 1 ภาพ');
      return;
    }
    if (kind === 'blog' && workType === 'image' && files.length === 0) {
      setError('กรุณาเลือกภาพผลงาน');
      return;
    }
    if (kind === 'blog' && workType === 'link' && !link.trim()) {
      setError('กรุณาใส่ลิงก์ผลงาน');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await onSubmit({ topic: topic.trim(), content: content.trim(), link: kind === 'blog' && workType === 'link' ? link.trim() : '', files });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title="เพิ่มงาน" onClose={handleClose}>
      <form className="stack" onSubmit={submit}>
        <Field label="หัวข้อ"><input value={topic} onChange={(e) => setTopic(e.target.value)} maxLength={200} placeholder="เช่น ตัวอย่างงานที่ดี" disabled={busy} autoFocus required /></Field>

        {kind === 'book' ? (
          <div className="stack">
            <label className="row small" style={{ gap: 8 }}>
              <Icon name="download" size={16} style={{ transform: 'rotate(180deg)' }} />
              แนบภาพ ({files.length} / {BOOK_MAX_PAGES} ภาพ)
              <input type="file" accept="image/png,image/jpeg,image/webp" multiple disabled={busy || files.length >= BOOK_MAX_PAGES} onChange={selectBookImages} />
            </label>
            {files.length > 0 && (
              <>
                <p className="muted small" style={{ margin: 0 }}>ลากภาพไปยังตำแหน่งที่ต้องการ หรือใช้ปุ่ม ← → เพื่อเลื่อนทีละตำแหน่ง</p>
                <ReorderableImageSlots files={files} onReorder={reorderFiles} onRemove={removeFile} disabled={busy} />
              </>
            )}
          </div>
        ) : (
          <>
            <div className="row" role="radiogroup" aria-label="ประเภทงาน">
              <button type="button" className={`btn small${workType === 'image' ? ' primary' : ''}`} onClick={() => setWorkType('image')} disabled={busy}>ภาพ</button>
              <button type="button" className={`btn small${workType === 'link' ? ' primary' : ''}`} onClick={() => setWorkType('link')} disabled={busy}>ลิงก์</button>
            </div>
            {workType === 'image' ? (
              <label className="row small" style={{ gap: 8 }}>
                <Icon name="download" size={16} style={{ transform: 'rotate(180deg)' }} />
                {files[0] ? `เลือกแล้ว: ${files[0].name}` : 'แนบภาพผลงาน'}
                <input type="file" accept="image/png,image/jpeg,image/webp" disabled={busy} onChange={selectSingleImage} />
              </label>
            ) : (
              <Field label="ลิงก์ผลงาน"><input type="url" value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://…" disabled={busy} required /></Field>
            )}
          </>
        )}

        <Field label="คำอธิบายใต้งาน"><textarea value={content} onChange={(e) => setContent(e.target.value)} rows={3} placeholder="เล่าเกี่ยวกับงานชิ้นนี้สั้น ๆ" disabled={busy} required /></Field>
        {error && <div className="alert" role="alert">{error}</div>}
        <button className="btn primary" disabled={busy}>{busy ? 'กำลังเพิ่ม…' : 'เพิ่มงาน'}</button>
      </form>
    </Modal>
  );
}

export function ShareSpaceModal({ space, onClose }: { space: SpaceSummary; onClose: () => void }) {
  const toast = useToast();
  const token = space.share_token;
  const origin = window.location.origin;
  const link = token ? `${origin}/s/${token}/space/${space.id}` : '';

  const copy = async () => {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      toast('คัดลอกลิงก์แล้ว');
    } catch {
      toast('คัดลอกไม่สำเร็จ กรุณาคัดลอกด้วยตนเอง');
    }
  };

  return (
    <Modal title={`แชร์ ${space.title}`} onClose={onClose}>
      <div className="stack" style={{ gap: 16 }}>
        <div>
          <div className="muted small">{sectionLabel(space)} · {KIND_LABEL[space.kind]}</div>
          <p className="small" style={{ margin: '6px 0 0' }}>
            นักเรียนสแกน QR Code หรือเปิดลิงก์ด้านล่าง แล้วกรอกเพียง<strong>รหัสนักเรียน</strong>เพื่อเข้าดูและส่งผลงานได้ทันที (ไม่ต้องล็อกอิน)
          </p>
        </div>

        {link ? (
          <>
            <div style={{ display: 'flex', justifyContent: 'center', background: 'var(--surface-2)', padding: 16, borderRadius: 16 }}>
              <Qr text={link} size={200} label="QR Code สำหรับนักเรียน" />
            </div>

            <div className="stack" style={{ gap: 6 }}>
              <label className="small muted">ลิงก์ตรงสำหรับนักเรียน</label>
              <div className="row between" style={{ background: 'var(--surface-2)', padding: '8px 12px', borderRadius: 8, gap: 8, alignItems: 'center' }}>
                <code className="small" style={{ wordBreak: 'break-all', userSelect: 'all', flex: 1 }}>{link}</code>
                <button type="button" className="btn small primary" onClick={copy}>คัดลอก</button>
              </div>
            </div>

            <div className="row" style={{ justifyContent: 'center' }}>
              <a href={link} target="_blank" rel="noreferrer" className="btn small" style={{ textDecoration: 'none' }}>
                เปิดทดสอบในแท็บใหม่ ↗
              </a>
            </div>
          </>
        ) : (
          <div className="alert warn small">ห้องเรียนนี้ยังไม่มีรหัสแชร์ (กรุณาตรวจสอบห้องเรียน)</div>
        )}
      </div>
    </Modal>
  );
}

/** The teacher's view of one Space's posts: everything posted (including posts still awaiting
 *  approval), a "เพิ่มงาน" FAB to add their own, approve/delete controls. A full page (not a
 *  dialog) since it's a whole scrolling feed, not a short form — matches how e.g. a section's own
 *  detail page ("/sections/:id") works elsewhere in this app rather than popping up in a modal. */
export function SpacePostsPage({ id }: { id: number }) {
  const toast = useToast();
  const spaceLoad = useLoad(() => get<SpaceSummary>(`/api/spaces/${id}`), `space-${id}`);
  const load = useLoad(() => get<{ posts: SpacePost[] }>(`/api/spaces/${id}/posts`), `space-posts-${id}`);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [showAddWork, setShowAddWork] = useState(false);
  const [showShare, setShowShare] = useState(false);
  const [editingPost, setEditingPost] = useState<SpacePost | null>(null);

  if (spaceLoad.loading && !spaceLoad.data) return <Loading />;
  if (spaceLoad.error) return <ErrorBox message={spaceLoad.error} onRetry={spaceLoad.reload} />;
  const src = spaceLoad.data!;

  async function submitWork({ topic, content, link, files }: { topic: string; content: string; link: string; files: File[] }) {
    if (files.length > 0) {
      const blobs = await Promise.all(files.map((f) => preparePostImage(f)));
      const form = new FormData();
      form.append('topic', topic);
      form.append('content', content);
      blobs.forEach((blob, i) => form.append('file', blob, `page-${i}.jpg`));
      await postForm(`/api/spaces/${id}/posts-image`, form);
    } else {
      await post(`/api/spaces/${id}/posts`, { topic, content, external_url: link });
    }
    setShowAddWork(false);
    await load.reload();
    toast('เพิ่มงานแล้ว');
  }

  async function remove(postId: number) {
    if (!window.confirm('ลบโพสต์นี้?')) return;
    setBusyId(postId);
    try {
      await del(`/api/spaces/${id}/posts/${postId}`);
      await load.reload();
      toast('ลบโพสต์แล้ว');
    } catch (err) {
      toast((err as Error).message);
    } finally {
      setBusyId(null);
    }
  }

  async function approve(postId: number) {
    setBusyId(postId);
    try {
      await post(`/api/spaces/${id}/posts/${postId}/approve`);
      await load.reload();
      toast('อนุมัติแล้ว');
    } catch (err) {
      toast((err as Error).message);
    } finally {
      setBusyId(null);
    }
  }

  async function saveEdit(data: EditWorkSubmitData) {
    if (!editingPost) return;
    if (data.manifest) {
      const blobs = await Promise.all((data.files ?? []).map((f) => preparePostImage(f)));
      const form = new FormData();
      form.append('topic', data.topic);
      form.append('content', data.content);
      if (data.external_url) form.append('external_url', data.external_url);
      form.append('media_manifest', JSON.stringify(data.manifest));
      blobs.forEach((blob, i) => form.append('file', blob, `page-${i}.jpg`));
      await patchForm(`/api/spaces/${id}/posts/${editingPost.id}`, form);
    } else {
      await patch(`/api/spaces/${id}/posts/${editingPost.id}`, {
        topic: data.topic,
        content: data.content,
        external_url: data.external_url,
      });
    }
    setEditingPost(null);
    await load.reload();
    toast('บันทึกการแก้ไขแล้ว');
  }

  async function changeColor(postId: number, color: PostColor | null) {
    try {
      await patch(`/api/spaces/${id}/posts/${postId}/color`, { color });
      await load.reload();
    } catch (err) {
      toast((err as Error).message);
    }
  }

  async function sharePost(p: SpacePost) {
    if (!src.share_token) {
      toast('ห้องเรียนนี้ยังไม่มีรหัสแชร์');
      return;
    }
    const url = `${window.location.origin}/s/${src.share_token}/book/${p.id}`;
    try {
      await navigator.clipboard.writeText(url);
      toast('คัดลอกลิงก์หนังสือแล้ว');
    } catch {
      toast('คัดลอกไม่สำเร็จ กรุณาคัดลอกด้วยตนเอง');
    }
  }

  return (
    <div className="stack">
      <div className="row between" style={{ alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <p className="small"><Link href="/space" style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 4 }}><Icon name="back" size={16} />Space ทั้งหมด</Link></p>
          <h1 style={{ margin: 0 }}>{src.title}</h1>
          <p className="muted small" style={{ margin: '4px 0 0' }}>{sectionLabel(src)} · {KIND_LABEL[src.kind]}</p>
        </div>
        {src.share_token && (
          <button type="button" className="btn small" onClick={() => setShowShare(true)} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <Icon name="link" size={16} /> แชร์
          </button>
        )}
      </div>
      {load.loading && !load.data && <Loading />}
      {load.error && <ErrorBox message={load.error} onRetry={load.reload} />}
      {load.data && load.data.posts.length === 0 && <div className="empty"><span>✦</span><h2>ยังไม่มีผลงาน</h2><p className="muted small">ผลงานชิ้นแรกจะปรากฏตรงนี้</p></div>}
      <div className="post-grid">
        {load.data?.posts.map((p) => (
          <article key={p.id} className={`card stack${p.color ? ' has-color' : ''}`} style={p.color ? { background: POST_COLOR_HEX[p.color] } : undefined}>
            <div className="row between">
              <div>
                <strong>{p.is_teacher ? `ครู ${p.author_name}` : p.author_name}</strong>
                <div className="muted small">{formatRelativeTimeTH(p.created_at)}</div>
              </div>
              <div className="row" style={{ gap: 6 }}>
                {p.pending && <button type="button" className="btn small primary" disabled={busyId === p.id} onClick={() => approve(p.id)}>อนุมัติ</button>}
                <PostKebabMenu color={p.color} onEdit={() => setEditingPost(p)} onColorChange={(color) => changeColor(p.id, color)} onDelete={() => remove(p.id)} onShare={() => sharePost(p)} />
              </div>
            </div>
            {p.topic && <strong style={{ display: 'block' }}>{p.topic}</strong>}
            {p.external_url && (
              <p style={{ margin: 0 }}>
                <a href={p.external_url} target="_blank" rel="noreferrer noopener">{p.external_url}</a>
              </p>
            )}
            {src.kind === 'book'
              ? <BookPages images={p.images} title={p.topic} />
              : p.images.map((img) => (
                  <img key={img.id} src={img.url} alt="" style={{ maxWidth: '100%', borderRadius: 12, display: 'block' }} loading="lazy" />
                ))}
            {p.content && <p style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{p.content}</p>}
            {p.pending && <span className="badge">รอตรวจ ยังไม่แสดงให้เพื่อนเห็น</span>}
            {Object.keys(p.reactions.counts).length > 0 && (
              <div className="row small muted" style={{ gap: 8 }}>
                {Object.entries(p.reactions.counts).map(([kind, n]) => (
                  <span key={kind}>{REACTION_EMOJI[kind] ?? kind} {n}</span>
                ))}
              </div>
            )}
            <TeacherComments spaceId={id} post={p} />
          </article>
        ))}
      </div>
      <button type="button" className="fab-add-button" onClick={() => setShowAddWork(true)} disabled={src.status !== 'open'} aria-label="เพิ่มงาน">+</button>
      {showAddWork && <TeacherAddWorkModal kind={src.kind} onClose={() => setShowAddWork(false)} onSubmit={submitWork} />}
      {editingPost && (
        <EditWorkModal
          initial={{
            topic: editingPost.topic,
            content: editingPost.content ?? '',
            external_url: editingPost.external_url,
            images: editingPost.images,
          }}
          kind={src.kind}
          onClose={() => setEditingPost(null)}
          onSubmit={saveEdit}
        />
      )}
      {showShare && <ShareSpaceModal space={src} onClose={() => setShowShare(false)} />}
    </div>
  );
}

/** The trash: Spaces the teacher moved out of the active list. Restore brings one back exactly as
 *  it was; purge is permanent (posts, comments, photos and all) and only reachable from here. */
function TrashModal({ onClose, onChanged }: { onClose: () => void; onChanged: () => void }) {
  const toast = useToast();
  const load = useLoad(() => get<{ spaces: SpaceSummary[] }>('/api/spaces/trash'), 'space-trash');
  const [busyId, setBusyId] = useState<number | null>(null);

  async function restore(id: number) {
    setBusyId(id);
    try {
      await post(`/api/spaces/${id}/restore`);
      await load.reload();
      onChanged();
      toast('กู้คืนแล้ว');
    } catch (err) {
      toast((err as Error).message);
    } finally {
      setBusyId(null);
    }
  }

  async function purge(id: number, title: string) {
    if (!window.confirm(`ลบ "${title}" ถาวรเลยหรือไม่? โพสต์ ความคิดเห็น และรูปทั้งหมดจะหายไปกู้คืนไม่ได้อีก`)) return;
    setBusyId(id);
    try {
      await del(`/api/spaces/${id}/purge`);
      await load.reload();
      toast('ลบถาวรแล้ว');
    } catch (err) {
      toast((err as Error).message);
    } finally {
      setBusyId(null);
    }
  }

  return (
    <Modal title="ถังขยะ" onClose={onClose}>
      <div className="stack">
        {load.loading && !load.data && <Loading />}
        {load.error && <ErrorBox message={load.error} onRetry={load.reload} />}
        {load.data && load.data.spaces.length === 0 && <div className="empty">ถังขยะว่างเปล่า</div>}
        {load.data?.spaces.map((s) => (
          <div key={s.id} className="card row between">
            <div>
              <strong>{s.title}</strong>
              <p className="muted small" style={{ margin: 0 }}>{sectionLabel(s)}</p>
            </div>
            <div className="row" style={{ gap: 6 }}>
              <button type="button" className="btn small" disabled={busyId === s.id} onClick={() => restore(s.id)}>กู้คืน</button>
              <button type="button" className="btn small danger" disabled={busyId === s.id} onClick={() => purge(s.id, s.title)}>ลบถาวร</button>
            </div>
          </div>
        ))}
      </div>
    </Modal>
  );
}

export function SpacePage() {
  const toast = useToast();
  const [, setLocation] = useLocation();
  const { me } = useSession();
  const [greetingMessage] = useState(() => GREETINGS[Math.floor(Math.random() * GREETINGS.length)]);

  const [filter, setFilter] = useState<{ type: 'recent' | 'mine' | 'bookmarks' | 'trash' | 'folder'; folderId?: string }>({ type: 'recent' });
  const [searchQuery, setSearchQuery] = useState('');

  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<SpaceSummary | null>(null);
  const [openCardMenuId, setOpenCardMenuId] = useState<number | null>(null);
  const [folderPickerSpaceId, setFolderPickerSpaceId] = useState<number | null>(null);

  // Folders & Folder Map from localStorage
  const [folders, setFolders] = useState<SpaceFolder[]>(loadStoredFolders);
  const [folderMap, setFolderMap] = useState<Record<string, string[]>>(loadStoredFolderMap);
  const [showAddFolderInput, setShowAddFolderInput] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [renamingFolderId, setRenamingFolderId] = useState<string | null>(null);
  const [renameFolderInput, setRenameFolderInput] = useState('');
  const [openFolderMenuId, setOpenFolderMenuId] = useState<string | null>(null);

  const spacesLoad = useLoad(() => get<{ spaces: SpaceSummary[] }>('/api/spaces'), 'spaces');
  const trashLoad = useLoad(() => get<{ spaces: SpaceSummary[] }>('/api/spaces/trash'), 'spaces-trash');
  const sectionsLoad = useLoad(() => get<{ sections: SectionOption[] }>('/api/sections'), 'sections');

  const selectFilter = useCallback(
    (next: { type: 'recent' | 'mine' | 'bookmarks' | 'trash' | 'folder'; folderId?: string }) => {
      setFilter(next);
      setOpenCardMenuId(null);
      setFolderPickerSpaceId(null);
      if (next.type === 'trash') {
        trashLoad.reload();
      }
    },
    [trashLoad],
  );

  const teacherName = me?.display_name || me?.username || 'sailor111';
  const spaces = spacesLoad.data?.spaces ?? [];
  const trashedSpaces = trashLoad.data?.spaces ?? [];
  const sections = sectionsLoad.data?.sections ?? [];

  async function toggleBookmark(s: SpaceSummary) {
    try {
      await patch(`/api/spaces/${s.id}`, { is_bookmarked: !s.is_bookmarked });
      await spacesLoad.reload();
    } catch (err) {
      toast((err as Error).message);
    }
  }

  async function trashSpace(s: SpaceSummary) {
    if (!window.confirm(`ย้าย "${s.title}" ไปถังขยะ? กู้คืนได้ภายหลังจากถังขยะ`)) return;
    try {
      await post(`/api/spaces/${s.id}/trash`);
      await spacesLoad.reload();
      toast('ย้ายไปถังขยะแล้ว');
    } catch (err) {
      toast((err as Error).message);
    }
  }

  async function restoreSpace(id: number) {
    try {
      await post(`/api/spaces/${id}/restore`);
      await trashLoad.reload();
      await spacesLoad.reload();
      toast('กู้คืนแล้ว');
    } catch (err) {
      toast((err as Error).message);
    }
  }

  async function purgeSpace(id: number, title: string) {
    if (!window.confirm(`ลบ "${title}" ถาวรเลยหรือไม่? โพสต์ ความคิดเห็น และรูปทั้งหมดจะหายไปกู้คืนไม่ได้อีก`)) return;
    try {
      await del(`/api/spaces/${id}/purge`);
      await trashLoad.reload();
      toast('ลบถาวรแล้ว');
    } catch (err) {
      toast((err as Error).message);
    }
  }

  async function cloneSpace(s: SpaceSummary) {
    try {
      await post(`/api/spaces/${s.id}/clone`, {});
      await spacesLoad.reload();
      toast('โคลนนิ่งพื้นที่แล้ว');
    } catch (err) {
      toast((err as Error).message);
    }
  }

  async function copyLink(s: SpaceSummary) {
    if (!s.share_token) {
      toast('ยังไม่มีรหัสแชร์สำหรับห้องนี้');
      return;
    }
    const url = `${window.location.origin}/space-student?token=${s.share_token}`;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(url);
      } else {
        const t = document.createElement('textarea');
        t.value = url;
        document.body.appendChild(t);
        t.select();
        document.execCommand('copy');
        document.body.removeChild(t);
      }
      toast('คัดลอกลิงก์แล้ว ✓');
    } catch {
      toast('คัดลอกลิงก์ไม่สำเร็จ');
    }
  }

  function submitCreateFolder(e: FormEvent) {
    e.preventDefault();
    const name = newFolderName.trim();
    if (!name) return;
    const newFolder: SpaceFolder = { id: `folder_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`, name };
    const updated = [...folders, newFolder];
    setFolders(updated);
    saveStoredFolders(updated);
    setNewFolderName('');
    setShowAddFolderInput(false);
    toast('เพิ่มโฟลเดอร์แล้ว');
  }

  function submitRenameFolder(e: FormEvent, folderId: string) {
    e.preventDefault();
    const name = renameFolderInput.trim();
    if (!name) return;
    const updated = folders.map((f) => (f.id === folderId ? { ...f, name } : f));
    setFolders(updated);
    saveStoredFolders(updated);
    setRenamingFolderId(null);
    setRenameFolderInput('');
    toast('เปลี่ยนชื่อโฟลเดอร์แล้ว');
  }

  function handleDeleteFolder(folderId: string) {
    if (!window.confirm('ต้องการลบโฟลเดอร์นี้ใช่หรือไม่? (พื้นที่ภายในจะไม่ถูกลบ)')) return;
    const updated = folders.filter((f) => f.id !== folderId);
    setFolders(updated);
    saveStoredFolders(updated);
    const nextMap = { ...folderMap };
    for (const spaceId in nextMap) {
      nextMap[spaceId] = nextMap[spaceId].filter((id) => id !== folderId);
    }
    setFolderMap(nextMap);
    saveStoredFolderMap(nextMap);
    if (filter.type === 'folder' && filter.folderId === folderId) {
      setFilter({ type: 'recent' });
    }
    setOpenFolderMenuId(null);
    toast('ลบโฟลเดอร์แล้ว');
  }

  function toggleSpaceFolder(spaceId: number, folderId: string) {
    const current = folderMap[spaceId] ?? [];
    const next = current.includes(folderId) ? current.filter((id) => id !== folderId) : [...current, folderId];
    const nextMap = { ...folderMap, [spaceId]: next };
    setFolderMap(nextMap);
    saveStoredFolderMap(nextMap);
  }

  if ((spacesLoad.loading && !spacesLoad.data) || (sectionsLoad.loading && !sectionsLoad.data)) return <Loading />;
  if (spacesLoad.error) return <ErrorBox message={spacesLoad.error} onRetry={spacesLoad.reload} />;
  if (sectionsLoad.error) return <ErrorBox message={sectionsLoad.error} onRetry={sectionsLoad.reload} />;

  const sourceSpaces = filter.type === 'trash' ? trashedSpaces : spaces;
  const scopedSpaces =
    filter.type === 'bookmarks'
      ? sourceSpaces.filter((s) => s.is_bookmarked)
      : filter.type === 'folder'
        ? sourceSpaces.filter((s) => (folderMap[s.id] ?? []).includes(filter.folderId ?? ''))
        : sourceSpaces;

  const query = searchQuery.trim().toLowerCase();
  const visibleSpaces = query
    ? scopedSpaces.filter((s) => s.title.toLowerCase().includes(query) || sectionLabel(s).toLowerCase().includes(query))
    : scopedSpaces;

  const filterTitle =
    filter.type === 'recent'
      ? 'ล่าสุด'
      : filter.type === 'mine'
        ? 'สร้างโดยฉัน'
        : filter.type === 'bookmarks'
          ? 'ปักหมุด'
          : filter.type === 'trash'
            ? 'ถังขยะ'
            : (folders.find((f) => f.id === filter.folderId)?.name ?? 'โฟลเดอร์');

  return (
    <div className="teacher-layout">
      {/* Sidebar Navigation */}
      <aside>
        <nav className="dashboard-nav">
          <button
            className={filter.type === 'recent' ? 'dashboard-nav-item active' : 'dashboard-nav-item'}
            type="button"
            onClick={() => selectFilter({ type: 'recent' })}
          >
            <Icon name="clock" size={18} />
            <span>ล่าสุด</span>
          </button>
          <button
            className={filter.type === 'mine' ? 'dashboard-nav-item active' : 'dashboard-nav-item'}
            type="button"
            onClick={() => selectFilter({ type: 'mine' })}
          >
            <Icon name="user" size={18} />
            <span>สร้างโดยฉัน</span>
          </button>
          <button
            className={filter.type === 'bookmarks' ? 'dashboard-nav-item active' : 'dashboard-nav-item'}
            type="button"
            onClick={() => selectFilter({ type: 'bookmarks' })}
          >
            <Icon name="pin" size={18} />
            <span>ปักหมุด</span>
          </button>
          <button
            className={filter.type === 'trash' ? 'dashboard-nav-item active' : 'dashboard-nav-item'}
            type="button"
            onClick={() => selectFilter({ type: 'trash' })}
          >
            <Icon name="trash" size={18} />
            <span>ถังขยะ</span>
          </button>
        </nav>

        <div className="folder-section">
          <div className="folder-section-header">
            <h2>โฟลเดอร์</h2>
          </div>
          {folders.map((folder) => {
            const isSelected = filter.type === 'folder' && filter.folderId === folder.id;
            const count = spaces.filter((s) => (folderMap[s.id] ?? []).includes(folder.id)).length;
            return (
              <div key={folder.id} className={isSelected ? 'folder-item active' : 'folder-item'}>
                {renamingFolderId === folder.id ? (
                  <form className="folder-rename-form" onSubmit={(e) => submitRenameFolder(e, folder.id)}>
                    <input
                      value={renameFolderInput}
                      onChange={(e) => setRenameFolderInput(e.target.value)}
                      maxLength={60}
                      autoFocus
                    />
                    <button type="submit" disabled={!renameFolderInput.trim()} aria-label="บันทึก">✓</button>
                    <button type="button" onClick={() => setRenamingFolderId(null)} aria-label="ยกเลิก">✕</button>
                  </form>
                ) : (
                  <>
                    <button
                      type="button"
                      className="folder-select"
                      onClick={() => selectFilter({ type: 'folder', folderId: folder.id })}
                    >
                      <Icon name="folder" size={16} />
                      <span className="folder-select-name">{folder.name}</span>
                      <span className="folder-select-count">{count}</span>
                    </button>
                    <span className="folder-menu-anchor">
                      <button
                        type="button"
                        className="folder-kebab"
                        onClick={() => setOpenFolderMenuId(openFolderMenuId === folder.id ? null : folder.id)}
                        aria-label={`เมนูโฟลเดอร์ ${folder.name}`}
                      >
                        ⋮
                      </button>
                      {openFolderMenuId === folder.id && (
                        <>
                          <div className="menu-backdrop" role="presentation" onClick={() => setOpenFolderMenuId(null)} />
                          <div className="card-menu folder-menu" role="menu">
                            <button
                              className="card-menu-item"
                              type="button"
                              onClick={() => {
                                setRenameFolderInput(folder.name);
                                setRenamingFolderId(folder.id);
                                setOpenFolderMenuId(null);
                              }}
                            >
                              <span>เปลี่ยนชื่อ</span>
                            </button>
                            <button
                              className="card-menu-item danger"
                              type="button"
                              onClick={() => handleDeleteFolder(folder.id)}
                            >
                              <span>ลบโฟลเดอร์</span>
                            </button>
                          </div>
                        </>
                      )}
                    </span>
                  </>
                )}
              </div>
            );
          })}
          {folders.length === 0 && !showAddFolderInput && <p className="folder-empty-hint">ยังไม่มีโฟลเดอร์</p>}

          {showAddFolderInput ? (
            <form className="folder-add-form" onSubmit={submitCreateFolder}>
              <input
                value={newFolderName}
                onChange={(e) => setNewFolderName(e.target.value)}
                maxLength={60}
                placeholder="ชื่อโฟลเดอร์"
                autoFocus
              />
              <button type="submit" disabled={!newFolderName.trim()} aria-label="บันทึกโฟลเดอร์">✓</button>
              <button type="button" onClick={() => setShowAddFolderInput(false)} aria-label="ยกเลิก">✕</button>
            </form>
          ) : (
            <button type="button" className="folder-add-trigger" onClick={() => setShowAddFolderInput(true)}>
              <span aria-hidden="true">+</span> เพิ่มโฟลเดอร์
            </button>
          )}
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="dashboard-main">
        <div className="dashboard-greeting">
          <h1>สวัสดี {teacherName}</h1>
          <p className="space-description">
            {greetingMessage}! สร้างพื้นที่ แล้วส่งลิงก์ให้นักเรียนเข้ามาโพสต์ผลงานได้ทันที
          </p>
        </div>

        <div className="dashboard-toolbar">
          <h2>{filterTitle}</h2>
          <input
            className="dashboard-search"
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="ค้นหาพื้นที่…"
          />
        </div>

        <div className="space-card-grid">
          {filter.type !== 'trash' && (
            <button
              className="space-card new-space-card"
              type="button"
              disabled={sections.length === 0}
              title={sections.length === 0 ? 'สร้างห้อง/วิชาในหน้า Nest ก่อน' : 'สร้างพื้นที่ใหม่'}
              onClick={() => setAdding(true)}
            >
              <span className="new-space-card-icon" aria-hidden="true">
                <span className="new-space-card-plus">+</span>
              </span>
              <span className="new-space-card-label">สร้างพื้นที่ใหม่</span>
            </button>
          )}

          {visibleSpaces.map((s) => (
            <article key={s.id} className="space-card">
              <div
                className="space-card-cover"
                role="button"
                tabIndex={0}
                style={{ background: COLOR_GRADIENT[s.color] || COLOR_GRADIENT.sky }}
                onClick={() => setLocation(`/space/${s.id}/posts`)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') setLocation(`/space/${s.id}/posts`);
                }}
                aria-label={`เปิด ${s.title}`}
              >
                {s.is_bookmarked && <span className="space-card-bookmark" aria-hidden="true">📌</span>}
              </div>
              <div className="space-card-body">
                <button
                  className="space-card-title"
                  type="button"
                  title={s.title}
                  onClick={() => setLocation(`/space/${s.id}/posts`)}
                >
                  {s.title}
                </button>
                <span className="space-card-menu-anchor">
                  <button
                    className="space-card-kebab"
                    type="button"
                    onClick={() => {
                      setOpenCardMenuId(openCardMenuId === s.id ? null : s.id);
                      setFolderPickerSpaceId(null);
                    }}
                    aria-haspopup="true"
                    aria-expanded={openCardMenuId === s.id}
                    aria-label="เมนูพื้นที่"
                  >
                    ⋮
                  </button>
                  {openCardMenuId === s.id && (
                    <>
                      <div
                        className="menu-backdrop"
                        role="presentation"
                        onClick={() => {
                          setOpenCardMenuId(null);
                          setFolderPickerSpaceId(null);
                        }}
                      />
                      <div className="card-menu" role="menu">
                        {filter.type !== 'trash' ? (
                          folderPickerSpaceId === s.id ? (
                            <>
                              <div className="card-menu-subheader">
                                <button
                                  type="button"
                                  className="card-menu-back"
                                  onClick={() => setFolderPickerSpaceId(null)}
                                  aria-label="ย้อนกลับ"
                                >
                                  <Icon name="back" size={14} />
                                </button>
                                <span>จัดเข้าแฟ้ม</span>
                              </div>
                              {folders.length === 0 && <p className="card-menu-empty">ยังไม่มีโฟลเดอร์</p>}
                              {folders.map((folder) => {
                                const inFolder = (folderMap[s.id] ?? []).includes(folder.id);
                                return (
                                  <button
                                    key={folder.id}
                                    type="button"
                                    className={inFolder ? 'folder-picker-option active' : 'folder-picker-option'}
                                    onClick={() => toggleSpaceFolder(s.id, folder.id)}
                                  >
                                    <Icon name="folder" size={15} />
                                    <span>{folder.name}</span>
                                    {inFolder && <span style={{ marginLeft: 'auto', fontSize: 13 }}>✓</span>}
                                  </button>
                                );
                              })}
                            </>
                          ) : (
                            <>
                              <button
                                className="card-menu-item"
                                type="button"
                                onClick={() => {
                                  setOpenCardMenuId(null);
                                  void toggleBookmark(s);
                                }}
                              >
                                <Icon name="pin" size={16} />
                                <span>{s.is_bookmarked ? 'เลิกปักหมุด' : 'ปักหมุด'}</span>
                              </button>
                              <button
                                className="card-menu-item"
                                type="button"
                                onClick={() => setFolderPickerSpaceId(s.id)}
                              >
                                <Icon name="folder" size={16} />
                                <span>จัดเข้าแฟ้ม</span>
                              </button>
                              <button
                                className="card-menu-item"
                                type="button"
                                onClick={() => {
                                  setOpenCardMenuId(null);
                                  void copyLink(s);
                                }}
                              >
                                <Icon name="link" size={16} />
                                <span>แชร์ (คัดลอกลิงก์)</span>
                              </button>
                              <button
                                className="card-menu-item"
                                type="button"
                                onClick={() => {
                                  setOpenCardMenuId(null);
                                  void cloneSpace(s);
                                }}
                              >
                                <Icon name="copy" size={16} />
                                <span>โคลนนิ่ง</span>
                              </button>
                              <button
                                className="card-menu-item"
                                type="button"
                                onClick={() => {
                                  setOpenCardMenuId(null);
                                  setEditing(s);
                                }}
                              >
                                <Icon name="settings" size={16} />
                                <span>ตั้งค่า</span>
                              </button>
                              <button
                                className="card-menu-item danger"
                                type="button"
                                onClick={() => {
                                  setOpenCardMenuId(null);
                                  void trashSpace(s);
                                }}
                              >
                                <Icon name="trash" size={16} />
                                <span>ย้ายไปถังขยะ</span>
                              </button>
                            </>
                          )
                        ) : (
                          <>
                            <button
                              className="card-menu-item"
                              type="button"
                              onClick={() => {
                                setOpenCardMenuId(null);
                                void restoreSpace(s.id);
                              }}
                            >
                              <span>↺ กู้คืน</span>
                            </button>
                            <button
                              className="card-menu-item danger"
                              type="button"
                              onClick={() => {
                                setOpenCardMenuId(null);
                                void purgeSpace(s.id, s.title);
                              }}
                            >
                              <Icon name="trash" size={16} />
                              <span>ลบถาวร</span>
                            </button>
                          </>
                        )}
                      </div>
                    </>
                  )}
                </span>
              </div>
            </article>
          ))}

          {visibleSpaces.length === 0 && (
            <div
              className="card empty"
              style={{
                gridColumn: '1 / -1',
                textAlign: 'center',
                padding: '48px 24px',
                background: 'var(--surface)',
                borderRadius: 'var(--radius)',
              }}
            >
              {filter.type === 'trash' ? (
                <>
                  <h2>ถังขยะว่างเปล่า</h2>
                  <p className="muted">ไม่มีพื้นที่ที่ถูกลบอยู่ในถังขยะ</p>
                </>
              ) : query ? (
                <>
                  <h2>ไม่พบพื้นที่ที่ค้นหา</h2>
                  <p className="muted">ลองค้นหาด้วยคำอื่น หรือล้างคำค้นหา</p>
                </>
              ) : (
                <>
                  <h2>ยังไม่มีพื้นที่ในหมวดนี้</h2>
                  <p className="muted">
                    {filter.type === 'bookmarks'
                      ? 'คุณยังไม่ได้ปักหมุดพื้นที่ใดๆ กดปุ่ม ⋮ บนการ์ด แล้วเลือก "ปักหมุด" เพื่อนำมาไว้ที่นี่'
                      : filter.type === 'folder'
                        ? 'ยังไม่มีพื้นที่ในโฟลเดอร์นี้ กดปุ่ม ⋮ บนการ์ด แล้วเลือก "จัดเข้าแฟ้ม"'
                        : 'เริ่มต้นสร้างพื้นที่แรกด้วยการกดปุ่ม "สร้างพื้นที่ใหม่" ด้านบน'}
                  </p>
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {adding && (
        <NewSpaceModal
          sections={sections}
          onClose={() => setAdding(false)}
          onDone={() => {
            spacesLoad.reload();
            setAdding(false);
            toast('สร้าง Space แล้ว');
          }}
        />
      )}
      {editing && (
        <EditSpaceModal
          src={editing}
          onClose={() => setEditing(null)}
          onDone={() => {
            spacesLoad.reload();
            setEditing(null);
            toast('บันทึกแล้ว');
          }}
        />
      )}
    </div>
  );
}
