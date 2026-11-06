import { defineAction } from "@agent-native/core/action";
import { z } from "zod";

import { actorFromCtx } from "../server/verbatim/actor.js";
import { deleteThemeRow, getTheme, recordEvent, requireStudy, touchStudy } from "../server/verbatim/store.js";

export default defineAction({
  description: "Delete a theme. Its notes go back to unsorted; nothing is lost.",
  schema: z.object({ themeId: z.string() }),
  // An agent deleting a theme a person made needs that person's OK first.
  needsApproval: async (args, ctx) => {
    if (actorFromCtx(ctx) === "user") return false;
    try {
      return (await getTheme(args.themeId)).createdBy === "user";
    } catch {
      return false;
    }
  },
  run: async (args, ctx) => {
    const theme = await getTheme(args.themeId);
    await requireStudy(theme.studyId, "editor");
    await deleteThemeRow(theme.id);
    await touchStudy(theme.studyId);
    await recordEvent({
      studyId: theme.studyId,
      actor: actorFromCtx(ctx),
      action: "delete-theme",
      summary: `Deleted theme "${theme.name}" (its notes are unsorted again)`,
      payload: { themeId: theme.id },
    });
    return { deleted: theme.id };
  },
});
