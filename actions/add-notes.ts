import { defineAction } from "@agent-native/core/action";
import { z } from "zod";

import { actorFromCtx, actorLabel } from "../server/verbatim/actor.js";
import { emitBoardEvent } from "../server/verbatim/events.js";
import { locateQuote } from "../server/verbatim/locate.js";
import { segmentAt } from "../server/verbatim/parse-source.js";
import { withAgentOnBoard } from "../server/verbatim/presence.js";
import {
  getSource,
  insertNotes,
  nextSlots,
  recordEvent,
  requireStudy,
  sourceSpans,
  themeIdsInStudy,
  touchStudy,
} from "../server/verbatim/store.js";
import { jsonArray } from "./lib/zod-helpers.js";

const noteInput = z.object({
  sourceId: z.string(),
  quote: z
    .string()
    .describe(
      "Copy the customer's words EXACTLY as they appear in the source: one contiguous passage, 12–600 characters, no ellipses, no paraphrase, no added words.",
    ),
  themeId: z.string().optional().describe("Put the note straight into this theme"),
  tags: z.array(z.string().max(40)).max(8).optional(),
  sentiment: z.enum(["pos", "neg", "neu", "mixed"]).optional(),
});

export const addNotesSchema = z.object({
  studyId: z.string(),
  notes: jsonArray(noteInput, { min: 1, max: 60 }),
});

export interface RejectedNote {
  sourceId: string;
  quote: string;
  reason: "not_found" | "not_contiguous" | "too_short" | "too_long" | "source_not_in_study" | "theme_not_found";
  nearest?: string | undefined;
}

export default defineAction({
  description:
    "Add verbatim quote notes to a study's board. Each quote is located in its source text and stored as that exact span with its speaker and timestamp. Anything that is not a contiguous passage of the source is rejected (with the nearest real passage when there is one) — retry with the exact words or drop it. Never paraphrase.",
  schema: addNotesSchema,
  run: async (args, ctx) => {
    await requireStudy(args.studyId, "editor");
    const actor = actorFromCtx(ctx);
    const themeIds = await themeIdsInStudy(args.studyId);
    const rejected: RejectedNote[] = [];
    type Pending = Parameters<typeof insertNotes>[0][number];
    const pending: Pending[] = [];

    return withAgentOnBoard(args.studyId, actor, actorLabel(actor, ctx), async (point) => {
      const bySource = new Map<string, typeof args.notes>();
      for (const n of args.notes) bySource.set(n.sourceId, [...(bySource.get(n.sourceId) ?? []), n]);

      for (const [sourceId, items] of bySource) {
        let source: Awaited<ReturnType<typeof getSource>> | null = null;
        try {
          source = await getSource(sourceId);
        } catch {
          source = null;
        }
        if (!source || source.studyId !== args.studyId) {
          for (const n of items) rejected.push({ sourceId, quote: n.quote, reason: "source_not_in_study" });
          continue;
        }
        point({ sourceId, activity: `Reading ${source.title}` });
        const taken: Array<[number, number]> = (await sourceSpans(sourceId)).map((s) => [s.charStart, s.charEnd]);
        for (const n of items) {
          if (n.themeId && !themeIds.has(n.themeId)) {
            rejected.push({ sourceId, quote: n.quote, reason: "theme_not_found" });
            continue;
          }
          const hit = locateQuote(source.text, n.quote, { taken });
          if (!hit.ok) {
            rejected.push({ sourceId, quote: n.quote, reason: hit.reason, nearest: hit.nearest });
            continue;
          }
          taken.push([hit.start, hit.end]);
          const seg = segmentAt(source.segments, hit.start);
          pending.push({
            studyId: args.studyId,
            sourceId,
            charStart: hit.start,
            charEnd: hit.end,
            text: hit.text,
            speaker: seg?.speaker ?? null,
            tMs: seg?.tMs ?? null,
            themeId: n.themeId ?? null,
            x: 0,
            y: 0,
            tags: n.tags ?? [],
            sentiment: n.sentiment ?? null,
            createdBy: actor,
          });
        }
      }

      const byTheme = new Map<string | null, Pending[]>();
      for (const p of pending) byTheme.set(p.themeId, [...(byTheme.get(p.themeId) ?? []), p]);
      for (const [themeId, group] of byTheme) {
        const slots = await nextSlots(args.studyId, themeId, group.length);
        group.forEach((p, i) => Object.assign(p, slots[i] ?? {}));
      }

      const inserted = await insertNotes(pending);
      if (inserted.length > 0) {
        point({ noteIds: inserted.map((n) => n.id), activity: `Added ${inserted.length} verbatim notes` });
        await touchStudy(args.studyId);
      }
      if (inserted.length > 0 || rejected.length > 0) {
        await recordEvent({
          studyId: args.studyId,
          actor,
          action: "add-notes",
          summary: `Added ${inserted.length} verbatim note${inserted.length === 1 ? "" : "s"}${rejected.length ? `, refused ${rejected.length} that were not in the source` : ""}`,
          payload: {
            noteIds: inserted.map((n) => n.id),
            rejected: rejected.map((r) => ({ quote: r.quote.slice(0, 240), reason: r.reason })),
          },
        });
      }
      if (inserted.length > 0 || rejected.length > 0) {
        emitBoardEvent("notesAdded", {
          studyId: args.studyId,
          added: inserted.length,
          refused: rejected.length,
          sourceIds: [...new Set(inserted.map((n) => n.sourceId))],
        });
      }
      return {
        added: inserted.map((n) => ({ id: n.id, sourceId: n.sourceId, text: n.text, speaker: n.speaker, tMs: n.tMs, themeId: n.themeId })),
        rejected,
      };
    });
  },
});
