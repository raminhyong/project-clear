import { useCallback, useEffect, useState, type ChangeEvent, type FormEvent } from 'react';
import { ApiError, post, postForm } from '../api.ts';
import { BookPages } from '../bookFlip.tsx';
import { Icon } from '../icons.tsx';
import { EditWorkModal, PostKebabMenu, POST_COLOR_HEX, type EditWorkSubmitData, type PostColor } from '../postCard.tsx';
import { preparePostImage } from '../spaceMedia.ts';
import { formatRelativeTimeTH } from '../time.ts';
import { Field, Loading, Modal, ReorderableImageSlots, useToast } from '../ui.tsx';

// The compose flow here is a close port of the real original CLEAR Space's own "เพิ่มงาน" (add
// work) modal — checked directly against its source rather than invented: a floating + button
// opens a modal with a required หัวข้อ (topic/title), an ภาพ/ลิงก์ (image/link) toggle for a
// 'blog' Space (never both at once — there's no plain-text-only post there, matching here too),
// or a multi-image picker up to BOOK_MAX_PAGES for a 'book' Space, and a required description.

const BOOK_MAX_PAGES = 15;

type ReactionKind = 'like' | 'love' | 'laugh' | 'wow' | 'sad';
const REACTIONS: { kind: ReactionKind; emoji: string; label: string }[] = [
  { kind: 'like', emoji: '👍', label: 'ถูกใจ' },
  { kind: 'love', emoji: '❤️', label: 'รักเลย' },
  { kind: 'laugh', emoji: '😂', label: 'ฮามาก' },
  { kind: 'wow', emoji: '😮', label: 'ว้าว' },
  { kind: 'sad', emoji: '😢', label: 'เศร้า' },
];

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
  is_mine: boolean;
  pending: boolean;
  topic: string;
  content: string | null;
  external_url: string | null;
  color: PostColor | null;
  images: SpacePostImage[];
  created_at: string;
  comments_count: number;
  reactions: { counts: Partial<Record<ReactionKind, number>>; mine: ReactionKind | null };
}
interface SpaceComment {
  id: number;
  author_name: string;
  is_teacher: boolean;
  is_mine: boolean;
  content: string | null;
  image: { url: string; width: number | null; height: number | null } | null;
  created_at: string;
}
type SpaceColor = 'brand' | 'amber' | 'sky' | 'rose' | 'violet' | 'slate';
const COLOR_HEX: Record<SpaceColor, string> = { brand: '#0e9f7a', amber: '#f59e0b', sky: '#0ea5e9', rose: '#f43f5e', violet: '#8b5cf6', slate: '#64748b' };

interface SpaceInfo {
  id: number;
  title: string;
  description: string;
  kind: 'blog' | 'book';
  status: 'draft' | 'open' | 'frozen' | 'archived';
  color: SpaceColor;
}

/** The reaction row under a post: five emoji, each showing its count when >0, mine highlighted. */
function ReactionBar({ post, onReact }: { post: SpacePost; onReact: (kind: ReactionKind) => void }) {
  return (
    <div className="row" style={{ gap: 4, flexWrap: 'wrap' }}>
      {REACTIONS.map((r) => {
        const n = post.reactions.counts[r.kind] ?? 0;
        const mine = post.reactions.mine === r.kind;
        return (
          <button
            key={r.kind}
            type="button"
            className={`btn small${mine ? ' primary' : ''}`}
            title={r.label}
            onClick={() => onReact(r.kind)}
          >
            {r.emoji} {n > 0 ? n : ''}
          </button>
        );
      })}
    </div>
  );
}

