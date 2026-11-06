import { defineAction } from "@agent-native/core/action";
import { z } from "zod";

import { getTheme, requireStudy, shiftTheme, touchStudy } from "../server/verbatim/store.js";

export default defineAction({
  description: "Move a theme frame, with all of its notes, by an offset on the board.",
  schema: z.object({
    themeId: z.string(),
    dx: z.number(),
    dy: z.number(),
  }),
  run: async (args) => {
    const theme = await getTheme(args.themeId);
    await requireStudy(theme.studyId, "editor");
    await shiftTheme(theme.id, args.dx, args.dy);
    await touchStudy(theme.studyId);
    return { themeId: theme.id, x: theme.x + args.dx, y: theme.y + args.dy };
  },
});
