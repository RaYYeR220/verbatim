import { defineAction } from "@agent-native/core/action";
import { desc, eq } from "drizzle-orm";
import { z } from "zod";

import { getDb, schema } from "../server/db/index.js";
import { requireStudy } from "../server/verbatim/store.js";

export default defineAction({
  description:
    "Read a study's activity feed, newest first: who did what (a person, the agent, an automation, or an external agent over MCP/A2A). Read it before sorting so you build on people's moves instead of undoing them.",
  schema: z.object({
    studyId: z.string(),
    limit: z.coerce.number().int().min(1).max(200).default(50),
  }),
  http: { method: "GET" },
  readOnly: true,
  run: async ({ studyId, limit }) => {
    await requireStudy(studyId, "viewer");
    const rows = await getDb()
      .select()
      .from(schema.boardEvents)
      .where(eq(schema.boardEvents.studyId, studyId))
      .orderBy(desc(schema.boardEvents.createdAt))
      .limit(limit);
    return {
      events: rows.map((r) => ({
        id: r.id,
        actor: r.actor,
        actorEmail: r.actorEmail,
        action: r.action,
        summary: r.summary,
        payload: JSON.parse(r.payloadJson || "{}"),
        at: r.createdAt,
      })),
    };
  },
});
