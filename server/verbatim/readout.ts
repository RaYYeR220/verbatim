// The readout: every theme's claim with the voices and the exact words behind
// it. Pure, so the board's readout page, the shared /r/ link and the agent
// context endpoint all render the same report from the same board data.
import type { BoardPayload } from "./types.js";

/** The agent-readable resource kind for shared readouts. */
export const READOUT_RESOURCE_KIND = "verbatim:readout";

export interface ReadoutQuote {
  noteId: string;
  text: string;
  speaker: string | null;
  tMs: number | null;
  source: string | null;
}

export interface ReadoutSection {
  themeId: string;
  name: string;
  /** Position on the board, which picks the theme's hue. */
  colorIndex: number;
  voices: number;
  quotes: number;
  insights: Array<{ claim: string; status: "verified" | "anecdote"; cited: number }>;
  evidence: ReadoutQuote[];
}

export interface Readout {
  study: { id: string; title: string; question: string | null; visibility: string };
  sources: number;
  notes: number;
  themes: number;
  sections: ReadoutSection[];
}

/**
 * Themes ordered by how many people raised them. Evidence is the quotes an
 * insight cites (its proof), or the theme's own notes when it has no insight.
 */
export function readoutFrom(board: BoardPayload, evidencePerTheme = 4): Readout {
  const notes = new Map(board.notes.map((n) => [n.id, n]));
  const sources = new Map(board.sources.map((s) => [s.id, s]));
  const sections = board.themes
    .map((t, colorIndex): ReadoutSection => {
      const insights = board.insights.filter((x) => x.themeId === t.id);
      const cited = insights[0]?.noteIds ?? board.notes.filter((n) => n.themeId === t.id).map((n) => n.id);
      return {
        themeId: t.id,
        name: t.name,
        colorIndex,
        voices: t.voiceCount,
        quotes: t.noteCount,
        insights: insights.map((x) => ({ claim: x.claim, status: x.status, cited: x.noteIds.length })),
        evidence: cited
          .map((id) => notes.get(id))
          .filter((n): n is NonNullable<typeof n> => !!n)
          .slice(0, evidencePerTheme)
          .map((n) => ({
            noteId: n.id,
            text: n.text,
            speaker: n.speaker,
            tMs: n.tMs,
            source: sources.get(n.sourceId)?.title ?? null,
          })),
      };
    })
    .sort((a, b) => b.voices - a.voices);
  return {
    study: {
      id: board.study.id,
      title: board.study.title,
      question: board.study.question,
      visibility: board.study.visibility,
    },
    sources: board.sources.length,
    notes: board.notes.length,
    themes: board.themes.length,
    sections,
  };
}
