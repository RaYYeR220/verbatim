import { fail } from "@agent-native/core/action";
import { accessFilter, assertAccess, currentAccess, resolveAccess } from "@agent-native/core/sharing";
import { getRequestOrgId, getRequestUserEmail } from "@agent-native/core/server/request-context";
import { isSameRecord, saveIfCurrent } from "@agent-native/core/save-conflict/server";
import { and, desc, eq, ilike, inArray, or, sql } from "drizzle-orm";

import { getDb, schema } from "../db/index.js";
import type { Actor } from "./actor.js";
import { layoutBoard, unsortedSlot } from "./layout.js";
import type { Segment } from "./parse-source.js";
import { computeBoardHealth, evaluateInsight, voiceOf, type NoteLite } from "./rules.js";
import { THEME_COLORS, type BoardNote, type BoardPayload } from "./types.js";

export const newId = (prefix: string) => `${prefix}_${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`;
export const nowIso = () => new Date().toISOString();
const newRev = () => crypto.randomUUID().slice(0, 8);

function parseJson<T>(raw: string | null | undefined, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export async function requireStudy(studyId: string, role: "viewer" | "editor") {
  const access = await assertAccess("study", studyId, role);
  return access.resource as typeof schema.studies.$inferSelect;
}

export async function touchStudy(studyId: string) {
  await getDb().update(schema.studies).set({ updatedAt: nowIso() }).where(eq(schema.studies.id, studyId));
}

export async function recordEvent(e: {
  studyId: string;
  actor: Actor;
  action: string;
  summary: string;
  payload?: unknown;
}) {
  await getDb()
    .insert(schema.boardEvents)
    .values({
      id: newId("evt"),
      studyId: e.studyId,
      actor: e.actor,
      actorEmail: getRequestUserEmail() ?? null,
      action: e.action,
      summary: e.summary,
      payloadJson: JSON.stringify(e.payload ?? {}),
      createdAt: nowIso(),
    });
}

// ── studies ────────────────────────────────────────────────────────────────

export async function createStudy(input: { title: string; question?: string | null | undefined }) {
  const ownerEmail = getRequestUserEmail();
  if (!ownerEmail) fail("Sign in to create a study.", { errorCode: "unauthenticated", statusCode: 401 });
  const id = newId("stu");
  const at = nowIso();
  await getDb()
    .insert(schema.studies)
    .values({
      id,
      title: input.title,
      question: input.question ?? null,
      ownerEmail,
      orgId: getRequestOrgId() ?? null,
      createdAt: at,
      updatedAt: at,
    });
  return { id, title: input.title };
}

export async function listStudies() {
  const db = getDb();
  const rows = await db
    .select()
    .from(schema.studies)
    .where(accessFilter(schema.studies, schema.studyShares))
    .orderBy(desc(schema.studies.updatedAt));
  if (rows.length === 0) return [];
  const ids = rows.map((r) => r.id);
  const count = async (table: typeof schema.notes | typeof schema.themes | typeof schema.sources) => {
    const res = await db
      .select({ studyId: table.studyId, n: sql<number>`count(*)` })
      .from(table)
      .where(inArray(table.studyId, ids))
      .groupBy(table.studyId);
    return new Map(res.map((r) => [r.studyId, Number(r.n)]));
  };
  const [notes, themes, sources] = await Promise.all([count(schema.notes), count(schema.themes), count(schema.sources)]);
  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    question: r.question,
    updatedAt: r.updatedAt,
    visibility: r.visibility,
    ownerEmail: r.ownerEmail,
    notes: notes.get(r.id) ?? 0,
    themes: themes.get(r.id) ?? 0,
    sources: sources.get(r.id) ?? 0,
  }));
}

// ── sources ────────────────────────────────────────────────────────────────

export async function upsertParticipant(
  studyId: string,
  p: { label: string; segment?: string | null | undefined; attrs?: unknown },
) {
  const db = getDb();
  const [existing] = await db
    .select()
    .from(schema.participants)
    .where(and(eq(schema.participants.studyId, studyId), eq(schema.participants.label, p.label)))
    .limit(1);
  if (existing) return existing.id;
  const id = newId("par");
  await db.insert(schema.participants).values({
    id,
    studyId,
    label: p.label,
    segment: p.segment ?? null,
    attrsJson: JSON.stringify(p.attrs ?? {}),
    createdAt: nowIso(),
  });
  return id;
}

