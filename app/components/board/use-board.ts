import { useActionMutation, useActionQuery } from "@agent-native/core/client/hooks";
import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useMemo } from "react";

import type { BoardNote, BoardPayload, BoardTheme } from "../../../server/verbatim/types";

export const CARD_W = 240;
export const CARD_H = 120;
export const FRAME_PAD = 16;
export const FRAME_HEADER = 56;

export interface ThemeFrame {
  theme: BoardTheme;
  x: number;
  y: number;
  w: number;
  h: number;
  notes: BoardNote[];
}

/** A theme frame is the bounding box of its notes (or its anchor when empty). */
export function frameFor(theme: BoardTheme, notes: BoardNote[]): ThemeFrame {
  if (notes.length === 0) {
    return { theme, x: theme.x, y: theme.y, w: CARD_W + FRAME_PAD * 2, h: FRAME_HEADER + 64, notes };
  }
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const n of notes) {
    minX = Math.min(minX, n.x);
    minY = Math.min(minY, n.y);
    maxX = Math.max(maxX, n.x + CARD_W);
    maxY = Math.max(maxY, n.y + CARD_H);
  }
  return {
    theme,
    x: minX - FRAME_PAD,
    y: minY - FRAME_HEADER,
    w: maxX - minX + FRAME_PAD * 2,
    h: maxY - minY + FRAME_HEADER + FRAME_PAD,
    notes,
  };
}

export function useBoard(studyId: string) {
  const qc = useQueryClient();
  const query = useActionQuery("get-board", { studyId } as never, {
    refetchOnWindowFocus: true,
  });
  const board = query.data as BoardPayload | undefined;

  const frames = useMemo(() => {
    if (!board) return [] as ThemeFrame[];
    const byTheme = new Map<string, BoardNote[]>();
    for (const n of board.notes) {
      if (!n.themeId) continue;
      byTheme.set(n.themeId, [...(byTheme.get(n.themeId) ?? []), n]);
    }
    return board.themes.map((t) => frameFor(t, byTheme.get(t.id) ?? []));
  }, [board]);

  const unsorted = useMemo(() => board?.notes.filter((n) => !n.themeId) ?? [], [board]);

  /** Patch the cached board immediately; the server write follows. */
  const patchCache = useCallback(
    (fn: (b: BoardPayload) => BoardPayload) => {
      qc.setQueriesData({ predicate: (q) => JSON.stringify(q.queryKey).includes("get-board") }, (old: unknown) =>
        old && typeof old === "object" && "notes" in (old as object) ? fn(old as BoardPayload) : old,
      );
    },
    [qc],
  );

  const moveMutation = useActionMutation("move-notes");
  const moveNotes = useCallback(
    (moves: Array<{ noteId: string; themeId?: string | null; x?: number; y?: number }>) => {
      patchCache((b) => ({
        ...b,
        notes: b.notes.map((n) => {
          const m = moves.find((mv) => mv.noteId === n.id);
          if (!m) return n;
          return {
            ...n,
            ...(m.themeId !== undefined ? { themeId: m.themeId } : {}),
            ...(m.x !== undefined ? { x: m.x } : {}),
            ...(m.y !== undefined ? { y: m.y } : {}),
          };
        }),
      }));
      return moveMutation.mutateAsync({ studyId, moves } as never);
    },
    [moveMutation, patchCache, studyId],
  );

  const moveThemeMutation = useActionMutation("move-theme");
  const moveTheme = useCallback(
    (themeId: string, dx: number, dy: number) => {
      patchCache((b) => ({
        ...b,
        themes: b.themes.map((t) => (t.id === themeId ? { ...t, x: t.x + dx, y: t.y + dy } : t)),
        notes: b.notes.map((n) => (n.themeId === themeId ? { ...n, x: n.x + dx, y: n.y + dy } : n)),
      }));
      return moveThemeMutation.mutateAsync({ themeId, dx, dy } as never);
    },
    [moveThemeMutation, patchCache],
  );

  return { query, board, frames, unsorted, moveNotes, moveTheme, patchCache };
}
