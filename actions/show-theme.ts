import { defineAction, embedApp } from "@agent-native/core";
import { z } from "zod";

import { getBoard, getTheme, searchQuotes } from "../server/verbatim/store.js";

export default defineAction({
  description:
    "Show one theme with its insight and the customers' exact quotes (speaker, timestamp, source). Pass a themeId, or a topic to find the best-matching theme across the studies you can open. The result links to the theme on the Verbatim board.",
  schema: z.object({
    themeId: z.string().optional(),
    topic: z.string().min(2).max(160).optional().describe("Find the theme about this topic, e.g. 'offline receipts'"),
    limit: z.coerce.number().int().min(1).max(40).default(12),
  }),
  http: { method: "GET" },
  readOnly: true,
  mcpTool: true,
  mcpApp: {
    compactCatalog: true,
    resource: embedApp({
      title: "Theme evidence",
      description: "The theme card from the Verbatim board: insight, voices and every verbatim quote with its source.",
      iframeTitle: "Verbatim theme",
      openLabel: "Open in Verbatim",
      height: 620,
    }),
  },
  run: async (args) => {
    let themeId = args.themeId;
    if (!themeId && args.topic) {
      const hit = (await searchQuotes({ query: args.topic, limit: 40 })).find((h) => h.themeId);
      themeId = hit?.themeId ?? undefined;
    }
    if (!themeId) return { error: "No theme matches that topic yet." };
    const theme = await getTheme(themeId);
    const board = await getBoard(theme.studyId);
    const index = board.themes.findIndex((x) => x.id === themeId);
    const t = board.themes[index]!;
    const sourceById = new Map(board.sources.map((s) => [s.id, s]));
    const quotes = board.notes
      .filter((n) => n.themeId === themeId)
      .slice(0, args.limit)
      .map((n) => ({
        noteId: n.id,
        quote: n.text,
        speaker: n.speaker,
        tMs: n.tMs,
        source: sourceById.get(n.sourceId)?.title ?? null,
      }));
    return {
      id: t.id,
      studyId: board.study.id,
      study: board.study.title,
      name: t.name,
      colorIndex: index,
      summary: t.summary,
      notes: t.noteCount,
      voices: t.voiceCount,
      insights: board.insights
        .filter((i) => i.themeId === themeId)
        .map((i) => ({ claim: i.claim, status: i.status, cited: i.noteIds.length })),
      quotes,
    };
  },
  link: ({ result }) => {
    const r = result as { id?: string; studyId?: string; name?: string; error?: string } | undefined;
    if (!r?.id || !r.studyId) return null;
    // Opens the board on this theme (the person's own session decides access).
    return { url: `/studies/${r.studyId}?theme=${r.id}`, label: `Open "${r.name}" in Verbatim`, view: "board" };
  },
});
