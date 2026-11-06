import { defineAction } from "@agent-native/core/action";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { getDb, schema } from "../server/db/index.js";
import { actorFromCtx } from "../server/verbatim/actor.js";
import { getInsight, recordEvent, requireStudy, touchStudy } from "../server/verbatim/store.js";

export default defineAction({
  description: "Delete an insight. The notes it cited stay on the board.",
  schema: z.object({ insightId: z.string() }),
  run: async (args, ctx) => {
    const insight = await getInsight(args.insightId);
    await requireStudy(insight.studyId, "editor");
    await getDb().delete(schema.insights).where(eq(schema.insights.id, insight.id));
    await touchStudy(insight.studyId);
    await recordEvent({
      studyId: insight.studyId,
      actor: actorFromCtx(ctx),
      action: "delete-insight",
      summary: `Deleted insight "${insight.claim.slice(0, 60)}"`,
      payload: { insightId: insight.id },
    });
    return { deleted: insight.id };
  },
});
