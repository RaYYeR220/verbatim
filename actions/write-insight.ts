import { defineAction, fail } from "@agent-native/core/action";
import { EXPECTED_REVISION_DESCRIPTION } from "@agent-native/core/save-conflict/server";
import { z } from "zod";

import { actorFromCtx, actorLabel } from "../server/verbatim/actor.js";
import { withAgentOnBoard } from "../server/verbatim/presence.js";
import { evaluateInsight } from "../server/verbatim/rules.js";
import {
  getTheme,
  liteNotesForStudy,
  recordEvent,
  requireStudy,
  saveInsight,
  touchStudy,
} from "../server/verbatim/store.js";
import { jsonArray } from "./lib/zod-helpers.js";

export const writeInsightSchema = z.object({
  studyId: z.string(),
  insightId: z.string().optional().describe("Omit to create a new insight"),
  themeId: z.string().nullable().optional(),
  claim: z
    .string()
    .min(8)
    .max(600)
    .describe("One sentence a product team can act on, e.g. '5 of 8 teams lose receipts when capture fails offline.'"),
  noteIds: jsonArray(z.string(), { min: 1, max: 40 }).describe("The verbatim notes that prove the claim"),
  expectedRev: z.string().optional().describe(EXPECTED_REVISION_DESCRIPTION),
});

export default defineAction({
  description:
    "Write or update an insight: a claim backed by cited verbatim notes. The server checks the evidence: two or more voices make it a verified insight, one voice makes it an anecdote, and a missing or altered note refuses the write.",
  schema: writeInsightSchema,
  run: async (args, ctx) => {
    await requireStudy(args.studyId, "editor");
    const actor = actorFromCtx(ctx);
    if (args.themeId) {
      const theme = await getTheme(args.themeId);
      if (theme.studyId !== args.studyId) fail("That theme is not in this study.", { errorCode: "theme_not_found", statusCode: 404 });
    }
    const { lites } = await liteNotesForStudy(args.studyId);
    const check = evaluateInsight(args.noteIds, new Map(lites.map((l) => [l.id, l])));
    if (check.status === "invalid") {
      fail(`Insight refused: ${check.reasons.join(" ")}`, {
        errorCode: "invalid_citation",
        statusCode: 422,
        details: { missing: check.missing, reasons: check.reasons },
      });
    }
    return withAgentOnBoard(args.studyId, actor, actorLabel(actor, ctx), async (point) => {
      point({ noteIds: args.noteIds, themeId: args.themeId ?? undefined, activity: "Writing an insight" });
      const saved = await saveInsight({
        studyId: args.studyId,
        insightId: args.insightId,
        expectedRev: args.expectedRev,
        themeId: args.themeId ?? null,
        claim: args.claim,
        noteIds: args.noteIds,
        status: check.status === "verified" ? "verified" : "anecdote",
        check,
        createdBy: actor,
      });
      await touchStudy(args.studyId);
      await recordEvent({
        studyId: args.studyId,
        actor,
        action: args.insightId ? "update-insight" : "write-insight",
        summary: `${args.insightId ? "Updated" : "Wrote"} ${check.status === "verified" ? "an insight" : "an anecdote"} citing ${args.noteIds.length} notes from ${check.participants} voice${check.participants === 1 ? "" : "s"}`,
        payload: { insightId: saved.id, status: check.status },
      });
      return { ...saved, status: check.status, participants: check.participants, reasons: check.reasons };
    });
  },
});
