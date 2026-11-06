import { defineAction } from "@agent-native/core/action";
import { buildDeepLink } from "@agent-native/core/server";
import { z } from "zod";

import { searchQuotes } from "../server/verbatim/store.js";

export default defineAction({
  description:
    "Find what customers actually said about a topic. Returns verbatim notes (with speaker, timestamp, theme and a link to the exact spot on the board) across one study or every study you can open.",
  mcpTool: true,
  schema: z.object({
    query: z.string().min(2).max(200).describe("Topic words, e.g. 'export quickbooks'"),
    studyId: z.string().optional(),
    limit: z.coerce.number().int().min(1).max(50).default(20),
  }),
  http: { method: "GET" },
  readOnly: true,
  run: async (args) => {
    const hits = await searchQuotes(args);
    return {
      quotes: hits.map((h) => ({
        noteId: h.id,
        studyId: h.studyId,
        quote: h.text,
        speaker: h.speaker,
        tMs: h.tMs,
        theme: h.themeName,
        source: h.sourceTitle,
        link: buildDeepLink({ view: "board", params: { studyId: h.studyId, note: h.id } }),
      })),
    };
  },
});
