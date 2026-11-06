/**
 * The naive baseline: paste every transcript into one chat prompt and ask for
 * themes with supporting quotes — what most teams do today.
 *
 *   node --import tsx scripts/eval/baseline.ts [--pids p1,p2,…] [--model claude-sonnet-5-5] [--out results/baseline.json]
 *
 * Uses the same OpenAI-compatible endpoint and key as the app (OPENAI_BASE_URL, OPENAI_API_KEY).
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { parseTranscript } from "../../server/verbatim/parse-source.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
const argv = process.argv.slice(2);
const flag = (n: string) => {
  const i = argv.indexOf(n);
  return i >= 0 ? argv[i + 1] : undefined;
};

function loadEnv() {
  try {
    for (const line of readFileSync(join(root, ".env"), "utf8").split(/\r?\n/)) {
      const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
      if (m && !process.env[m[1]!]) process.env[m[1]!] = m[2]!;
    }
  } catch {
    /* env may come from the shell */
  }
}
loadEnv();

const people = JSON.parse(readFileSync(join(root, "fixtures/eval/participants.json"), "utf8"));
const pids = (flag("--pids") ?? people.participants.map((p: any) => p.pid).join(",")).split(",");
const model = flag("--model") ?? "claude-sonnet-5-5";
const out = flag("--out") ?? join(root, `results/baseline-${pids.length}.json`);

const transcripts = pids.map((pid: string) => {
  const p = people.participants.find((x: any) => x.pid === pid);
  const parsed = parseTranscript(readFileSync(join(root, `fixtures/eval/interviews/${pid}.vtt`), "utf8"), "vtt");
  const body = parsed.segments.map((s) => `${s.speaker ?? "Unknown"}: ${parsed.text.slice(s.start, s.end)}`).join("\n");
  return `### Interview ${pid} — ${p.name}, ${p.role}\n${body}`;
});

const prompt = `You are a senior UX researcher. Below are ${pids.length} customer interview transcripts for Ledgerly, a team expense and receipts app. Research question: "${people.study.researchQuestion}"

Synthesize the findings. Identify every distinct theme (include minority or single-participant findings and any disagreements). For each theme give: a short name, a one-sentence insight, the participants who raised it, and 2–6 supporting verbatim quotes, each with the participant's full name.

Return ONLY JSON: {"themes":[{"name":"...","insight":"...","participants":["Full Name"],"quotes":[{"speaker":"Full Name","text":"exact quote"}]}]}

${transcripts.join("\n\n")}`;

const res = await fetch(`${process.env.OPENAI_BASE_URL}/chat/completions`, {
  method: "POST",
  headers: { "content-type": "application/json", authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
  body: JSON.stringify({ model, messages: [{ role: "user", content: prompt }], max_tokens: 8000 }),
});
if (!res.ok) throw new Error(`baseline call failed ${res.status}: ${(await res.text()).slice(0, 400)}`);
const data: any = await res.json();
const text: string = data.choices?.[0]?.message?.content ?? "";
const json = JSON.parse(text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1));
const prediction = {
  label: `Single prompt (${model})`,
  model,
  usage: data.usage ?? null,
  themes: json.themes.map((t: any) => ({ name: t.name, insight: t.insight, quotes: t.quotes ?? [] })),
};
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, `${JSON.stringify(prediction, null, 2)}\n`);
console.log(`wrote ${out}: ${prediction.themes.length} themes, ${prediction.themes.reduce((n: number, t: any) => n + t.quotes.length, 0)} quotes`);
