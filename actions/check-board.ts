import { defineAction } from "@agent-native/core/action";
import { z } from "zod";

import { claimCountIssues, describeCountIssues } from "../server/verbatim/claim-counts.js";
import { claimCountContext } from "../server/verbatim/rules.js";
import { getBoard } from "../server/verbatim/store.js";

export default defineAction({
  description:
    "Check a board against its evidence: re-verifies every note against its source text and reports unsorted notes, themes resting on one voice, themes with no insight, anecdotes, and insights whose stated counts the evidence no longer shows. Keep working until it reports done, or say what is left and why.",
  mcpTool: true,
  schema: z.object({ studyId: z.string() }),
  http: { method: "GET" },
  readOnly: true,
  run: async ({ studyId }) => {
    const board = await getBoard(studyId);
    const themeName = new Map(board.themes.map((t) => [t.id, t.name]));
    const h = board.health;
    const next: string[] = [];
    if (h.unreadSources.length > 0)
      next.push(`${h.unreadSources.length} source(s) have no notes yet — read them (list-unread-sources for short ones) and extract.`);
    if (h.tampered > 0) next.push(`${h.tampered} note(s) no longer match their source — delete or re-extract them.`);
    if (h.unsorted > 0) next.push(`Sort ${h.unsorted} unsorted note(s) into themes (or leave clear outliers unsorted and say why).`);
    if (h.thinThemes.length > 0)
      next.push(`Themes on one voice: ${h.thinThemes.map((id) => `"${themeName.get(id)}"`).join(", ")} — merge them or keep them as anecdotes.`);
    if (h.uncitedThemes.length > 0)
      next.push(`Write an insight for: ${h.uncitedThemes.map((id) => `"${themeName.get(id)}"`).join(", ")}.`);
    for (const id of h.countMismatches) {
      const ins = board.insights.find((i) => i.id === id);
      if (!ins) continue;
      const issues = claimCountIssues(ins.claim, claimCountContext(ins.noteIds, ins.themeId, board.notes, board.sources.length));
      next.push(`Insight ${id} (rev ${ins.rev}) states a count the evidence doesn't show: ${describeCountIssues(issues)} Update it with write-insight.`);
    }
    return {
      score: h.score,
      done: h.unreadSources.length === 0 && h.tampered === 0 && h.unsorted === 0 && h.uncitedThemes.length === 0 && h.countMismatches.length === 0,
      health: {
        ...h,
        unreadSources: h.unreadSources.length,
        thinThemes: h.thinThemes.length,
        uncitedThemes: h.uncitedThemes.length,
        countMismatches: h.countMismatches.length,
        issues: h.issues.map((i) => ({ kind: i.kind, count: i.ids.length, sample: i.ids.slice(0, 12), message: i.message })),
      },
      themes: board.themes.map((t) => ({ id: t.id, name: t.name, notes: t.noteCount, voices: t.voiceCount, rev: t.rev })),
      next,
    };
  },
});
