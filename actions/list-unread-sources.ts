import { defineAction } from "@agent-native/core/action";
import { and, eq, notExists, sql } from "drizzle-orm";
import { z } from "zod";

import { getDb, schema } from "../server/db/index.js";
import { actorFromCtx, actorLabel } from "../server/verbatim/actor.js";
import { withAgentOnBoard } from "../server/verbatim/presence.js";
import { requireStudy } from "../server/verbatim/store.js";

export default defineAction({
  description:
    "Read the next batch of sources that have no notes yet, with full text for short ones (reviews, tickets, survey answers). Use it to extract from many small sources in a few calls; long transcripts are listed by id — read those with get-source.",
  schema: z.object({
    studyId: z.string(),
    maxChars: z.coerce.number().int().min(2000).max(60000).default(24000).describe("Total text budget for this batch"),
    limit: z.coerce.number().int().min(1).max(120).default(60),
  }),
  http: { method: "GET" },
  readOnly: true,
  run: async ({ studyId, maxChars, limit }, ctx) => {
    await requireStudy(studyId, "viewer");
    const actor = actorFromCtx(ctx);
    await withAgentOnBoard(studyId, actor, actorLabel(actor, ctx), async (point) => {
      point({ activity: "Reading the next batch of sources" });
    });
    const db = getDb();
    const unread = await db
      .select({
        id: schema.sources.id,
        title: schema.sources.title,
        kind: schema.sources.kind,
        participantId: schema.sources.participantId,
        text: schema.sources.text,
      })
      .from(schema.sources)
      .where(
        and(
          eq(schema.sources.studyId, studyId),
          notExists(db.select({ one: sql`1` }).from(schema.notes).where(eq(schema.notes.sourceId, schema.sources.id))),
        ),
      )
      .orderBy(schema.sources.createdAt)
      .limit(500);
    let budget = maxChars;
    const batch: Array<{ id: string; title: string; kind: string; text: string }> = [];
    const long: Array<{ id: string; title: string; chars: number }> = [];
    for (const s of unread) {
      if (batch.length >= limit) break;
      if (s.text.length > 6000) {
        long.push({ id: s.id, title: s.title, chars: s.text.length });
        continue;
      }
      if (s.text.length > budget) break;
      budget -= s.text.length;
      batch.push({ id: s.id, title: s.title, kind: s.kind, text: s.text });
    }
    return { remaining: unread.length, batch, longSources: long.slice(0, 20) };
  },
});
