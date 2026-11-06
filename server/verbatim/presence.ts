import {
  agentEnterDocument,
  agentLeaveDocument,
  agentUpdateSelection,
} from "@agent-native/core/collab";

import { isMachineActor, type Actor } from "./actor.js";

export const boardDocId = (studyId: string) => `board:${studyId}`;

export interface AgentPointer {
  noteIds?: string[] | undefined;
  themeId?: string | undefined;
  sourceId?: string | undefined;
  /** What the agent is doing right now, e.g. "Sorting 6 notes into Setup is painful". */
  activity?: string | undefined;
}

/**
 * Publishes the agent's presence on a board while `fn` runs so every open
 * board shows its cursor moving to the cards it touches. Human calls skip it.
 * Presence is best effort and never fails the action.
 */
export async function withAgentOnBoard<T>(
  studyId: string,
  actor: Actor,
  label: string,
  fn: (point: (p: AgentPointer) => void) => Promise<T>,
): Promise<T> {
  if (!isMachineActor(actor)) return fn(() => {});
  const docId = boardDocId(studyId);
  const safe = (f: () => void) => {
    try {
      f();
    } catch {
      /* presence is decorative */
    }
  };
  safe(() => agentEnterDocument(docId, { name: label, actor }));
  try {
    return await fn((p) => safe(() => agentUpdateSelection(docId, { selection: p, at: Date.now() })));
  } finally {
    safe(() => agentLeaveDocument(docId));
  }
}
