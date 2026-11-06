import { defineAction } from "@agent-native/core/action";
import { z } from "zod";

import { actorFromCtx } from "../server/verbatim/actor.js";
import { clipsRecordingUrl, readClipsTranscript } from "../server/verbatim/clips.js";
import { emitBoardEvent } from "../server/verbatim/events.js";
import { insertSource, recordEvent, requireStudy, touchStudy, upsertParticipant } from "../server/verbatim/store.js";

export default defineAction({
  description:
    "Bring a Clips recording into a study as a source. The transcript is copied exactly as Clips stores it, with speakers and timestamps, so every quote taken from it links back to that moment in the recording.",
  schema: z.object({
    studyId: z.string(),
    recordingId: z.string().describe("Clips recording id"),
    participant: z.string().max(120).optional().describe("Who the customer on the call is; defaults to the first speaker who isn't you"),
  }),
  run: async (args, ctx) => {
    const study = await requireStudy(args.studyId, "editor");
    const t = await readClipsTranscript(args.recordingId);
    if (!t.text.trim()) throw new Error("That recording's transcript is empty.");
    const label = args.participant ?? t.speakers.find((s) => !/^(me|you|interviewer|host)$/i.test(s)) ?? t.title;
    const participantId = await upsertParticipant(args.studyId, { label, attrs: { clipsRecordingId: t.recordingId } });
    const sourceId = await insertSource({
      studyId: args.studyId,
      participantId,
      kind: "clip",
      title: t.title,
      text: t.text,
      segments: t.segments,
      mediaUrl: clipsRecordingUrl(t.recordingId),
      externalRef: { clipsRecordingId: t.recordingId, durationMs: t.durationMs },
    });
    await touchStudy(args.studyId);
    await recordEvent({
      studyId: args.studyId,
      actor: actorFromCtx(ctx),
      action: "import-clips-call",
      summary: `Imported the Clips call "${t.title}" (${t.segments.length} transcript lines)`,
      payload: { sourceId, recordingId: t.recordingId },
    });
    emitBoardEvent("sourceAdded", { studyId: args.studyId, studyTitle: study.title, sourceId, title: t.title, kind: "clip", chars: t.text.length });
    return { sourceId, participantId, title: t.title, lines: t.segments.length, speakers: t.speakers, recording: clipsRecordingUrl(t.recordingId) };
  },
});
