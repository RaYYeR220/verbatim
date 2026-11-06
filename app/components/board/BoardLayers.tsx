import { memo, type CSSProperties } from "react";

import type { BoardNote, BoardSource } from "../../../server/verbatim/types";
import type { AgentOnBoard } from "./use-board-presence";
import { CARD_H, CARD_W, type ThemeFrame } from "./use-board";

export function formatTime(ms: number | null | undefined): string | null {
  if (ms === null || ms === undefined) return null;
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = String(s % 60).padStart(2, "0");
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${ss}` : `${m}:${ss}`;
}

/** "author · 2★ · 2026-04-05" → the stars and date of a review source. */
export function sourceMeta(source: BoardSource | undefined): { stars: string | null; date: string | null } {
  if (!source) return { stars: null, date: null };
  const m = /·\s*(\d(?:\.\d)?)★/.exec(source.title);
  const d = /(\d{4}-\d{2}-\d{2})/.exec(source.title);
  const date = d?.[1] ? new Date(`${d[1]}T12:00:00Z`).toLocaleDateString("en", { month: "short", day: "numeric" }) : null;
  return { stars: m?.[1] ? "★".repeat(Math.round(Number(m[1]))) : null, date };
}

export function noteMetaLine(note: BoardNote, source: BoardSource | undefined): string {
  const time = formatTime(note.tMs);
  const { stars, date } = sourceMeta(source);
  return [note.speaker ?? "unknown", time ?? stars, time ? null : date].filter(Boolean).join(" · ");
}

interface NotesLayerProps {
  notes: BoardNote[];
  sources: Map<string, BoardSource>;
  hueByTheme: Map<string, string>;
  selected: ReadonlySet<string>;
  agentNotes: ReadonlySet<string>;
  focusNoteId: string | null;
  commentCounts: Map<string, number>;
}

/** Every note card. Memoised so panning and zooming never re-render 500 cards. */
const seenNotes = new Set<string>();
let entranceBatch = 0;

export const NotesLayer = memo(function NotesLayer({
  notes,
  sources,
  hueByTheme,
  selected,
  agentNotes,
  focusNoteId,
  commentCounts,
}: NotesLayerProps) {
  const firstPaint = seenNotes.size === 0;
  entranceBatch = 0;
  return (
    <>
      {notes.map((n) => {
        const src = sources.get(n.sourceId);
        // Notes that arrive while the board is open (the agent adding them) fade in one after another.
        const isNew = !firstPaint && !seenNotes.has(n.id);
        seenNotes.add(n.id);
        const delay = isNew ? Math.min(entranceBatch++ * 45, 1800) : 0;
        const style = {
          left: n.x,
          top: n.y,
          "--hue": n.themeId ? hueByTheme.get(n.themeId) : undefined,
          ...(isNew ? { animationDelay: `${delay}ms` } : {}),
        } as CSSProperties;
        const comments = commentCounts.get(n.id) ?? 0;
        return (
          <article
            key={n.id}
            className={isNew ? "vb-note vb-note-enter" : "vb-note"}
            data-note-id={n.id}
            data-selected={selected.has(n.id) ? "true" : undefined}
            data-agent={agentNotes.has(n.id) ? "true" : undefined}
            data-focus={focusNoteId === n.id ? "true" : undefined}
            style={style}
            aria-label={`Quote from ${n.speaker ?? "unknown"}: ${n.text}`}
          >
            <p className="vb-note-quote">{n.text}</p>
            <div className="vb-note-foot">
              <span className="who">{noteMetaLine(n, src)}</span>
              <span className="exact" data-bad={n.matchesSource ? undefined : "true"} title={n.matchesSource ? "Exact span of the source" : "No longer matches its source"}>
                {n.matchesSource ? "exact" : "changed"}
              </span>
            </div>
            {comments > 0 ? <span className="vb-badge">{comments} comment{comments === 1 ? "" : "s"}</span> : null}
          </article>
        );
      })}
    </>
  );
});

interface FramesLayerProps {
  frames: ThemeFrame[];
  hueByTheme: Map<string, string>;
  dropThemeId: string | null;
  agentThemeId: string | null;
  focusThemeId: string | null;
  insightByTheme: Map<string, { status: string; claim: string }>;
  renamingId: string | null;
  onRenameCommit: (themeId: string, name: string) => void;
  onRenameCancel: () => void;
}

export const FramesLayer = memo(function FramesLayer({
  frames,
  hueByTheme,
  dropThemeId,
  agentThemeId,
  focusThemeId,
  insightByTheme,
  renamingId,
  onRenameCommit,
  onRenameCancel,
}: FramesLayerProps) {
  return (
    <>
      {frames.map((f) => {
        const insight = insightByTheme.get(f.theme.id);
        return (
          <section
            key={f.theme.id}
            className="vb-frame"
            data-theme-id={f.theme.id}
            data-drop={dropThemeId === f.theme.id ? "true" : undefined}
            data-agent={agentThemeId === f.theme.id ? "true" : undefined}
            data-focus={focusThemeId === f.theme.id ? "true" : undefined}
            style={{ left: f.x, top: f.y, width: f.w, height: f.h, "--hue": hueByTheme.get(f.theme.id) } as CSSProperties}
            aria-label={`Theme ${f.theme.name}`}
          >
            <header className="vb-frame-head" data-theme-handle={f.theme.id}>
              <span className="vb-frame-chip" />
              {renamingId === f.theme.id ? (
                <span
                  className="vb-frame-name"
                  contentEditable
                  suppressContentEditableWarning
                  ref={(el) => {
                    if (el && document.activeElement !== el) {
                      el.focus();
                      const r = document.createRange();
                      r.selectNodeContents(el);
                      const sel = window.getSelection();
                      sel?.removeAllRanges();
                      sel?.addRange(r);
                    }
                  }}
                  onPointerDown={(e) => e.stopPropagation()}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      onRenameCommit(f.theme.id, e.currentTarget.textContent ?? "");
                    } else if (e.key === "Escape") onRenameCancel();
                  }}
                  onBlur={(e) => onRenameCommit(f.theme.id, e.currentTarget.textContent ?? "")}
                >
                  {f.theme.name}
                </span>
              ) : (
                <span className="vb-frame-name" data-rename={f.theme.id} title="Double-click to rename">
                  {f.theme.name}
                </span>
              )}
              <span className="vb-frame-count">
                {f.theme.noteCount} notes · {f.theme.voiceCount} voice{f.theme.voiceCount === 1 ? "" : "s"}
              </span>
              <span className="vb-frame-status">
                {insight ? (insight.status === "verified" ? "insight ✓" : "anecdote") : "no insight yet"}
              </span>
            </header>
          </section>
        );
      })}
    </>
  );
});

export function AgentCursors({ agents, positionFor }: { agents: AgentOnBoard[]; positionFor: (a: AgentOnBoard) => { x: number; y: number } | null }) {
  return (
    <>
      {agents.map((a, i) => {
        const pos = positionFor(a);
        if (!pos) return null;
        return (
          <div key={`${a.name}-${i}`} className="vb-cursor" style={{ transform: `translate(${pos.x}px, ${pos.y}px)` }} aria-live="polite">
            <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
              <path d="M2 1.5 15.5 8 9 9.6 6.4 16z" fill="currentColor" stroke="#fff" strokeWidth="1.2" strokeLinejoin="round" />
            </svg>
            <div className="vb-cursor-label">
              <b>{a.name.toLowerCase() === "agent" ? "agent" : a.name}</b>
              {a.pointer?.activity ? <span>{a.pointer.activity}</span> : null}
            </div>
          </div>
        );
      })}
    </>
  );
}

export function cardRect(n: { x: number; y: number }) {
  return { x: n.x, y: n.y, w: CARD_W, h: CARD_H };
}
