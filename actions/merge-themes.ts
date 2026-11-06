import { defineAction, fail } from "@agent-native/core/action";
import { z } from "zod";

import { actorFromCtx, actorLabel } from "../server/verbatim/actor.js";
import { withAgentOnBoard } from "../server/verbatim/presence.js";
import {
  applyLayout,
  deleteThemeRow,
  getTheme,
  moveAllNotes,
  recordEvent,
  requireStudy,
  touchStudy,
  updateThemeIfCurrent,
} from "../server/verbatim/store.js";
import { jsonArray } from "./lib/zod-helpers.js";

export default defineAction({
  description:
    "Merge two or more themes into the first one listed, under a new name. Notes and insights move with it; the other themes are removed.",
  schema: z.object({
    studyId: z.string(),
    themeIds: jsonArray(z.string(), { min: 2, max: 12 }),
    name: z.string().min(1).max(80),
  }),
  // Merging away a theme a person made needs that person's OK first.
  needsApproval: async (args, ctx) => {
    if (actorFromCtx(ctx) === "user") return false;
    for (const id of args.themeIds) {
      try {
        if ((await getTheme(id)).createdBy === "user") return true;
      } catch {
        /* missing themes fail in run() */
      }
    }
    return false;
  },
  run: async (args, ctx) => {
    await requireStudy(args.studyId, "editor");
    const actor = actorFromCtx(ctx);
    const themes: Awaited<ReturnType<typeof getTheme>>[] = [];
    for (const id of args.themeIds) {
      const t = await getTheme(id);
      if (t.studyId !== args.studyId) fail(`Theme ${id} is not in this study.`, { errorCode: "theme_not_found", statusCode: 404 });
      themes.push(t);
    }
    const [keep, ...rest] = themes;
    if (!keep) fail("Pass at least two themes.", { errorCode: "bad_request", statusCode: 400 });
    return withAgentOnBoard(args.studyId, actor, actorLabel(actor, ctx), async (point) => {
      point({ themeId: keep.id, activity: `Merging ${themes.length} themes into "${args.name}"` });
      for (const t of rest) {
        await moveAllNotes(t.id, keep.id);
        await deleteThemeRow(t.id);
      }
      await updateThemeIfCurrent(keep.id, undefined, { name: args.name });
      await applyLayout(args.studyId);
      await touchStudy(args.studyId);
      await recordEvent({
        studyId: args.studyId,
        actor,
        action: "merge-themes",
        summary: `Merged ${themes.map((t) => `"${t.name}"`).join(", ")} into "${args.name}"`,
        payload: { keep: keep.id, merged: rest.map((t) => t.id) },
      });
      return { themeId: keep.id, name: args.name, merged: rest.length };
    });
  },
});
