import { defineAction, fail } from "@agent-native/core/action";
import { EXPECTED_REVISION_DESCRIPTION } from "@agent-native/core/save-conflict/server";
import { z } from "zod";

import { actorFromCtx, actorLabel } from "../server/verbatim/actor.js";
import { withAgentOnBoard } from "../server/verbatim/presence.js";
import { emitBoardEvent } from "../server/verbatim/events.js";
import { claimCountIssues, describeCountIssues } from "../server/verbatim/claim-counts.js";
import { claimCountContext, evaluateInsight } from "../server/verbatim/rules.js";
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
    "Write or update an insight: a claim backed by cited verbatim notes. The server checks the evidence: two or more voices make it a verified insight, one voice makes it an anecdote, and a missing or altered note refuses the write. Any count in the claim (\"5 of 8 participants\", \"85 reviewers\", \"40 notes\") must equal the cited voices or notes, or the theme's voices or notes; otherwise the write is refused with the numbers to use.",
  schema: writeInsightSchema,
  run: async (args, ctx) => {
    await requireStudy(args.studyId, "editor");
    const actor = actorFromCtx(ctx);
    if (args.themeId) {
      const theme = await getTheme(args.themeId);
      if (theme.studyId !== args.studyId) fail("That theme is not in this study.", { errorCode: "theme_not_found", statusCode: 404 });
    }
    const { lites, rows } = await liteNotesForStudy(args.studyId);
    const check = evaluateInsight(args.noteIds, new Map(lites.map((l) => [l.id, l])));
    if (check.status === "invalid") {
      fail(`Insight refused: ${check.reasons.join(" ")}`, {
        errorCode: "invalid_citation",
        statusCode: 422,
        details: { missing: check.missing, reasons: check.reasons },
      });
    }
    // A number in the claim has to be one the board can show.
    const counts = claimCountContext(args.noteIds, args.themeId, lites, rows.sources.length);
    const countIssues = claimCountIssues(args.claim, counts);
    if (countIssues.length > 0) {
      fail(`Insight refused: ${describeCountIssues(countIssues)} Restate the count from the evidence, or drop the number.`, {
        errorCode: "count_mismatch",
        statusCode: 422,
        details: { issues: countIssues, evidence: counts },
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
      emitBoardEvent("insightWritten", {
        studyId: args.studyId,
        insightId: saved.id,
        claim: args.claim,
        status: check.status,
        voices: check.participants,
      });
      return { ...saved, status: check.status, participants: check.participants, reasons: check.reasons };
    });
  },
});