export async function insertSource(input: {
  studyId: string;
  participantId: string | null;
  kind: "interview" | "ticket" | "review" | "slack" | "clip" | "note";
  title: string;
  text: string;
  segments: Segment[];
  mediaUrl?: string | null | undefined;
  externalRef?: Record<string, unknown> | null | undefined;
}) {
  const id = newId("src");
  await getDb()
    .insert(schema.sources)
    .values({
      id,
      studyId: input.studyId,
      participantId: input.participantId,
      kind: input.kind,
      title: input.title,
      text: input.text,
      segmentsJson: JSON.stringify(input.segments),
      mediaUrl: input.mediaUrl ?? null,
      externalRefJson: input.externalRef ? JSON.stringify(input.externalRef) : null,
      createdAt: nowIso(),
    });
  return id;
}

export async function getSource(sourceId: string) {
  const [row] = await getDb().select().from(schema.sources).where(eq(schema.sources.id, sourceId)).limit(1);
  if (!row) fail(`Source ${sourceId} not found.`, { errorCode: "source_not_found", statusCode: 404 });
  return { ...row, segments: parseJson<Segment[]>(row.segmentsJson, []) };
}

export async function sourceSpans(sourceId: string) {
  const rows = await getDb()
    .select({ id: schema.notes.id, charStart: schema.notes.charStart, charEnd: schema.notes.charEnd, themeId: schema.notes.themeId })
    .from(schema.notes)
    .where(eq(schema.notes.sourceId, sourceId));
  return rows;
}

// ── notes ──────────────────────────────────────────────────────────────────

export async function insertNotes(
  rows: Array<{
    studyId: string;
    sourceId: string;
    charStart: number;
    charEnd: number;
    text: string;
    speaker: string | null;
    tMs: number | null;
    themeId: string | null;
    x: number;
    y: number;
    tags: string[];
    sentiment: "pos" | "neg" | "neu" | "mixed" | null;
    createdBy: Actor;
  }>,
) {
  if (rows.length === 0) return [];
  const at = nowIso();
  const values = rows.map((r) => ({
    id: newId("not"),
    studyId: r.studyId,
    sourceId: r.sourceId,
    charStart: r.charStart,
    charEnd: r.charEnd,
    text: r.text,
    speaker: r.speaker,
    tMs: r.tMs,
    themeId: r.themeId,
    x: r.x,
    y: r.y,
    tagsJson: JSON.stringify(r.tags),
    sentiment: r.sentiment,
    createdBy: r.createdBy === "user" ? "user" : "agent",
    verifiedAt: at,
    createdAt: at,
    updatedAt: at,
  }));
  await getDb().insert(schema.notes).values(values);
  return values;
}

export async function themeIdsInStudy(studyId: string) {
  const rows = await getDb().select({ id: schema.themes.id }).from(schema.themes).where(eq(schema.themes.studyId, studyId));
  return new Set(rows.map((r) => r.id));
}

export async function noteIdsInStudy(studyId: string, ids: string[]) {
  if (ids.length === 0) return new Set<string>();
  const rows = await getDb()
    .select({ id: schema.notes.id })
    .from(schema.notes)
    .where(and(eq(schema.notes.studyId, studyId), inArray(schema.notes.id, ids)));
  return new Set(rows.map((r) => r.id));
}

export async function updateNotePlacement(
  noteId: string,
  patch: { themeId?: string | null | undefined; x?: number | undefined; y?: number | undefined },
) {
  await getDb()
    .update(schema.notes)
    .set({ ...patch, updatedAt: nowIso() })
    .where(eq(schema.notes.id, noteId));
}

export const CARD_W = 240;
export const CARD_H = 120;
const SLOT_GAP = 16;
const SLOT_COLS = 3;

/**
 * Free card positions for `count` new notes: appended to a theme's grid
 * (relative to the theme anchor) or to the unsorted column left of x = 0.
 * Existing positions are never moved; `layout-board` tidies on request.
 */
