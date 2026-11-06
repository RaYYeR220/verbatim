import { defineAction } from "@agent-native/core/action";
import { getRequestUserEmail } from "@agent-native/core/server/request-context";
import { z } from "zod";

import { getDb, schema } from "../server/db/index.js";
import { actorFromCtx } from "../server/verbatim/actor.js";
import { newId, nowIso, recordEvent, requireStudy } from "../server/verbatim/store.js";

export default defineAction({
  description:
    "Leave a comment on a note, theme, insight or the whole board — e.g. 'split this into pricing vs billing'. The agent picks up open comments, does the work and replies in place.",
  schema: z.object({
    studyId: z.string(),
    targetType: z.enum(["note", "theme", "insight", "board"]),
    targetId: z.string().optional(),
    body: z.string().min(1).max(2000),
  }),
  run: async (args, ctx) => {
    await requireStudy(args.studyId, "viewer");
    const id = newId("cmt");
    const at = nowIso();
    await getDb()
      .insert(schema.comments)
      .values({
        id,
        studyId: args.studyId,
        targetType: args.targetType,
        targetId: args.targetId ?? null,
        body: args.body,
        authorEmail: getRequestUserEmail() ?? "anonymous",
        status: "open",
        createdAt: at,
        updatedAt: at,
      });
    await recordEvent({
      studyId: args.studyId,
      actor: actorFromCtx(ctx),
      action: "add-comment",
      summary: `Commented: "${args.body.slice(0, 80)}"`,
      payload: { commentId: id, targetType: args.targetType, targetId: args.targetId },
    });
    return { id, status: "open" };
  },
});
