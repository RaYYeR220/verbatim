import { defineAction } from "@agent-native/core/action";
import { z } from "zod";

import { actorFromCtx } from "../server/verbatim/actor.js";
import { emitBoardEvent } from "../server/verbatim/events.js";
import { parseFeedbackCsv } from "../server/verbatim/parse-source.js";
import {
  insertSource,
  recordEvent,
  requireStudy,
  touchStudy,
  upsertParticipant,
} from "../server/verbatim/store.js";

export default defineAction({
  description:
    "Import a CSV of feedback (app reviews, survey answers, tickets). Each row becomes one source from one voice. Recognised columns: id, author/user/name, rating/stars, date, title, body/review/text/comment.",
  mcpTool: true,
  schema: z.object({
    studyId: z.string(),
    csv: z.string().min(1).max(2_000_000),
    kind: z.enum(["review", "ticket", "note"]).default("review"),
    limit: z.coerce.number().int().min(1).max(1000).default(500),
  }),
  run: async (args, ctx) => {
    const study = await requireStudy(args.studyId, "editor");
    const rows = parseFeedbackCsv(args.csv).slice(0, args.limit);
    const sourceIds: string[] = [];
    let anon = 0;
    for (const row of rows) {
      anon += row.author ? 0 : 1;
      const label = row.author ?? `Anonymous #${anon}`;
      const participantId = await upsertParticipant(args.studyId, {
        label,
        attrs: { rating: row.rating, date: row.date },
      });
      const text = row.title ? `${row.title}\n${row.body}` : row.body;
      const stars = row.rating !== null ? ` · ${row.rating}★` : "";
      const sourceId = await insertSource({
          studyId: args.studyId,
          participantId,
          kind: args.kind,
          title: `${label}${stars}${row.date ? ` · ${row.date.slice(0, 10)}` : ""}`,
          text,
          segments: [{ start: 0, end: text.length, speaker: label, tMs: null }],
          externalRef: { externalId: row.externalId, rating: row.rating, date: row.date },
        });
      sourceIds.push(sourceId);
    }
    await touchStudy(args.studyId);
    await recordEvent({
      studyId: args.studyId,
      actor: actorFromCtx(ctx),
      action: "add-feedback-csv",
      summary: `Imported ${sourceIds.length} ${args.kind}s`,
      payload: { count: sourceIds.length },
    });
    if (sourceIds.length > 0) {
      emitBoardEvent("sourceAdded", {
        studyId: args.studyId,
        studyTitle: study.title,
        sourceId: sourceIds[0]!,
        title: `${sourceIds.length} ${args.kind}s imported`,
        kind: args.kind,
        chars: rows.reduce((n, r) => n + r.body.length, 0),
      });
    }
    return { added: sourceIds.length, sourceIds };
  },
});
