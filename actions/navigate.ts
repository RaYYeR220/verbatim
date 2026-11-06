import { defineAction } from "@agent-native/core/action";
import { writeAppStateForCurrentTab } from "@agent-native/core/application-state";
import { z } from "zod";

const VIEW_PATHS: Record<string, (a: { studyId?: string | undefined; sourceId?: string | undefined }) => string | null> = {
  studies: () => "/studies",
  board: (a) => (a.studyId ? `/studies/${a.studyId}` : null),
  source: (a) => (a.studyId && a.sourceId ? `/studies/${a.studyId}/sources/${a.sourceId}` : null),
  insights: (a) => (a.studyId ? `/studies/${a.studyId}/readout` : null),
  readout: (a) => (a.studyId ? `/studies/${a.studyId}/readout` : null),
  chat: () => "/chat",
};

export default defineAction({
  description:
    "Move the person's screen: to the study list, a study's board, a source transcript (scrolled to a note), or its insights. Use it to show the person the thing you just changed.",
  schema: z.object({
    view: z.enum(["studies", "board", "source", "insights", "readout", "chat"]).optional(),
    studyId: z.string().optional(),
    sourceId: z.string().optional(),
    noteId: z.string().optional().describe("Highlight and scroll to this note"),
    themeId: z.string().optional().describe("Focus this theme on the board"),
    path: z.string().optional().describe("Raw app path, if no view fits"),
    threadId: z.string().optional().describe("Chat thread ID to open"),
  }),
  http: false,
  run: async (args) => {
    const base = args.view ? VIEW_PATHS[args.view]?.(args) : null;
    const path = base ?? args.path;
    if (!path) throw new Error("Pass a view (with the ids it needs) or a path.");
    const query = new URLSearchParams();
    if (args.noteId) query.set("note", args.noteId);
    if (args.themeId) query.set("theme", args.themeId);
    const nav: Record<string, string> = {
      path: query.size > 0 ? `${path}?${query.toString()}` : path,
      _writeId: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    };
    if (args.view) nav.view = args.view;
    if (args.threadId) nav.threadId = args.threadId;
    await writeAppStateForCurrentTab("navigate", nav);
    return `Navigating to ${nav.path}`;
  },
});
