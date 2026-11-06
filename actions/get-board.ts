import { defineAction } from "@agent-native/core/action";
import { buildDeepLink } from "@agent-native/core/server";
import { z } from "zod";

import { getBoard } from "../server/verbatim/store.js";

export default defineAction({
  description:
    "Read a study's whole board: participants, sources (without full text), every verbatim note with its theme and position, themes with note and voice counts, insights with their evidence check, open comments, and board health.",
  schema: z.object({ studyId: z.string().describe("Study id (stu_…)") }),
  http: { method: "GET" },
  readOnly: true,
  run: async ({ studyId }) => getBoard(studyId),
  link: ({ args }) => ({
    url: buildDeepLink({ view: "board", params: { studyId: args.studyId } }),
    label: "Open board",
  }),
});
