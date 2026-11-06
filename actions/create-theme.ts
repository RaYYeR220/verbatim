import { defineAction } from "@agent-native/core/action";
import { z } from "zod";

import { actorFromCtx, actorLabel } from "../server/verbatim/actor.js";
import { withAgentOnBoard } from "../server/verbatim/presence.js";
import {
  insertTheme,
  nextSlots,
  noteIdsInStudy,
  recordEvent,
  requireStudy,
  touchStudy,
  updateNotePlacement,
} from "../server/verbatim/store.js";
import { THEME_COLORS } from "../server/verbatim/types.js";
import { jsonArray } from "./lib/zod-helpers.js";

export default defineAction({
  description:
    "Create a theme (a cluster on the board) named as the customer's problem in plain words, optionally moving notes into it.",
  schema: z.object({
    studyId: z.string(),
    name: z.string().min(1).max(80).describe("Plain-language problem, ≤ 6 words, e.g. 'Receipts fail offline'"),
    color: z.enum(THEME_COLORS).optional(),
    noteIds: jsonArray(z.string(), { max: 200 }).optional(),
    x: z.number().optional(),
    y: z.number().optional(),
  }),
  run: async (args, ctx) => {
    await requireStudy(args.studyId, "editor");
    const actor = actorFromCtx(ctx);
    return withAgentOnBoard(args.studyId, actor, actorLabel(actor, ctx), async (point) => {
      const theme = await insertTheme({
        studyId: args.studyId,
        name: args.name,
        color: args.color,
        createdBy: actor,
        x: args.x,
        y: args.y,
      });
      point({ themeId: theme.id, activity: `Created theme "${args.name}"` });
      let moved = 0;
      if (args.noteIds?.length) {
        const known = await noteIdsInStudy(args.studyId, args.noteIds);
        const ids = args.noteIds.filter((id) => known.has(id));
        const slots = await nextSlots(args.studyId, theme.id, ids.length);
        for (const [i, id] of ids.entries()) {
          await updateNotePlacement(id, { themeId: theme.id, ...(slots[i] ?? {}) });
        }
        moved = ids.length;
        point({ themeId: theme.id, noteIds: ids, activity: `Sorting ${ids.length} notes into "${args.name}"` });
      }
      await touchStudy(args.studyId);
      await recordEvent({
        studyId: args.studyId,
        actor,
        action: "create-theme",
        summary: `Created theme "${args.name}"${moved ? ` with ${moved} notes` : ""}`,
        payload: { themeId: theme.id, noteIds: args.noteIds ?? [] },
      });
      return { ...theme, moved };
    });
  },
});
