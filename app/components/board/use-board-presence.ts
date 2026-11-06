import { useCollaborativeDoc, usePresence, type CollabUser } from "@agent-native/core/client/collab";
import { useMemo } from "react";

import { TAB_ID } from "@/lib/tab-id";

export interface AgentPointer {
  noteIds?: string[];
  themeId?: string;
  sourceId?: string;
  activity?: string;
}

export interface AgentOnBoard {
  name: string;
  actor: string;
  pointer: AgentPointer | null;
  at: number;
}

/**
 * Who is on this board right now, and where the agent is working. The agent's
 * position comes from the actions it runs (`withAgentOnBoard` on the server),
 * so its cursor always sits on a card it is actually changing.
 */
export function useBoardPresence(studyId: string, user?: CollabUser) {
  const { awareness, ydoc, activeUsers, agentPresent, agentActive } = useCollaborativeDoc({
    docId: `board:${studyId}`,
    requestSource: TAB_ID,
    pollInterval: 1500,
    activityResource: { resourceType: "study", resourceId: studyId },
    ...(user ? { user } : {}),
  });
  const { others, setPresence } = usePresence(awareness, ydoc?.clientID ?? null);

  const agents = useMemo<AgentOnBoard[]>(
    () =>
      others
        .filter((o) => o.isAgent)
        .map((o) => {
          const p = o.presence as Record<string, unknown>;
          return {
            name: typeof p.name === "string" ? p.name : o.user.name || "Agent",
            actor: typeof p.actor === "string" ? p.actor : "agent",
            pointer: (p.selection as AgentPointer | undefined) ?? null,
            at: typeof p.at === "number" ? p.at : Date.now(),
          };
        }),
    [others],
  );

  const people = useMemo(() => others.filter((o) => !o.isAgent), [others]);

  return { agents, people, activeUsers, agentPresent, agentActive, setPresence };
}
