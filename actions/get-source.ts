import { defineAction } from "@agent-native/core/action";
import { z } from "zod";

import { getSource, requireStudy, sourceSpans } from "../server/verbatim/store.js";

export default defineAction({
  description:
    "Read one source's full text with its speaker and timestamp segments and the character spans already taken by notes. Read this before extracting quotes from it.",
  schema: z.object({
    sourceId: z.string(),
    offset: z.coerce.number().int().min(0).default(0).describe("Character offset to start from, for long sources"),
    length: z.coerce.number().int().min(1000).max(60000).default(30000),
  }),
  http: { method: "GET" },
  readOnly: true,
  run: async ({ sourceId, offset, length }) => {
    const src = await getSource(sourceId);
    await requireStudy(src.studyId, "viewer");
    const spans = await sourceSpans(sourceId);
    const end = Math.min(src.text.length, offset + length);
    return {
      source: {
        id: src.id,
        studyId: src.studyId,
        title: src.title,
        kind: src.kind,
        participantId: src.participantId,
        mediaUrl: src.mediaUrl,
        chars: src.text.length,
      },
      offset,
      text: src.text.slice(offset, end),
      truncated: end < src.text.length,
      segments: src.segments.filter((s) => s.end > offset && s.start < end),
      notes: spans,
    };
  },
});
