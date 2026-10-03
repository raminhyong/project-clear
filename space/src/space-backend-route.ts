import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { tx } from '../db.ts';
import type { DB } from '../db.ts';
import {
  type AppEnv,
  type Ctx,
  type User,
  HttpError,
  audit,
  bad,
  bool,
  conflict,
  idParam,
  int,
  notFound,
  readJson,
  requireUser,
  str,
} from '../http.ts';
import { IMAGE_EXT, type ImageType, sniffImageType } from '../imagesniff.ts';
import { clientIp, failures, recordFailure } from '../ratelimit.ts';
import { type SectionRow, sectionFor } from '../sections.ts';
import { hashToken, newToken } from '../security.ts';

export interface SpaceOptions {
  /** storage/space-media for uploaded post photos; without it, image posting answers 404. */
  mediaDir?: string;
}

// ---- Space itself (Phase 1) ------------------------------------------------------------------
const KINDS = ['blog', 'book'] as const;
const STATUSES = ['draft', 'open', 'frozen', 'archived'] as const;
const COLORS = ['brand', 'amber', 'sky', 'rose', 'violet', 'slate'] as const;
// A post's own accent color — separate palette from the Space-level one above, matching the real
// original CLEAR Space's own per-post PostColor set.
const POST_COLORS = ['pink', 'blue', 'green', 'yellow', 'purple'] as const;
// a generous cap, not user-facing pagination — matches this codebase's existing convention of a
// single flat LIMIT sized well above realistic classroom volume (see quiz.ts, attendance.ts)
const FEED_LIMIT = 500;
// how many new posts a student may make in a 15-minute window (reuses the login-attempt counter
// as a generic "record an attempt" tally, not because posting failed)
const POST_LIMIT = 20;
const AUTH_FAIL_LIMIT = 30;
const IMAGE_MAX = 6 * 1024 * 1024;
// Phase 5: a 'book' Space post may carry several images ("pages") instead of the usual one.
// Matches the real original CLEAR Space's own MAX_BOOK_PAGES exactly.
const BOOK_MAX_PAGES = 15;
// A full book post can legitimately carry BOOK_MAX_PAGES images at up to IMAGE_MAX each;
// the request body limit has to fit that, plus a little slack for multipart overhead.
const POST_IMAGE_BODY_LIMIT = BOOK_MAX_PAGES * IMAGE_MAX + 2 * 1024 * 1024;

// ---- Interaction (Phase 3): comments + reactions -----------------------------------------------
const REACTION_KINDS = ['like', 'love', 'laugh', 'wow', 'sad'] as const;
const COMMENT_LIMIT = 30;
const REACT_LIMIT = 60;

interface SpaceRow {
  id: number;
  section_id: number;
  title: string;
  description: string;
  kind: (typeof KINDS)[number];
  status: (typeof STATUSES)[number];
  require_approval: number;
  allow_comments: number;
  allow_reactions: number;
  is_bookmarked: number;
  color: (typeof COLORS)[number];
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}
interface PostRow {
  id: number;
  space_id: number;
  author_kind: 'teacher' | 'student';
  student_id: number | null;
  topic: string;
  content: string | null;
  external_url: string | null;
  color: string | null;
  edit_token_hash: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  approved_at: string | null;
}
interface MediaRow {
  id: number;
  post_id: number;
  path: string;
  content_type: string;
  size_bytes: number;
  width: number | null;
  height: number | null;
  position: number;
}
interface CommentRow {
  id: number;
  post_id: number;
  author_kind: 'teacher' | 'student';
  student_id: number | null;
  content: string | null;
  image_path: string | null;
  image_content_type: string | null;
  image_width: number | null;
  image_height: number | null;
  created_at: string;
  deleted_at: string | null;
}

function shape(s: SpaceRow) {
  return {
    id: s.id,
    section_id: s.section_id,
    title: s.title,
    description: s.description,
    kind: s.kind,
    status: s.status,
    require_approval: !!s.require_approval,
    allow_comments: !!s.allow_comments,
    allow_reactions: !!s.allow_reactions,
    is_bookmarked: !!s.is_bookmarked,
    color: s.color,
    created_at: s.created_at,
    updated_at: s.updated_at,
    deleted_at: s.deleted_at,
  };
}