export async function nextSlots(studyId: string, themeId: string | null, count: number) {
  const db = getDb();
  const existing = await db
    .select({ n: sql<number>`count(*)` })
    .from(schema.notes)
    .where(
      and(
        eq(schema.notes.studyId, studyId),
        themeId ? eq(schema.notes.themeId, themeId) : sql`${schema.notes.themeId} is null`,
      ),
    );
  const start = Number(existing[0]?.n ?? 0);
  if (!themeId) {
    return Array.from({ length: count }, (_, i) => unsortedSlot(start + i, CARD_W, CARD_H, SLOT_GAP));
  }
  const theme = await getTheme(themeId);
  return Array.from({ length: count }, (_, i) => {
    const k = start + i;
    return {
      x: theme.x + 16 + (k % SLOT_COLS) * (CARD_W + SLOT_GAP),
      y: theme.y + 56 + Math.floor(k / SLOT_COLS) * (CARD_H + SLOT_GAP),
    };
  });
}

// ── themes ─────────────────────────────────────────────────────────────────

export async function getTheme(themeId: string) {
  const [row] = await getDb().select().from(schema.themes).where(eq(schema.themes.id, themeId)).limit(1);
  if (!row) fail(`Theme ${themeId} not found.`, { errorCode: "theme_not_found", statusCode: 404 });
  return row;
}

export async function insertTheme(input: {
  studyId: string;
  name: string;
  color?: string | undefined;
  createdBy: Actor;
  x?: number | undefined;
  y?: number | undefined;
}) {
  const db = getDb();
  const existing = await db.select({ id: schema.themes.id }).from(schema.themes).where(eq(schema.themes.studyId, input.studyId));
  const color = input.color ?? THEME_COLORS[existing.length % THEME_COLORS.length];
  const id = newId("thm");
  const at = nowIso();
  // Without an explicit position, open the new theme to the right of everything on the board.
  let x = input.x;
  let y = input.y;
  if (x === undefined || y === undefined) {
    const [ext] = await db
      .select({ maxX: sql<number>`max(${schema.notes.x})`, minY: sql<number>`min(${schema.notes.y})` })
      .from(schema.notes)
      .where(and(eq(schema.notes.studyId, input.studyId), sql`${schema.notes.themeId} is not null`));
    const [thx] = await db
      .select({ maxX: sql<number>`max(${schema.themes.x})` })
      .from(schema.themes)
      .where(eq(schema.themes.studyId, input.studyId));
    const right = Math.max(Number(ext?.maxX ?? -Infinity) + CARD_W + 16, Number(thx?.maxX ?? -Infinity) + CARD_W * 3 + 64);
    x = x ?? (Number.isFinite(right) ? Math.round(right + 56) : 0);
    y = y ?? 0;
  }
  await db.insert(schema.themes).values({
    id,
    studyId: input.studyId,
    name: input.name,
    color,
    x,
    y,
    summary: null,
    rev: newRev(),
    createdBy: input.createdBy === "user" ? "user" : "agent",
    createdAt: at,
    updatedAt: at,
  });
  return { id, name: input.name, color };
}

/**
 * Writes theme text only if nobody changed the theme since the caller read
 * `expectedRev` (framework `saveIfCurrent`); a stale write fails with the typed
 * `save_conflict` carrying the current value, so human and agent edits never
 * silently overwrite each other.
 */
export async function updateThemeIfCurrent(
  themeId: string,
  expectedRev: string | undefined,
  patch: { name?: string | undefined; summary?: string | null | undefined; color?: string | undefined },
) {
  const db = getDb();
  const rev = newRev();
  type ThemeText = { name: string; summary: string | null; color: string };
  const { outcome, current } = await saveIfCurrent<ThemeText, { value: ThemeText; revision: string | null }>({
    record: "theme",
    expectedRevision: expectedRev,
    read: async () => {
      const t = await getTheme(themeId);
      return { value: { name: t.name, summary: t.summary, color: t.color }, revision: t.rev };
    },
    write: (cur) =>
      db
        .update(schema.themes)
        .set({ ...patch, rev, updatedAt: nowIso() })
        .where(and(eq(schema.themes.id, themeId), eq(schema.themes.rev, cur.revision ?? "")))
        .returning({ id: schema.themes.id }),
    isSameSave: (value) => isSameRecord({ ...value, ...patch }, value),
  });
  return {
    id: themeId,
    ...current.value,
    ...(outcome === "written" ? patch : {}),
    rev: outcome === "written" ? rev : current.revision,
    outcome,
  };
}

