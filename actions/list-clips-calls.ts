import { defineAction } from "@agent-native/core/action";
import { z } from "zod";

import { callClips } from "../server/verbatim/clips.js";

export default defineAction({
  description:
    "List the person's recent Clips recordings (calls, meetings, screen recordings) from their connected Clips account, so they can pick which to bring into a study.",
  schema: z.object({
    query: z.string().max(200).optional().describe("Search recordings by words in the title or transcript"),
    limit: z.coerce.number().int().min(1).max(50).default(20),
  }),
  http: { method: "GET" },
  readOnly: true,
  run: async ({ query, limit }) => {
    const data = query ? await callClips("search-recordings", { query, limit }) : await callClips("list-recordings", { view: "library", limit });
    const rows: any[] = data?.recordings ?? data?.results ?? data?.items ?? (Array.isArray(data) ? data : []);
    return {
      recordings: rows.slice(0, limit).map((r) => ({
        id: r.id ?? r.recordingId,
        title: r.title ?? "Untitled recording",
        createdAt: r.createdAt ?? null,
        durationMs: r.durationMs ?? null,
        hasTranscript: r.transcriptStatus ? r.transcriptStatus === "ready" : undefined,
      })),
    };
  },
});
