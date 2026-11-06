import { defineAction } from "@agent-native/core/action";
import { z } from "zod";

import { actorFromCtx } from "../server/verbatim/actor.js";
import { emitBoardEvent } from "../server/verbatim/events.js";
import { parseTranscript } from "../server/verbatim/parse-source.js";
import {
  insertSource,
  recordEvent,
  requireStudy,
  touchStudy,
  upsertParticipant,
} from "../server/verbatim/store.js";
import { jsonObject } from "./lib/zod-helpers.js";

export default defineAction({
  description:
    "Add one source to a study: an interview transcript (WebVTT, SRT, or plain 'Name: text' lines), a support ticket, a review or any text. Speakers and timestamps are parsed so every quote taken from it keeps who said it and when.",
  mcpTool: true,
  schema: z.object({
    studyId: z.string(),
    title: z.string().min(1).max(160).describe("e.g. 'Interview — Dana Okafor (finance lead)'"),
    raw: z.string().min(1).max(400_000).describe("The full transcript or text"),
    format: z.enum(["auto", "vtt", "srt", "plain"]).default("auto"),
    kind: z.enum(["interview", "ticket", "review", "slack", "note"]).default("interview"),
    participant: jsonObject(z.object({ label: z.string().min(1).max(120), segment: z.string().max(80).optional() }))
      .optional()
      .describe("Who this source is from; reused if the label already exists in the study"),
    mediaUrl: z.string().url().optional().describe("Recording URL, used for timestamp links"),
  }),
  run: async (args, ctx) => {
    const study = await requireStudy(args.studyId, "editor");
    const parsed = parseTranscript(args.raw, args.format);
    if (!parsed.text.trim()) throw new Error("The source has no readable text.");
    const participantId = args.participant
      ? await upsertParticipant(args.studyId, args.participant)
      : null;
    const sourceId = await insertSource({
      studyId: args.studyId,
      participantId,
      kind: args.kind,
      title: args.title,
      text: parsed.text,
      segments: parsed.segments,
      mediaUrl: args.mediaUrl ?? null,
    });
    await touchStudy(args.studyId);
    await recordEvent({
      studyId: args.studyId,
      actor: actorFromCtx(ctx),
      action: "add-source",
      summary: `Added source "${args.title}"`,
      payload: { sourceId },
    });
    emitBoardEvent("sourceAdded", {
      studyId: args.studyId,
      studyTitle: study.title,
      sourceId,
      title: args.title,
      kind: args.kind,
      chars: parsed.text.length,
    });
    return {
      sourceId,
      participantId,
      chars: parsed.text.length,
      segments: parsed.segments.length,
      speakers: parsed.speakers,
    };
  },
});
