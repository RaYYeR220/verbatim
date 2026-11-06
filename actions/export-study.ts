import { defineAction } from "@agent-native/core/action";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { getDb, schema } from "../server/db/index.js";
import { getBoard } from "../server/verbatim/store.js";

export default defineAction({
  description:
    "Export a study as JSON (every source with its full text, every verbatim note with its exact character span, themes and insights) or as a Markdown readout. Use it to take the evidence elsewhere.",
  schema: z.object({
    studyId: z.string(),
    format: z.enum(["json", "markdown", "rows"]).default("json").describe("rows = every stored row, for moving a study to another deployment"),
  }),
  http: { method: "GET" },
  readOnly: true,
  mcpTool: true,
  run: async ({ studyId, format }) => {
    const board = await getBoard(studyId);
    if (format === "rows") {
      const db = getDb();
      const [study] = await db.select().from(schema.studies).where(eq(schema.studies.id, studyId));
      return {
        version: 1,
        study,
        participants: await db.select().from(schema.participants).where(eq(schema.participants.studyId, studyId)),
        sources: await db.select().from(schema.sources).where(eq(schema.sources.studyId, studyId)),
        themes: await db.select().from(schema.themes).where(eq(schema.themes.studyId, studyId)),
        notes: await db.select().from(schema.notes).where(eq(schema.notes.studyId, studyId)),
        insights: await db.select().from(schema.insights).where(eq(schema.insights.studyId, studyId)),
      };
    }
    const sources = await getDb()
      .select({ id: schema.sources.id, title: schema.sources.title, kind: schema.sources.kind, text: schema.sources.text, participantId: schema.sources.participantId })
      .from(schema.sources)
      .where(eq(schema.sources.studyId, studyId));
    const notesFull = await getDb()
      .select({ id: schema.notes.id, sourceId: schema.notes.sourceId, charStart: schema.notes.charStart, charEnd: schema.notes.charEnd })
      .from(schema.notes)
      .where(eq(schema.notes.studyId, studyId));
    const spanById = new Map(notesFull.map((n) => [n.id, n]));
    if (format === "markdown") {
      const lines = [`# ${board.study.title}`, "", board.study.question ? `> ${board.study.question}` : "", ""];
      lines.push(`${board.sources.length} sources · ${board.notes.length} verbatim notes · ${board.themes.length} themes`, "");
      for (const t of [...board.themes].sort((a, b) => b.voiceCount - a.voiceCount)) {
        lines.push(`## ${t.name} — ${t.voiceCount} voices, ${t.noteCount} notes`, "");
        for (const i of board.insights.filter((x) => x.themeId === t.id)) lines.push(`**${i.claim}**${i.status === "anecdote" ? " _(anecdote)_" : ""}`, "");
        for (const n of board.notes.filter((x) => x.themeId === t.id).slice(0, 6)) lines.push(`- “${n.text}” — ${n.speaker ?? "unknown"}`);
        lines.push("");
      }
      return { markdown: lines.join("\n") };
    }
    return {
      study: board.study,
      participants: board.participants,
      sources,
      themes: board.themes,
      insights: board.insights.map((i) => ({ id: i.id, themeId: i.themeId, claim: i.claim, status: i.status, noteIds: i.noteIds })),
      notes: board.notes.map((n) => ({
        id: n.id,
        sourceId: n.sourceId,
        themeId: n.themeId,
        text: n.text,
        speaker: n.speaker,
        tMs: n.tMs,
        charStart: spanById.get(n.id)?.charStart ?? null,
        charEnd: spanById.get(n.id)?.charEnd ?? null,
      })),
      health: board.health,
    };
  },
});
