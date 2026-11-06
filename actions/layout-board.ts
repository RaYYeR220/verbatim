import { defineAction } from "@agent-native/core/action";
import { z } from "zod";

import { actorFromCtx, actorLabel } from "../server/verbatim/actor.js";
import { withAgentOnBoard } from "../server/verbatim/presence.js";
import { applyLayout, recordEvent, requireStudy, touchStudy } from "../server/verbatim/store.js";

export default defineAction({
  description:
    "Tidy the board: lay theme frames out in columns, notes in a grid inside their theme, unsorted notes in a column on the left. Call after a round of sorting.",
  schema: z.object({ studyId: z.string() }),
  run: async (args, ctx) => {
    await requireStudy(args.studyId, "editor");
    const actor = actorFromCtx(ctx);
    return withAgentOnBoard(args.studyId, actor, actorLabel(actor, ctx), async (point) => {
      point({ activity: "Tidying the board" });
      const layout = await applyLayout(args.studyId);
      await touchStudy(args.studyId);
      await recordEvent({ studyId: args.studyId, actor, action: "layout-board", summary: "Tidied the board" });
      return { themes: Object.keys(layout.themes).length, notes: Object.keys(layout.notes).length };
    });
  },
});
