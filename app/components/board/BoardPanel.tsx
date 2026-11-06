import { useActionQuery } from "@agent-native/core/client/hooks";
import { useMemo, useState } from "react";
import { Link } from "react-router";

import { cn } from "@/lib/utils";

import type { BoardPayload } from "../../../server/verbatim/types";
import { noteMetaLine } from "./BoardLayers";

type Tab = "insights" | "activity" | "sources";

interface ActivityEvent {
  id: string;
  actor: string;
  actorEmail: string | null;
  action: string;
  summary: string;
  at: string;
}

const ACTOR_LABEL: Record<string, string> = {
  user: "you",
  http: "you",
  agent: "agent",
  automation: "automation",
  mcp: "external agent",
  a2a: "connected agent",
  cli: "cli",
};

function ago(iso: string): string {
  const s = Math.max(1, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.round(s / 60)}m`;
  if (s < 86400) return `${Math.round(s / 3600)}h`;
  return `${Math.round(s / 86400)}d`;
}

export function BoardPanel({
  board,
  hueByTheme,
  onFocusNote,
  onFocusTheme,
  selectedThemeId,
}: {
  board: BoardPayload;
  hueByTheme: Map<string, string>;
  onFocusNote: (noteId: string) => void;
  onFocusTheme: (themeId: string) => void;
  selectedThemeId: string | null;
}) {
  const [tab, setTab] = useState<Tab>("insights");
  const h = board.health;

  return (
    <aside className="flex h-full w-[340px] shrink-0 flex-col border-l border-[var(--vb-hair)] bg-[var(--vb-ground-hi)]">
      <div className="border-b border-[var(--vb-hair)] px-4 pb-3 pt-3.5">
        <div className="flex items-baseline justify-between">
          <span className="font-[family-name:var(--vb-mono)] text-[11px] text-[var(--vb-ink3)]">BOARD HEALTH</span>
          <span className="font-[family-name:var(--vb-display)] text-[22px] font-medium tracking-[-0.02em] tabular-nums">{h.score}</span>
        </div>
        <div className="mt-1.5 h-[2px] w-full bg-[var(--vb-hair)]">
          <div className="h-full bg-[var(--vb-ink)] transition-[width] duration-700" style={{ width: `${h.score}%` }} />
        </div>
        <dl className="mt-2.5 grid grid-cols-3 gap-y-1 font-[family-name:var(--vb-mono)] text-[10.5px] text-[var(--vb-ink3)]">
          <div>
            <dt>voices</dt>
            <dd className="text-[13px] text-[var(--vb-ink)]">
              {h.sources - h.unreadSources.length}/{h.sources}
            </dd>
          </div>
          <div>
            <dt>unsorted</dt>
            <dd className="text-[13px] text-[var(--vb-ink)]">{h.unsorted}</dd>
          </div>
          <div>
            <dt>changed</dt>
            <dd className={cn("text-[13px]", h.tampered ? "text-[var(--vb-rust)]" : "text-[var(--vb-ink)]")}>{h.tampered}</dd>
          </div>
        </dl>
      </div>

      <div className="flex gap-1 border-b border-[var(--vb-hair)] px-3 pt-2" role="tablist">
        {(["insights", "activity", "sources"] as Tab[]).map((t) => (
          <button
            key={t}
            type="button"
            role="tab"
            aria-selected={tab === t}
            onClick={() => setTab(t)}
            className={cn(
              "-mb-px border-b px-2 pb-2 text-[13px] capitalize transition-colors",
              tab === t ? "border-[var(--vb-ink)] text-[var(--vb-ink)]" : "border-transparent text-[var(--vb-ink3)] hover:text-[var(--vb-ink)]",
            )}
          >
            {t}
            <span className="ml-1 font-[family-name:var(--vb-mono)] text-[10.5px] text-[var(--vb-ink4)]">
              {t === "insights" ? board.insights.length : t === "sources" ? board.sources.length : ""}
            </span>
          </button>
        ))}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {tab === "insights" ? (
          <InsightsList board={board} hueByTheme={hueByTheme} onFocusNote={onFocusNote} onFocusTheme={onFocusTheme} selectedThemeId={selectedThemeId} />
        ) : tab === "activity" ? (
          <ActivityList studyId={board.study.id} />
        ) : (
          <SourcesList board={board} />
        )}
      </div>
    </aside>
  );
}

function InsightsList({
  board,
  hueByTheme,
  onFocusNote,
  onFocusTheme,
  selectedThemeId,
}: {
  board: BoardPayload;
  hueByTheme: Map<string, string>;
  onFocusNote: (noteId: string) => void;
  onFocusTheme: (themeId: string) => void;
  selectedThemeId: string | null;
}) {
  const sources = useMemo(() => new Map(board.sources.map((s) => [s.id, s])), [board.sources]);
  const notes = useMemo(() => new Map(board.notes.map((n) => [n.id, n])), [board.notes]);
  const themes = useMemo(() => new Map(board.themes.map((t) => [t.id, t])), [board.themes]);
  const [open, setOpen] = useState<string | null>(null);
  const sorted = [...board.insights].sort((a, b) => (themes.get(b.themeId ?? "")?.voiceCount ?? 0) - (themes.get(a.themeId ?? "")?.voiceCount ?? 0));

  if (sorted.length === 0) {
    return <p className="px-4 py-6 text-[13px] leading-relaxed text-[var(--vb-ink3)]">No insights yet. Ask the agent to synthesize the board, or select notes and write one.</p>;
  }

  return (
    <ul className="divide-y divide-[var(--vb-hair)]">
      {sorted.map((i) => {
        const theme = i.themeId ? themes.get(i.themeId) : undefined;
        const expanded = open === i.id || (selectedThemeId !== null && selectedThemeId === i.themeId);
        return (
          <li key={i.id} className={cn("px-4 py-3.5", expanded && "bg-[var(--vb-card)]")}>
            <button type="button" className="block w-full text-left" onClick={() => {
              setOpen(expanded ? null : i.id);
              if (i.themeId) onFocusTheme(i.themeId);
            }}>
              <div className="flex items-center gap-2 font-[family-name:var(--vb-mono)] text-[10.5px] text-[var(--vb-ink3)]">
                <span className="size-2 rounded-[2px]" style={{ background: (i.themeId && hueByTheme.get(i.themeId)) || "var(--vb-ink4)" }} />
                <span className="truncate">{theme?.name ?? "No theme"}</span>
                <span className="ml-auto shrink-0">
                  {i.status === "verified" ? `${theme?.voiceCount ?? i.check.participants} voices · ${i.noteIds.length} cited` : "anecdote · 1 voice"}
                </span>
              </div>
              <p className="mt-1.5 font-[family-name:var(--vb-display)] text-[15.5px] font-medium leading-snug tracking-[-0.015em] text-[var(--vb-ink)]">{i.claim}</p>
              {board.health.countMismatches.includes(i.id) ? (
                <span className="mt-1 block font-[family-name:var(--vb-mono)] text-[10.5px] text-[var(--vb-rust)]">
                  a count here no longer matches the evidence
                </span>
              ) : null}
            </button>
            {expanded ? (
              <ol className="mt-2.5 flex flex-col gap-2">
                {i.noteIds.slice(0, 8).map((id) => {
                  const n = notes.get(id);
                  if (!n) return null;
                  return (
                    <li key={id}>
                      <button type="button" onClick={() => onFocusNote(id)} className="block w-full border-l-2 py-0.5 pl-2.5 text-left" style={{ borderColor: (i.themeId && hueByTheme.get(i.themeId)) || "var(--vb-ink4)" }}>
                        <span className="block text-[13px] leading-snug text-[var(--vb-ink)]">“{n.text}”</span>
                        <span className="mt-0.5 block font-[family-name:var(--vb-mono)] text-[10.5px] text-[var(--vb-ink3)]">{noteMetaLine(n, sources.get(n.sourceId))}</span>
                      </button>
                    </li>
                  );
                })}
                {i.noteIds.length > 8 ? <li className="pl-2.5 font-[family-name:var(--vb-mono)] text-[10.5px] text-[var(--vb-ink3)]">+{i.noteIds.length - 8} more cited</li> : null}
              </ol>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}

function ActivityList({ studyId }: { studyId: string }) {
  const { data } = useActionQuery("list-activity", { studyId, limit: 80 } as never, { refetchInterval: 4000 });
  const events = ((data as { events?: ActivityEvent[] } | undefined)?.events ?? []);
  if (events.length === 0) return <p className="px-4 py-6 text-[13px] text-[var(--vb-ink3)]">Nothing yet.</p>;
  return (
    <ol className="flex flex-col px-4 py-2">
      {events.map((e) => {
        const label = ACTOR_LABEL[e.actor] ?? e.actor;
        const machine = e.actor !== "user" && e.actor !== "http";
        return (
          <li key={e.id} className="flex gap-2.5 border-b border-[var(--vb-hair2)] py-2.5 last:border-0">
            <span
              className={cn(
                "mt-px h-[18px] shrink-0 rounded-[2px] px-1.5 font-[family-name:var(--vb-mono)] text-[10px] leading-[18px]",
                machine ? "bg-[var(--vb-steel)] text-white" : "bg-[var(--vb-ink)] text-[var(--vb-ground-hi)]",
              )}
            >
              {label}
            </span>
            <span className="min-w-0 flex-1 text-[12.5px] leading-snug text-[var(--vb-ink2)]">{e.summary}</span>
            <span className="shrink-0 font-[family-name:var(--vb-mono)] text-[10px] text-[var(--vb-ink4)]">{ago(e.at)}</span>
          </li>
        );
      })}
    </ol>
  );
}

function SourcesList({ board }: { board: BoardPayload }) {
  const [q, setQ] = useState("");
  const list = board.sources.filter((s) => !q || s.title.toLowerCase().includes(q.toLowerCase()));
  return (
    <div>
      <div className="sticky top-0 bg-[var(--vb-ground-hi)] px-4 py-2">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Filter sources"
          className="h-8 w-full rounded-[2px] border border-[var(--vb-hair)] bg-[var(--vb-card)] px-2.5 text-[13px] outline-none focus:border-[var(--vb-ink3)]"
        />
      </div>
      <ul className="pb-3">
        {list.slice(0, 300).map((s) => (
          <li key={s.id}>
            <Link to={`/studies/${board.study.id}/sources/${s.id}`} className="flex items-center gap-2 px-4 py-2 text-[13px] text-[var(--vb-ink2)] hover:bg-[var(--vb-card)] hover:text-[var(--vb-ink)]">
              <span className="min-w-0 flex-1 truncate">{s.title}</span>
              <span className={cn("shrink-0 font-[family-name:var(--vb-mono)] text-[10.5px]", s.noteCount ? "text-[var(--vb-ink3)]" : "text-[var(--vb-rust)]")}>
                {s.noteCount ? `${s.noteCount} notes` : "unread"}
              </span>
            </Link>
          </li>
        ))}
        {list.length > 300 ? <li className="px-4 py-2 font-[family-name:var(--vb-mono)] text-[10.5px] text-[var(--vb-ink3)]">{list.length - 300} more — filter to find one</li> : null}
      </ul>
    </div>
  );
}