export function spaceRoutes(db: DB, opts: SpaceOptions = {}): Hono<AppEnv> {
  const app = new Hono<AppEnv>();
  const mediaDir = opts.mediaDir;

  const rowById = (id: number) => db.prepare('SELECT * FROM spaces WHERE id = ?').get(id) as SpaceRow | undefined;

  /** Loads a Space the user may act on. A Space's owner is whoever owns its section. A trashed
   *  Space is invisible here — restore it first (via `trashedSpaceFor`) to act on it normally. */
  function spaceFor(user: User, id: number): SpaceRow {
    const row = rowById(id);
    if (!row || row.deleted_at) throw notFound();
    sectionFor(db, user, row.section_id); // throws notFound for another teacher's section
    return row;
  }

  /** The counterpart of `spaceFor` for the trash: only a Space that IS trashed, owned by this user. */
  function trashedSpaceFor(user: User, id: number): SpaceRow {
    const row = rowById(id);
    if (!row || !row.deleted_at) throw notFound();
    sectionFor(db, user, row.section_id);
    return row;
  }

  /** Permanently removes a Space and everything under it (posts, comments, media, reactions).
   *  Only reachable from the trash — a Space must be trashed first, never purged directly. */
  function purgeSpace(spaceId: number) {
    const posts = db.prepare('SELECT id FROM space_posts WHERE space_id = ?').all(spaceId) as unknown as { id: number }[];
    for (const p of posts) {
      deletePostMedia(p.id);
      deleteComments(p.id);
    }
    db.prepare('DELETE FROM space_post_reactions WHERE post_id IN (SELECT id FROM space_posts WHERE space_id = ?)').run(spaceId);
    db.prepare('DELETE FROM space_posts WHERE space_id = ?').run(spaceId);
    db.prepare('DELETE FROM spaces WHERE id = ?').run(spaceId);
  }

  /** Normalizes a multipart `file` field (one File, several, or none) into an array, then
   *  validates every one (size, real magic-byte type) before any of them touch disk — one bad
   *  file anywhere in the batch rejects the whole post. Shared by student and teacher posting. */
  async function validateImageFiles(rawFiles: unknown, maxPages: number, tooManyMessage: string): Promise<{ buf: Buffer; type: ImageType }[]> {
    const files = (Array.isArray(rawFiles) ? rawFiles : rawFiles !== undefined ? [rawFiles] : []).filter((f): f is File => f instanceof File);
    if (files.length === 0) throw bad('ไม่พบไฟล์รูปภาพ');
    if (files.length > maxPages) throw bad(tooManyMessage);
    const buffers: { buf: Buffer; type: ImageType }[] = [];
    for (const file of files) {
      const buf = Buffer.from(await file.arrayBuffer());
      if (buf.length === 0) throw bad('ไฟล์รูปว่างเปล่า');
      if (buf.length > IMAGE_MAX) throw bad('ไฟล์รูปใหญ่เกินไป (ไม่เกิน 6MB ต่อรูป)');
      const type = sniffImageType(buf);
      if (!type) throw bad('รองรับเฉพาะไฟล์ JPEG, PNG หรือ WebP');
      buffers.push({ buf, type });
    }
    return buffers;
  }

  /** Writes validated image buffers to disk under random filenames; caller inserts DB rows inside
   *  a tx and, on failure, unlinks these same files (see the two post-image routes below). */
  function saveImages(buffers: { buf: Buffer; type: ImageType }[]) {
    if (!mediaDir) throw notFound();
    fs.mkdirSync(mediaDir, { recursive: true });
    const saved = buffers.map(({ buf, type }) => ({ buf, type, filename: `${crypto.randomBytes(16).toString('hex')}.${IMAGE_EXT[type]}` }));
    for (const s of saved) fs.writeFileSync(path.join(mediaDir, s.filename), s.buf, { mode: 0o600 });
    return saved;
  }

  function unlinkSaved(saved: { filename: string }[]) {
    if (!mediaDir) return;
    for (const s of saved) {
      try {
        fs.unlinkSync(path.join(mediaDir, s.filename));
      } catch {
        // ignore
      }
    }
  }

  /** Deletes a post's photo(s) from disk and their rows. Called from inside a post's soft-delete. */
  function deletePostMedia(postId: number) {
    const rows = db.prepare('SELECT path FROM space_post_media WHERE post_id = ?').all(postId) as unknown as { path: string }[];
    db.prepare('DELETE FROM space_post_media WHERE post_id = ?').run(postId);
    if (!mediaDir) return;
    for (const r of rows) {
      try {
        fs.unlinkSync(path.join(mediaDir, r.path));
      } catch {
        // best effort: an already-missing file is not an error here
      }
    }
  }

  /** A post the caller may act on, with the Space it belongs to. 404s for anything not visible
   *  (wrong section, or the Space is draft/archived) — the same "never reveal existence" rule
   *  used everywhere else in Space. */
  function loadPostInSection(section: SectionRow, postId: number): { post: PostRow; sp: SpaceRow } {
    const post = db.prepare('SELECT * FROM space_posts WHERE id = ?').get(postId) as PostRow | undefined;
    if (!post || post.deleted_at) throw notFound();
    const sp = rowById(post.space_id);
    if (!sp || sp.section_id !== section.id || sp.deleted_at || sp.status === 'draft' || sp.status === 'archived') throw notFound();
    return { post, sp };
  }

  /** A post awaiting approval is invisible to everyone but its own author — same "never reveal
   *  existence" rule as everywhere else, so a guessed/leaked post id doesn't work either. */
  function assertPostVisible(post: PostRow, viewerStudentId: number) {
    if (post.approved_at === null && post.student_id !== viewerStudentId) throw notFound();
  }

  /** Deletes a comment's photo (if any) from disk and its row. */
  function deleteCommentMedia(commentId: number) {
    const row = db.prepare('SELECT image_path FROM space_comments WHERE id = ?').get(commentId) as { image_path: string | null } | undefined;
    if (mediaDir && row?.image_path) {
      try {
        fs.unlinkSync(path.join(mediaDir, row.image_path));
      } catch {
        // best effort
      }
    }
  }

  /** Cascades a post's own deletion to its comments and their photos. */
  function deleteComments(postId: number) {
    const rows = db.prepare('SELECT id FROM space_comments WHERE post_id = ?').all(postId) as unknown as { id: number }[];
    for (const r of rows) deleteCommentMedia(r.id);
    db.prepare('DELETE FROM space_comments WHERE post_id = ?').run(postId);
  }

  /** A post is soft-deleted (kept for audit), not removed, so FK CASCADE never fires for it —
   *  its media, comments and reactions are cleaned up by hand from both delete routes. */
  function cascadeDeletePost(postId: number) {
    deletePostMedia(postId);
    deleteComments(postId);
    db.prepare('DELETE FROM space_post_reactions WHERE post_id = ?').run(postId);
  }

  /** Reaction counts by kind for a post, plus what (if anything) `actorKey` reacted with. */
  function reactionSummary(postId: number, actorKey: string) {
    const rows = db.prepare('SELECT kind, COUNT(*) AS n FROM space_post_reactions WHERE post_id = ? GROUP BY kind').all(postId) as unknown as {
      kind: string;
      n: number;
    }[];
    const counts: Record<string, number> = {};
    for (const r of rows) counts[r.kind] = r.n;
    const mine = db.prepare('SELECT kind FROM space_post_reactions WHERE post_id = ? AND actor_key = ?').get(postId, actorKey) as
      | { kind: string }
      | undefined;
    return { counts, mine: mine?.kind ?? null };
  }

  function commentShape(c: CommentRow & { student_name: string | null }, ownerName: string, section: SectionRow, myStudentId: number) {
    return {
      id: c.id,
      post_id: c.post_id,
      author_name: c.author_kind === 'teacher' ? ownerName : (c.student_name ?? 'นักเรียน'),
      is_teacher: c.author_kind === 'teacher',
      is_mine: c.author_kind === 'student' && c.student_id === myStudentId,
      content: c.content,
      image: c.image_path ? { url: `/api/public/space/media/comment/${c.id}?token=${section.share_token}`, width: c.image_width, height: c.image_height } : null,
      created_at: c.created_at,
    };
  }

  /** Loads every (non-deleted) comment on a post, teacher/student-shaped the same way as posts
   *  (myStudentId -1 for the teacher's own view). */
  function loadComments(section: SectionRow, sp: SpaceRow, postId: number, myStudentId: number) {
    const owner = db.prepare('SELECT display_name FROM users WHERE id = ?').get(section.owner_user_id) as { display_name: string } | undefined;
    const rows = db
      .prepare(
        `SELECT c.*, st.name AS student_name FROM space_comments c LEFT JOIN students st ON st.id = c.student_id
          WHERE c.post_id = ? AND c.deleted_at IS NULL ORDER BY c.created_at, c.id`,
      )
      .all(postId) as unknown as (CommentRow & { student_name: string | null })[];
    return rows.map((c) => commentShape(c, owner?.display_name ?? 'ครู', section, myStudentId));
  }

  /** The feed of one Space, shaped for either a teacher (myStudentId -1, sees pending posts too
   *  for moderation) or one student (sees approved posts plus their own still-pending ones). */
  function loadFeed(section: SectionRow, sp: SpaceRow, myStudentId: number) {
    const actorKey = myStudentId === -1 ? 'teacher' : `student:${myStudentId}`;
    const owner = db.prepare('SELECT display_name FROM users WHERE id = ?').get(section.owner_user_id) as { display_name: string } | undefined;
    const visibility = myStudentId === -1 ? '' : 'AND (p.approved_at IS NOT NULL OR p.student_id = ?)';
    const visibilityArgs = myStudentId === -1 ? [] : [myStudentId];
    const posts = db
      .prepare(
        `SELECT p.*, st.name AS student_name FROM space_posts p LEFT JOIN students st ON st.id = p.student_id
          WHERE p.space_id = ? AND p.deleted_at IS NULL ${visibility} ORDER BY p.created_at DESC, p.id DESC LIMIT ${FEED_LIMIT}`,
      )
      .all(sp.id, ...visibilityArgs) as unknown as (PostRow & { student_name: string | null })[];
    const media = db
      .prepare(
        `SELECT m.* FROM space_post_media m JOIN space_posts p ON p.id = m.post_id
          WHERE p.space_id = ? AND p.deleted_at IS NULL ORDER BY m.post_id, m.position`,
      )
      .all(sp.id) as unknown as MediaRow[];
    const byPost = new Map<number, MediaRow[]>();
    for (const m of media) {
      const arr = byPost.get(m.post_id) ?? [];
      arr.push(m);
      byPost.set(m.post_id, arr);
    }
    const commentCounts = db
      .prepare(
        `SELECT c.post_id, COUNT(*) AS n FROM space_comments c JOIN space_posts p ON p.id = c.post_id
          WHERE p.space_id = ? AND c.deleted_at IS NULL GROUP BY c.post_id`,
      )
      .all(sp.id) as unknown as { post_id: number; n: number }[];
    const commentCountByPost = new Map(commentCounts.map((r) => [r.post_id, r.n]));
    const reactionRows = db
      .prepare(
        `SELECT r.post_id, r.kind, COUNT(*) AS n FROM space_post_reactions r JOIN space_posts p ON p.id = r.post_id
          WHERE p.space_id = ? GROUP BY r.post_id, r.kind`,
      )
      .all(sp.id) as unknown as { post_id: number; kind: string; n: number }[];
    const reactionsByPost = new Map<number, Record<string, number>>();
    for (const r of reactionRows) {
      const rec = reactionsByPost.get(r.post_id) ?? {};
      rec[r.kind] = r.n;
      reactionsByPost.set(r.post_id, rec);
    }
    const mineRows = db
      .prepare(
        `SELECT r.post_id, r.kind FROM space_post_reactions r JOIN space_posts p ON p.id = r.post_id
          WHERE p.space_id = ? AND r.actor_key = ?`,
      )
      .all(sp.id, actorKey) as unknown as { post_id: number; kind: string }[];
    const mineByPost = new Map(mineRows.map((r) => [r.post_id, r.kind]));
    return posts.map((p) => ({
      id: p.id,
      author_name: p.author_kind === 'teacher' ? (owner?.display_name ?? 'ครู') : (p.student_name ?? 'นักเรียน'),
      is_teacher: p.author_kind === 'teacher',
      is_mine: p.author_kind === 'student' && p.student_id === myStudentId,
      topic: p.topic,
      content: p.content,
      external_url: p.external_url,
      color: p.color,
      images: (byPost.get(p.id) ?? []).map((m) => ({
        id: m.id,
        url: `/api/public/space/media/${m.id}?token=${section.share_token}`,
        width: m.width,
        height: m.height,
      })),
      created_at: p.created_at,
      comments_count: commentCountByPost.get(p.id) ?? 0,
      reactions: { counts: reactionsByPost.get(p.id) ?? {}, mine: mineByPost.get(p.id) ?? null },
      pending: p.approved_at === null,
    }));
  }

  // ---- across every section I own -------------------------------------------------------------
  app.get('/spaces', (c) => {
    const user = requireUser(c);
    const rows = db
      .prepare(
        `SELECT sp.*, se.room, se.course_name, se.course_code, se.term_id, se.share_token
           FROM spaces sp JOIN sections se ON se.id = sp.section_id
          WHERE se.active = 1 AND sp.deleted_at IS NULL AND (? = 1 OR se.owner_user_id = ?)
          ORDER BY sp.is_bookmarked DESC, sp.updated_at DESC`,
      )
      .all(user.role === 'super_admin' ? 1 : 0, user.id) as unknown as (SpaceRow & {
      room: string;
      course_name: string;
      course_code: string;
      term_id: number;
      share_token: string | null;
    })[];
    return c.json({
      spaces: rows.map((r) => ({ ...shape(r), room: r.room, course_name: r.course_name, course_code: r.course_code, term_id: r.term_id, share_token: r.share_token })),
    });
  });

  // ---- trash: Spaces moved out of the active list, kept until restored or purged for good -------
  app.get('/spaces/trash', (c) => {
    const user = requireUser(c);
    const rows = db
      .prepare(
        `SELECT sp.*, se.room, se.course_name, se.course_code, se.term_id
           FROM spaces sp JOIN sections se ON se.id = sp.section_id
          WHERE sp.deleted_at IS NOT NULL AND (? = 1 OR se.owner_user_id = ?)
          ORDER BY sp.deleted_at DESC`,
      )
      .all(user.role === 'super_admin' ? 1 : 0, user.id) as unknown as (SpaceRow & {
      room: string;
      course_name: string;
      course_code: string;
      term_id: number;
    })[];
    return c.json({
      spaces: rows.map((r) => ({ ...shape(r), room: r.room, course_name: r.course_name, course_code: r.course_code, term_id: r.term_id })),
    });
  });

  app.post('/spaces/:id/trash', (c) => {
    const user = requireUser(c);
    const sp = spaceFor(user, idParam(c, 'id'));
    const now = new Date().toISOString();
    db.prepare('UPDATE spaces SET deleted_at = ?, updated_at = ? WHERE id = ?').run(now, now, sp.id);
    audit(db, user.id, 'space.trash', 'space', sp.id, {});
    return c.json({ ok: true });
  });

  app.post('/spaces/:id/clone', async (c) => {
    const user = requireUser(c);
    const sp = spaceFor(user, idParam(c, 'id'));
    const body = (await readJson(c).catch(() => ({}))) as Record<string, unknown>;
    const title = str(body.title, 'ชื่อ Space', { max: 160, optional: true }) ?? `${sp.title} (สำเนา)`.slice(0, 160);
    const now = new Date().toISOString();
    const r = db
      .prepare(
        `INSERT INTO spaces (section_id, title, description, kind, status, require_approval, allow_comments, allow_reactions, is_bookmarked, color, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?)`,
      )
      .run(
        sp.section_id,
        title,
        sp.description,
        sp.kind,
        sp.status,
        sp.require_approval ? 1 : 0,
        sp.allow_comments ? 1 : 0,
        sp.allow_reactions ? 1 : 0,
        sp.color,
        now,
        now,
      );
    const newId = Number(r.lastInsertRowid);
    audit(db, user.id, 'space.clone', 'space', newId, { source_id: sp.id, title });
    const sec = sectionFor(db, user, sp.section_id);
    return c.json({ ...shape(rowById(newId)!), room: sec.room, course_code: sec.course_code, course_name: sec.course_name, share_token: sec.share_token }, 201);
  });

  app.post('/spaces/:id/restore', (c) => {
    const user = requireUser(c);
    const sp = trashedSpaceFor(user, idParam(c, 'id'));
    db.prepare('UPDATE spaces SET deleted_at = NULL, updated_at = ? WHERE id = ?').run(new Date().toISOString(), sp.id);
    audit(db, user.id, 'space.restore', 'space', sp.id, {});
    return c.json(shape(rowById(sp.id)!));
  });

  app.delete('/spaces/:id/purge', (c) => {
    const user = requireUser(c);
    const sp = trashedSpaceFor(user, idParam(c, 'id'));
    tx(db, () => purgeSpace(sp.id));
    audit(db, user.id, 'space.purge', 'space', sp.id, {});
    return c.json({ ok: true });
  });

  // ---- within one section -----------------------------------------------------------------------
  app.get('/sections/:id/spaces', (c) => {
    const s = sectionFor(db, requireUser(c), idParam(c, 'id'));
    const rows = db.prepare('SELECT * FROM spaces WHERE section_id = ? AND deleted_at IS NULL ORDER BY created_at').all(s.id) as unknown as SpaceRow[];
    return c.json({ spaces: rows.map(shape) });
  });

  app.post('/sections/:id/spaces', async (c) => {
    const user = requireUser(c);
    const s = sectionFor(db, user, idParam(c, 'id'));
    const body = await readJson(c);
    const title = str(body.title, 'ชื่อ Space', { max: 160 });
    const description = str(body.description, 'คำชี้แจง', { max: 2000, optional: true, min: 0 }) ?? '';
    const kind = typeof body.kind === 'string' && (KINDS as readonly string[]).includes(body.kind) ? (body.kind as (typeof KINDS)[number]) : 'blog';
    const color = typeof body.color === 'string' && (COLORS as readonly string[]).includes(body.color) ? (body.color as (typeof COLORS)[number]) : 'brand';
    const now = new Date().toISOString();
    const r = db
      .prepare('INSERT INTO spaces (section_id, title, description, kind, color, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(s.id, title, description, kind, color, now, now);
    const id = Number(r.lastInsertRowid);
    audit(db, user.id, 'space.create', 'space', id, { section_id: s.id, title, kind });
    return c.json(shape(rowById(id)!), 201);
  });

  // ---- one Space -----------------------------------------------------------------------------
  app.get('/spaces/:id', (c) => {
    const user = requireUser(c);
    const sp = spaceFor(user, idParam(c, 'id'));
    const sec = sectionFor(db, user, sp.section_id);
    return c.json({ ...shape(sp), room: sec.room, course_code: sec.course_code, course_name: sec.course_name, share_token: sec.share_token });
  });

  app.patch('/spaces/:id', async (c) => {
    const user = requireUser(c);
    const sp = spaceFor(user, idParam(c, 'id'));
    const body = await readJson(c);
    const title = str(body.title, 'ชื่อ Space', { max: 160, optional: true }) ?? sp.title;
    const description = str(body.description, 'คำชี้แจง', { max: 2000, optional: true, min: 0 }) ?? sp.description;
    let status = sp.status;
    if (body.status !== undefined) {
      if (typeof body.status !== 'string' || !(STATUSES as readonly string[]).includes(body.status)) throw bad('สถานะไม่ถูกต้อง');
      status = body.status as (typeof STATUSES)[number];
    }
    const requireApproval = body.require_approval === undefined ? !!sp.require_approval : bool(body.require_approval, 'ต้องอนุมัติก่อนเผยแพร่');
    const allowComments = body.allow_comments === undefined ? !!sp.allow_comments : bool(body.allow_comments, 'เปิดคอมเมนต์');
    const allowReactions = body.allow_reactions === undefined ? !!sp.allow_reactions : bool(body.allow_reactions, 'เปิดปฏิกิริยา');
    const isBookmarked = body.is_bookmarked === undefined ? !!sp.is_bookmarked : bool(body.is_bookmarked, 'ปักหมุด');
    let color = sp.color;
    if (body.color !== undefined) {
      if (typeof body.color !== 'string' || !(COLORS as readonly string[]).includes(body.color)) throw bad('สีไม่ถูกต้อง');
      color = body.color as (typeof COLORS)[number];
    }
    let kind = sp.kind;
    if (body.kind !== undefined) {
      if (typeof body.kind !== 'string' || !(KINDS as readonly string[]).includes(body.kind)) throw bad('ประเภทไม่ถูกต้อง');
      kind = body.kind as (typeof KINDS)[number];
    }
    const now = new Date().toISOString();
    db.prepare(
      `UPDATE spaces SET title = ?, description = ?, status = ?, require_approval = ?, allow_comments = ?, allow_reactions = ?, is_bookmarked = ?, color = ?, kind = ?, updated_at = ?
        WHERE id = ?`,
    ).run(title, description, status, requireApproval ? 1 : 0, allowComments ? 1 : 0, allowReactions ? 1 : 0, isBookmarked ? 1 : 0, color, kind, now, sp.id);
    audit(db, user.id, 'space.update', 'space', sp.id, { status });
    return c.json(shape(rowById(sp.id)!));
  });

  // ---- teacher: post to their own Space directly (an example, an announcement, seed content) —
  // always auto-approved (the approval queue moderates student submissions, not the teacher's own)
  // and allowed regardless of status, so a teacher can prepare content before opening a Space up.
  app.post('/spaces/:id/posts', async (c) => {
    const user = requireUser(c);
    const sp = spaceFor(user, idParam(c, 'id'));
    const body = await readJson(c);
    const topic = str(body.topic, 'หัวข้อ', { max: 200 });
    const content = str(body.content, 'คำอธิบาย', { max: 2000 });
    const externalUrl = str(body.external_url, 'ลิงก์', { max: 2048 });
    if (!/^https?:\/\//i.test(externalUrl)) throw bad('ลิงก์ต้องขึ้นต้นด้วย http:// หรือ https://');
    const now = new Date().toISOString();
    const id = db
      .prepare(
        `INSERT INTO space_posts (space_id, author_kind, student_id, topic, content, external_url, created_at, updated_at, approved_at)
         VALUES (?, 'teacher', NULL, ?, ?, ?, ?, ?, ?)`,
      )
      .run(sp.id, topic, content, externalUrl, now, now, now).lastInsertRowid;
    audit(db, user.id, 'space.post.create', 'space_post', Number(id), { by: 'teacher' });
    return c.json({ id: Number(id) }, 201);
  });

  app.post(
    '/spaces/:id/posts-image',
    bodyLimit({ maxSize: POST_IMAGE_BODY_LIMIT, onError: (c) => c.json({ error: 'ไฟล์รูปใหญ่เกินไป', code: 'too_large' }, 413) }),
    async (c) => {
      const user = requireUser(c);
      const sp = spaceFor(user, idParam(c, 'id'));
      const form = (await c.req.parseBody({ all: true })) as Record<string, unknown>;
      const maxPages = sp.kind === 'book' ? BOOK_MAX_PAGES : 1;
      const tooMany = sp.kind === 'book' ? `แนบได้ไม่เกิน ${BOOK_MAX_PAGES} หน้าต่อโพสต์` : 'บอร์ดนี้แนบได้รูปเดียวต่อโพสต์ (สลับเป็น "หนังสือ" ถ้าต้องการหลายหน้า)';
      const buffers = await validateImageFiles(form.file, maxPages, tooMany);
      const topic = str(form.topic, 'หัวข้อ', { max: 200 });
      const content = str(form.content, 'คำอธิบาย', { max: 2000 });
      const saved = saveImages(buffers);
      const now = new Date().toISOString();
      let id: number;
      try {
        id = tx(db, () => {
          const r = db
            .prepare(
              `INSERT INTO space_posts (space_id, author_kind, student_id, topic, content, created_at, updated_at, approved_at)
               VALUES (?, 'teacher', NULL, ?, ?, ?, ?, ?)`,
            )
            .run(sp.id, topic, content, now, now, now);
          const postId = Number(r.lastInsertRowid);
          saved.forEach((s, position) => {
            db.prepare(
              'INSERT INTO space_post_media (post_id, path, content_type, size_bytes, position, created_at) VALUES (?, ?, ?, ?, ?, ?)',
            ).run(postId, s.filename, s.type, s.buf.length, position, now);
          });
          return postId;
        });
      } catch (err) {
        unlinkSaved(saved);
        throw err;
      }
      audit(db, user.id, 'space.post.create', 'space_post', id, { by: 'teacher', images: saved.length });
      return c.json({ id }, 201);
    },
  );

  // ---- teacher: read posts, moderate (approve/delete); comments viewed/deleted separately below --
  app.get('/spaces/:id/posts', (c) => {
    const user = requireUser(c);
    const sp = spaceFor(user, idParam(c, 'id'));
    const section = db.prepare('SELECT * FROM sections WHERE id = ?').get(sp.section_id) as unknown as SectionRow;
    return c.json({ posts: loadFeed(section, sp, -1) });
  });

  app.post('/spaces/:id/posts/:postId/approve', (c) => {
    const user = requireUser(c);
    const sp = spaceFor(user, idParam(c, 'id'));
    const postId = idParam(c, 'postId');
    const row = db.prepare('SELECT * FROM space_posts WHERE id = ? AND space_id = ?').get(postId, sp.id) as PostRow | undefined;
    if (!row || row.deleted_at) throw notFound();
    if (row.approved_at) throw conflict('โพสต์นี้อนุมัติแล้ว');
    db.prepare('UPDATE space_posts SET approved_at = ? WHERE id = ?').run(new Date().toISOString(), postId);
    audit(db, user.id, 'space.post.approve', 'space_post', postId, {});
    return c.json({ ok: true });
  });

  app.delete('/spaces/:id/posts/:postId', (c) => {
    const user = requireUser(c);
    const sp = spaceFor(user, idParam(c, 'id'));
    const postId = idParam(c, 'postId');
    const row = db.prepare('SELECT * FROM space_posts WHERE id = ? AND space_id = ?').get(postId, sp.id) as PostRow | undefined;
    if (!row || row.deleted_at) throw notFound();
    const now = new Date().toISOString();
    tx(db, () => {
      db.prepare('UPDATE space_posts SET deleted_at = ? WHERE id = ?').run(now, postId);
      cascadeDeletePost(postId);
    });
    audit(db, user.id, 'space.post.delete', 'space_post', postId, { by: 'teacher' });
    return c.json({ ok: true });
  });

  interface ManifestItem {
    type: 'existing' | 'new';
    id?: number;
    index?: number;
  }

  async function updatePostMediaAndContent(
    sp: SpaceRow,
    postId: number,
    row: PostRow,
    body: Record<string, unknown>,
    rawFiles: unknown,
  ): Promise<number> {
    const topic = str(body.topic, 'หัวข้อ', { max: 200 });
    const content = str(body.content, 'คำอธิบาย', { max: 2000 });
    const rawManifest = body.media_manifest;
    let manifest: ManifestItem[] | null = null;
    if (rawManifest !== undefined && rawManifest !== null && rawManifest !== '') {
      if (typeof rawManifest === 'string') {
        try {
          manifest = JSON.parse(rawManifest);
        } catch {
          throw bad('media_manifest ไม่ถูกต้อง');
        }
      } else if (Array.isArray(rawManifest)) {
        manifest = rawManifest as ManifestItem[];
      }
      if (!Array.isArray(manifest)) throw bad('media_manifest ต้องเป็นรายการ');
    }

    const currentMedia = db.prepare('SELECT * FROM space_post_media WHERE post_id = ?').all(postId) as unknown as MediaRow[];
    const hasExistingMedia = currentMedia.length > 0;

    let externalUrl = row.external_url;
    if (!hasExistingMedia && manifest === null && row.external_url !== null) {
      externalUrl = str(body.external_url, 'ลิงก์', { max: 2048 });
      if (!/^https?:\/\//i.test(externalUrl)) throw bad('ลิงก์ต้องขึ้นต้นด้วย http:// หรือ https://');
    }

    const now = new Date().toISOString();

    if (manifest !== null) {
      const maxPages = sp.kind === 'book' ? BOOK_MAX_PAGES : 1;
      const tooMany = sp.kind === 'book' ? `แนบได้ไม่เกิน ${BOOK_MAX_PAGES} หน้าต่อโพสต์` : 'บอร์ดนี้แนบได้รูปเดียวต่อโพสต์ (สลับเป็น "หนังสือ" ถ้าต้องการหลายหน้า)';
      if (manifest.length === 0) throw bad('ต้องมีภาพอย่างน้อย 1 ภาพ');
      if (manifest.length > maxPages) throw bad(tooMany);

      const currentMap = new Map(currentMedia.map((m) => [m.id, m]));
      const retainedIds = new Set<number>();
      const newItems: { itemIndex: number; pos: number }[] = [];

      for (let i = 0; i < manifest.length; i++) {
        const item = manifest[i];
        if (!item || (item.type !== 'existing' && item.type !== 'new')) {
          throw bad('รูปแบบข้อมูลรูปภาพไม่ถูกต้อง');
        }
        if (item.type === 'existing') {
          const id = Number(item.id);
          if (!Number.isInteger(id) || !currentMap.has(id)) throw bad('ไม่พบรูปภาพเดิม');
          if (retainedIds.has(id)) throw bad('รูปภาพเดิมซ้ำในรายการ');
          retainedIds.add(id);
        } else {
          const idx = Number(item.index);
          if (!Number.isInteger(idx) || idx < 0) throw bad('ดัชนีรูปภาพใหม่ไม่ถูกต้อง');
          newItems.push({ itemIndex: idx, pos: i });
        }
      }

      const sortedNewIndices = newItems.map((n) => n.itemIndex).sort((a, b) => a - b);
      for (let i = 0; i < sortedNewIndices.length; i++) {
        if (sortedNewIndices[i] !== i) {
          throw bad('ลำดับดัชนีรูปภาพใหม่ไม่ถูกต้อง');
        }
      }

      const toDelete = currentMedia.filter((m) => !retainedIds.has(m.id));
      let savedNew: { buf: Buffer; type: ImageType; filename: string }[] = [];
      if (newItems.length > 0) {
        const buffers = await validateImageFiles(rawFiles, maxPages, tooMany);
        if (buffers.length !== newItems.length) {
          throw bad(`จำนวนไฟล์ที่อัปโหลด (${buffers.length}) ไม่ตรงกับรายการภาพใหม่ (${newItems.length})`);
        }
        savedNew = saveImages(buffers);
      }

      const deletedFiles = toDelete.map((m) => m.path);
      try {
        tx(db, () => {
          for (const m of toDelete) {
            db.prepare('DELETE FROM space_post_media WHERE id = ?').run(m.id);
          }
          db.prepare('UPDATE space_post_media SET position = 1000000 + id WHERE post_id = ?').run(postId);

          for (let pos = 0; pos < manifest!.length; pos++) {
            const item = manifest![pos];
            if (item.type === 'existing') {
              db.prepare('UPDATE space_post_media SET position = ? WHERE id = ?').run(pos, Number(item.id));
            } else {
              const s = savedNew[Number(item.index)];
              db.prepare(
                'INSERT INTO space_post_media (post_id, path, content_type, size_bytes, position, created_at) VALUES (?, ?, ?, ?, ?, ?)',
              ).run(postId, s.filename, s.type, s.buf.length, pos, now);
            }
          }

          db.prepare('UPDATE space_posts SET topic = ?, content = ?, external_url = ?, updated_at = ? WHERE id = ?')
            .run(topic, content, externalUrl, now, postId);
        });
      } catch (err) {
        unlinkSaved(savedNew);
        throw err;
      }

      if (mediaDir) {
        for (const f of deletedFiles) {
          try {
            fs.unlinkSync(path.join(mediaDir, f));
          } catch {
            // best effort
          }
        }
      }

      return manifest.length;
    } else {
      db.prepare('UPDATE space_posts SET topic = ?, content = ?, external_url = ?, updated_at = ? WHERE id = ?')
        .run(topic, content, externalUrl, now, postId);
      return currentMedia.length;
    }
  }

  app.patch(
    '/spaces/:id/posts/:postId',
    bodyLimit({ maxSize: POST_IMAGE_BODY_LIMIT, onError: (c) => c.json({ error: 'ไฟล์รูปใหญ่เกินไป', code: 'too_large' }, 413) }),
    async (c) => {
      const user = requireUser(c);
      const sp = spaceFor(user, idParam(c, 'id'));
      const postId = idParam(c, 'postId');
      const row = db.prepare('SELECT * FROM space_posts WHERE id = ? AND space_id = ?').get(postId, sp.id) as PostRow | undefined;
      if (!row || row.deleted_at) throw notFound();

      const contentType = c.req.header('content-type') ?? '';
      let body: Record<string, unknown>;
      let rawFiles: unknown = undefined;
      if (contentType.includes('multipart/form-data')) {
        const form = (await c.req.parseBody({ all: true })) as Record<string, unknown>;
        body = form;
        rawFiles = form.file;
      } else {
        body = await readJson(c);
      }

      const imageCount = await updatePostMediaAndContent(sp, postId, row, body, rawFiles);
      audit(db, user.id, 'space.post.edit', 'space_post', postId, { by: 'teacher', images: imageCount });
      return c.json({ ok: true });
    },
  );

  app.patch('/spaces/:id/posts/:postId/color', async (c) => {
    const user = requireUser(c);
    const sp = spaceFor(user, idParam(c, 'id'));
    const postId = idParam(c, 'postId');
    const row = db.prepare('SELECT * FROM space_posts WHERE id = ? AND space_id = ?').get(postId, sp.id) as PostRow | undefined;
    if (!row || row.deleted_at) throw notFound();
    const body = await readJson(c);
    const color = body.color === null ? null : str(body.color, 'สี', { max: 20 });
    if (color !== null && !(POST_COLORS as readonly string[]).includes(color)) throw bad('สีไม่ถูกต้อง');
    db.prepare('UPDATE space_posts SET color = ?, updated_at = ? WHERE id = ?').run(color, new Date().toISOString(), postId);
    return c.json({ ok: true });
  });

  app.get('/spaces/:id/posts/:postId/comments', (c) => {
    const user = requireUser(c);
    const sp = spaceFor(user, idParam(c, 'id'));
    const postId = idParam(c, 'postId');
    const post = db.prepare('SELECT * FROM space_posts WHERE id = ? AND space_id = ?').get(postId, sp.id) as PostRow | undefined;
    if (!post || post.deleted_at) throw notFound();
    const section = db.prepare('SELECT * FROM sections WHERE id = ?').get(sp.section_id) as unknown as SectionRow;
    return c.json({ comments: loadComments(section, sp, postId, -1) });
  });

  app.post(
    '/spaces/:id/posts/:postId/comments',
    bodyLimit({ maxSize: 8 * 1024 * 1024, onError: (c) => c.json({ error: 'ไฟล์รูปใหญ่เกินไป', code: 'too_large' }, 413) }),
    async (c) => {
      const user = requireUser(c);
      const sp = spaceFor(user, idParam(c, 'id'));
      const postId = idParam(c, 'postId');
      const post = db.prepare('SELECT * FROM space_posts WHERE id = ? AND space_id = ?').get(postId, sp.id) as PostRow | undefined;
      if (!post || post.deleted_at) throw notFound();
      const section = db.prepare('SELECT * FROM sections WHERE id = ?').get(sp.section_id) as unknown as SectionRow;

      const contentType = c.req.header('content-type') ?? '';
      let content = '';
      let filename: string | null = null;
      let type: ImageType | null = null;

      if (contentType.startsWith('multipart/form-data')) {
        const form = (await c.req.parseBody()) as Record<string, unknown>;
        content = typeof form.content === 'string' ? form.content.trim().slice(0, 1000) : '';
        const file = form.file;
        if (file instanceof File && file.size > 0) {
          const buf = Buffer.from(await file.arrayBuffer());
          if (buf.length > IMAGE_MAX) throw bad('ไฟล์รูปใหญ่เกินไป (ไม่เกิน 6MB)');
          type = sniffImageType(buf);
          if (!type) throw bad('รองรับเฉพาะไฟล์ JPEG, PNG หรือ WebP');
          if (!mediaDir) throw notFound();
          fs.mkdirSync(mediaDir, { recursive: true });
          filename = `${crypto.randomBytes(16).toString('hex')}.${IMAGE_EXT[type]}`;
          fs.writeFileSync(path.join(mediaDir, filename), buf, { mode: 0o600 });
        }
      } else {
        const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
        content = typeof body.content === 'string' ? body.content.trim().slice(0, 1000) : '';
      }

      if (!content && !filename) throw bad('กรุณากรอกข้อความหรือแนบรูปภาพ');

      const now = new Date().toISOString();
      let commentId: number;
      try {
        commentId = Number(
          db
            .prepare(
              `INSERT INTO space_comments (post_id, author_kind, student_id, content, image_path, image_content_type, created_at)
               VALUES (?, 'teacher', NULL, ?, ?, ?, ?)`,
            )
            .run(postId, content || null, filename, type, now).lastInsertRowid,
        );
      } catch (err) {
        if (filename && mediaDir) {
          try {
            fs.unlinkSync(path.join(mediaDir, filename));
          } catch {
            // ignore
          }
        }
        throw err;
      }

      audit(db, user.id, 'space.comment.create', 'space_comment', commentId, { by: 'teacher' });
      return c.json({ id: commentId, comments: loadComments(section, sp, postId, -1) }, 201);
    },
  );

  app.delete('/spaces/:id/comments/:commentId', (c) => {
    const user = requireUser(c);
    const sp = spaceFor(user, idParam(c, 'id'));
    const commentId = idParam(c, 'commentId');
    const row = db
      .prepare('SELECT c.* FROM space_comments c JOIN space_posts p ON p.id = c.post_id WHERE c.id = ? AND p.space_id = ?')
      .get(commentId, sp.id) as CommentRow | undefined;
    if (!row || row.deleted_at) throw notFound();
    tx(db, () => {
      db.prepare('UPDATE space_comments SET deleted_at = ? WHERE id = ?').run(new Date().toISOString(), commentId);
      deleteCommentMedia(commentId);
    });
    audit(db, user.id, 'space.comment.delete', 'space_comment', commentId, { by: 'teacher' });
    return c.json({ ok: true });
  });

  // ---- students (no login): the section link + their own code, same trust model as quiz/journey ---
  function resolveStudent(c: Ctx, body: Record<string, unknown>): { section: SectionRow; student: { id: number; name: string; seat_no: number | null } } {
    const ip = clientIp(c);
    if (failures(db, `space:${ip}`) >= AUTH_FAIL_LIMIT) throw new HttpError(429, 'ลองผิดหลายครั้งเกินไป กรุณารอสักครู่แล้วลองใหม่', 'rate_limited');
    const fail = () => {
      recordFailure(db, `space:${ip}`);
      return notFound('ไม่พบรหัสนี้ในห้องนี้ กรุณาตรวจสอบรหัสนักเรียนอีกครั้ง');
    };
    const token = typeof body.token === 'string' ? body.token.trim().toLowerCase() : '';
    const code = typeof body.student_code === 'string' ? body.student_code.trim() : '';
    if (!/^[0-9a-f]{12}$/.test(token) || !/^[A-Za-z0-9]{3,20}$/.test(code)) throw fail();
    const section = db.prepare('SELECT * FROM sections WHERE share_token = ? AND active = 1').get(token) as unknown as SectionRow | undefined;
    if (!section) throw fail();
    const student = db
      .prepare(
        `SELECT st.id, st.name, e.seat_no FROM enrollments e JOIN students st ON st.id = e.student_id
          WHERE e.section_id = ? AND st.student_code = ? AND e.active = 1 AND st.active = 1`,
      )
      .get(section.id, code) as { id: number; name: string; seat_no: number | null } | undefined;
    if (!student) throw fail();
    return { section, student };
  }

  /** A Space that belongs to `section` and is visible/postable right now. Never reveals draft/archived. */
  function openSpaceFor(section: SectionRow, spaceId: number, need: 'read' | 'post'): SpaceRow {
    const sp = rowById(spaceId);
    if (!sp || sp.section_id !== section.id || sp.deleted_at || sp.status === 'draft' || sp.status === 'archived') throw notFound();
    if (need === 'post' && sp.status !== 'open') throw conflict('ครูปิดรับงานชิ้นนี้ชั่วคราว');
    return sp;
  }

  app.post('/public/space/feed', async (c) => {
    const body = await readJson(c);
    const { section, student } = resolveStudent(c, body);
    const sp = openSpaceFor(section, int(body.space_id, 'Space', { min: 1 }), 'read');
    return c.json({ space: shape(sp), posts: loadFeed(section, sp, student.id) });
  });

  // A post always needs a topic (title) and a description, matching the real original — there is
  // no such thing as a topic-less or description-less post there. This route is specifically the
  // "link" kind of post (image posts go through /post-image below); the link is required here.
  app.post('/public/space/post', async (c) => {
    const body = await readJson(c);
    const { section, student } = resolveStudent(c, body);
    const sp = openSpaceFor(section, int(body.space_id, 'Space', { min: 1 }), 'post');
    const topic = str(body.topic, 'หัวข้อ', { max: 200 });
    const content = str(body.content, 'คำอธิบาย', { max: 2000 });
    const externalUrl = str(body.external_url, 'ลิงก์', { max: 2048 });
    if (!/^https?:\/\//i.test(externalUrl)) throw bad('ลิงก์ต้องขึ้นต้นด้วย http:// หรือ https://');
    const rateKey = `space-post:${student.id}`;
    if (failures(db, rateKey) >= POST_LIMIT) throw new HttpError(429, 'โพสต์ถี่เกินไป กรุณารอสักครู่แล้วลองใหม่', 'rate_limited');
    const now = new Date().toISOString();
    const approvedAt = sp.require_approval ? null : now;
    const editToken = newToken();
    const id = db
      .prepare(
        `INSERT INTO space_posts (space_id, author_kind, student_id, topic, content, external_url, edit_token_hash, created_at, updated_at, approved_at)
         VALUES (?, 'student', ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(sp.id, student.id, topic, content, externalUrl, hashToken(editToken), now, now, approvedAt).lastInsertRowid;
    recordFailure(db, rateKey); // counts this successful post toward the rate limit, not a failure
    return c.json({ id: Number(id), pending: approvedAt === null, edit_token: editToken }, 201);
  });

  app.post(
    '/public/space/post-image',
    bodyLimit({ maxSize: POST_IMAGE_BODY_LIMIT, onError: (c) => c.json({ error: 'ไฟล์รูปใหญ่เกินไป', code: 'too_large' }, 413) }),
    async (c) => {
      const form = (await c.req.parseBody({ all: true })) as Record<string, unknown>;
      const { section, student } = resolveStudent(c, form);
      const sp = openSpaceFor(section, int(form.space_id, 'Space', { min: 1 }), 'post');
      const maxPages = sp.kind === 'book' ? BOOK_MAX_PAGES : 1;
      const tooMany = sp.kind === 'book' ? `แนบได้ไม่เกิน ${BOOK_MAX_PAGES} หน้าต่อโพสต์` : 'บอร์ดนี้แนบได้รูปเดียวต่อโพสต์ (สลับเป็น "หนังสือ" ถ้าต้องการหลายหน้า)';
      const buffers = await validateImageFiles(form.file, maxPages, tooMany);
      const topic = str(form.topic, 'หัวข้อ', { max: 200 });
      const content = str(form.content, 'คำอธิบาย', { max: 2000 });
      const rateKey = `space-post:${student.id}`;
      if (failures(db, rateKey) >= POST_LIMIT) throw new HttpError(429, 'โพสต์ถี่เกินไป กรุณารอสักครู่แล้วลองใหม่', 'rate_limited');
      const saved = saveImages(buffers);
      const now = new Date().toISOString();
      const approvedAt = sp.require_approval ? null : now;
      const editToken = newToken();
      let id: number;
      try {
        id = tx(db, () => {
          const r = db
            .prepare(
              `INSERT INTO space_posts (space_id, author_kind, student_id, topic, content, edit_token_hash, created_at, updated_at, approved_at)
               VALUES (?, 'student', ?, ?, ?, ?, ?, ?, ?)`,
            )
            .run(sp.id, student.id, topic, content, hashToken(editToken), now, now, approvedAt);
          const postId = Number(r.lastInsertRowid);
          saved.forEach((s, position) => {
            db.prepare(
              'INSERT INTO space_post_media (post_id, path, content_type, size_bytes, position, created_at) VALUES (?, ?, ?, ?, ?, ?)',
            ).run(postId, s.filename, s.type, s.buf.length, position, now);
          });
          return postId;
        });
      } catch (err) {
        unlinkSaved(saved);
        throw err;
      }
      recordFailure(db, rateKey);
      return c.json({ id, pending: approvedAt === null, edit_token: editToken }, 201);
    },
  );

  /** A student's own post can only be edited/recolored/deleted with the `edit_token` handed back
   *  once in the create response and held only in the browser tab's own memory — proving "this is
   *  the same tab that just posted this", not just "the same student_code again someday". A
   *  mismatched or missing token (including old posts from before this existed, which have no
   *  hash at all) always looks like "not found", the same as anything else not visible here. */
  function ownedStudentPostFor(section: SectionRow, postId: number, editToken: string): PostRow {
    const row = db.prepare('SELECT * FROM space_posts WHERE id = ?').get(postId) as PostRow | undefined;
    if (!row || row.deleted_at) throw notFound();
    const sp = rowById(row.space_id);
    if (!sp || sp.section_id !== section.id) throw notFound();
    if (row.author_kind !== 'student' || !row.edit_token_hash || hashToken(editToken) !== row.edit_token_hash) throw notFound();
    return row;
  }

  app.post('/public/space/post/:postId/delete', async (c) => {
    const body = await readJson(c);
    const { section } = resolveStudent(c, body);
    const postId = idParam(c, 'postId');
    const editToken = str(body.edit_token, 'edit_token', { max: 200 });
    ownedStudentPostFor(section, postId, editToken);
    const now = new Date().toISOString();
    tx(db, () => {
      db.prepare('UPDATE space_posts SET deleted_at = ? WHERE id = ?').run(now, postId);
      cascadeDeletePost(postId);
    });
    return c.json({ ok: true });
  });

  app.post(
    '/public/space/post/:postId/edit',
    bodyLimit({ maxSize: POST_IMAGE_BODY_LIMIT, onError: (c) => c.json({ error: 'ไฟล์รูปใหญ่เกินไป', code: 'too_large' }, 413) }),
    async (c) => {
      const contentType = c.req.header('content-type') ?? '';
      let body: Record<string, unknown>;
      let rawFiles: unknown = undefined;
      if (contentType.includes('multipart/form-data')) {
        const form = (await c.req.parseBody({ all: true })) as Record<string, unknown>;
        body = form;
        rawFiles = form.file;
      } else {
        body = await readJson(c);
      }

      const { section } = resolveStudent(c, body);
      const postId = idParam(c, 'postId');
      const editToken = str(body.edit_token, 'edit_token', { max: 200 });
      const row = ownedStudentPostFor(section, postId, editToken);
      const sp = rowById(row.space_id)!;

      await updatePostMediaAndContent(sp, postId, row, body, rawFiles);
      return c.json({ ok: true });
    },
  );

  app.post('/public/space/post/:postId/color', async (c) => {
    const body = await readJson(c);
    const { section } = resolveStudent(c, body);
    const postId = idParam(c, 'postId');
    const editToken = str(body.edit_token, 'edit_token', { max: 200 });
    ownedStudentPostFor(section, postId, editToken);
    const color = body.color === null ? null : str(body.color, 'สี', { max: 20 });
    if (color !== null && !(POST_COLORS as readonly string[]).includes(color)) throw bad('สีไม่ถูกต้อง');
    db.prepare('UPDATE space_posts SET color = ?, updated_at = ? WHERE id = ?').run(color, new Date().toISOString(), postId);
    return c.json({ ok: true });
  });

  // ---- comments: same trust model as posting, one level down (scoped to a post not a Space) ----
  app.post('/public/space/post/:postId/comments', async (c) => {
    const body = await readJson(c);
    const { section, student } = resolveStudent(c, body);
    const postId = idParam(c, 'postId');
    const { post, sp } = loadPostInSection(section, postId);
    assertPostVisible(post, student.id);
    return c.json({ comments: loadComments(section, sp, postId, student.id) });
  });

  app.post('/public/space/post/:postId/comment', async (c) => {
    const body = await readJson(c);
    const { section, student } = resolveStudent(c, body);
    const postId = idParam(c, 'postId');
    const { post, sp } = loadPostInSection(section, postId);
    assertPostVisible(post, student.id);
    if (sp.status !== 'open') throw conflict('ครูปิดรับการโต้ตอบชิ้นนี้ชั่วคราว');
    if (!sp.allow_comments) throw conflict('บอร์ดนี้ปิดการแสดงความคิดเห็น');
    const content = str(body.content, 'ข้อความ', { max: 1000 });
    const rateKey = `space-comment:${student.id}`;
    if (failures(db, rateKey) >= COMMENT_LIMIT) throw new HttpError(429, 'แสดงความคิดเห็นถี่เกินไป กรุณารอสักครู่แล้วลองใหม่', 'rate_limited');
    const now = new Date().toISOString();
    const id = db
      .prepare(`INSERT INTO space_comments (post_id, author_kind, student_id, content, created_at) VALUES (?, 'student', ?, ?, ?)`)
      .run(postId, student.id, content, now).lastInsertRowid;
    recordFailure(db, rateKey);
    return c.json({ id: Number(id) }, 201);
  });

  app.post(
    '/public/space/post/:postId/comment-image',
    bodyLimit({ maxSize: 8 * 1024 * 1024, onError: (c) => c.json({ error: 'ไฟล์รูปใหญ่เกินไป', code: 'too_large' }, 413) }),
    async (c) => {
      const form = (await c.req.parseBody()) as Record<string, unknown>;
      const { section, student } = resolveStudent(c, form);
      const postId = idParam(c, 'postId');
      const { post, sp } = loadPostInSection(section, postId);
      assertPostVisible(post, student.id);
      if (sp.status !== 'open') throw conflict('ครูปิดรับการโต้ตอบชิ้นนี้ชั่วคราว');
      if (!sp.allow_comments) throw conflict('บอร์ดนี้ปิดการแสดงความคิดเห็น');
      const file = form.file;
      if (!(file instanceof File)) throw bad('ไม่พบไฟล์รูปภาพ');
      const buf = Buffer.from(await file.arrayBuffer());
      if (buf.length === 0) throw bad('ไฟล์รูปว่างเปล่า');
      if (buf.length > IMAGE_MAX) throw bad('ไฟล์รูปใหญ่เกินไป (ไม่เกิน 6MB)');
      const type = sniffImageType(buf);
      if (!type) throw bad('รองรับเฉพาะไฟล์ JPEG, PNG หรือ WebP');
      const content = typeof form.content === 'string' ? form.content.trim().slice(0, 1000) : '';
      const rateKey = `space-comment:${student.id}`;
      if (failures(db, rateKey) >= COMMENT_LIMIT) throw new HttpError(429, 'แสดงความคิดเห็นถี่เกินไป กรุณารอสักครู่แล้วลองใหม่', 'rate_limited');
      if (!mediaDir) throw notFound();
      fs.mkdirSync(mediaDir, { recursive: true });
      const filename = `${crypto.randomBytes(16).toString('hex')}.${IMAGE_EXT[type]}`;
      fs.writeFileSync(path.join(mediaDir, filename), buf, { mode: 0o600 });
      const now = new Date().toISOString();
      let id: number;
      try {
        id = Number(
          db
            .prepare(
              `INSERT INTO space_comments (post_id, author_kind, student_id, content, image_path, image_content_type, created_at)
               VALUES (?, 'student', ?, ?, ?, ?, ?)`,
            )
            .run(postId, student.id, content || null, filename, type, now).lastInsertRowid,
        );
      } catch (err) {
        try {
          fs.unlinkSync(path.join(mediaDir, filename));
        } catch {
          // ignore
        }
        throw err;
      }
      recordFailure(db, rateKey);
      return c.json({ id }, 201);
    },
  );

  app.post('/public/space/comment/:commentId/delete', async (c) => {
    const body = await readJson(c);
    const { section, student } = resolveStudent(c, body);
    const commentId = idParam(c, 'commentId');
    const row = db.prepare('SELECT * FROM space_comments WHERE id = ?').get(commentId) as CommentRow | undefined;
    if (!row || row.deleted_at) throw notFound();
    const post = db.prepare('SELECT * FROM space_posts WHERE id = ?').get(row.post_id) as PostRow | undefined;
    if (!post) throw notFound();
    const sp = rowById(post.space_id);
    if (!sp || sp.section_id !== section.id) throw notFound();
    if (row.author_kind !== 'student' || row.student_id !== student.id) throw notFound();
    tx(db, () => {
      db.prepare('UPDATE space_comments SET deleted_at = ? WHERE id = ?').run(new Date().toISOString(), commentId);
      deleteCommentMedia(commentId);
    });
    return c.json({ ok: true });
  });

  // ---- reactions: one per person per post; sending the same kind again removes it ---------------
  app.post('/public/space/post/:postId/react', async (c) => {
    const body = await readJson(c);
    const { section, student } = resolveStudent(c, body);
    const postId = idParam(c, 'postId');
    const { post, sp } = loadPostInSection(section, postId);
    assertPostVisible(post, student.id);
    if (sp.status !== 'open') throw conflict('ครูปิดรับการโต้ตอบชิ้นนี้ชั่วคราว');
    if (!sp.allow_reactions) throw conflict('บอร์ดนี้ปิดการแสดงความรู้สึก');
    const actorKey = `student:${student.id}`;
    const rateKey = `space-react:${student.id}`;
    if (failures(db, rateKey) >= REACT_LIMIT) throw new HttpError(429, 'กดถี่เกินไป กรุณารอสักครู่แล้วลองใหม่', 'rate_limited');
    const kindRaw = body.kind;
    if (kindRaw === null || kindRaw === undefined || kindRaw === '') {
      db.prepare('DELETE FROM space_post_reactions WHERE post_id = ? AND actor_key = ?').run(postId, actorKey);
    } else {
      if (typeof kindRaw !== 'string' || !(REACTION_KINDS as readonly string[]).includes(kindRaw)) throw bad('ปฏิกิริยาไม่ถูกต้อง');
      const now = new Date().toISOString();
      const existing = db.prepare('SELECT kind FROM space_post_reactions WHERE post_id = ? AND actor_key = ?').get(postId, actorKey) as
        | { kind: string }
        | undefined;
      if (existing && existing.kind === kindRaw) {
        db.prepare('DELETE FROM space_post_reactions WHERE post_id = ? AND actor_key = ?').run(postId, actorKey);
      } else {
        db.prepare(
          `INSERT INTO space_post_reactions (post_id, actor_key, author_kind, student_id, kind, created_at) VALUES (?, ?, 'student', ?, ?, ?)
           ON CONFLICT(post_id, actor_key) DO UPDATE SET kind = excluded.kind, created_at = excluded.created_at`,
        ).run(postId, actorKey, student.id, kindRaw, now);
      }
    }
    recordFailure(db, rateKey);
    return c.json(reactionSummary(postId, actorKey));
  });

  // ---- the photo behind a post: gated by the section's own link token, not a student login -----
  // (everyone enrolled sees the same Wall, so this matches the trust level of the link itself —
  // unlike a quiz or exam answer, a Wall photo is not one student's private data)
  app.get('/public/space/media/:mediaId', (c) => {
    const mediaId = idParam(c, 'mediaId');
    const token = (c.req.query('token') ?? '').trim().toLowerCase();
    if (!/^[0-9a-f]{12}$/.test(token)) throw notFound();
    const row = db
      .prepare(
        `SELECT m.*, p.space_id FROM space_post_media m JOIN space_posts p ON p.id = m.post_id
          WHERE m.id = ? AND p.deleted_at IS NULL`,
      )
      .get(mediaId) as (MediaRow & { space_id: number }) | undefined;
    if (!row) throw notFound();
    const sp = rowById(row.space_id);
    if (!sp || sp.status === 'draft' || sp.status === 'archived') throw notFound();
    if (!db.prepare('SELECT 1 FROM sections WHERE id = ? AND share_token = ? AND active = 1').get(sp.section_id, token)) throw notFound();
    if (!mediaDir) throw notFound();
    const file = path.join(mediaDir, row.path);
    if (!fs.existsSync(file)) throw notFound();
    const stat = fs.statSync(file);
    const etag = `"${row.id}-${Math.floor(stat.mtimeMs)}"`;
    c.res.headers.set('ETag', etag);
    c.res.headers.set('Cache-Control', 'private, max-age=86400');
    if (c.req.header('if-none-match') === etag) {
      return c.body(null, 304);
    }
    return c.body(new Uint8Array(fs.readFileSync(file)), 200, { 'Content-Type': row.content_type, 'Cache-Control': 'private, max-age=86400', 'ETag': etag });
  });

  // ---- the photo behind a comment: same token-only gate as a post's photo -----------------------
  app.get('/public/space/media/comment/:commentId', (c) => {
    const commentId = idParam(c, 'commentId');
    const token = (c.req.query('token') ?? '').trim().toLowerCase();
    if (!/^[0-9a-f]{12}$/.test(token)) throw notFound();
    const row = db
      .prepare(
        `SELECT c.*, p.space_id FROM space_comments c JOIN space_posts p ON p.id = c.post_id
          WHERE c.id = ? AND c.deleted_at IS NULL`,
      )
      .get(commentId) as (CommentRow & { space_id: number }) | undefined;
    if (!row || !row.image_path) throw notFound();
    const sp = rowById(row.space_id);
    if (!sp || sp.status === 'draft' || sp.status === 'archived') throw notFound();
    if (!db.prepare('SELECT 1 FROM sections WHERE id = ? AND share_token = ? AND active = 1').get(sp.section_id, token)) throw notFound();
    if (!mediaDir) throw notFound();
    const file = path.join(mediaDir, row.image_path);
    if (!fs.existsSync(file)) throw notFound();
    const stat = fs.statSync(file);
    const etag = `"${row.id}-${Math.floor(stat.mtimeMs)}"`;
    c.res.headers.set('ETag', etag);
    c.res.headers.set('Cache-Control', 'private, max-age=86400');
    if (c.req.header('if-none-match') === etag) {
      return c.body(null, 304);
    }
    return c.body(new Uint8Array(fs.readFileSync(file)), 200, { 'Content-Type': row.image_content_type!, 'Cache-Control': 'private, max-age=86400', 'ETag': etag });
  });

  // ---- a single book's pages, opened from a shared link without a student login -----------------
  // Gated by the section's own share token (exactly like a post's photo): the link is public only
  // to whoever holds it. Only approved posts are shareable, so a still-pending student post is
  // never exposed ahead of the teacher's approval.
  app.get('/public/space/book/:postId', (c) => {
    const postId = idParam(c, 'postId');
    const token = (c.req.query('token') ?? '').trim().toLowerCase();
    if (!/^[0-9a-f]{12}$/.test(token)) throw notFound();
    const section = db.prepare('SELECT * FROM sections WHERE share_token = ? AND active = 1').get(token) as unknown as SectionRow | undefined;
    if (!section) throw notFound();
    const p = db
      .prepare(
        `SELECT p.*, sp.kind AS space_kind FROM space_posts p JOIN spaces sp ON sp.id = p.space_id
          WHERE p.id = ? AND p.deleted_at IS NULL AND p.approved_at IS NOT NULL
            AND sp.section_id = ? AND sp.deleted_at IS NULL`,
      )
      .get(postId, section.id) as (PostRow & { space_kind: 'blog' | 'book' }) | undefined;
    if (!p) throw notFound();
    const sp = rowById(p.space_id);
    if (!sp || sp.status === 'draft' || sp.status === 'archived') throw notFound();
    const media = db.prepare('SELECT * FROM space_post_media WHERE post_id = ? ORDER BY position').all(postId) as unknown as MediaRow[];
    return c.json({
      topic: p.topic,
      space_id: sp.id,
      images: media.map((m) => ({ id: m.id, url: `/api/public/space/media/${m.id}?token=${token}`, width: m.width, height: m.height })),
    });
  });

  return app;
}
