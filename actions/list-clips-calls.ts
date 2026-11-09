import { defineAction } from "@agent-native/core/action";
import { z } from "zod";

import { callClips, tryClips } from "../server/verbatim/clips.js";

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
    // Clips' compact catalog lists search-recordings; list-recordings may not be served.
    let data: any;
    if (query) data = await callClips("search-recordings", { query, limit });
    else {
      const recent = await tryClips("list-recordings", { view: "library", limit });
      data = recent.ok ? recent.data : await callClips("search-recordings", { query: " ", limit });
    }
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
