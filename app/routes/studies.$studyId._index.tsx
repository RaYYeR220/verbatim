import { sendToAgentChat } from "@agent-native/core/client/agent-chat";
import { setClientAppState } from "@agent-native/core/client/application-state";
import { useActionMutation, useDbSync } from "@agent-native/core/client/hooks";
import { focusAgentChat } from "@agent-native/toolkit/app/chat";
import { useSetPageTitle } from "@agent-native/toolkit/app-shell/header-actions";
import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router";
import { toast } from "sonner";

import { BoardCanvas } from "@/components/board/BoardCanvas";
import { BoardPanel } from "@/components/board/BoardPanel";
import { ImportDialog } from "@/components/board/ImportDialog";
import { themeHue } from "@/components/board/theme-colors";
import { useBoard } from "@/components/board/use-board";
import { useBoardPresence } from "@/components/board/use-board-presence";
import { cn } from "@/lib/utils";

import type { BoardNote } from "../../server/verbatim/types";

export function meta() {
  return [{ title: "Board · Verbatim" }];
}

function askAgent(message: string, context?: string) {
  sendToAgentChat({ message, ...(context ? { context } : {}), submit: true });
  focusAgentChat();
}

export default function StudyBoardRoute() {
  const { studyId = "" } = useParams();
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  useDbSync({ queryClient: qc, realtime: { reason: "the agent and teammates edit this board live" } });

  const { query, board, frames, moveNotes, moveTheme } = useBoard(studyId);
  const { agents } = useBoardPresence(studyId);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [selectedThemeId, setSelectedThemeId] = useState<string | null>(null);
  const [followAgent, setFollowAgent] = useState(true);
  const [panelOpen, setPanelOpen] = useState(true);
  const [importOpen, setImportOpen] = useState(false);
  const [commentDraft, setCommentDraft] = useState<string | null>(null);
  const [themeDraft, setThemeDraft] = useState<string | null>(null);
  const focusNoteId = params.get("note");
  const focusThemeId = params.get("theme") ?? selectedThemeId;

  useSetPageTitle(board ? board.study.title : "Board");

  const hueByTheme = useMemo(() => {
    const m = new Map<string, string>();
    board?.themes.forEach((t, i) => m.set(t.id, themeHue(t.color, i)));
    return m;
  }, [board?.themes]);

  // Tell the agent what the person has selected.
  const selectionTimer = useRef<number | null>(null);
  useEffect(() => {
    if (selectionTimer.current) window.clearTimeout(selectionTimer.current);
    selectionTimer.current = window.setTimeout(() => {
      void setClientAppState(
        "selection",
        selected.size || selectedThemeId
          ? { studyId, noteIds: [...selected].slice(0, 60), themeId: selectedThemeId, capturedAt: Date.now() }
          : null,
        { keepalive: true },
      );
    }, 180);
  }, [selected, selectedThemeId, studyId]);

  const onSelect = useCallback((ids: string[], mode: "replace" | "toggle" | "add") => {
    setSelected((prev) => {
      if (mode === "replace") return new Set(ids);
      const next = new Set(prev);
      for (const id of ids) {
        if (mode === "toggle" && next.has(id)) next.delete(id);
        else next.add(id);
      }
      return next;
    });
  }, []);

  const renameMutation = useActionMutation("update-theme");
  const onRenameTheme = useCallback(
    (themeId: string, name: string) => {
      const theme = board?.themes.find((t) => t.id === themeId);
      renameMutation.mutate({ themeId, name, expectedRev: theme?.rev } as never, {
        onError: (err) => {
          const msg = err instanceof Error ? err.message : String(err);
          toast.error(msg.includes("changed after you read it") ? "Someone renamed this theme a moment ago — the board has their version." : msg);
          void query.refetch();
        },
      });
    },
    [board?.themes, renameMutation, query],
  );

  const onMoveNotes = useCallback(
    (moves: Array<{ noteId: string; themeId: string | null; x: number; y: number }>) => {
      moveNotes(moves).catch((err: unknown) => {
        toast.error(err instanceof Error ? err.message : "Could not move notes");
        void query.refetch();
      });
    },
    [moveNotes, query],
  );

  const onOpenNote = useCallback(
    (note: BoardNote) => navigate(`/studies/${studyId}/sources/${note.sourceId}?note=${note.id}`),
    [navigate, studyId],
  );

  const createTheme = useActionMutation("create-theme");
  const addComment = useActionMutation("add-comment");
  const layoutBoard = useActionMutation("layout-board");

  const selectedNotes = useMemo(() => (board ? board.notes.filter((n) => selected.has(n.id)) : []), [board, selected]);

  const submitComment = async () => {
    if (!commentDraft?.trim() || !board) return;
    const body = commentDraft.trim();
    const target = selectedNotes.length === 1 ? { targetType: "note" as const, targetId: selectedNotes[0]!.id } : selectedThemeId ? { targetType: "theme" as const, targetId: selectedThemeId } : { targetType: "board" as const };
    const res = (await addComment.mutateAsync({ studyId, ...target, body } as never)) as { id: string };
    setCommentDraft(null);
    const what =
      target.targetType === "note"
        ? `the note ${target.targetId}`
        : target.targetType === "theme"
          ? `the theme "${board.themes.find((t) => t.id === target.targetId)?.name}" (${target.targetId})`
          : "the board";
    askAgent(`Handle the open comment ${res.id} on ${what}: "${body}"`, selectedNotes.length > 1 ? `Selected notes: ${selectedNotes.map((n) => n.id).join(", ")}` : undefined);
  };

  if (query.isLoading && !board) {
    return <div className="flex h-full items-center justify-center font-[family-name:var(--vb-mono)] text-[12px] text-[var(--vb-ink3)]">Loading the board…</div>;
  }
  if (!board) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 text-[14px] text-[var(--vb-ink2)]">
        <p>This study isn't available to you.</p>
        <Link to="/studies" className="underline underline-offset-4">
          Back to studies
        </Link>
      </div>
    );
  }

  const empty = board.notes.length === 0;
  const unread = board.health.unreadSources.length;

  const selBar =
    selected.size > 0 || commentDraft !== null ? (
      <div className="vb-selbar" onPointerDown={(e) => e.stopPropagation()}>
        {themeDraft !== null ? (
          <>
            <input
              autoFocus
              value={themeDraft}
              onChange={(e) => setThemeDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && themeDraft.trim()) {
                  createTheme.mutate({ studyId, name: themeDraft.trim(), noteIds: [...selected] } as never);
                  setThemeDraft(null);
                  setSelected(new Set());
                }
                if (e.key === "Escape") setThemeDraft(null);
              }}
              placeholder="The customer's problem, in plain words"
              className="h-7 w-[300px] bg-transparent px-2 text-[13px] outline-none"
            />
            <button
              type="button"
              className="primary"
              disabled={!themeDraft.trim()}
              onClick={() => {
                createTheme.mutate({ studyId, name: themeDraft.trim(), noteIds: [...selected] } as never);
                setThemeDraft(null);
                setSelected(new Set());
              }}
            >
              Create theme
            </button>
            <button type="button" onClick={() => setThemeDraft(null)}>
              Cancel
            </button>
          </>
        ) : commentDraft !== null ? (
          <>
            <input
              autoFocus
              value={commentDraft}
              onChange={(e) => setCommentDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void submitComment();
                if (e.key === "Escape") setCommentDraft(null);
              }}
              placeholder={selectedNotes.length ? "e.g. split these into pricing vs billing" : "Comment for the agent"}
              className="h-7 w-[340px] bg-transparent px-2 text-[13px] outline-none"
            />
            <button type="button" className="primary" onClick={() => void submitComment()}>
              Send
            </button>
            <button type="button" onClick={() => setCommentDraft(null)}>
              Cancel
            </button>
          </>
        ) : (
          <>
            <span className="count">{selected.size} selected</span>
            <button type="button" onClick={() => setThemeDraft("")}>
              New theme
            </button>
            <button type="button" onClick={() => setCommentDraft("")}>
              Comment
            </button>
            <button
              type="button"
              className="primary"
              onClick={() =>
                askAgent(
                  `Look at the ${selected.size} notes I selected on the board. What do they have in common, and where do they belong?`,
                  `Selected notes: ${selectedNotes.map((n) => `${n.id} "${n.text.slice(0, 90)}"`).join("; ")}`,
                )
              }
            >
              Ask agent
            </button>
            <button type="button" onClick={() => setSelected(new Set())}>
              Clear
            </button>
          </>
        )}
      </div>
    ) : null;

  return (
    <div className="flex h-full min-h-0 flex-col bg-[var(--vb-ground)]">
      <div className="flex shrink-0 items-center gap-3 border-b border-[var(--vb-hair)] px-4 py-2.5">
        <div className="min-w-0 flex-1">
          <h1 className="truncate font-[family-name:var(--vb-display)] text-[19px] font-medium tracking-[-0.02em] text-[var(--vb-ink)]">{board.study.title}</h1>
          <p className="truncate font-[family-name:var(--vb-mono)] text-[11px] text-[var(--vb-ink3)]">
            {board.sources.length} sources · {board.notes.length} exact quotes · {board.themes.length} themes · {board.insights.length} insights
            {board.study.question ? <span className="font-[family-name:var(--vb-body)] text-[12px]"> — {board.study.question}</span> : null}
          </p>
        </div>
        <button type="button" onClick={() => setImportOpen(true)} className="h-8 rounded-[2px] border border-[var(--vb-hair)] px-3 text-[13px] hover:border-[var(--vb-ink3)]">
          Add sources
        </button>
        <button
          type="button"
          onClick={() => layoutBoard.mutate({ studyId } as never)}
          className="h-8 rounded-[2px] border border-[var(--vb-hair)] px-3 text-[13px] hover:border-[var(--vb-ink3)]"
          title="Lay themes out in columns and notes in a grid"
        >
          Tidy
        </button>
        <button
          type="button"
          onClick={() => setFollowAgent((v) => !v)}
          className={cn("h-8 rounded-[2px] border px-3 text-[13px]", followAgent ? "border-[var(--vb-steel)] text-[var(--vb-steel)]" : "border-[var(--vb-hair)] text-[var(--vb-ink3)]")}
          title="Keep the agent's work in view"
        >
          {followAgent ? "Following agent" : "Follow agent"}
        </button>
        <button
          type="button"
          onClick={() =>
            askAgent(
              empty || unread
                ? `Synthesize this study: put every source on the board as verbatim notes, sort them into themes, write an insight for every theme, and keep going until check-board reports done.`
                : `Review this board: check-board, fix what it reports, and tell me the three findings a product team should act on first.`,
            )
          }
          className="h-8 rounded-full bg-[var(--vb-ink)] px-4 text-[13px] text-[var(--vb-ground-hi)]"
        >
          {empty || unread ? "Synthesize with agent" : "Review with agent"}
        </button>
        <button type="button" onClick={() => setPanelOpen((v) => !v)} className="h-8 px-2 text-[13px] text-[var(--vb-ink3)] hover:text-[var(--vb-ink)]" aria-pressed={panelOpen}>
          {panelOpen ? "Hide panel" : "Insights"}
        </button>
      </div>

      <div className="flex min-h-0 flex-1">
        <div className="relative min-w-0 flex-1">
          {empty ? (
            <EmptyBoard sources={board.sources.length} onImport={() => setImportOpen(true)} onSynthesize={() => askAgent("Synthesize this study: extract verbatim notes from every source, sort them into themes, write an insight for every theme, and keep going until check-board reports done.")} />
          ) : (
            <BoardCanvas
              board={board}
              frames={frames}
              hueByTheme={hueByTheme}
              selected={selected}
              onSelect={onSelect}
              agents={agents}
              followAgent={followAgent}
              focusNoteId={focusNoteId}
              focusThemeId={focusThemeId}
              onMoveNotes={onMoveNotes}
              onMoveTheme={(id, dx, dy) => void moveTheme(id, dx, dy)}
              onRenameTheme={onRenameTheme}
              onOpenNote={onOpenNote}
              onSelectTheme={setSelectedThemeId}
              toolbar={selBar}
            />
          )}
        </div>
        {panelOpen ? (
          <BoardPanel
            board={board}
            hueByTheme={hueByTheme}
            selectedThemeId={focusThemeId}
            onFocusNote={(id) => setParams((p) => { p.set("note", id); return p; }, { replace: true })}
            onFocusTheme={(id) => setSelectedThemeId(id)}
          />
        ) : null}
      </div>
      <ImportDialog open={importOpen} onOpenChange={setImportOpen} studyId={studyId} onImported={(n) => {
        void query.refetch();
        toast.success(`Added ${n} source${n === 1 ? "" : "s"}`, {
          action: { label: "Extract with agent", onClick: () => askAgent(`I just added ${n} source${n === 1 ? "" : "s"} to this study. Extract verbatim notes from every unread source and file them into the existing themes (create new themes where needed), then update the insights.`) },
        });
      }} />
    </div>
  );
}

