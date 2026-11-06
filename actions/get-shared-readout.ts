import { defineAction } from "@agent-native/core";
import { z } from "zod";

import { readoutFrom, type Readout } from "../server/verbatim/readout.js";
import { getSharedBoard } from "../server/verbatim/store.js";

export default defineAction({
  description:
    "Read a study's readout for its shared /r/:studyId link: every theme's insight with the voices and exact quotes behind it. A study whose visibility is public is readable by anyone with the link; any other study needs access, else the result is restricted.",
  schema: z.object({
    studyId: z.string().min(1),
  }),
  http: { method: "GET" },
  readOnly: true,
  requiresAuth: false,
  agentTool: false,
  run: async ({ studyId }): Promise<{ status: "ok"; readout: Readout } | { status: "restricted" }> => {
    const board = await getSharedBoard(studyId);
    if (!board) return { status: "restricted" };
    return { status: "ok", readout: readoutFrom(board) };
  },
});
