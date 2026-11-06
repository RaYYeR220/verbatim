import type { ReactNode } from "react";

import { noteMetaLine } from "@/components/board/BoardLayers";
import { themeHue } from "@/components/board/theme-colors";

import type { Readout } from "../../../server/verbatim/readout";
import type { BoardNote, BoardSource } from "../../../server/verbatim/types";

const metaFor = (q: Readout["sections"][number]["evidence"][number]) =>
  noteMetaLine({ speaker: q.speaker, tMs: q.tMs } as BoardNote, q.source ? ({ title: q.source } as BoardSource) : undefined);

/** The report itself: every claim with the voices and the exact words behind it. */
export function ReadoutView({ readout, toolbar, footer }: { readout: Readout; toolbar?: ReactNode; footer?: ReactNode }) {
  return (
    <article className="mx-auto max-w-[820px] px-6 pb-24 pt-10">
      {toolbar ? <div className="flex items-center justify-between gap-3 print:hidden">{toolbar}</div> : null}

      <header className="mt-8 border-b border-[var(--vb-hair)] pb-6">
        <p className="font-[family-name:var(--vb-mono)] text-[11px] text-[var(--vb-ink3)]">READOUT</p>
        <h1 className="mt-2 font-[family-name:var(--vb-display)] text-[40px] font-medium leading-[1.05] tracking-[-0.04em] text-[var(--vb-ink)]">
          {readout.study.title}
        </h1>
        {readout.study.question ? <p className="mt-3 text-[16px] leading-relaxed text-[var(--vb-ink2)]">{readout.study.question}</p> : null}
        <p className="mt-4 font-[family-name:var(--vb-mono)] text-[11.5px] text-[var(--vb-ink3)]">
          {readout.sources} sources · {readout.notes} exact quotes · {readout.themes} themes · every quote below is a verbatim span of its source
        </p>
      </header>

      <ol className="mt-2">
        {readout.sections.map((s, i) => {
          const hue = themeHue(undefined, s.colorIndex);
          return (
            <li key={s.themeId} className="border-b border-[var(--vb-hair)] py-7">
              <div className="flex items-baseline gap-3 font-[family-name:var(--vb-mono)] text-[11px] text-[var(--vb-ink3)]">
                <span className="tabular-nums">{String(i + 1).padStart(2, "0")}</span>
                <span className="size-2 translate-y-[-1px] rounded-[2px]" style={{ background: hue }} />
                <span className="text-[var(--vb-ink2)]">{s.name}</span>
                <span className="ml-auto tabular-nums">
                  {s.voices} voice{s.voices === 1 ? "" : "s"} · {s.quotes} quotes
                </span>
              </div>
              {s.insights.map((x, j) => (
                <p key={j} className="mt-3 font-[family-name:var(--vb-display)] text-[21px] font-medium leading-snug tracking-[-0.02em] text-[var(--vb-ink)]">
                  {x.claim}
                  {x.status === "anecdote" ? (
                    <span className="ml-2 font-[family-name:var(--vb-mono)] text-[11px] font-normal text-[var(--vb-ink3)]">anecdote — one voice</span>
                  ) : null}
                  <span className="mt-1 block font-[family-name:var(--vb-mono)] text-[10.5px] font-normal tracking-normal text-[var(--vb-ink3)]">
                    cites {x.cited} of the theme’s {s.quotes} quotes
                  </span>
                </p>
              ))}
              <ul className="mt-4 flex flex-col gap-3">
                {s.evidence.map((q) => (
                  <li key={q.noteId} className="border-l-2 pl-4" style={{ borderColor: hue }}>
                    <p className="text-[15px] leading-relaxed text-[var(--vb-ink)]">“{q.text}”</p>
                    <p className="mt-1 font-[family-name:var(--vb-mono)] text-[10.5px] text-[var(--vb-ink3)]">{metaFor(q)}</p>
                  </li>
                ))}
              </ul>
            </li>
          );
        })}
      </ol>
      {footer}
    </article>
  );
}
