/**
 * Imports a study exported with `export-study --format rows` into the database
 * in DATABASE_URL, under a new owner, with fresh ids.
 *
 *   DATABASE_URL=... node --import tsx scripts/import-study.ts <export.json> <owner-email>
 */
import { readFileSync } from "node:fs";

import { closeDbExec } from "@agent-native/core/db";

import { getDb, schema } from "../server/db/index.js";

const [file, owner] = process.argv.slice(2);
if (!file || !owner) {
  console.error("usage: import-study.ts <export.json> <owner-email>");
  process.exit(1);
}
const data = JSON.parse(readFileSync(file, "utf8"));
const db = getDb();
const ids = new Map<string, string>();
const fresh = (prefix: string, old: string | null | undefined) => {
  if (!old) return null;
  if (!ids.has(old)) ids.set(old, `${prefix}_${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`);
  return ids.get(old)!;
};

const studyId = fresh("stu", data.study.id)!;
await db.insert(schema.studies).values({ ...data.study, id: studyId, ownerEmail: owner, orgId: null, visibility: "private" });
const chunk = async <T>(rows: T[], insert: (part: T[]) => Promise<unknown>) => {
  for (let i = 0; i < rows.length; i += 200) await insert(rows.slice(i, i + 200));
};
await chunk(data.participants, (part) =>
  db.insert(schema.participants).values(part.map((p: any) => ({ ...p, id: fresh("par", p.id)!, studyId }))),
);
await chunk(data.sources, (part) =>
  db.insert(schema.sources).values(part.map((s: any) => ({ ...s, id: fresh("src", s.id)!, studyId, participantId: fresh("par", s.participantId) }))),
);
await chunk(data.themes, (part) => db.insert(schema.themes).values(part.map((t: any) => ({ ...t, id: fresh("thm", t.id)!, studyId }))));
await chunk(data.notes, (part) =>
  db.insert(schema.notes).values(
    part.map((n: any) => ({ ...n, id: fresh("not", n.id)!, studyId, sourceId: fresh("src", n.sourceId)!, themeId: fresh("thm", n.themeId) })),
  ),
);
await chunk(data.insights, (part) =>
  db.insert(schema.insights).values(
    part.map((i: any) => ({
      ...i,
      id: fresh("ins", i.id)!,
      studyId,
      themeId: fresh("thm", i.themeId),
      noteIdsJson: JSON.stringify((JSON.parse(i.noteIdsJson) as string[]).map((n) => fresh("not", n))),
    })),
  ),
);
console.log(`STUDY ${studyId} (${data.sources.length} sources, ${data.notes.length} notes, ${data.themes.length} themes) for ${owner}`);
await closeDbExec();
