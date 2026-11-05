import { createGetDb } from "@agent-native/core/db";
import { registerShareableResource } from "@agent-native/core/sharing";
import { eq } from "drizzle-orm";

import * as schema from "./schema.js";

export const getDb = createGetDb(schema);
export { schema };

registerShareableResource({
  type: "study",
  agentRead: { actions: ["get-board"] },
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
