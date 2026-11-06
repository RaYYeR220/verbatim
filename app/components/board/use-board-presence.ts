import { useCollaborativeDoc, usePresence, type CollabUser } from "@agent-native/core/client/collab";
import { useEffect, useMemo, useRef, useState } from "react";

import { TAB_ID } from "@/lib/tab-id";

import type { BoardAgentTrail } from "../../../server/verbatim/types";

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

/** How long the agent's cursor stays where it last worked once its action ends. */
const LINGER_MS = 15000;

/**
 * Who is on this board right now, and where the agent is working. The agent's
 * position comes from the actions it runs (`withAgentOnBoard` on the server),
 * so its cursor always sits on a card it is actually changing.
 *
 * Each action publishes presence only while it runs, and an agent turn is a
 * chain of short actions. Between them the cursor stays on the last card it
 * touched (while the run is active, and briefly after), so it glides from one
 * change to the next instead of blinking out.
 */
export function useBoardPresence(studyId: string, trail?: BoardAgentTrail | null, user?: CollabUser) {
  const { awareness, ydoc, activeUsers, agentPresent, agentActive } = useCollaborativeDoc({
    docId: `board:${studyId}`,
    requestSource: TAB_ID,
    pollInterval: 1500,
    activityResource: { resourceType: "study", resourceId: studyId },
    ...(user ? { user } : {}),
  });
  const { others, setPresence } = usePresence(awareness, ydoc?.clientID ?? null);

  const live = useMemo<AgentOnBoard[]>(
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

  const last = useRef<{ agent: AgentOnBoard; seenAt: number } | null>(null);
  const [, setTick] = useState(0);
  const withPointer = live.find((a) => a.pointer) ?? live[0];
  if (withPointer) last.current = { agent: withPointer, seenAt: Date.now() };

  // The board's own record of the agent's latest change, for when presence
  // from a short serverless action has already gone.
  const trailKey = trail ? `${trail.actor}:${trail.summary}:${trail.noteIds.join(",")}:${trail.themeId}` : "";
  useEffect(() => {
    if (!trail || withPointer) return;
    last.current = {
      agent: {
        name: trail.actor === "agent" ? "Agent" : trail.actor,
        actor: trail.actor,
        pointer: { noteIds: trail.noteIds, ...(trail.themeId ? { themeId: trail.themeId } : {}), activity: trail.summary },
        at: Date.now() - trail.ageMs,
      },
      seenAt: Date.now() - trail.ageMs,
    };
    setTick((n) => n + 1);
    // keyed on the trail's content
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trailKey]);

  // Re-render once the linger window closes, so the cursor leaves on time.
  useEffect(() => {
    if (live.length > 0 || !last.current || agentActive) return;
    const left = LINGER_MS - (Date.now() - last.current.seenAt);
    if (left <= 0) return;
    const t = window.setTimeout(() => setTick((n) => n + 1), left + 50);
    return () => window.clearTimeout(t);
  }, [live.length, agentActive, trailKey]);

  const lingering = !!last.current && (agentActive || Date.now() - last.current.seenAt < LINGER_MS);
  const agents = live.length > 0 ? live : lingering && last.current ? [last.current.agent] : [];

  const people = useMemo(() => others.filter((o) => !o.isAgent), [others]);

  return { agents, people, activeUsers, agentPresent, agentActive, setPresence };
}
