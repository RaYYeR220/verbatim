import { useActionMutation, useActionQuery } from "@agent-native/core/client/hooks";
import { useSetPageTitle } from "@agent-native/toolkit/app-shell/header-actions";
import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router";
import { toast } from "sonner";

import { formatTime } from "@/components/board/BoardLayers";
import { themeHue } from "@/components/board/theme-colors";

import type { BoardPayload } from "../../server/verbatim/types";

interface SourcePayload {
  source: { id: string; studyId: string; title: string; kind: string; chars: number; mediaUrl: string | null };
  offset: number;
  text: string;
  truncated: boolean;
  segments: Array<{ start: number; end: number; speaker: string | null; tMs: number | null }>;
  notes: Array<{ id: string; charStart: number; charEnd: number; themeId: string | null }>;
}

export function meta() {
  return [{ title: "Source · Verbatim" }];
}

interface Piece {
  start: number;
  end: number;
  noteId: string | null;
}

/** Splits [from, to) at every note boundary so spans can be tinted. */
function piecesFor(from: number, to: number, notes: SourcePayload["notes"]): Piece[] {
  const cuts = new Set<number>([from, to]);
  for (const n of notes) {
    if (n.charEnd <= from || n.charStart >= to) continue;
    cuts.add(Math.max(from, n.charStart));
    cuts.add(Math.min(to, n.charEnd));
  }
  const points = [...cuts].sort((a, b) => a - b);
  const out: Piece[] = [];
  for (let i = 0; i < points.length - 1; i += 1) {
    const s = points[i]!;
    const e = points[i + 1]!;
    if (e <= s) continue;
    const owner = notes.find((n) => n.charStart <= s && n.charEnd >= e) ?? null;
    out.push({ start: s, end: e, noteId: owner?.id ?? null });
  }
  return out;
}

