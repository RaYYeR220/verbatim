import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";

import type { BoardNote, BoardPayload, BoardSource } from "../../../server/verbatim/types";
import { AgentCursors, FramesLayer, NotesLayer, noteMetaLine } from "./BoardLayers";
import "./board.css";
import { CARD_H, CARD_W, type ThemeFrame } from "./use-board";
import type { AgentOnBoard } from "./use-board-presence";
import { useViewport } from "./use-viewport";

type Drag =
  | { kind: "notes"; ids: string[]; startX: number; startY: number; moved: boolean; pointerId: number }
  | { kind: "theme"; id: string; startX: number; startY: number; moved: boolean; pointerId: number }
  | { kind: "pan"; startClientX: number; startClientY: number; moved: boolean; pointerId: number }
  | { kind: "lasso"; startX: number; startY: number; curX: number; curY: number; pointerId: number };

export interface BoardCanvasProps {
  board: BoardPayload;
  frames: ThemeFrame[];
  hueByTheme: Map<string, string>;
  selected: ReadonlySet<string>;
  onSelect: (ids: string[], mode: "replace" | "toggle" | "add") => void;
  agents: AgentOnBoard[];
  followAgent: boolean;
  focusNoteId: string | null;
  focusThemeId: string | null;
  onMoveNotes: (moves: Array<{ noteId: string; themeId: string | null; x: number; y: number }>) => void;
  onMoveTheme: (themeId: string, dx: number, dy: number) => void;
  onRenameTheme: (themeId: string, name: string) => void;
  onOpenNote: (note: BoardNote) => void;
  onSelectTheme: (themeId: string | null) => void;
  toolbar?: React.ReactNode;
}

const SLOT_GAP = 16;

/**
 * Drops notes into the free grid slots of a theme frame nearest to where they
 * were let go, so a drop never lands one card on top of another.
 */
function snapIntoFrame(frame: ThemeFrame, moving: BoardNote[], dx: number, dy: number, movingIds: string[]) {
  const ox = frame.x + 16;
  const oy = frame.y + 56;
  const stepX = CARD_W + SLOT_GAP;
  const stepY = CARD_H + SLOT_GAP;
  const staying = frame.notes.filter((n) => !movingIds.includes(n.id));
  const taken = new Set(staying.map((n) => `${Math.round((n.x - ox) / stepX)}:${Math.round((n.y - oy) / stepY)}`));
  const cols = Math.max(3, Math.round(frame.w / stepX));
  return moving.map((n) => {
    const want = { c: Math.round((n.x + dx - ox) / stepX), r: Math.round((n.y + dy - oy) / stepY) };
    let best = { c: 0, r: 0, d: Infinity };
    for (let r = 0; r <= Math.ceil((staying.length + moving.length) / cols) + 2; r += 1) {
      for (let c = 0; c < cols; c += 1) {
        if (taken.has(`${c}:${r}`)) continue;
        const dist = Math.hypot(c - want.c, r - want.r);
        if (dist < best.d) best = { c, r, d: dist };
      }
    }
    taken.add(`${best.c}:${best.r}`);
    return { noteId: n.id, themeId: frame.theme.id, x: ox + best.c * stepX, y: oy + best.r * stepY };
  });
}

const zoomBand = (scale: number) => (scale >= 0.55 ? "near" : scale >= 0.28 ? "mid" : "far");

