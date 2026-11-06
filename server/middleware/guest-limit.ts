import { getDbExec } from "@agent-native/core/db";
import { createError, defineEventHandler, getRequestURL } from "h3";

import { readGuestEmail } from "../verbatim/guest.js";

const PER_GUEST_PER_DAY = Number(process.env.GUEST_AGENT_RUNS_PER_DAY ?? 30);
const ALL_GUESTS_PER_DAY = Number(process.env.GUEST_AGENT_RUNS_TOTAL_PER_DAY ?? 600);

/**
 * Guests share the deployment's model key, so their agent runs are capped per
 * guest and across all guests per day. Signed-in users are not affected.
 */
export default defineEventHandler(async (event) => {
  if (event.method !== "POST") return;
  const path = getRequestURL(event).pathname.replace(/\/+$/, "");
  if (path !== "/_agent-native/agent-chat") return;
  const email = await readGuestEmail(event);
  if (!email) return;
  const day = new Date().toISOString().slice(0, 10);
  const db = getDbExec();
  await db.execute({
    sql: `INSERT INTO guest_usage (email, day, runs) VALUES ($1, $2, 1)
          ON CONFLICT (email, day) DO UPDATE SET runs = guest_usage.runs + 1`,
    args: [email, day],
  });
  const mine = await db.execute({ sql: `SELECT runs FROM guest_usage WHERE email = $1 AND day = $2`, args: [email, day] });
  const all = await db.execute({ sql: `SELECT COALESCE(SUM(runs), 0) AS n FROM guest_usage WHERE day = $1`, args: [day] });
  const myRuns = Number((mine.rows?.[0] as { runs?: number } | undefined)?.runs ?? 0);
  const allRuns = Number((all.rows?.[0] as { n?: number } | undefined)?.n ?? 0);
  if (myRuns > PER_GUEST_PER_DAY || allRuns > ALL_GUESTS_PER_DAY) {
    throw createError({
      statusCode: 429,
      statusMessage: "Guest limit reached",
      data: {
        error:
          "This demo workspace has used today's agent runs. Sign in (free) to keep going with your own model key, or come back tomorrow.",
      },
    });
  }
});
