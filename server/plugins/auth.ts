import { createToolkitAuthPlugin } from "@agent-native/toolkit/app/auth/server";

import { clearGuestCookie, guestSession } from "../verbatim/guest.js";

export default createToolkitAuthPlugin({
  workspaceAppPublicPaths: ["/"],
  // "/" is the public landing page, not a sign-in screen.
  rootAuth: false,
  marketing: false,
  publicPaths: [
    "/",
    "/api/guest",
    // Shared readouts: the page and its agent-readable JSON. Both still return
    // a study only when it is public or the caller has access to it.
    "/r",
    "/api/readout-context.json",
    "/__manifest",
  ],
  // One-click guest workspaces sit beside normal accounts; sign-in is unchanged.
  getAdditionalSession: guestSession,
  getAdditionalBrowserSession: guestSession,
  clearAdditionalSession: clearGuestCookie,
});