export function BoardCanvas(props: BoardCanvasProps) {
  const { board, frames, hueByTheme, selected, onSelect, agents, followAgent, focusNoteId, focusThemeId } = props;
  const container = useRef<HTMLDivElement | null>(null);
  const { vp, setVp, toWorld, zoomAt, fit, reveal } = useViewport(container);
  const drag = useRef<Drag | null>(null);
  const [lasso, setLasso] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const [dropThemeId, setDropThemeId] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [hover, setHover] = useState<{ id: string; x: number; y: number } | null>(null);
  const [panning, setPanning] = useState(false);
  const fittedFor = useRef<string | null>(null);

  const sources = useMemo(() => new Map<string, BoardSource>(board.sources.map((s) => [s.id, s])), [board.sources]);
  const noteById = useMemo(() => new Map(board.notes.map((n) => [n.id, n])), [board.notes]);
  const insightByTheme = useMemo(() => {
    const m = new Map<string, { status: string; claim: string }>();
    for (const i of board.insights) if (i.themeId && !m.has(i.themeId)) m.set(i.themeId, { status: i.status, claim: i.claim });
    return m;
  }, [board.insights]);
  const commentCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const c of board.comments) if (c.targetId && c.status !== "done") m.set(c.targetId, (m.get(c.targetId) ?? 0) + 1);
    return m;
  }, [board.comments]);

  const bounds = useMemo(() => {
    if (board.notes.length === 0) return null;
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const f of frames) {
      minX = Math.min(minX, f.x);
      minY = Math.min(minY, f.y);
      maxX = Math.max(maxX, f.x + f.w);
      maxY = Math.max(maxY, f.y + f.h);
    }
    for (const n of board.notes) {
      minX = Math.min(minX, n.x);
      minY = Math.min(minY, n.y);
      maxX = Math.max(maxX, n.x + CARD_W);
      maxY = Math.max(maxY, n.y + CARD_H);
    }
    return { x: minX, y: minY - 40, w: maxX - minX, h: maxY - minY + 40 };
  }, [board.notes, frames]);

  // Fit once per study when the board first has content.
  useEffect(() => {
    if (!bounds || fittedFor.current === board.study.id) return;
    fittedFor.current = board.study.id;
    // Small boards open at reading size; big ones open as the whole map.
    fit(bounds, board.notes.length < 80 ? { minScale: 0.62 } : {});
  }, [board.study.id, bounds, fit]);

  // Bring a focused note or theme into view.
  useEffect(() => {
    const n = focusNoteId ? noteById.get(focusNoteId) : undefined;
    if (n) reveal({ x: n.x, y: n.y, w: CARD_W, h: CARD_H });
  }, [focusNoteId, noteById, reveal]);
  useEffect(() => {
    const f = focusThemeId ? frames.find((fr) => fr.theme.id === focusThemeId) : undefined;
    if (f) reveal(f);
    // only when the focus changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusThemeId]);

  const agentNotes = useMemo(() => new Set(agents.flatMap((a) => a.pointer?.noteIds ?? [])), [agents]);
  const agentThemeId = agents.find((a) => a.pointer?.themeId)?.pointer?.themeId ?? null;

  const positionFor = useCallback(
    (a: AgentOnBoard) => {
      const ids = a.pointer?.noteIds ?? [];
      const pts = ids.map((id) => noteById.get(id)).filter((n): n is BoardNote => !!n);
      if (pts.length > 0) {
        const last = pts[pts.length - 1]!;
        return { x: last.x + CARD_W - 18, y: last.y + CARD_H - 22 };
      }
      const themeId = a.pointer?.themeId;
      const f = themeId ? frames.find((fr) => fr.theme.id === themeId) : undefined;
      if (f) return { x: f.x + Math.min(f.w - 40, 220), y: f.y + 18 };
      if (bounds) return { x: bounds.x + 24, y: bounds.y + 24 };
      return null;
    },
    [noteById, frames, bounds],
  );

  // Follow the agent: keep what it is touching on screen.
  useEffect(() => {
    if (!followAgent) return;
    for (const a of agents) {
      const p = positionFor(a);
      if (p) {
        reveal({ x: p.x - 120, y: p.y - 80, w: 280, h: 200 });
        break;
      }
    }
  }, [agents, followAgent, positionFor, reveal]);

  const frameAt = useCallback(
    (wx: number, wy: number) => frames.find((f) => wx >= f.x && wx <= f.x + f.w && wy >= f.y && wy <= f.y + f.h) ?? null,
    [frames],
  );

  const setDraggedTransform = (ids: string[], dx: number, dy: number, on: boolean) => {
    const root = container.current;
    if (!root) return;
    for (const id of ids) {
      const el = root.querySelector<HTMLElement>(`[data-note-id="${id}"]`);
      if (!el) continue;
      el.style.transform = on ? `translate(${dx}px, ${dy}px)` : "";
      if (on) el.dataset.dragging = "true";
      else delete el.dataset.dragging;
    }
  };

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 && e.pointerType === "mouse") return;
    const target = e.target as HTMLElement;
    const noteEl = target.closest<HTMLElement>("[data-note-id]");
    const themeHandle = target.closest<HTMLElement>("[data-theme-handle]");
    const w = toWorld(e.clientX, e.clientY);
    container.current?.setPointerCapture(e.pointerId);
    setHover(null);
    if (noteEl) {
      const id = noteEl.dataset.noteId!;
      if (e.shiftKey || e.metaKey || e.ctrlKey) {
        onSelect([id], "toggle");
        drag.current = null;
        return;
      }
      const ids = selected.has(id) ? [...selected] : [id];
      if (!selected.has(id)) onSelect([id], "replace");
      drag.current = { kind: "notes", ids, startX: w.x, startY: w.y, moved: false, pointerId: e.pointerId };
      return;
    }
    if (themeHandle && !target.closest("[contenteditable='true']")) {
      drag.current = { kind: "theme", id: themeHandle.dataset.themeHandle!, startX: w.x, startY: w.y, moved: false, pointerId: e.pointerId };
      return;
    }
    if (e.shiftKey) {
      drag.current = { kind: "lasso", startX: w.x, startY: w.y, curX: w.x, curY: w.y, pointerId: e.pointerId };
      return;
    }
    drag.current = { kind: "pan", startClientX: e.clientX, startClientY: e.clientY, moved: false, pointerId: e.pointerId };
  };

  const panStart = useRef({ x: 0, y: 0 });
  const vpRef = useRef(vp);
  vpRef.current = vp;

  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d) {
      const noteEl = (e.target as HTMLElement).closest<HTMLElement>("[data-note-id]");
      const id = noteEl?.dataset.noteId;
      if (id && vpRef.current.scale < 0.95) {
        const rect = container.current!.getBoundingClientRect();
        setHover((h) => (h?.id === id ? h : { id, x: e.clientX - rect.left, y: e.clientY - rect.top }));
      } else if (!id && hover) setHover(null);
      return;
    }
    const w = toWorld(e.clientX, e.clientY);
    if (d.kind === "notes") {
      const dx = w.x - d.startX;
      const dy = w.y - d.startY;
      if (!d.moved && Math.hypot(dx, dy) * vpRef.current.scale < 4) return;
      d.moved = true;
      setDraggedTransform(d.ids, dx, dy, true);
      const f = frameAt(w.x, w.y);
      setDropThemeId(f?.theme.id ?? null);
    } else if (d.kind === "theme") {
      const dx = w.x - d.startX;
      const dy = w.y - d.startY;
      if (!d.moved && Math.hypot(dx, dy) * vpRef.current.scale < 4) return;
      d.moved = true;
      const el = container.current?.querySelector<HTMLElement>(`[data-theme-id="${d.id}"]`);
      if (el) el.style.transform = `translate(${dx}px, ${dy}px)`;
      const ids = board.notes.filter((n) => n.themeId === d.id).map((n) => n.id);
      setDraggedTransform(ids, dx, dy, true);
    } else if (d.kind === "pan") {
      const dx = e.clientX - d.startClientX;
      const dy = e.clientY - d.startClientY;
      if (!d.moved) {
        if (Math.hypot(dx, dy) < 3) return;
        d.moved = true;
        panStart.current = { x: vpRef.current.x, y: vpRef.current.y };
        setPanning(true);
      }
      const el = container.current?.querySelector<HTMLElement>(".vb-world");
      const v = vpRef.current;
      if (el) el.style.transform = `translate(${panStart.current.x + dx}px, ${panStart.current.y + dy}px) scale(${v.scale})`;
    } else if (d.kind === "lasso") {
      d.curX = w.x;
      d.curY = w.y;
      setLasso({ x: Math.min(d.startX, w.x), y: Math.min(d.startY, w.y), w: Math.abs(w.x - d.startX), h: Math.abs(w.y - d.startY) });
    }
  };

  const onPointerUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    drag.current = null;
    container.current?.releasePointerCapture?.(e.pointerId);
    if (!d) return;
    const w = toWorld(e.clientX, e.clientY);
    if (d.kind === "notes") {
      setDropThemeId(null);
      if (!d.moved) {
        setDraggedTransform(d.ids, 0, 0, false);
        return;
      }
      const dx = w.x - d.startX;
      const dy = w.y - d.startY;
      const f = frameAt(w.x, w.y);
      const moving = d.ids.map((id) => noteById.get(id)).filter((n): n is BoardNote => !!n);
      const moves = f
        ? snapIntoFrame(f, moving, dx, dy, d.ids)
        : moving.map((n) => ({ noteId: n.id, themeId: null, x: Math.round(n.x + dx), y: Math.round(n.y + dy) }));
      setDraggedTransform(d.ids, 0, 0, false);
      props.onMoveNotes(moves);
    } else if (d.kind === "theme") {
      const el = container.current?.querySelector<HTMLElement>(`[data-theme-id="${d.id}"]`);
      if (el) el.style.transform = "";
      const ids = board.notes.filter((n) => n.themeId === d.id).map((n) => n.id);
      setDraggedTransform(ids, 0, 0, false);
      if (!d.moved) {
        props.onSelectTheme(d.id);
        return;
      }
      props.onMoveTheme(d.id, Math.round(w.x - d.startX), Math.round(w.y - d.startY));
    } else if (d.kind === "pan") {
      setPanning(false);
      if (!d.moved) {
        onSelect([], "replace");
        props.onSelectTheme(null);
        return;
      }
      const nx = panStart.current.x + (e.clientX - d.startClientX);
      const ny = panStart.current.y + (e.clientY - d.startClientY);
      setVp((v) => ({ ...v, x: nx, y: ny }));
    } else if (d.kind === "lasso") {
      setLasso(null);
      const x0 = Math.min(d.startX, d.curX);
      const y0 = Math.min(d.startY, d.curY);
      const x1 = Math.max(d.startX, d.curX);
      const y1 = Math.max(d.startY, d.curY);
      const ids = board.notes.filter((n) => n.x < x1 && n.x + CARD_W > x0 && n.y < y1 && n.y + CARD_H > y0).map((n) => n.id);
      onSelect(ids, e.metaKey || e.ctrlKey ? "add" : "replace");
    }
  };

  const onDoubleClick = (e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    const rename = target.closest<HTMLElement>("[data-rename]");
    if (rename) {
      setRenamingId(rename.dataset.rename!);
      return;
    }
    const noteEl = target.closest<HTMLElement>("[data-note-id]");
    const n = noteEl ? noteById.get(noteEl.dataset.noteId!) : undefined;
    if (n) props.onOpenNote(n);
  };

  const commitRename = useCallback(
    (themeId: string, name: string) => {
      setRenamingId(null);
      const clean = name.replace(/\s+/g, " ").trim();
      const theme = board.themes.find((t) => t.id === themeId);
      if (clean && theme && clean !== theme.name) props.onRenameTheme(themeId, clean);
    },
    [board.themes, props],
  );

  const hoverNote = hover ? noteById.get(hover.id) : undefined;
  const unsortedCount = board.notes.filter((n) => !n.themeId).length;

  return (
    <div
      ref={container}
      className="vb-board h-full w-full"
      data-zoom={zoomBand(vp.scale)}
      data-panning={panning ? "true" : undefined}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onPointerLeave={() => setHover(null)}
      onDoubleClick={onDoubleClick}
      role="application"
      aria-label="Research board"
    >
      <div className="vb-world" style={{ transform: `translate(${vp.x}px, ${vp.y}px) scale(${vp.scale})` }}>
        {unsortedCount > 0 ? (
          <div className="vb-column-label" style={{ left: -(CARD_W + 72), top: -28 }}>
            UNSORTED · {unsortedCount}
          </div>
        ) : null}
        <FramesLayer
          frames={frames}
          hueByTheme={hueByTheme}
          dropThemeId={dropThemeId}
          agentThemeId={agentThemeId}
          focusThemeId={focusThemeId}
          insightByTheme={insightByTheme}
          renamingId={renamingId}
          onRenameCommit={commitRename}
          onRenameCancel={() => setRenamingId(null)}
        />
        <NotesLayer
          notes={board.notes}
          sources={sources}
          hueByTheme={hueByTheme}
          selected={selected}
          agentNotes={agentNotes}
          focusNoteId={focusNoteId}
          commentCounts={commentCounts}
        />
        {lasso ? <div className="vb-lasso" style={{ left: lasso.x, top: lasso.y, width: lasso.w, height: lasso.h }} /> : null}
        <AgentCursors agents={agents} positionFor={positionFor} />
      </div>

      {zoomBand(vp.scale) !== "near" ? (
        <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
          {frames.map((f) => {
            const left = f.x * vp.scale + vp.x;
            const top = f.y * vp.scale + vp.y;
            const width = f.w * vp.scale;
            if (left + width < 0 || top > (container.current?.clientHeight ?? 2000) || width < 56) return null;
            return (
              <div key={f.theme.id} className="vb-frame-label" style={{ left: Math.max(left + 4, 4), top: Math.max(top + 4, 2), maxWidth: Math.max(width - 8, 120) }}>
                <span className="dot" style={{ background: hueByTheme.get(f.theme.id) }} />
                <span className="name">{f.theme.name}</span>
                <span className="n">{f.theme.voiceCount}</span>
              </div>
            );
          })}
        </div>
      ) : null}

      {hoverNote ? (
        <div className="vb-chip" style={{ left: Math.min(hover!.x + 16, (container.current?.clientWidth ?? 800) - 356), top: hover!.y + 16 }}>
          <q>{hoverNote.text}</q>
          <div className="meta">{noteMetaLine(hoverNote, sources.get(hoverNote.sourceId))} · exact span · double-click to open the source</div>
        </div>
      ) : null}

      {props.toolbar}

      <div className="vb-zoom" onPointerDown={(e) => e.stopPropagation()}>
        <button type="button" aria-label="Zoom out" onClick={() => zoomAt(window.innerWidth / 2, window.innerHeight / 2, 1 / 1.25)}>
          −
        </button>
        <span>{Math.round(vp.scale * 100)}%</span>
        <button type="button" aria-label="Zoom in" onClick={() => zoomAt(window.innerWidth / 2, window.innerHeight / 2, 1.25)}>
          +
        </button>
        <button type="button" onClick={() => fit(bounds)}>
          Fit
        </button>
      </div>
    </div>
  );
}