/** A post's comment thread: lazy-loaded on expand, with its own add-comment form (text or photo). */
function CommentsSection({
  post,
  canWrite,
  comments,
  loading,
  onLoad,
  onSubmit,
  onDelete,
}: {
  post: SpacePost;
  canWrite: boolean;
  comments: SpaceComment[] | undefined;
  loading: boolean;
  onLoad: () => void;
  onSubmit: (content: string, file: File | null) => Promise<void>;
  onDelete: (commentId: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const [content, setContent] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);

  function toggle() {
    const next = !open;
    setOpen(next);
    if (next && comments === undefined) onLoad();
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!content.trim() && !file) return;
    setBusy(true);
    try {
      await onSubmit(content.trim(), file);
      setContent('');
      setFile(null);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <button type="button" className="btn small" onClick={toggle}>
        ความคิดเห็น{post.comments_count > 0 ? ` (${post.comments_count})` : ''}
      </button>
      {open && (
        <div className="stack" style={{ marginTop: 8, paddingLeft: 12, borderLeft: '2px solid var(--border, #e5e5e5)' }}>
          {loading && <Loading />}
          {comments?.length === 0 && <p className="muted small" style={{ margin: 0 }}>ยังไม่มีความคิดเห็น</p>}
          {comments?.map((cm) => (
            <div key={cm.id} className="stack" style={{ gap: 2 }}>
              <div className="row between">
                <strong className="small">{cm.is_teacher ? `ครู ${cm.author_name}` : cm.author_name}</strong>
                {cm.is_mine && <button type="button" className="btn small danger" onClick={() => onDelete(cm.id)}>ลบ</button>}
              </div>
              {cm.content && <p className="small" style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{cm.content}</p>}
              {cm.image && <img src={cm.image.url} alt="" style={{ maxWidth: 200, borderRadius: 8, display: 'block' }} loading="lazy" />}
              <span className="muted small">{formatRelativeTimeTH(cm.created_at)}</span>
            </div>
          ))}
          {canWrite && (
            <form className="row" style={{ gap: 6 }} onSubmit={submit}>
              <input value={content} onChange={(e) => setContent(e.target.value)} placeholder="แสดงความคิดเห็น..." style={{ flex: 1 }} />
              <label className="btn small" style={{ cursor: 'pointer' }}>
                📷
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  style={{ display: 'none' }}
                  onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                />
              </label>
              <button className="btn small primary" disabled={busy}>ส่ง</button>
            </form>
          )}
          {file && <p className="muted small" style={{ margin: 0 }}>แนบรูป: {file.name}</p>}
        </div>
      )}
    </div>
  );
}

/** One post's full body — header, topic, link/images, description, pending badge, reactions and
 *  comments — in the same order as the original's PostCard. A 'book' kind post shows its pages as
 *  a thumbnail stack that opens the real page-flip reader, matching the original's own post-detail
 *  behavior, instead of listing every page image inline. */
function PostBody({
  post: p,
  kind,
  canInteract,
  canManage,
  comments,
  loading,
  onLoadComments,
  onSubmitComment,
  onDeleteComment,
  onDelete,
  onEdit,
  onColorChange,
  onReact,
  onShare,
}: {
  post: SpacePost;
  kind: 'blog' | 'book';
  canInteract: boolean;
  canManage: boolean;
  comments: SpaceComment[] | undefined;
  loading: boolean;
  onLoadComments: () => void;
  onSubmitComment: (content: string, file: File | null) => Promise<void>;
  onDeleteComment: (commentId: number) => void;
  onDelete: () => void;
  onEdit: () => void;
  onColorChange: (color: PostColor | null) => void;
  onReact: (kind: ReactionKind) => void;
  onShare: () => void;
}) {
  return (
    <div className="stack">
      <div className="row between">
        <div>
          <strong>{p.is_teacher ? `ครู ${p.author_name}` : p.author_name}</strong>
          <div className="muted small">{formatRelativeTimeTH(p.created_at)}</div>
        </div>
        <PostKebabMenu color={p.color} canManage={canManage} onEdit={onEdit} onColorChange={onColorChange} onDelete={onDelete} onShare={onShare} />
      </div>
      {p.topic && <strong style={{ display: 'block' }}>{p.topic}</strong>}
      {p.external_url && (
        <p style={{ margin: 0 }}>
          <a href={p.external_url} target="_blank" rel="noreferrer noopener">{p.external_url}</a>
        </p>
      )}
      {kind === 'book'
        ? <BookPages images={p.images} title={p.topic} />
        : p.images.map((img) => <img key={img.id} src={img.url} alt="" style={{ maxWidth: '100%', borderRadius: 12, display: 'block' }} loading="lazy" />)}
      {p.content && <p style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{p.content}</p>}
      {p.pending && <span className="badge">รอครูตรวจ เพื่อนยังไม่เห็น</span>}
      <ReactionBar post={p} onReact={(kind) => canInteract && onReact(kind)} />
      <CommentsSection post={p} canWrite={canInteract} comments={comments} loading={loading} onLoad={onLoadComments} onSubmit={onSubmitComment} onDelete={onDeleteComment} />
    </div>
  );
}

/** The "เพิ่มงานของฉัน" modal — a close port of the original's add-work form. */
function AddWorkModal({
  kind,
  onClose,
  onSubmit,
}: {
  kind: 'blog' | 'book';
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
      setError((err as ApiError).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title="เพิ่มงานของฉัน" onClose={handleClose}>
      <form className="stack" onSubmit={submit}>
        <Field label="หัวข้อ"><input value={topic} onChange={(e) => setTopic(e.target.value)} maxLength={200} placeholder="เช่น ภาพวาดสัตว์เลี้ยงของฉัน" disabled={busy} autoFocus required /></Field>

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

/** The Wall: a student reads every published post in a Space and, while it's open, can post their own. */
export function SpaceStudentPage({ token, code, spaceId }: { token: string; code: string; spaceId: number }) {
  const toast = useToast();
  const [space, setSpace] = useState<SpaceInfo | null>(null);
  const [posts, setPosts] = useState<SpacePost[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [showAddWork, setShowAddWork] = useState(false);
  const [comments, setComments] = useState<Record<number, SpaceComment[]>>({});
  const [commentsLoading, setCommentsLoading] = useState<Record<number, boolean>>({});
  // Held only in this tab's memory, never persisted: proves "I just posted this, this tab
  // session" so a student can edit/recolor/delete their own post only until they close the tab —
  // see migration 15's note on space_posts.edit_token_hash for why.
  const [ownEditTokens, setOwnEditTokens] = useState<Record<number, string>>({});
  const [editingPost, setEditingPost] = useState<SpacePost | null>(null);

  async function load() {
    try {
      const r = await post<{ space: SpaceInfo; posts: SpacePost[] }>('/api/public/space/feed', { token, student_code: code, space_id: spaceId });
      setSpace(r.space);
      setPosts(r.posts);
      setLoadError(null);
    } catch (e) {
      setLoadError((e as ApiError).message);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spaceId]);

  async function submitWork({ topic, content, link, files }: { topic: string; content: string; link: string; files: File[] }) {
    let pending = false;
    let id = 0;
    let editToken = '';
    if (files.length > 0) {
      const blobs = await Promise.all(files.map((f) => preparePostImage(f)));
      const form = new FormData();
      form.append('token', token);
      form.append('student_code', code);
      form.append('space_id', String(spaceId));
      form.append('topic', topic);
      form.append('content', content);
      blobs.forEach((blob, i) => form.append('file', blob, `page-${i}.jpg`));
      const r = await postForm<{ id: number; pending: boolean; edit_token: string }>('/api/public/space/post-image', form);
      pending = r.pending;
      id = r.id;
      editToken = r.edit_token;
    } else {
      const r = await post<{ id: number; pending: boolean; edit_token: string }>('/api/public/space/post', { token, student_code: code, space_id: spaceId, topic, content, external_url: link });
      pending = r.pending;
      id = r.id;
      editToken = r.edit_token;
    }
    setOwnEditTokens((prev) => ({ ...prev, [id]: editToken }));
    setShowAddWork(false);
    await load();
    toast(pending ? 'ส่งแล้ว รอครูตรวจก่อนเผยแพร่ให้เพื่อนเห็น' : 'เพิ่มงานแล้ว');
  }

  async function remove(id: number) {
    const editToken = ownEditTokens[id];
    if (!editToken) return;
    if (!window.confirm('ลบโพสต์นี้?')) return;
    try {
      await post(`/api/public/space/post/${id}/delete`, { token, student_code: code, edit_token: editToken });
      await load();
    } catch (err) {
      toast((err as ApiError).message);
    }
  }

  async function saveEdit(data: EditWorkSubmitData) {
    if (!editingPost) return;
    const editToken = ownEditTokens[editingPost.id];
    if (!editToken) return;
    if (data.manifest) {
      const blobs = await Promise.all((data.files ?? []).map((f) => preparePostImage(f)));
      const form = new FormData();
      form.append('token', token);
      form.append('student_code', code);
      form.append('edit_token', editToken);
      form.append('topic', data.topic);
      form.append('content', data.content);
      if (data.external_url) form.append('external_url', data.external_url);
      form.append('media_manifest', JSON.stringify(data.manifest));
      blobs.forEach((blob, i) => form.append('file', blob, `page-${i}.jpg`));
      await postForm(`/api/public/space/post/${editingPost.id}/edit`, form);
    } else {
      await post(`/api/public/space/post/${editingPost.id}/edit`, {
        token,
        student_code: code,
        edit_token: editToken,
        topic: data.topic,
        content: data.content,
        external_url: data.external_url,
      });
    }
    setEditingPost(null);
    await load();
    toast('บันทึกการแก้ไขแล้ว');
  }

  async function changeColor(postId: number, color: PostColor | null) {
    const editToken = ownEditTokens[postId];
    if (!editToken) return;
    try {
      await post(`/api/public/space/post/${postId}/color`, { token, student_code: code, edit_token: editToken, color });
      await load();
    } catch (err) {
      toast((err as ApiError).message);
    }
  }

  async function sharePost(p: SpacePost) {
    const url = `${window.location.origin}/s/${token}/book/${p.id}`;
    try {
      await navigator.clipboard.writeText(url);
      toast('คัดลอกลิงก์หนังสือแล้ว');
    } catch {
      toast('คัดลอกไม่สำเร็จ กรุณาคัดลอกด้วยตนเอง');
    }
  }

  async function react(postId: number, kind: ReactionKind) {
    try {
      await post(`/api/public/space/post/${postId}/react`, { token, student_code: code, kind });
      await load();
    } catch (err) {
      toast((err as ApiError).message);
    }
  }

  async function loadComments(postId: number) {
    setCommentsLoading((prev) => ({ ...prev, [postId]: true }));
    try {
      const r = await post<{ comments: SpaceComment[] }>(`/api/public/space/post/${postId}/comments`, { token, student_code: code });
      setComments((prev) => ({ ...prev, [postId]: r.comments }));
    } catch (err) {
      toast((err as ApiError).message);
    } finally {
      setCommentsLoading((prev) => ({ ...prev, [postId]: false }));
    }
  }

  async function submitComment(postId: number, text: string, commentFile: File | null) {
    try {
      if (commentFile) {
        const blob = await preparePostImage(commentFile);
        const form = new FormData();
        form.append('token', token);
        form.append('student_code', code);
        if (text) form.append('content', text);
        form.append('file', blob, 'comment.jpg');
        await postForm(`/api/public/space/post/${postId}/comment-image`, form);
      } else {
        await post(`/api/public/space/post/${postId}/comment`, { token, student_code: code, content: text });
      }
      await loadComments(postId);
      await load();
    } catch (err) {
      toast((err as ApiError).message);
    }
  }

  async function removeComment(postId: number, commentId: number) {
    if (!window.confirm('ลบความคิดเห็นนี้?')) return;
    try {
      await post(`/api/public/space/comment/${commentId}/delete`, { token, student_code: code });
      await loadComments(postId);
      await load();
    } catch (err) {
      toast((err as ApiError).message);
    }
  }

  if (!space && !loadError) return <Loading />;
  if (loadError && !space) return <div className="alert" role="alert">{loadError}</div>;
  const sp = space!;
  const canInteract = sp.status === 'open';

  return (
    <div className="stack">
      <div style={{ borderLeft: `4px solid ${COLOR_HEX[sp.color]}`, paddingLeft: 12 }}>
        <h1 style={{ margin: 0 }}>{sp.title}</h1>
        {sp.description && <p className="muted small" style={{ margin: '4px 0 0' }}>{sp.description}</p>}
      </div>

      {sp.status === 'frozen' && <div className="alert warn">ครูปิดรับงานชิ้นนี้ชั่วคราว ยังดูผลงานเพื่อนได้อยู่</div>}

      {posts && posts.length === 0 && <div className="empty"><span>✦</span><h2>ยังไม่มีผลงาน</h2><p className="muted small">ผลงานชิ้นแรกจะปรากฏตรงนี้</p></div>}
      <div className="post-grid">
        {posts?.map((p) => (
          <article key={p.id} className={`card stack${p.color ? ' has-color' : ''}`} style={p.color ? { background: POST_COLOR_HEX[p.color] } : undefined}>
            <PostBody
              post={p}
              kind={sp.kind}
              canInteract={canInteract}
              canManage={!!ownEditTokens[p.id]}
              comments={comments[p.id]}
              loading={!!commentsLoading[p.id]}
              onLoadComments={() => loadComments(p.id)}
              onSubmitComment={(text, cf) => submitComment(p.id, text, cf)}
              onDeleteComment={(commentId) => removeComment(p.id, commentId)}
              onDelete={() => remove(p.id)}
              onEdit={() => setEditingPost(p)}
              onColorChange={(color) => changeColor(p.id, color)}
              onReact={(kind) => react(p.id, kind)}
              onShare={() => sharePost(p)}
            />
          </article>
        ))}
      </div>

      <button type="button" className="fab-add-button" onClick={() => setShowAddWork(true)} disabled={!canInteract} aria-label="เพิ่มงาน">+</button>
      {showAddWork && <AddWorkModal kind={sp.kind} onClose={() => setShowAddWork(false)} onSubmit={submitWork} />}
      {editingPost && (
        <EditWorkModal
          initial={{
            topic: editingPost.topic,
            content: editingPost.content ?? '',
            external_url: editingPost.external_url,
            images: editingPost.images,
          }}
          kind={sp.kind}
          onClose={() => setEditingPost(null)}
          onSubmit={saveEdit}
        />
      )}
    </div>
  );
}
