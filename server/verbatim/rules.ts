import { claimCountIssues, type ClaimCountContext } from "./claim-counts.js";

export interface NoteLite {
  id: string;
  sourceId: string;
  participantId: string | null;
  themeId: string | null;
  verified: boolean;
  textMatchesSource: boolean;
}

export interface InsightCheck {
  status: "verified" | "anecdote" | "invalid";
  participants: number;
  missing: string[];
  reasons: string[];
}

/** A voice is a participant, or the source itself when it has no participant (one review = one voice). */
export const voiceOf = (n: Pick<NoteLite, "participantId" | "sourceId">) => n.participantId ?? `source:${n.sourceId}`;

export function evaluateInsight(noteIds: string[], notes: Map<string, NoteLite>): InsightCheck {
  const missing: string[] = [];
  const reasons: string[] = [];
  const voices = new Set<string>();
  for (const id of new Set(noteIds)) {
    const n = notes.get(id);
    if (!n) {
      missing.push(id);
      continue;
    }
    if (!n.verified) reasons.push(`Note ${id} is not verified against its source.`);
    if (!n.textMatchesSource) reasons.push(`Note ${id} does not match its source text.`);
    voices.add(voiceOf(n));
  }
  if (missing.length > 0) reasons.push(`Cited notes not found: ${missing.join(", ")}.`);
  if (noteIds.length === 0) reasons.push("An insight must cite at least one note.");
  if (missing.length > 0 || reasons.length > 0) {
    return { status: "invalid", participants: voices.size, missing, reasons };
  }
  if (voices.size < 2 || new Set(noteIds).size < 2) {
    return {
      status: "anecdote",
      participants: voices.size,
      missing,
      reasons: ["Backed by a single voice; label it as an anecdote, not a pattern."],
    };
  }
  return { status: "verified", participants: voices.size, missing, reasons };
}

type CountNote = Pick<NoteLite, "id" | "sourceId" | "participantId" | "themeId">;

/** What the board can show for an insight's claim: its cited voices and notes, its theme's, the study's. */
export function claimCountContext(noteIds: string[], themeId: string | null | undefined, notes: CountNote[], sourceCount: number): ClaimCountContext {
  const byId = new Map(notes.map((n) => [n.id, n]));
  const cited = [...new Set(noteIds)].map((id) => byId.get(id)).filter((n): n is CountNote => !!n);
  const inTheme = themeId ? notes.filter((n) => n.themeId === themeId) : null;
  return {
    citedVoices: new Set(cited.map(voiceOf)).size,
    citedNotes: cited.length,
    themeVoices: inTheme ? new Set(inTheme.map(voiceOf)).size : undefined,
    themeNotes: inTheme ? inTheme.length : undefined,
    studyVoices: new Set(notes.map(voiceOf)).size,
    studySources: sourceCount,
  };
}

export interface BoardHealthIssue {
  kind: "unread_source" | "unsorted" | "unverified" | "tampered" | "thin_theme" | "uncited_theme" | "anecdote" | "count_mismatch";
  ids: string[];
  message: string;
}

export interface BoardHealth {
  sources: number;
  /** Sources with no note yet: voices that are not on the board. */
  unreadSources: string[];
  notes: number;
  unsorted: number;
  unverified: number;
  tampered: number;
  themes: number;
  thinThemes: string[];
  insights: number;
  anecdotes: number;
  uncitedThemes: string[];
  /** Insights whose claim states a count the evidence no longer shows. */
  countMismatches: string[];
  score: number;
  issues: BoardHealthIssue[];
}

export function computeBoardHealth(input: {
  notes: NoteLite[];
  themes: { id: string; name: string }[];
  insights: { id: string; themeId: string | null; status: string; noteIds: string[]; claim?: string }[];
  sourceIds?: string[];
}): BoardHealth {
  const noted = new Set(input.notes.map((n) => n.sourceId));
  const unreadSources = (input.sourceIds ?? []).filter((id) => !noted.has(id));
  const unsortedIds = input.notes.filter((n) => !n.themeId).map((n) => n.id);
  const unverifiedIds = input.notes.filter((n) => !n.verified).map((n) => n.id);
  const tamperedIds = input.notes.filter((n) => !n.textMatchesSource).map((n) => n.id);

  const voicesByTheme = new Map<string, Set<string>>();
  for (const n of input.notes) {
    if (!n.themeId) continue;
    const set = voicesByTheme.get(n.themeId) ?? new Set<string>();
    set.add(voiceOf(n));
    voicesByTheme.set(n.themeId, set);
  }
  const thinThemes = input.themes
    .filter((t) => (voicesByTheme.get(t.id)?.size ?? 0) < 2)
    .map((t) => t.id);
  const cited = new Set(input.insights.map((i) => i.themeId).filter(Boolean) as string[]);
  const uncitedThemes = input.themes
    .filter((t) => (voicesByTheme.get(t.id)?.size ?? 0) > 0 && !cited.has(t.id))
    .map((t) => t.id);
  const anecdoteIds = input.insights.filter((i) => i.status === "anecdote").map((i) => i.id);
  const sourceCount = input.sourceIds?.length ?? noted.size;
  const countMismatches = input.insights
    .filter((i) => i.claim && claimCountIssues(i.claim, claimCountContext(i.noteIds, i.themeId, input.notes, sourceCount)).length > 0)
    .map((i) => i.id);

  const issues: BoardHealthIssue[] = [];
  const push = (kind: BoardHealthIssue["kind"], ids: string[], message: string) => {
    if (ids.length > 0) issues.push({ kind, ids, message });
  };
  push("unread_source", unreadSources, `${unreadSources.length} source(s) have no notes yet.`);
  push("tampered", tamperedIds, `${tamperedIds.length} note(s) no longer match their source text.`);
  push("unverified", unverifiedIds, `${unverifiedIds.length} note(s) are not verified.`);
  push("unsorted", unsortedIds, `${unsortedIds.length} note(s) are not in a theme yet.`);
  push("thin_theme", thinThemes, `${thinThemes.length} theme(s) rest on fewer than two voices.`);
  push("uncited_theme", uncitedThemes, `${uncitedThemes.length} theme(s) have no insight yet.`);
  push("anecdote", anecdoteIds, `${anecdoteIds.length} insight(s) are single-voice anecdotes.`);
  push("count_mismatch", countMismatches, `${countMismatches.length} insight(s) state a count the evidence doesn't show.`);

  const penalty =
    Math.min(unsortedIds.length, 30) +
    Math.min(unreadSources.length, 30) +
    tamperedIds.length * 25 +
    unverifiedIds.length * 5 +
    thinThemes.length * 5 +
    uncitedThemes.length * 5 +
    countMismatches.length * 5;

  return {
    sources: input.sourceIds?.length ?? noted.size,
    unreadSources,
    notes: input.notes.length,
    unsorted: unsortedIds.length,
    unverified: unverifiedIds.length,
    tampered: tamperedIds.length,
    themes: input.themes.length,
    thinThemes,
    insights: input.insights.length,
    anecdotes: anecdoteIds.length,
    uncitedThemes,
    countMismatches,
    score: Math.max(0, 100 - penalty),
    issues,
  };
}
