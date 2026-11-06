import { sendToAgentChat } from "@agent-native/core/client/agent-chat";
import { callAction, useActionQuery } from "@agent-native/core/client/hooks";
import { focusAgentChat } from "@agent-native/toolkit/app/chat";
import { ShareButton } from "@agent-native/toolkit/app/sharing";
import { useSetPageTitle } from "@agent-native/toolkit/app-shell/header-actions";
import { useMemo } from "react";
import { Link, useParams } from "react-router";
import { toast } from "sonner";

import { ReadoutView } from "@/components/readout/ReadoutView";

import { readoutFrom } from "../../server/verbatim/readout";
import type { BoardPayload } from "../../server/verbatim/types";

export function meta() {
  return [{ title: "Readout · Verbatim" }];
}

const BUTTON = "h-8 rounded-[2px] border border-[var(--vb-hair)] px-3 text-[13px] hover:border-[var(--vb-ink3)]";

/** A readable, printable report: every claim with the voices and words behind it. */
export default function ReadoutRoute() {
  const { studyId = "" } = useParams();
  const { data } = useActionQuery("get-board", { studyId } as never);
  const board = data as BoardPayload | undefined;
  useSetPageTitle(board ? `${board.study.title} — readout` : "Readout");
  const readout = useMemo(() => (board ? readoutFrom(board) : null), [board]);

  if (!readout) return <div className="p-10 font-[family-name:var(--vb-mono)] text-[12px] text-[var(--vb-ink3)]">Loading…</div>;

  const copyMarkdown = async () => {
    const res = (await callAction("export-study", { studyId, format: "markdown" } as never)) as { markdown: string };
    await navigator.clipboard.writeText(res.markdown);
    toast.success("Readout copied as Markdown");
  };
  const shareUrl = typeof window === "undefined" ? `/r/${studyId}` : `${window.location.origin}/r/${studyId}`;

  return (
    <div className="min-h-full bg-[var(--vb-ground)]">
      <ReadoutView
        readout={readout}
        toolbar={
          <>
            <Link to={`/studies/${studyId}`} className="font-[family-name:var(--vb-mono)] text-[11px] text-[var(--vb-ink3)] hover:text-[var(--vb-ink)]">
              ← Board
            </Link>
            <div className="flex items-center gap-2">
              <ShareButton
                resourceType="study"
                resourceId={studyId}
                resourceTitle={readout.study.title}
                shareUrl={shareUrl}
                shareUrlLabel="Copy the readout link"
                triggerClassName={BUTTON}
              />
              <button type="button" onClick={() => void copyMarkdown()} className={BUTTON}>
                Copy as Markdown
              </button>
              <button type="button" onClick={() => window.print()} className={BUTTON}>
                Print
              </button>
              <button
                type="button"
                onClick={() => {
                  sendToAgentChat({
                    message:
                      "Turn this study's readout into a short slide deck: one slide per insight (strongest first) with the claim, the voice count and two verbatim quotes with speakers, plus a title slide and a 'what the evidence does not show' slide. Use a connected Slides app if one is available; otherwise give me the deck outline in Markdown.",
                    submit: true,
                    newTab: true,
                    reuseEmptyTab: true,
                  });
                  focusAgentChat();
                }}
                className="h-8 rounded-full bg-[var(--vb-ink)] px-3.5 text-[13px] text-[var(--vb-ground-hi)]"
              >
                Make a deck
              </button>
            </div>
          </>
        }
      />
    </div>
  );
}