export default function SourceRoute() {
  const { studyId = "", sourceId = "" } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const focusNote = params.get("note");
  const { data, refetch } = useActionQuery("get-source", { sourceId, length: 60000 } as never);
  const { data: boardData } = useActionQuery("get-board", { studyId } as never);
  const src = data as SourcePayload | undefined;
  const board = boardData as BoardPayload | undefined;
  const [picked, setPicked] = useState<string | null>(focusNote);
  const [selection, setSelection] = useState<{ text: string; x: number; y: number } | null>(null);
  const textRef = useRef<HTMLDivElement | null>(null);
  const addNotes = useActionMutation("add-notes");
  useSetPageTitle(src?.source.title ?? "Source");

  const themeIndex = useMemo(() => new Map(board?.themes.map((t, i) => [t.id, i]) ?? []), [board?.themes]);
  const themes = useMemo(() => new Map(board?.themes.map((t) => [t.id, t]) ?? []), [board?.themes]);
  const notesById = useMemo(() => new Map(board?.notes.map((n) => [n.id, n]) ?? []), [board?.notes]);
  const hue = (themeId: string | null | undefined) => {
    if (!themeId) return "var(--vb-ink4)";
    const t = themes.get(themeId);
    return themeHue(t?.color, themeIndex.get(themeId) ?? -1);
  };

  useEffect(() => {
    if (!focusNote || !textRef.current) return;
    const el = textRef.current.querySelector(`[data-span="${focusNote}"]`);
    el?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [focusNote, src]);

  if (!src) {
    return <div className="flex h-full items-center justify-center font-[family-name:var(--vb-mono)] text-[12px] text-[var(--vb-ink3)]">Loading source…</div>;
  }

  const base = src.offset;
  const segs = src.segments.length ? src.segments : [{ start: base, end: base + src.text.length, speaker: null, tMs: null }];
  const pickedNote = picked ? notesById.get(picked) : undefined;
  const pickedSpan = picked ? src.notes.find((n) => n.id === picked) : undefined;

  const onMouseUp = () => {
    const sel = window.getSelection();
    const text = sel?.toString() ?? "";
    if (!sel || sel.rangeCount === 0 || text.trim().length < 3 || !textRef.current?.contains(sel.anchorNode)) {
      setSelection(null);
      return;
    }
    const rect = sel.getRangeAt(0).getBoundingClientRect();
    const host = textRef.current.getBoundingClientRect();
    setSelection({ text, x: rect.left - host.left + rect.width / 2, y: rect.top - host.top });
  };

  const addSelection = async () => {
    if (!selection) return;
    const res = (await addNotes.mutateAsync({ studyId, notes: [{ sourceId, quote: selection.text }] } as never)) as {
      added: Array<{ id: string }>;
      rejected: Array<{ reason: string }>;
    };
    setSelection(null);
    window.getSelection()?.removeAllRanges();
    if (res.added.length) {
      toast.success("Added to the board as an exact quote", { action: { label: "Show on board", onClick: () => navigate(`/studies/${studyId}?note=${res.added[0]!.id}`) } });
      void refetch();
    } else toast.error(`Not added: ${res.rejected[0]?.reason.replace("_", " ") ?? "unknown"}`);
  };

  return (
    <div className="min-h-full bg-[var(--vb-ground)]">
      <div className="mx-auto grid max-w-[1180px] grid-cols-1 gap-10 px-6 pb-24 pt-8 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div>
          <Link to={`/studies/${studyId}`} className="font-[family-name:var(--vb-mono)] text-[11px] text-[var(--vb-ink3)] hover:text-[var(--vb-ink)]">
            ← {board?.study.title ?? "Board"}
          </Link>
          <h1 className="mt-3 font-[family-name:var(--vb-display)] text-[30px] font-medium leading-tight tracking-[-0.03em] text-[var(--vb-ink)]">{src.source.title}</h1>
          <p className="mt-1.5 font-[family-name:var(--vb-mono)] text-[11px] text-[var(--vb-ink3)]">
            {src.source.kind} · {src.source.chars.toLocaleString()} characters · {src.notes.length} exact quotes taken · select any passage to add it
          </p>

          <div ref={textRef} className="relative mt-7" onMouseUp={onMouseUp}>
            {segs.map((seg, i) => {
              const from = Math.max(seg.start, base);
              const to = Math.min(seg.end, base + src.text.length);
              if (to <= from) return null;
              return (
                <div key={`${seg.start}-${i}`} className="grid grid-cols-[92px_minmax(0,1fr)] gap-4 py-1.5">
                  <div className="pt-[3px] text-right font-[family-name:var(--vb-mono)] text-[10.5px] leading-tight text-[var(--vb-ink3)]">
                    {seg.speaker && (i === 0 || segs[i - 1]?.speaker !== seg.speaker) ? <span className="block truncate text-[var(--vb-ink2)]">{seg.speaker}</span> : null}
                    {formatTime(seg.tMs) ? <span className="block">{formatTime(seg.tMs)}</span> : null}
                  </div>
                  <p className="text-[15px] leading-[1.7] text-[var(--vb-ink2)]">
                    {piecesFor(from, to, src.notes).map((p) => {
                      const text = src.text.slice(p.start - base, p.end - base);
                      if (!p.noteId) return <span key={p.start}>{text}</span>;
                      const note = notesById.get(p.noteId);
                      const style = { "--hue": hue(note?.themeId) } as CSSProperties;
                      return (
                        <mark
                          key={p.start}
                          data-span={p.noteId}
                          onClick={() => setPicked(p.noteId)}
                          style={style}
                          className="cursor-pointer rounded-[1px] bg-[color-mix(in_srgb,var(--hue)_15%,transparent)] text-[var(--vb-ink)] underline decoration-[var(--hue)] decoration-2 underline-offset-[3px] data-[on=true]:bg-[color-mix(in_srgb,var(--hue)_30%,transparent)]"
                          data-on={picked === p.noteId ? "true" : undefined}
                        >
                          {text}
                        </mark>
                      );
                    })}
                  </p>
                </div>
              );
            })}
            {selection ? (
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => void addSelection()}
                className="absolute z-10 -translate-x-1/2 -translate-y-[calc(100%+8px)] rounded-[2px] bg-[var(--vb-ink)] px-3 py-1.5 text-[12.5px] text-[var(--vb-ground-hi)] shadow-[0_8px_20px_-12px_rgba(0,0,0,.5)]"
                style={{ left: selection.x, top: selection.y }}
              >
                Add as exact quote
              </button>
            ) : null}
            {src.truncated ? <p className="mt-6 font-[family-name:var(--vb-mono)] text-[11px] text-[var(--vb-ink3)]">Showing the first {src.text.length.toLocaleString()} characters.</p> : null}
          </div>
        </div>

        <aside className="lg:sticky lg:top-8 lg:self-start">
          <p className="font-[family-name:var(--vb-mono)] text-[11px] text-[var(--vb-ink3)]">QUOTES FROM THIS SOURCE</p>
          {pickedNote && pickedSpan ? (
            <div className="mt-3 rounded-[2px] border border-[var(--vb-hair)] bg-[var(--vb-ground-hi)] p-3.5">
              <div className="flex items-center gap-2 font-[family-name:var(--vb-mono)] text-[10.5px] text-[var(--vb-ink3)]">
                <span className="size-2 rounded-[2px]" style={{ background: hue(pickedNote.themeId) }} />
                <span className="truncate">{pickedNote.themeId ? themes.get(pickedNote.themeId)?.name : "Unsorted"}</span>
              </div>
              <p className="mt-2 text-[14px] leading-snug text-[var(--vb-ink)]">“{pickedNote.text}”</p>
              <p className="mt-2 font-[family-name:var(--vb-mono)] text-[10.5px] text-[var(--vb-ink3)]">
                chars {pickedSpan.charStart}–{pickedSpan.charEnd} · {pickedNote.matchesSource ? "exact match" : "no longer matches"}
              </p>
              <Link to={`/studies/${studyId}?note=${pickedNote.id}`} className="mt-3 inline-flex h-8 items-center rounded-full bg-[var(--vb-ink)] px-3.5 text-[12.5px] text-[var(--vb-ground-hi)]">
                Show on board
              </Link>
            </div>
          ) : (
            <p className="mt-3 text-[13px] leading-relaxed text-[var(--vb-ink3)]">Click a tinted passage to see where it sits on the board. Untinted text is everything nobody has quoted yet.</p>
          )}
          <ul className="mt-5 flex flex-col gap-1.5">
            {[...new Set(src.notes.map((n) => n.themeId))].map((tid) => {
              const count = src.notes.filter((n) => n.themeId === tid).length;
              return (
                <li key={tid ?? "none"} className="flex items-center gap-2 text-[12.5px] text-[var(--vb-ink2)]">
                  <span className="size-2 rounded-[2px]" style={{ background: hue(tid) }} />
                  <span className="min-w-0 flex-1 truncate">{tid ? themes.get(tid)?.name : "Unsorted"}</span>
                  <span className="font-[family-name:var(--vb-mono)] text-[10.5px] text-[var(--vb-ink3)]">{count}</span>
                </li>
              );
            })}
          </ul>
        </aside>
      </div>
    </div>
  );
}
