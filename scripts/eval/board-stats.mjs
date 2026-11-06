// Board statistics for a study, including every quote the server refused.
//   node scripts/eval/board-stats.mjs <studyId> <out.json>   (BASE=http://localhost:8790)
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

const BASE = process.env.BASE ?? "http://localhost:8790";
const [studyId, out] = process.argv.slice(2);
const get = async (name, params) => {
  const url = new URL(`/_agent-native/actions/${name}`, BASE);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v));
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${name} ${res.status}`);
  return res.json();
};
const board = await get("get-board", { studyId });
const { events } = await get("list-activity", { studyId, limit: 200 });
const refused = events.filter((e) => e.action === "add-notes").flatMap((e) => e.payload.rejected ?? []);
const voices = new Set(board.notes.map((n) => n.participantId ?? n.sourceId));
const stats = {
  label: "Verbatim agent",
  study: board.study.title,
  sources: board.sources.length,
  sourcesOnBoard: board.sources.filter((s) => s.noteCount > 0).length,
  voicesOnBoard: voices.size,
  notes: board.notes.length,
  notesMatchingSource: board.notes.filter((n) => n.matchesSource).length,
  themes: board.themes.length,
  themesWithOpenableCounts: board.themes.filter((t) => t.noteCount > 0).length,
  insights: board.insights.length,
  verifiedInsights: board.insights.filter((i) => i.status === "verified").length,
  anecdotes: board.insights.filter((i) => i.status === "anecdote").length,
  health: board.health.score,
  refused: refused.length,
  refusedByReason: refused.reduce((m, r) => ((m[r.reason] = (m[r.reason] ?? 0) + 1), m), {}),
  refusedQuotes: refused,
  agentActions: events.filter((e) => e.actor === "agent").length,
};
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, `${JSON.stringify(stats, null, 2)}\n`);
const { refusedQuotes, ...head } = stats;
console.log(JSON.stringify(head, null, 2));
