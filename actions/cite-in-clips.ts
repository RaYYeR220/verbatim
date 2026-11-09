import { defineAction, fail } from "@agent-native/core/action";
import { getAppProductionUrl } from "@agent-native/core/server";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { getDb, schema } from "../server/db/index.js";
import { callClips, tryClips } from "../server/verbatim/clips.js";
import { getSource, recordEvent, requireStudy } from "../server/verbatim/store.js";
import { actorFromCtx } from "../server/verbatim/actor.js";

export default defineAction({
  description:
    "Leave a comment on the Clips recording at the exact moment a quote was said, saying which theme and insight it backs, with a link back to the board. Use it when a finding should be visible to whoever watches the call.",
  schema: z.object({ noteId: z.string() }),
  run: async ({ noteId }, ctx) => {
    const [note] = await getDb().select().from(schema.notes).where(eq(schema.notes.id, noteId)).limit(1);
    if (!note) fail("Note not found.", { errorCode: "note_not_found", statusCode: 404 });
    await requireStudy(note.studyId, "editor");
    const source = await getSource(note.sourceId);
    const ref = source.externalRefJson ? (JSON.parse(source.externalRefJson) as { clipsRecordingId?: string }) : null;
    if (!ref?.clipsRecordingId) fail("This note doesn't come from a Clips recording.", { errorCode: "not_a_clip", statusCode: 400 });
    const [theme] = note.themeId ? await getDb().select().from(schema.themes).where(eq(schema.themes.id, note.themeId)).limit(1) : [];
    const base = (() => {
      try {
        return getAppProductionUrl();
      } catch {
        return "";
      }
    })();
    const content = `Cited in Verbatim${theme ? ` · theme **${theme.name}**` : ""}: “${note.text}” — [open the board](${base}/studies/${note.studyId}?note=${note.id})`;
    const atMs = note.tMs ?? 0;
    let via = "add-comment";
    const direct = await tryClips("add-comment", { recordingId: ref.clipsRecordingId, content, videoTimestampMs: atMs });
    if (!direct.ok) {
      // Clips' compact catalog may not serve add-comment to other apps; its own
      // agent can still leave the comment (app-to-app over ask_app).
      via = "ask_app";
      const mmss = `${Math.floor(atMs / 60000)}:${String(Math.floor(atMs / 1000) % 60).padStart(2, "0")}`;
      await callClips("ask_app", {
        message: `Add a comment to recording ${ref.clipsRecordingId} at ${atMs} ms (${mmss}) with exactly this text, unchanged:

${content}`,
      });
    }
    // Confirm the comment is on the call rather than trusting either path.
    const listed = await tryClips("list-comments", { recordingId: ref.clipsRecordingId });
    const comments: any[] = listed.ok ? (listed.data?.comments ?? listed.data?.items ?? (Array.isArray(listed.data) ? listed.data : [])) : [];
    const verified = comments.some((c) => typeof (c.content ?? c.body ?? c.text) === "string" && (c.content ?? c.body ?? c.text).includes(note.text.slice(0, 60)));
    await recordEvent({
      studyId: note.studyId,
      actor: actorFromCtx(ctx),
      action: "cite-in-clips",
      summary: `Commented on the Clips call at ${Math.floor(atMs / 1000)}s${verified ? "" : " (not yet confirmed in Clips)"}`,
      payload: { noteId, via, verified },
    });
    return { commented: verified, via, recordingId: ref.clipsRecordingId, atMs };
  },
});