/** Shifts a theme frame and every note in it by (dx, dy). */
export async function shiftTheme(themeId: string, dx: number, dy: number) {
  const db = getDb();
  await db
    .update(schema.themes)
    .set({ x: sql`${schema.themes.x} + ${dx}`, y: sql`${schema.themes.y} + ${dy}`, updatedAt: nowIso() })
    .where(eq(schema.themes.id, themeId));
  await db
    .update(schema.notes)
    .set({ x: sql`${schema.notes.x} + ${dx}`, y: sql`${schema.notes.y} + ${dy}`, updatedAt: nowIso() })
    .where(eq(schema.notes.themeId, themeId));
}

export async function deleteThemeRow(themeId: string) {
  const db = getDb();
  await db.update(schema.notes).set({ themeId: null, updatedAt: nowIso() }).where(eq(schema.notes.themeId, themeId));
  await db.update(schema.insights).set({ themeId: null, updatedAt: nowIso() }).where(eq(schema.insights.themeId, themeId));
  await db.delete(schema.themes).where(eq(schema.themes.id, themeId));
}

export async function moveAllNotes(fromThemeId: string, toThemeId: string) {
  await getDb()
    .update(schema.notes)
    .set({ themeId: toThemeId, updatedAt: nowIso() })
    .where(eq(schema.notes.themeId, fromThemeId));
  await getDb()
    .update(schema.insights)
    .set({ themeId: toThemeId, updatedAt: nowIso() })
    .where(eq(schema.insights.themeId, fromThemeId));
}

// ── board ──────────────────────────────────────────────────────────────────

async function loadStudyRows(studyId: string) {
  const db = getDb();
  const [participants, sources, notes, themes, insights, comments] = await Promise.all([
    db.select().from(schema.participants).where(eq(schema.participants.studyId, studyId)),
    db.select().from(schema.sources).where(eq(schema.sources.studyId, studyId)),
    db.select().from(schema.notes).where(eq(schema.notes.studyId, studyId)),
    db.select().from(schema.themes).where(eq(schema.themes.studyId, studyId)).orderBy(schema.themes.createdAt),
    db.select().from(schema.insights).where(eq(schema.insights.studyId, studyId)).orderBy(schema.insights.createdAt),
    db
      .select()
      .from(schema.comments)
      .where(eq(schema.comments.studyId, studyId))
      .orderBy(desc(schema.comments.createdAt))
      .limit(100),
  ]);
  return { participants, sources, notes, themes, insights, comments };
}

export function toNoteLite(
  n: typeof schema.notes.$inferSelect,
  sourceById: Map<string, typeof schema.sources.$inferSelect>,
): NoteLite {
  const src = sourceById.get(n.sourceId);
  return {
    id: n.id,
    sourceId: n.sourceId,
    participantId: src?.participantId ?? null,
    themeId: n.themeId,
    verified: Boolean(n.verifiedAt),
    textMatchesSource: Boolean(src) && src!.text.slice(n.charStart, n.charEnd) === n.text,
  };
}

export async function getBoard(studyId: string): Promise<BoardPayload> {
  return boardFor(await requireStudy(studyId, "viewer"));
}

/**
 * The board behind a shared readout link: anyone may read a study whose
 * visibility is public; anyone else needs access to it, or a caller-verified
 * study-scoped agent token (`trusted`). Null when none of these hold.
 */
export async function getSharedBoard(studyId: string, opts: { trusted?: boolean } = {}): Promise<BoardPayload | null> {
  // guard:allow-unscoped -- the row is used only after the public or resolveAccess check below.
  const [study] = await getDb().select().from(schema.studies).where(eq(schema.studies.id, studyId)).limit(1);
  if (!study) return null;
  if (study.visibility === "public" || opts.trusted) return boardFor(study);
  const allowed = await resolveAccess("study", studyId, currentAccess()).catch(() => null);
  if (!allowed) return null;
  return boardFor(study);
}

