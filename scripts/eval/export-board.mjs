// Exports a study board as an eval prediction (themes → verbatim notes with participant).
//   node scripts/eval/export-board.mjs <studyId> <out.json>   (BASE=http://localhost:8790)
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
const BASE = process.env.BASE ?? "http://localhost:8790";
const [studyId, out] = process.argv.slice(2);
const people = JSON.parse(readFileSync(join(root, "fixtures/eval/participants.json"), "utf8"));
const pidByName = new Map(people.participants.map((p) => [p.name, p.pid]));

const url = new URL("/_agent-native/actions/get-board", BASE);
url.searchParams.set("studyId", studyId);
const res = await fetch(url);
if (!res.ok) throw new Error(`get-board ${res.status}: ${(await res.text()).slice(0, 300)}`);
const board = await res.json();
const labelByParticipant = new Map(board.participants.map((p) => [p.id, p.label]));

const prediction = {
  label: "Verbatim agent",
  studyId,
  stats: {
    sources: board.sources.length,
    notes: board.notes.length,
    themes: board.themes.length,
    insights: board.insights.length,
    health: board.health.score,
    unsorted: board.health.unsorted,
  },
  themes: board.themes.map((t) => ({
    name: t.name,
    insight: board.insights.find((i) => i.themeId === t.id)?.claim ?? null,
    quotes: board.notes
      .filter((n) => n.themeId === t.id)
      .map((n) => ({ pid: pidByName.get(labelByParticipant.get(n.participantId)) ?? undefined, speaker: n.speaker, text: n.text })),
  })),
};
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, `${JSON.stringify(prediction, null, 2)}\n`);
console.log(`wrote ${out}: ${prediction.themes.length} themes, ${board.notes.length} notes`);
