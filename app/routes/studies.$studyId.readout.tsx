import { sendToAgentChat } from "@agent-native/core/client/agent-chat";
import { callAction, useActionQuery } from "@agent-native/core/client/hooks";
import { focusAgentChat } from "@agent-native/toolkit/app/chat";
import { useSetPageTitle } from "@agent-native/toolkit/app-shell/header-actions";
import { useMemo } from "react";
import { Link, useParams } from "react-router";
import { toast } from "sonner";

import { noteMetaLine } from "@/components/board/BoardLayers";
import { themeHue } from "@/components/board/theme-colors";

import type { BoardPayload } from "../../server/verbatim/types";

export function meta() {
  return [{ title: "Readout · Verbatim" }];
}

/** A readable, printable report: every claim with the voices and words behind it. */
export default function ReadoutRoute() {
  const { studyId = "" } = useParams();
  const { data } = useActionQuery("get-board", { studyId } as never);
  const board = data as BoardPayload | undefined;
  useSetPageTitle(board ? `${board.study.title} — readout` : "Readout");

  const sections = useMemo(() => {
    if (!board) return [];
    const notes = new Map(board.notes.map((n) => [n.id, n]));
    const sources = new Map(board.sources.map((s) => [s.id, s]));
    return board.themes
      .map((t, i) => ({
        theme: t,
        hue: themeHue(t.color, i),
        insights: board.insights.filter((x) => x.themeId === t.id),
        quotes: (board.insights.find((x) => x.themeId === t.id)?.noteIds ?? board.notes.filter((n) => n.themeId === t.id).map((n) => n.id))
          .map((id) => notes.get(id))
          .filter((n): n is NonNullable<typeof n> => !!n)
          .slice(0, 4)
          .map((n) => ({ text: n.text, meta: noteMetaLine(n, sources.get(n.sourceId)) })),
      }))
      .sort((a, b) => b.theme.voiceCount - a.theme.voiceCount);
  }, [board]);

  if (!board) return <div className="p-10 font-[family-name:var(--vb-mono)] text-[12px] text-[var(--vb-ink3)]">Loading…</div>;

  const copyMarkdown = async () => {
    const res = (await callAction("export-study", { studyId, format: "markdown" } as never)) as { markdown: string };
    await navigator.clipboard.writeText(res.markdown);
    toast.success("Readout copied as Markdown");
  };

  return (
    <div className="min-h-full bg-[var(--vb-ground)]">
      <article className="mx-auto max-w-[820px] px-6 pb-24 pt-10">
        <div className="flex items-center justify-between gap-3 print:hidden">
          <Link to={`/studies/${studyId}`} className="font-[family-name:var(--vb-mono)] text-[11px] text-[var(--vb-ink3)] hover:text-[var(--vb-ink)]">
            ← Board
          </Link>
          <div className="flex gap-2">
            <button type="button" onClick={() => void copyMarkdown()} className="h-8 rounded-[2px] border border-[var(--vb-hair)] px-3 text-[13px] hover:border-[var(--vb-ink3)]">
              Copy as Markdown
            </button>
            <button type="button" onClick={() => window.print()} className="h-8 rounded-[2px] border border-[var(--vb-hair)] px-3 text-[13px] hover:border-[var(--vb-ink3)]">
              Print
            </button>
            <button
              type="button"
              onClick={() => {
                sendToAgentChat({
                  message:
                    "Turn this study's readout into a short slide deck: one slide per insight (strongest first) with the claim, the voice count and two verbatim quotes with speakers, plus a title slide and a 'what the evidence does not show' slide. Use a connected Slides app if one is available; otherwise give me the deck outline in Markdown.",
                  submit: true,
                });
                focusAgentChat();
              }}
              className="h-8 rounded-full bg-[var(--vb-ink)] px-3.5 text-[13px] text-[var(--vb-ground-hi)]"
            >
              Make a deck
            </button>
          </div>
        </div>

        <header className="mt-8 border-b border-[var(--vb-hair)] pb-6">
          <p className="font-[family-name:var(--vb-mono)] text-[11px] text-[var(--vb-ink3)]">READOUT</p>
          <h1 className="mt-2 font-[family-name:var(--vb-display)] text-[40px] font-medium leading-[1.05] tracking-[-0.04em] text-[var(--vb-ink)]">{board.study.title}</h1>
          {board.study.question ? <p className="mt-3 text-[16px] leading-relaxed text-[var(--vb-ink2)]">{board.study.question}</p> : null}
          <p className="mt-4 font-[family-name:var(--vb-mono)] text-[11.5px] text-[var(--vb-ink3)]">
            {board.sources.length} sources · {board.notes.length} exact quotes · {board.themes.length} themes · every quote below is a verbatim span of its source
          </p>
        </header>

        <ol className="mt-2">
          {sections.map((s, i) => (
            <li key={s.theme.id} className="border-b border-[var(--vb-hair)] py-7">
              <div className="flex items-baseline gap-3 font-[family-name:var(--vb-mono)] text-[11px] text-[var(--vb-ink3)]">
                <span className="tabular-nums">{String(i + 1).padStart(2, "0")}</span>
                <span className="size-2 translate-y-[-1px] rounded-[2px]" style={{ background: s.hue }} />
                <span className="text-[var(--vb-ink2)]">{s.theme.name}</span>
                <span className="ml-auto tabular-nums">
                  {s.theme.voiceCount} voice{s.theme.voiceCount === 1 ? "" : "s"} · {s.theme.noteCount} quotes
                </span>
              </div>
              {s.insights.map((x) => (
                <p key={x.id} className="mt-3 font-[family-name:var(--vb-display)] text-[21px] font-medium leading-snug tracking-[-0.02em] text-[var(--vb-ink)]">
                  {x.claim}
                  {x.status === "anecdote" ? <span className="ml-2 font-[family-name:var(--vb-mono)] text-[11px] font-normal text-[var(--vb-ink3)]">anecdote — one voice</span> : null}
                </p>
              ))}
              <ul className="mt-4 flex flex-col gap-3">
                {s.quotes.map((q, j) => (
                  <li key={j} className="border-l-2 pl-4" style={{ borderColor: s.hue }}>
                    <p className="text-[15px] leading-relaxed text-[var(--vb-ink)]">“{q.text}”</p>
                    <p className="mt-1 font-[family-name:var(--vb-mono)] text-[10.5px] text-[var(--vb-ink3)]">{q.meta}</p>
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ol>
      </article>
    </div>
  );
}
