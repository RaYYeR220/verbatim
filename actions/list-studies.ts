import { defineAction } from "@agent-native/core/action";
import { z } from "zod";

import { listStudies } from "../server/verbatim/store.js";

export default defineAction({
  description: "List the research studies you can open, with note, theme and source counts.",
  mcpTool: true,
  schema: z.object({}),
  http: { method: "GET" },
  readOnly: true,
  run: async () => ({ studies: await listStudies() }),
});
