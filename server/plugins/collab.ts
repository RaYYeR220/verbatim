import { createCollabPlugin } from "@agent-native/core/server";

/**
 * Presence on a study board (`board:<studyId>`): who is looking at it and where
 * the agent is working. Board content itself lives in SQL rows, so nothing is
 * seeded into the document.
 */
export default createCollabPlugin({
  autoSeed: false,
  access: {
    mode: "resource",
    resourceType: "study",
    resolveResourceId: (docId) => resolveStudyIdFromBoardDocId(docId),
  },
});

export function resolveStudyIdFromBoardDocId(docId: string): string | null {
  if (!docId.startsWith("board:")) return null;
  const id = docId.slice("board:".length).trim();
  return id || null;
}
