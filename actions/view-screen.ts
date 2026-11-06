import { defineAction } from "@agent-native/core/action";
import { readAppState } from "@agent-native/core/application-state";
import { z } from "zod";

import { getBoard } from "../server/verbatim/store.js";

interface Navigation {
  view?: string;
  studyId?: string;
  sourceId?: string;
  [key: string]: unknown;
}

interface Selection {
  studyId?: string;
  noteIds?: string[];
  themeId?: string | null;
  insightId?: string | null;
}

export default defineAction({
  description:
    "Read what the person is looking at right now: the current view, the open study, and the notes, theme or insight they have selected on the board (with the selected notes' exact text).",
  schema: z.object({}),
  http: false,
  readOnly: true,
  run: async () => {
    const navigation = (await readAppState("navigation")) as Navigation | null;
    const selection = (await readAppState("selection")) as Selection | null;
    const screen: Record<string, unknown> = {};
    if (navigation) screen.navigation = navigation;

    const studyId = navigation?.studyId ?? selection?.studyId;
    if (studyId && (navigation?.view === "board" || navigation?.view === "source")) {
      try {
        const board = await getBoard(studyId);
        const noteIds = new Set(selection?.studyId === studyId ? (selection.noteIds ?? []) : []);
        screen.study = {
          id: board.study.id,
          title: board.study.title,
          question: board.study.question,
          sources: board.sources.length,
          notes: board.notes.length,
          unsorted: board.health.unsorted,
          healthScore: board.health.score,
          themes: board.themes.map((t) => ({ id: t.id, name: t.name, notes: t.noteCount, voices: t.voiceCount, rev: t.rev })),
          insights: board.insights.length,
          openComments: board.comments.filter((c) => c.status !== "done").length,
        };
        if (selection?.studyId === studyId) {
          screen.selection = {
            notes: board.notes
              .filter((n) => noteIds.has(n.id))
              .map((n) => ({ id: n.id, text: n.text, speaker: n.speaker, themeId: n.themeId })),
            theme: selection.themeId ? (board.themes.find((t) => t.id === selection.themeId) ?? null) : null,
            insight: selection.insightId ? (board.insights.find((i) => i.id === selection.insightId) ?? null) : null,
          };
        }
      } catch {
        screen.study = { id: studyId, error: "Study not readable for this user." };
      }
    }

    if (Object.keys(screen).length === 0) {
      return "No application state found. Is the app running?";
    }
    return screen;
  },
});