/** Board data for a study the caller has already been allowed to read. */
async function boardFor(study: typeof schema.studies.$inferSelect): Promise<BoardPayload> {
  const studyId = study.id;
  const rows = await loadStudyRows(studyId);
  const sourceById = new Map(rows.sources.map((s) => [s.id, s]));
  const lites = rows.notes.map((n) => toNoteLite(n, sourceById));
  const liteById = new Map(lites.map((l) => [l.id, l]));

  const notes: BoardNote[] = rows.notes.map((n) => {
    const lite = liteById.get(n.id)!;
    return {
      id: n.id,
      sourceId: n.sourceId,
      participantId: lite.participantId,
      text: n.text,
      speaker: n.speaker,
      tMs: n.tMs,
      themeId: n.themeId,
      x: n.x,
      y: n.y,
      tags: parseJson<string[]>(n.tagsJson, []),
      sentiment: n.sentiment,
      createdBy: n.createdBy,
      verified: lite.verified,
      matchesSource: lite.textMatchesSource,
    };
  });

  const themeStats = new Map<string, { notes: number; voices: Set<string> }>();
  for (const l of lites) {
    if (!l.themeId) continue;
    const s = themeStats.get(l.themeId) ?? { notes: 0, voices: new Set<string>() };
    s.notes += 1;
    s.voices.add(voiceOf(l));
    themeStats.set(l.themeId, s);
  }

  const insights = rows.insights.map((i) => {
    const noteIds = parseJson<string[]>(i.noteIdsJson, []);
    return {
      id: i.id,
      themeId: i.themeId,
      claim: i.claim,
      noteIds,
      status: i.status as "verified" | "anecdote",
      rev: i.rev,
      createdBy: i.createdBy,
      check: evaluateInsight(noteIds, liteById),
    };
  });

  const health = computeBoardHealth({
    notes: lites,
    themes: rows.themes.map((t) => ({ id: t.id, name: t.name })),
    insights: insights.map((i) => ({ id: i.id, themeId: i.themeId, status: i.check.status === "invalid" ? "invalid" : i.status, noteIds: i.noteIds, claim: i.claim })),
    sourceIds: rows.sources.map((s) => s.id),
  });

  const notesBySource = new Map<string, number>();
  for (const n of rows.notes) notesBySource.set(n.sourceId, (notesBySource.get(n.sourceId) ?? 0) + 1);

  return {
    study: {
      id: study.id,
      title: study.title,
      question: study.question,
      visibility: study.visibility,
      ownerEmail: study.ownerEmail,
      updatedAt: study.updatedAt,
    },
    participants: rows.participants.map((p) => ({ id: p.id, label: p.label, segment: p.segment })),
    sources: rows.sources.map((s) => ({
      id: s.id,
      title: s.title,
      kind: s.kind,
      participantId: s.participantId,
      chars: s.text.length,
      noteCount: notesBySource.get(s.id) ?? 0,
      mediaUrl: s.mediaUrl,
      externalRef: parseJson<Record<string, unknown> | null>(s.externalRefJson, null),
    })),
    notes,
    themes: rows.themes.map((t) => ({
      id: t.id,
      name: t.name,
      color: t.color,
      x: t.x,
      y: t.y,
      summary: t.summary,
      rev: t.rev,
      createdBy: t.createdBy,
      noteCount: themeStats.get(t.id)?.notes ?? 0,
      voiceCount: themeStats.get(t.id)?.voices.size ?? 0,
    })),
    insights,
    comments: rows.comments.map((c) => ({
      id: c.id,
      targetType: c.targetType,
      targetId: c.targetId,
      body: c.body,
      authorEmail: c.authorEmail,
      status: c.status,
      replyBody: c.replyBody,
      createdAt: c.createdAt,
    })),
    health,
  };
}

export async function liteNotesForStudy(studyId: string) {
  const rows = await loadStudyRows(studyId);
  const sourceById = new Map(rows.sources.map((s) => [s.id, s]));
  return { rows, lites: rows.notes.map((n) => toNoteLite(n, sourceById)) };
}

