import { defineAction } from "@agent-native/core/action";
import { and, asc, eq, isNull } from "drizzle-orm";
import { z } from "zod";

import { getDb, schema } from "../server/db/index.js";
import { requireStudy } from "../server/verbatim/store.js";

export default defineAction({
  description:
    "List a study's notes compactly (id, text, speaker, theme) for sorting large boards. Filter to unsorted notes or one theme, and page with offset.",
  schema: z.object({
    studyId: z.string(),
    filter: z.enum(["all", "unsorted", "theme"]).default("unsorted"),
    themeId: z.string().optional(),
    limit: z.coerce.number().int().min(1).max(400).default(200),
    offset: z.coerce.number().int().min(0).default(0),
  }),
  http: { method: "GET" },
  readOnly: true,
  run: async ({ studyId, filter, themeId, limit, offset }) => {
    await requireStudy(studyId, "viewer");
    const where =
      filter === "unsorted"
        ? and(eq(schema.notes.studyId, studyId), isNull(schema.notes.themeId))
        : filter === "theme" && themeId
          ? and(eq(schema.notes.studyId, studyId), eq(schema.notes.themeId, themeId))
          : eq(schema.notes.studyId, studyId);
    const rows = await getDb()
      .select({ id: schema.notes.id, text: schema.notes.text, speaker: schema.notes.speaker, themeId: schema.notes.themeId })
      .from(schema.notes)
      .where(where)
      .orderBy(asc(schema.notes.createdAt), asc(schema.notes.id))
      .limit(limit + 1)
      .offset(offset);
    return {
      notes: rows.slice(0, limit).map((r) => ({ ...r, text: r.text.length > 220 ? `${r.text.slice(0, 220)}…` : r.text })),
      more: rows.length > limit,
      nextOffset: rows.length > limit ? offset + limit : null,
    };
  },
});
