import { defineAction, fail } from "@agent-native/core/action";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { getDb, schema } from "../server/db/index.js";
import { actorFromCtx } from "../server/verbatim/actor.js";
import { nowIso, recordEvent, requireStudy } from "../server/verbatim/store.js";

export default defineAction({
  description:
    "Mark a comment as being worked on (status working) or done with a reply saying exactly what changed on the board.",
  schema: z.object({
    commentId: z.string(),
    status: z.enum(["working", "done"]),
    replyBody: z.string().max(2000).optional(),
  }),
  run: async (args, ctx) => {
    const db = getDb();
    const [comment] = await db.select().from(schema.comments).where(eq(schema.comments.id, args.commentId)).limit(1);
    if (!comment) fail("Comment not found.", { errorCode: "comment_not_found", statusCode: 404 });
    await requireStudy(comment.studyId, "editor");
    await db
      .update(schema.comments)
      .set({ status: args.status, replyBody: args.replyBody ?? comment.replyBody, updatedAt: nowIso() })
      .where(eq(schema.comments.id, comment.id));
    if (args.status === "done") {
      await recordEvent({
        studyId: comment.studyId,
        actor: actorFromCtx(ctx),
        action: "resolve-comment",
        summary: args.replyBody ? `Replied: "${args.replyBody.slice(0, 100)}"` : "Resolved a comment",
        payload: { commentId: comment.id },
      });
    }
    return { id: comment.id, status: args.status };
  },
});
