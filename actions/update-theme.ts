import { defineAction } from "@agent-native/core/action";
import { EXPECTED_REVISION_DESCRIPTION } from "@agent-native/core/save-conflict/server";
import { z } from "zod";

import { actorFromCtx, actorLabel } from "../server/verbatim/actor.js";
import { withAgentOnBoard } from "../server/verbatim/presence.js";
import { getTheme, recordEvent, requireStudy, touchStudy, updateThemeIfCurrent } from "../server/verbatim/store.js";
import { THEME_COLORS } from "../server/verbatim/types.js";

export default defineAction({
  description:
    "Rename a theme, change its colour, or write its one-paragraph summary. Pass the theme's `rev` from your last read so you never overwrite a person's edit.",
  schema: z.object({
    themeId: z.string(),
    name: z.string().min(1).max(80).optional(),
    summary: z.string().max(1200).nullable().optional(),
    color: z.enum(THEME_COLORS).optional(),
    expectedRev: z.string().optional().describe(EXPECTED_REVISION_DESCRIPTION),
  }),
  run: async (args, ctx) => {
    const theme = await getTheme(args.themeId);
    await requireStudy(theme.studyId, "editor");
    const actor = actorFromCtx(ctx);
    return withAgentOnBoard(theme.studyId, actor, actorLabel(actor, ctx), async (point) => {
      point({ themeId: theme.id, activity: args.name ? `Renaming "${theme.name}"` : `Editing "${theme.name}"` });
      const patch: { name?: string; summary?: string | null; color?: string } = {};
      if (args.name !== undefined) patch.name = args.name;
      if (args.summary !== undefined) patch.summary = args.summary;
      if (args.color !== undefined) patch.color = args.color;
      const saved = await updateThemeIfCurrent(theme.id, args.expectedRev, patch);
      await touchStudy(theme.studyId);
      if (args.name && args.name !== theme.name) {
        await recordEvent({
          studyId: theme.studyId,
          actor,
          action: "rename-theme",
          summary: `Renamed "${theme.name}" to "${args.name}"`,
          payload: { themeId: theme.id, from: theme.name, to: args.name },
        });
      } else if (args.summary !== undefined) {
        await recordEvent({
          studyId: theme.studyId,
          actor,
          action: "update-theme",
          summary: `Updated the summary of "${saved.name}"`,
          payload: { themeId: theme.id },
        });
      }
      return saved;
    });
  },
});
