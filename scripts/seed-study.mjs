// Seeds a study into a running app over the action HTTP API.
//   node scripts/seed-study.mjs eval [p1,p2,…]   → Ledgerly interviews (synthetic, labelled benchmark)
//   node scripts/seed-study.mjs reviews [limit]  → public Notion App Store reviews
// BASE defaults to http://localhost:8790.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const BASE = process.env.BASE ?? "http://localhost:8790";

async function call(name, body) {
  const res = await fetch(new URL(`/_agent-native/actions/${name}`, BASE), {
    method: "POST",
    headers: { "content-type": "application/json", ...(process.env.TOKEN ? { authorization: `Bearer ${process.env.TOKEN}` } : {}) },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${name} ${res.status}: ${text.slice(0, 400)}`);
  return JSON.parse(text);
}

const [kind = "eval", arg] = process.argv.slice(2);

if (kind === "eval") {
  const people = JSON.parse(readFileSync(join(root, "fixtures/eval/participants.json"), "utf8"));
  const only = arg ? new Set(arg.split(",")) : null;
  const study = await call("create-study", {
    title: process.env.TITLE ?? "Ledgerly — first-month interviews (synthetic benchmark)",
    question: people.study.researchQuestion,
  });
  for (const p of people.participants) {
    if (only && !only.has(p.pid)) continue;
    const raw = readFileSync(join(root, `fixtures/eval/interviews/${p.pid}.vtt`), "utf8");
    const src = await call("add-source", {
      studyId: study.id,
      title: `${p.name} — ${p.role}, ${p.companySize}-person ${p.company.split(" (")[0]}`,
      raw,
      format: "vtt",
      kind: "interview",
      participant: { label: p.name, segment: p.segment },
    });
    console.log(`${p.pid} → ${src.sourceId} (${src.segments} cues)`);
  }
  console.log(`STUDY ${study.id}`);
} else if (kind === "reviews") {
  const csv = readFileSync(join(root, "fixtures/reviews/notion-appstore-reviews.csv"), "utf8");
  const study = await call("create-study", {
    title: "Notion iOS — what 500 App Store reviewers say",
    question: "What gets in the way of people using Notion on iPhone and iPad?",
  });
  const r = await call("add-feedback-csv", { studyId: study.id, csv, kind: "review", limit: Number(arg ?? 500) });
  console.log(`imported ${r.added} reviews`);
  console.log(`STUDY ${study.id}`);
} else {
  console.error("usage: seed-study.mjs eval [pids] | reviews [limit]");
  process.exit(1);
}
