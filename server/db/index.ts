import { createGetDb } from "@agent-native/core/db";
import { registerShareableResource } from "@agent-native/core/sharing";
import { eq } from "drizzle-orm";

import * as schema from "./schema.js";

export const getDb = createGetDb(schema);
export { schema };

registerShareableResource({
  type: "study",
  agentRead: { actions: ["get-board"] },
  // Share links hand agents the readout as JSON (see /api/readout-context.json).
  agentReadable: {
    resourceKind: "verbatim:readout",
    getContextPath: () => "/api/readout-context.json",
    getPagePath: (study) => `/r/${study.id}`,
  },
  resourceTable: schema.studies,
  sharesTable: schema.studyShares,
  displayName: "Study",
  titleColumn: "title",
  getResourcePath: (study) => `/studies/${study.id}`,
  getDb,
  persistVisibilityChange: async ({ resourceId, update }) => {
    await getDb()
      .update(schema.studies)
      .set(update)
      .where(eq(schema.studies.id, resourceId));
  },
});
