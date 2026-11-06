import { AGENT_ACCESS_PARAM, verifyScopedAgentAccessToken } from "@agent-native/core/server";
import { defineEventHandler, getQuery, setResponseHeader, setResponseStatus } from "h3";

import { READOUT_RESOURCE_KIND, readoutFrom } from "../../verbatim/readout.js";
import { getSharedBoard } from "../../verbatim/store.js";

/**
 * Agent-readable JSON behind a shared readout link (/r/:studyId). An agent
 * handed the link finds this URL in the page's discovery script and reads the
 * same report a person sees, with more of the evidence per theme.
 */
export default defineEventHandler(async (event) => {
  setResponseHeader(event, "Cache-Control", "no-store");
  setResponseHeader(event, "Referrer-Policy", "no-referrer");
  setResponseHeader(event, "X-Content-Type-Options", "nosniff");
  const query = getQuery(event);
  const id = String(query.id ?? "");
  const token = String(query[AGENT_ACCESS_PARAM] ?? "");
  if (!id) {
    setResponseStatus(event, 400);
    return { error: "Study id is required" };
  }
  // A study-scoped agent_access token (from the share panel) opens a private
  // study for exactly this id; otherwise the study must be public or readable.
  const tokenOk = token ? verifyScopedAgentAccessToken(token, { resourceKind: READOUT_RESOURCE_KIND, resourceId: id }).ok : false;
  const board = await getSharedBoard(id, { trusted: tokenOk });
  if (!board) {
    setResponseStatus(event, 404);
    return { error: "This readout isn't shared." };
  }
  return {
    ...readoutFrom(board, 12),
    note: "Every quote is an exact span of its source. voices = distinct people; an insight on one voice is an anecdote.",
  };
});
