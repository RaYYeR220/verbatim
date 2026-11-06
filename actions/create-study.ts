import { defineAction } from "@agent-native/core/action";
import { buildDeepLink } from "@agent-native/core/server";
import { z } from "zod";

import { actorFromCtx } from "../server/verbatim/actor.js";
import { createStudy, recordEvent } from "../server/verbatim/store.js";

export default defineAction({
  description:
    "Create a research study: a board where customer evidence (interviews, reviews, tickets) is broken into verbatim quote notes and sorted into themes.",
  mcpTool: true,
  schema: z.object({
    title: z.string().min(1).max(120).describe("Study name, e.g. 'Q4 onboarding interviews'"),
    question: z.string().max(400).optional().describe("The research question the study answers"),
  }),
  run: async (args, ctx) => {
    const study = await createStudy(args);
    await recordEvent({
      studyId: study.id,
      actor: actorFromCtx(ctx),
      action: "create-study",
      summary: `Created study "${args.title}"`,
    });
    return study;
  },
  link: ({ result }) => {
    const r = result as { id?: string; title?: string } | undefined;
    if (!r?.id) return null;
    return { url: buildDeepLink({ view: "board", params: { studyId: r.id } }), label: r.title ?? "Open study" };
  },
});
