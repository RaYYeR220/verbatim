import { defineEventHandler, readBody } from "h3";

import { newGuestEmail, readGuestEmail, setGuestCookie } from "../../verbatim/guest.js";
import { cloneStudyForOwner, studiesOwnedBy } from "../../verbatim/store.js";

/**
 * Starts (or resumes) a guest workspace: a throwaway identity with its own
 * copy of the demo studies, so anyone can try the board and the agent without
 * signing up.
 */
export default defineEventHandler(async (event) => {
  const body = ((await readBody(event).catch(() => null)) ?? {}) as { next?: string };
  let email = await readGuestEmail(event);
  if (!email) {
    email = newGuestEmail();
    await setGuestCookie(event, email);
  }
  let owned = await studiesOwnedBy(email);
  if (owned.length === 0) {
    const templates = (process.env.DEMO_STUDY_IDS ?? "").split(",").map((s) => s.trim()).filter(Boolean);
    for (const id of templates) await cloneStudyForOwner(id, email);
    owned = await studiesOwnedBy(email);
  }
  const first = owned[0]?.id;
  const next = typeof body.next === "string" && body.next.startsWith("/") ? body.next : first ? `/studies/${first}` : "/studies";
  return { email, redirect: next };
});