/** Lays out the whole board deterministically and persists every position. */
export async function applyLayout(studyId: string) {
  const db = getDb();
  const rows = await loadStudyRows(studyId);
  const counts = new Map<string, number>();
  for (const n of rows.notes) if (n.themeId) counts.set(n.themeId, (counts.get(n.themeId) ?? 0) + 1);
  const layout = layoutBoard({
    // Biggest themes first, so the board reads left to right by how many people said it.
    themes: [...rows.themes]
      .sort((a, b) => (counts.get(b.id) ?? 0) - (counts.get(a.id) ?? 0) || a.createdAt.localeCompare(b.createdAt))
      .map((t) => ({ id: t.id })),
    notes: rows.notes
      .slice()
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id))
      .map((n) => ({ id: n.id, themeId: n.themeId })),
  });
  for (const [id, f] of Object.entries(layout.themes)) {
    await db.update(schema.themes).set({ x: f.x, y: f.y }).where(eq(schema.themes.id, id));
  }
  for (const [id, p] of Object.entries(layout.notes)) {
    await db.update(schema.notes).set({ x: p.x, y: p.y }).where(eq(schema.notes.id, id));
  }
  return layout;
}

// ── insights ───────────────────────────────────────────────────────────────

export async function getInsight(insightId: string) {
  const [row] = await getDb().select().from(schema.insights).where(eq(schema.insights.id, insightId)).limit(1);
  if (!row) fail(`Insight ${insightId} not found.`, { errorCode: "insight_not_found", statusCode: 404 });
  return row;
}

export async function saveInsight(input: {
  studyId: string;
  insightId?: string | undefined;
  expectedRev?: string | undefined;
  themeId: string | null;
  claim: string;
  noteIds: string[];
  status: "verified" | "anecdote";
  check: unknown;
  createdBy: Actor;
}) {
  const db = getDb();
  const at = nowIso();
  if (input.insightId) {
    const insightId = input.insightId;
    const rev = newRev();
    const next = { claim: input.claim, themeId: input.themeId, noteIds: input.noteIds };
    type InsightText = { claim: string; themeId: string | null; noteIds: string[] };
    const { outcome, current } = await saveIfCurrent<InsightText, { value: InsightText; revision: string | null }>({
      record: "insight",
      expectedRevision: input.expectedRev,
      read: async () => {
        const row = await getInsight(insightId);
        return {
          value: { claim: row.claim, themeId: row.themeId, noteIds: parseJson<string[]>(row.noteIdsJson, []) },
          revision: row.rev,
        };
      },
      write: (cur) =>
        db
          .update(schema.insights)
          .set({
            themeId: input.themeId,
            claim: input.claim,
            noteIdsJson: JSON.stringify(input.noteIds),
            status: input.status,
            checkJson: JSON.stringify(input.check),
            rev,
            updatedAt: at,
          })
          .where(and(eq(schema.insights.id, insightId), eq(schema.insights.rev, cur.revision ?? "")))
          .returning({ id: schema.insights.id }),
      isSameSave: (value) => isSameRecord(value, next),
    });
    return { id: insightId, rev: outcome === "written" ? rev : (current.revision ?? rev) };
  }
  const id = newId("ins");
  const rev = newRev();
  await db.insert(schema.insights).values({
    id,
    studyId: input.studyId,
    themeId: input.themeId,
    claim: input.claim,
    noteIdsJson: JSON.stringify(input.noteIds),
    status: input.status,
    checkJson: JSON.stringify(input.check),
    rev,
    createdBy: input.createdBy === "user" ? "user" : "agent",
    createdAt: at,
    updatedAt: at,
  });
  return { id, rev };
}

// ── search ─────────────────────────────────────────────────────────────────

