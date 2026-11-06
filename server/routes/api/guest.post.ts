import { getSession } from "@agent-native/core/server";
import { mutateUserSetting } from "@agent-native/core/settings";
import { defineEventHandler, readBody } from "h3";

import { isGuestEmail, newGuestEmail, readGuestEmail, setGuestCookie } from "../../verbatim/guest.js";
import { cloneStudyForOwner, studiesOwnedBy } from "../../verbatim/store.js";

/**
 * Starts (or resumes) a guest workspace: a throwaway identity with its own
 * copy of the demo studies, so anyone can try the board and the agent without
 * signing up.
 */
export default defineEventHandler(async (event) => {
  const body = ((await readBody(event).catch(() => null)) ?? {}) as { next?: string };
  let email = await readGuestEmail(event);
  // Someone already signed in keeps their own account and studies.
  if (!email) {
    const session = await getSession(event).catch(() => null);
    if (session?.email && !isGuestEmail(session.email) && session.email !== "local@localhost") {
      return { email: session.email, redirect: "/studies" };
    }
  }
  if (!email) {
    email = newGuestEmail();
    await setGuestCookie(event, email);
  }
  const owned = await studiesOwnedBy(email);
  let first = owned[0]?.id;
  if (owned.length === 0) {
    // A guest who connects Claude or ChatGPT should see the theme card inline,
    // so the App cards lab starts on for guests (still theirs to turn off).
    await mutateUserSetting(email, "labs", (current) =>
      typeof current?.["mcp-app-cards"] === "boolean" ? current : { ...(current ?? {}), "mcp-app-cards": true },
    ).catch(() => undefined);
    // Each guest gets their own editable copy of every demo study; the first one opens.
    const templates = (process.env.DEMO_STUDY_IDS ?? "").split(",").map((s) => s.trim()).filter(Boolean);
    for (const [i, id] of templates.entries()) {
      const copy = await cloneStudyForOwner(id, email);
      if (i === 0 && copy) first = copy.id;
    }
  }
  const next = typeof body.next === "string" && body.next.startsWith("/") ? body.next : first ? `/studies/${first}` : "/studies";
  return { email, redirect: next };
});