function EmptyBoard({ sources, onImport, onSynthesize }: { sources: number; onImport: () => void; onSynthesize: () => void }) {
  return (
    <div className="flex h-full items-center justify-center bg-[var(--vb-ground)]">
      <div className="max-w-md text-center">
        <p className="font-[family-name:var(--vb-display)] text-[28px] font-medium tracking-[-0.03em] text-[var(--vb-ink)]">
          {sources ? `${sources} source${sources === 1 ? "" : "s"}, no notes yet.` : "An empty board."}
        </p>
        <p className="mt-2 text-[14px] leading-relaxed text-[var(--vb-ink2)]">
          {sources
            ? "The agent will read every source, cut it into exact quotes and sort them into themes with you. You can move anything it does."
            : "Drop in interview transcripts, call recordings, reviews or tickets. Every note on this board will be a passage someone actually said."}
        </p>
        <div className="mt-5 flex justify-center gap-2">
          <button type="button" onClick={onImport} className="h-9 rounded-full border border-[var(--vb-hair)] px-4 text-[13px] hover:border-[var(--vb-ink3)]">
            Add sources
          </button>
          {sources ? (
            <button type="button" onClick={onSynthesize} className="h-9 rounded-full bg-[var(--vb-ink)] px-4 text-[13px] text-[var(--vb-ground-hi)]">
              Synthesize with agent
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
