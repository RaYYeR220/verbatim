import { useActionQuery } from "@agent-native/core/client/hooks";
import { useParams } from "react-router";

import { themeHue } from "@/components/board/theme-colors";

interface ThemeCard {
  id: string;
  studyId: string;
  study: string;
  name: string;
  colorIndex: number;
  summary: string | null;
  notes: number;
  voices: number;
  insights: Array<{ claim: string; status: string; cited: number }>;
  quotes: Array<{ noteId: string; quote: string; speaker: string | null; tMs: number | null; source: string | null }>;
  error?: string;
}

export function meta() {
  return [{ title: "Theme · Verbatim" }];
}

const fmt = (ms: number | null) => {
  if (ms === null) return null;
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

/** The theme card that MCP Apps hosts (Claude, ChatGPT) render inline. */
export default function EmbedThemeRoute() {
  const { themeId = "" } = useParams();
  const { data, isLoading } = useActionQuery("show-theme", { themeId, limit: 12 } as never);
  const t = data as ThemeCard | undefined;

  if (isLoading) return <div className="p-6 font-[family-name:var(--vb-mono)] text-[12px] text-[var(--vb-ink3)]">Loading theme…</div>;
  if (!t || t.error) return <div className="p-6 text-[14px] text-[var(--vb-ink2)]">{t?.error ?? "This theme isn't available."}</div>;

  const hue = themeHue(undefined, t.colorIndex ?? 0);
  return (
    <div className="min-h-screen bg-[var(--vb-ground)] p-5">
      <div className="flex items-center gap-2 font-[family-name:var(--vb-mono)] text-[10.5px] text-[var(--vb-ink3)]">
        <span className="size-2 rounded-[2px]" style={{ background: hue }} />
        <span className="truncate">{t.study}</span>
        <span className="ml-auto">
          {t.voices} voices · {t.notes} exact quotes
        </span>
      </div>
      <h1 className="mt-2 font-[family-name:var(--vb-display)] text-[26px] font-medium leading-tight tracking-[-0.03em] text-[var(--vb-ink)]">{t.name}</h1>
      {t.insights[0] ? (
        <p className="mt-2 text-[15px] leading-snug text-[var(--vb-ink2)]">
          {t.insights[0].claim}
          {t.insights[0].status === "anecdote" ? <span className="ml-1 font-[family-name:var(--vb-mono)] text-[11px] text-[var(--vb-ink3)]">(anecdote)</span> : null}
        </p>
      ) : null}
      <ol className="mt-4 flex flex-col gap-2.5">
        {t.quotes.map((q) => (
          <li key={q.noteId} className="border-l-2 pl-3" style={{ borderColor: hue }}>
            <p className="text-[14px] leading-snug text-[var(--vb-ink)]">“{q.quote}”</p>
            <p className="mt-0.5 font-[family-name:var(--vb-mono)] text-[10.5px] text-[var(--vb-ink3)]">
              {[q.speaker, fmt(q.tMs), q.source].filter(Boolean).join(" · ")} · exact span
            </p>
          </li>
        ))}
      </ol>
      <a
        href={`/studies/${t.studyId}?theme=${t.id}`}
        target="_blank"
        rel="noreferrer"
        className="mt-5 inline-flex h-8 items-center rounded-full bg-[var(--vb-ink)] px-3.5 text-[12.5px] text-[var(--vb-ground-hi)]"
      >
        Open the board
      </a>
    </div>
  );
}
