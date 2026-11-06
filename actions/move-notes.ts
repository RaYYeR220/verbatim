import { defineAction, fail } from "@agent-native/core/action";
import { z } from "zod";

import { actorFromCtx, actorLabel } from "../server/verbatim/actor.js";
import { withAgentOnBoard } from "../server/verbatim/presence.js";
import {
  nextSlots,
  noteIdsInStudy,
  recordEvent,
  requireStudy,
  themeIdsInStudy,
  touchStudy,
  updateNotePlacement,
} from "../server/verbatim/store.js";
import { jsonArray } from "./lib/zod-helpers.js";

const move = z.object({
  noteId: z.string(),
  themeId: z
    .string()
    .nullable()
    .optional()
    .describe("Theme to put the note in; null takes it out of every theme (unsorted); omit to keep its theme"),
  x: z.number().optional().describe("Board x; omit to let the board pick a free slot"),
  y: z.number().optional(),
});

export const moveNotesSchema = z.object({
  studyId: z.string(),
  moves: jsonArray(move, { min: 1, max: 200 }),
});

export default defineAction({
  description:
    "Move notes on the board: into a theme, out to unsorted, or to an x/y position. The board's drag-and-drop calls this same action, so a person's moves and yours show up the same way in the activity feed.",
  schema: moveNotesSchema,
  run: async (args, ctx) => {
    await requireStudy(args.studyId, "editor");
    const actor = actorFromCtx(ctx);
    const themeIds = await themeIdsInStudy(args.studyId);
    const unknownThemes = [
      ...new Set(args.moves.map((m) => m.themeId).filter((t): t is string => typeof t === "string" && !themeIds.has(t))),
    ];
    if (unknownThemes.length > 0) {
      fail(`Theme(s) not found in this study: ${unknownThemes.join(", ")}. Nothing was moved.`, {
        errorCode: "theme_not_found",
        statusCode: 404,
        details: { themeIds: unknownThemes },
      });
    }
    const known = await noteIdsInStudy(args.studyId, args.moves.map((m) => m.noteId));
    const missing = args.moves.map((m) => m.noteId).filter((id) => !known.has(id));
    if (missing.length > 0) {
      fail(`Note(s) not found in this study: ${missing.join(", ")}. Nothing was moved.`, {
        errorCode: "note_not_found",
        statusCode: 404,
        details: { noteIds: missing },
      });
    }

    return withAgentOnBoard(args.studyId, actor, actorLabel(actor, ctx), async (point) => {
      const needSlots = new Map<string | null, typeof args.moves>();
      for (const m of args.moves) {
        if (m.x === undefined || m.y === undefined) {
          if (m.themeId === undefined) continue;
          const key = m.themeId ?? null;
          needSlots.set(key, [...(needSlots.get(key) ?? []), m]);
        }
      }
      const slotFor = new Map<string, { x: number; y: number }>();
      for (const [themeId, group] of needSlots) {
        const slots = await nextSlots(args.studyId, themeId, group.length);
        group.forEach((m, i) => {
          const slot = slots[i];
          if (slot) slotFor.set(m.noteId, slot);
        });
      }

      const targetTheme = args.moves.find((m) => typeof m.themeId === "string")?.themeId ?? undefined;
      point({
        noteIds: args.moves.map((m) => m.noteId),
        themeId: targetTheme ?? undefined,
        activity: `Moving ${args.moves.length} note${args.moves.length === 1 ? "" : "s"}`,
      });
      for (const m of args.moves) {
        const pos = m.x !== undefined && m.y !== undefined ? { x: m.x, y: m.y } : slotFor.get(m.noteId);
        await updateNotePlacement(m.noteId, {
          ...(m.themeId !== undefined ? { themeId: m.themeId } : {}),
          ...(pos ?? {}),
        });
      }
      await touchStudy(args.studyId);
      const themed = args.moves.filter((m) => m.themeId !== undefined);
      if (themed.length > 0 || actor !== "user") {
        await recordEvent({
          studyId: args.studyId,
          actor,
          action: "move-notes",
          summary:
            themed.length > 0
              ? `Moved ${themed.length} note${themed.length === 1 ? "" : "s"} between themes`
              : `Repositioned ${args.moves.length} note${args.moves.length === 1 ? "" : "s"}`,
          payload: { moves: args.moves.map((m) => ({ noteId: m.noteId, themeId: m.themeId })) },
        });
      }
      return { moved: args.moves.length };
    });
  },
});
