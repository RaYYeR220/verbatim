import { defineAppConfig } from "@agent-native/core/server";

export default defineAppConfig({
  app: {
    // This name appears in transactional emails. Change it to your product name.
    name: "Verbatim",
    // Shown on the A2A agent card and wherever other agents discover this app.
    description:
      "Research board where every note is a customer's exact words: turns interviews, calls and reviews into themes and evidence-backed insights, and answers with verbatim quotes, speakers and counts you can open.",
    // The source template keeps a renamed app from inheriting first-party email branding.
    sourceTemplate: "chat",
    // Keep the template's authenticated entry explicit after renaming the app.
    homePath: "/studies",
    // Optional: use your own absolute HTTPS logo URL in transactional emails.
    // logoUrl: "https://example.com/logo.png",
  },
});
