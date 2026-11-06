import { callAction, useActionQuery } from "@agent-native/core/client/hooks";
import { sendToAgentChat } from "@agent-native/core/client/agent-chat";
import { focusAgentChat } from "@agent-native/toolkit/app/chat";
import * as Dialog from "@radix-ui/react-dialog";
import { useState } from "react";
import { toast } from "sonner";

import { cn } from "@/lib/utils";

type Tab = "paste" | "files" | "clips" | "webhook";

const TABS: Array<{ id: Tab; label: string }> = [
  { id: "paste", label: "Paste" },
  { id: "files", label: "Files" },
  { id: "clips", label: "Clips" },
  { id: "webhook", label: "Feedback inbox" },
];

export function ImportDialog({
  open,
  onOpenChange,
  studyId,
  onImported,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  studyId: string;
  onImported: (count: number) => void;
}) {
  const [tab, setTab] = useState<Tab>("paste");
  const [title, setTitle] = useState("");
  const [who, setWho] = useState("");
  const [raw, setRaw] = useState("");
  const [busy, setBusy] = useState(false);

  const close = () => {
    onOpenChange(false);
    setRaw("");
    setTitle("");
    setWho("");
  };

  const addPasted = async () => {
    if (!raw.trim()) return;
    setBusy(true);
    try {
      await callAction("add-source", {
        studyId,
        title: title.trim() || (who.trim() ? `Interview — ${who.trim()}` : "Pasted source"),
        raw,
        format: "auto",
        kind: "interview",
        ...(who.trim() ? { participant: { label: who.trim() } } : {}),
      } as never);
      onImported(1);
      close();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not add the source");
    } finally {
      setBusy(false);
    }
  };

  const addFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    setBusy(true);
    let added = 0;
    try {
      for (const file of [...files]) {
        const text = await file.text();
        if (/\.csv$/i.test(file.name)) {
          const res = (await callAction("add-feedback-csv", { studyId, csv: text, kind: "review" } as never)) as { added: number };
          added += res.added;
        } else {
          const base = file.name.replace(/\.(vtt|srt|txt|md)$/i, "");
          await callAction("add-source", {
            studyId,
            title: base,
            raw: text,
            format: /\.vtt$/i.test(file.name) ? "vtt" : /\.srt$/i.test(file.name) ? "srt" : "auto",
            kind: "interview",
            participant: { label: base.replace(/[-_]+/g, " ").trim() },
          } as never);
          added += 1;
        }
      }
      onImported(added);
      close();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not import those files");
    } finally {
      setBusy(false);
    }
  };

  const viaAgent = (message: string) => {
    sendToAgentChat({ message, submit: true });
    focusAgentChat();
    close();
  };

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-[color-mix(in_srgb,var(--vb-ink)_28%,transparent)]" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[min(640px,calc(100vw-32px))] -translate-x-1/2 -translate-y-1/2 rounded-[2px] border border-[var(--vb-hair)] bg-[var(--vb-ground-hi)] p-5 shadow-[0_24px_60px_-30px_rgba(27,27,25,0.5)]">
          <Dialog.Title className="font-[family-name:var(--vb-display)] text-[22px] font-medium tracking-[-0.02em]">Add sources</Dialog.Title>
          <Dialog.Description className="mt-1 text-[13px] text-[var(--vb-ink2)]">
            Every note the agent takes from these will be an exact passage, with who said it and when.
          </Dialog.Description>

          <div className="mt-4 flex gap-1 border-b border-[var(--vb-hair)]" role="tablist">
            {TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={tab === t.id}
                onClick={() => setTab(t.id)}
                className={cn("-mb-px border-b px-2.5 pb-2 text-[13px]", tab === t.id ? "border-[var(--vb-ink)] text-[var(--vb-ink)]" : "border-transparent text-[var(--vb-ink3)] hover:text-[var(--vb-ink)]")}
              >
                {t.label}
              </button>
            ))}
          </div>

          {tab === "paste" ? (
            <div className="mt-4 flex flex-col gap-2.5">
              <div className="flex gap-2">
                <input value={who} onChange={(e) => setWho(e.target.value)} placeholder="Who is it from? e.g. Dana Okafor" className="h-9 flex-1 rounded-[2px] border border-[var(--vb-hair)] bg-[var(--vb-card)] px-2.5 text-[13px] outline-none focus:border-[var(--vb-ink3)]" />
                <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title (optional)" className="h-9 flex-1 rounded-[2px] border border-[var(--vb-hair)] bg-[var(--vb-card)] px-2.5 text-[13px] outline-none focus:border-[var(--vb-ink3)]" />
              </div>
              <textarea
                value={raw}
                onChange={(e) => setRaw(e.target.value)}
                rows={10}
                placeholder={"Paste a transcript (WebVTT, SRT, or lines like “Dana: …”), a support ticket or any text."}
                className="w-full resize-y rounded-[2px] border border-[var(--vb-hair)] bg-[var(--vb-card)] p-2.5 font-[family-name:var(--vb-mono)] text-[12px] leading-relaxed outline-none focus:border-[var(--vb-ink3)]"
              />
              <div className="flex justify-end">
                <button type="button" disabled={busy || !raw.trim()} onClick={() => void addPasted()} className="h-9 rounded-full bg-[var(--vb-ink)] px-4 text-[13px] text-[var(--vb-ground-hi)] disabled:opacity-40">
                  {busy ? "Adding…" : "Add source"}
                </button>
              </div>
            </div>
          ) : tab === "files" ? (
            <label className="mt-4 flex h-44 cursor-pointer flex-col items-center justify-center gap-1.5 rounded-[2px] border border-dashed border-[var(--vb-ink4)] bg-[var(--vb-card)] text-center text-[13px] text-[var(--vb-ink2)] hover:border-[var(--vb-ink3)]">
              <span className="text-[var(--vb-ink)]">{busy ? "Importing…" : "Choose files"}</span>
              <span className="font-[family-name:var(--vb-mono)] text-[11px] text-[var(--vb-ink3)]">.vtt · .srt · .txt transcripts · .csv of reviews or tickets</span>
              <input type="file" multiple accept=".vtt,.srt,.txt,.md,.csv" className="sr-only" onChange={(e) => void addFiles(e.target.files)} />
            </label>
          ) : tab === "clips" ? (
            <ClipsTab studyId={studyId} onImported={(n) => { onImported(n); close(); }} />
          ) : (
            <div className="mt-4 flex flex-col gap-3 text-[13px] leading-relaxed text-[var(--vb-ink2)]">
              <p>Give this study a feedback inbox: a webhook any tool can post to (Intercom, Typeform, Zendesk, a form). Each new item becomes a source, and the agent files its quotes into the existing themes.</p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() =>
                    viaAgent(
                      "Create a webhook automation for this study: every POST to it is customer feedback. Add the payload's text as a source (kind ticket, participant = the sender if the payload names one), extract verbatim notes, file them into the existing themes, and update affected insights. Give me the webhook URL.",
                    )
                  }
                  className="h-9 rounded-full bg-[var(--vb-ink)] px-4 text-[13px] text-[var(--vb-ground-hi)]"
                >
                  Set up a feedback inbox
                </button>
              </div>
            </div>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function ClipsTab({ studyId, onImported }: { studyId: string; onImported: (n: number) => void }) {
  const { data, error, isLoading } = useActionQuery("list-clips-calls", { limit: 20 } as never, { retry: false });
  const [busy, setBusy] = useState<string | null>(null);
  const rows = (data as { recordings?: Array<{ id: string; title: string; createdAt: string | null; durationMs: number | null }> } | undefined)?.recordings ?? [];
  const notConnected = error && String((error as Error).message).includes("isn't connected");
  if (isLoading) return <p className="mt-4 font-[family-name:var(--vb-mono)] text-[12px] text-[var(--vb-ink3)]">Looking for your Clips calls…</p>;
  if (error) {
    return (
      <div className="mt-4 flex flex-col gap-3 text-[13px] leading-relaxed text-[var(--vb-ink2)]">
        <p>
          {notConnected
            ? "Connect your Clips account once: the transcript of every call you pick is copied exactly, with speakers and timestamps, and quotes link back to the moment in the recording."
            : (error as Error).message}
        </p>
        <ol className="list-decimal pl-5 text-[12.5px]">
          <li>Open Settings → Connections and add the MCP server <code className="font-[family-name:var(--vb-mono)]">https://clips.agent-native.com/mcp</code>.</li>
          <li>Sign in to Clips when asked, then come back here.</li>
        </ol>
        <a href="/settings" className="self-start rounded-full bg-[var(--vb-ink)] px-4 py-2 text-[13px] text-[var(--vb-ground-hi)]">Open settings</a>
      </div>
    );
  }
  return (
    <ul className="mt-3 max-h-72 divide-y divide-[var(--vb-hair)] overflow-y-auto">
      {rows.length === 0 ? <li className="py-4 text-[13px] text-[var(--vb-ink3)]">No recordings in your Clips library yet.</li> : null}
      {rows.map((r) => (
        <li key={r.id} className="flex items-center gap-3 py-2.5">
          <div className="min-w-0 flex-1">
            <p className="truncate text-[13.5px] text-[var(--vb-ink)]">{r.title}</p>
            <p className="font-[family-name:var(--vb-mono)] text-[10.5px] text-[var(--vb-ink3)]">
              {r.createdAt ? new Date(r.createdAt).toLocaleDateString("en", { month: "short", day: "numeric" }) : ""}
              {r.durationMs ? ` · ${Math.round(r.durationMs / 60000)} min` : ""}
            </p>
          </div>
          <button
            type="button"
            disabled={busy !== null}
            onClick={async () => {
              setBusy(r.id);
              try {
                await callAction("import-clips-call", { studyId, recordingId: r.id } as never);
                onImported(1);
              } catch (e) {
                toast.error(e instanceof Error ? e.message : "Import failed");
              } finally {
                setBusy(null);
              }
            }}
            className="h-8 shrink-0 rounded-full border border-[var(--vb-hair)] px-3 text-[12.5px] hover:border-[var(--vb-ink3)] disabled:opacity-40"
          >
            {busy === r.id ? "Importing…" : "Import"}
          </button>
        </li>
      ))}
    </ul>
  );
}
