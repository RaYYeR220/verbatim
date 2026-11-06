import { getOrgContext } from "@agent-native/core/org";
import {
  createAgentChatPlugin,
  loadActionsFromStaticRegistry,
} from "@agent-native/core/server";

import actionsRegistry from "../../.generated/actions-registry.js";

const INITIAL_TOOL_NAMES = [
  "view-screen",
  "navigate",
  "ask-question",
  "list-studies",
  "get-board",
  "check-board",
  "get-source",
  "list-unread-sources",
  "list-notes",
  "add-source",
  "add-feedback-csv",
  "add-notes",
  "move-notes",
  "create-theme",
  "update-theme",
  "merge-themes",
  "layout-board",
  "write-insight",
  "list-activity",
  "resolve-comment",
  "search-quotes",
  "create-study",
  "list-clips-calls",
  "import-clips-call",
  "cite-in-clips",
  "show-theme",
  "export-study",
];

export default createAgentChatPlugin({
  appId: "verbatim",
  actions: loadActionsFromStaticRegistry(actionsRegistry),
  mcp: {
    connectorCatalog: [],
    appApprovalPage: true,
    // In MCP Apps hosts (Claude, ChatGPT) show-theme's result opens the theme
    // card route inline, on a short-lived embed session scoped to that one theme.
    directoryProfile: {
      // No separate app-directory catalog; this profile only scopes the card.
      connectorCatalog: [],
      directoryRoute: false,
      widgetTargets: {
        "show-theme": (_args, result) => {
          const id = (result as { id?: unknown } | null)?.id;
          return typeof id === "string"
            ? { targetPath: `/embed/theme/${encodeURIComponent(id)}`, resourceIds: { themeId: id } }
            : null;
        },
      },
      widgetReadActionArguments: {
        "show-theme": { themeId: "themeId", limit: { type: "integerRange", min: 1, max: 40 } },
      },
    },
  },
  frameworkTools: {
    preset: "minimal",
    database: "read",
    sharing: true,
    automation: true,
    resources: true,
    chat: true,
    history: true,
    audit: true,
  },
  initialToolNames: INITIAL_TOOL_NAMES,
  resolveOrgId: async (event) => (await getOrgContext(event)).orgId,
  systemPrompt: `You are the Verbatim research agent. You work on a shared research board with the person: sources (interviews, calls, reviews, tickets) become verbatim quote notes, notes become themes, themes become insights that cite their notes.

Never put words in a customer's mouth: notes are created only through add-notes, which stores the exact source span and refuses anything else; insights cite note ids and are checked by the server. Read AGENTS.md and the matching skill before multi-step work. Respect what people already did on the board (list-activity), keep going until check-board reports done or say what is left, then navigate the person to what you changed and report counts in one or two lines.`,
});