export async function searchQuotes(input: { studyId?: string | undefined; query: string; limit: number }) {
  const db = getDb();
  const terms = input.query
    .toLowerCase()
    .split(/[^\p{L}\p{N}']+/u)
    .filter((t) => t.length >= 3)
    .slice(0, 8);
  if (terms.length === 0) return [];
  let studyIds: string[];
  if (input.studyId) {
    await requireStudy(input.studyId, "viewer");
    studyIds = [input.studyId];
  } else {
    const rows = await db
      .select({ id: schema.studies.id })
      .from(schema.studies)
      .where(accessFilter(schema.studies, schema.studyShares));
    studyIds = rows.map((r) => r.id);
  }
  if (studyIds.length === 0) return [];
  const matches = await db
    .select({
      id: schema.notes.id,
      studyId: schema.notes.studyId,
      sourceId: schema.notes.sourceId,
      text: schema.notes.text,
      speaker: schema.notes.speaker,
      tMs: schema.notes.tMs,
      themeId: schema.notes.themeId,
      themeName: schema.themes.name,
      sourceTitle: schema.sources.title,
    })
    .from(schema.notes)
    .leftJoin(schema.themes, eq(schema.themes.id, schema.notes.themeId))
    .leftJoin(schema.sources, eq(schema.sources.id, schema.notes.sourceId))
    .where(
      and(
        inArray(schema.notes.studyId, studyIds),
        or(...terms.flatMap((t) => [ilike(schema.notes.text, `%${t}%`), ilike(schema.themes.name, `%${t}%`)])),
      ),
    )
    .limit(400);
  const scored = matches.map((m) => {
    const hay = `${m.text} ${m.themeName ?? ""}`.toLowerCase();
    return { ...m, score: terms.filter((t) => hay.includes(t)).length };
  });
  scored.sort((a, b) => b.score - a.score || a.text.length - b.text.length);
  return scored.slice(0, input.limit);
}

// ── demo workspaces ────────────────────────────────────────────────────────

/**
 * Copies a study (sources, participants, notes, themes, insights) to a new
 * owner, remapping every id. Used to give a guest their own editable copy of
 * a seeded demo board; the original is never touched.
 */
export async function cloneStudyForOwner(templateStudyId: string, ownerEmail: string, titleSuffix = "") {
  const db = getDb();
  const [study] = await db.select().from(schema.studies).where(eq(schema.studies.id, templateStudyId)).limit(1);
  if (!study) return null;
  const rows = await loadStudyRows(templateStudyId);
  const at = nowIso();
  const studyId = newId("stu");
  const ids = new Map<string, string>();
  const map = (prefix: string, old: string | null) => {
    if (!old) return null;
    if (!ids.has(old)) ids.set(old, newId(prefix));
    return ids.get(old)!;
  };
  await db.insert(schema.studies).values({
    id: studyId,
    title: `${study.title}${titleSuffix}`,
    question: study.question,
    ownerEmail,
    orgId: null,
    visibility: "private",
    createdAt: at,
    updatedAt: at,
  });
  if (rows.participants.length)
    await db.insert(schema.participants).values(rows.participants.map((p) => ({ ...p, id: map("par", p.id)!, studyId })));
  if (rows.sources.length)
    await db
      .insert(schema.sources)
      .values(rows.sources.map((s) => ({ ...s, id: map("src", s.id)!, studyId, participantId: map("par", s.participantId) })));
  if (rows.themes.length)
    await db.insert(schema.themes).values(rows.themes.map((t) => ({ ...t, id: map("thm", t.id)!, studyId })));
  for (let i = 0; i < rows.notes.length; i += 200) {
    await db.insert(schema.notes).values(
      rows.notes.slice(i, i + 200).map((n) => ({
        ...n,
        id: map("not", n.id)!,
        studyId,
        sourceId: map("src", n.sourceId)!,
        themeId: map("thm", n.themeId),
      })),
    );
  }
  if (rows.insights.length)
    await db.insert(schema.insights).values(
      rows.insights.map((i) => ({
        ...i,
        id: map("ins", i.id)!,
        studyId,
        themeId: map("thm", i.themeId),
        noteIdsJson: JSON.stringify(parseJson<string[]>(i.noteIdsJson, []).map((n) => map("not", n))),
      })),
    );
  return { id: studyId, title: study.title };
}

export async function studiesOwnedBy(ownerEmail: string) {
  return getDb().select({ id: schema.studies.id }).from(schema.studies).where(eq(schema.studies.ownerEmail, ownerEmail));
}
