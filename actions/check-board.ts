import { defineAction } from "@agent-native/core/action";
import { z } from "zod";

import { getBoard } from "../server/verbatim/store.js";

export default defineAction({
  description:
    "Check a board against its evidence: re-verifies every note against its source text and reports unsorted notes, themes resting on one voice, themes with no insight, and anecdotes. Keep working until it reports 0 unsorted, 0 tampered and no uncited themes, or say what is left and why.",
  schema: z.object({ studyId: z.string() }),
  http: { method: "GET" },
  readOnly: true,
  run: async ({ studyId }) => {
    const board = await getBoard(studyId);
    const themeName = new Map(board.themes.map((t) => [t.id, t.name]));
    const h = board.health;
    const next: string[] = [];
    if (h.tampered > 0) next.push(`${h.tampered} note(s) no longer match their source — delete or re-extract them.`);
    if (h.unsorted > 0) next.push(`Sort ${h.unsorted} unsorted note(s) into themes (or leave clear outliers unsorted and say why).`);
    if (h.thinThemes.length > 0)
      next.push(`Themes on one voice: ${h.thinThemes.map((id) => `"${themeName.get(id)}"`).join(", ")} — merge them or keep them as anecdotes.`);
    if (h.uncitedThemes.length > 0)
      next.push(`Write an insight for: ${h.uncitedThemes.map((id) => `"${themeName.get(id)}"`).join(", ")}.`);
    return {
      score: h.score,
      done: h.tampered === 0 && h.unsorted === 0 && h.uncitedThemes.length === 0,
      health: h,
      themes: board.themes.map((t) => ({ id: t.id, name: t.name, notes: t.noteCount, voices: t.voiceCount, rev: t.rev })),
      next,
    };
  },
});
