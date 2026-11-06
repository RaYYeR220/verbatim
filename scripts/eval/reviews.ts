/**
 * Real-data check on the public Notion App Store reviews (fixtures/reviews).
 * There is no answer key here, so this measures what can be checked exactly:
 * is each quoted passage really in a review, and is it credited to the person
 * who wrote it?
 *
 *   node --import tsx scripts/eval/reviews.ts baseline [--model claude-sonnet-5-5] [--limit 500]
 *   node --import tsx scripts/eval/reviews.ts score <prediction.json>
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { locateQuote } from "../../server/verbatim/locate.js";
import { parseFeedbackCsv } from "../../server/verbatim/parse-source.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
const argv = process.argv.slice(2);
const flag = (n: string) => {
  const i = argv.indexOf(n);
  return i >= 0 ? argv[i + 1] : undefined;
};
for (const line of readFileSync(join(root, ".env"), "utf8").split(/\r?\n/)) {
  const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
  if (m && !process.env[m[1]!]) process.env[m[1]!] = m[2]!;
}

const limit = Number(flag("--limit") ?? 500);
const reviews = parseFeedbackCsv(readFileSync(join(root, "fixtures/reviews/notion-appstore-reviews.csv"), "utf8")).slice(0, limit);
const texts = reviews.map((r) => ({ author: r.author ?? "", text: r.title ? `${r.title}\n${r.body}` : r.body }));

export function scoreReviews(pred: { label: string; themes: Array<{ name: string; reviewCount?: number; quotes: Array<{ author?: string; text: string }> }> }) {
  let total = 0;
  let verbatim = 0;
  let wrongAuthor = 0;
  const invented: Array<{ theme: string; text: string }> = [];
  for (const t of pred.themes) {
    for (const q of t.quotes) {
      total += 1;
      const claimed = (q.author ?? "").trim().toLowerCase();
      let hit: { author: string } | null = null;
      const order = claimed ? [...texts].sort((a, b) => Number(b.author.toLowerCase() === claimed) - Number(a.author.toLowerCase() === claimed)) : texts;
      for (const r of order) {
        if (locateQuote(r.text, q.text, { minChars: 6, maxChars: 2000 }).ok) {
          hit = r;
          break;
        }
      }
      if (!hit) {
        invented.push({ theme: t.name, text: q.text });
        continue;
      }
      verbatim += 1;
      if (claimed && hit.author.toLowerCase() !== claimed) wrongAuthor += 1;
    }
  }
  return {
    label: pred.label,
    reviews: texts.length,
    themes: pred.themes.length,
    quotes: total,
    quoteFidelity: total ? verbatim / total : null,
    notInAnyReview: invented.length,
    creditedToWrongReviewer: wrongAuthor,
    invented,
  };
}

const mode = argv[0];
if (mode === "baseline") {
  const model = flag("--model") ?? "claude-sonnet-5-5";
  const corpus = texts.map((r, i) => `[${i + 1}] ${r.author}: ${r.text.replace(/\s+/g, " ")}`).join("\n");
  const prompt = `You are a senior UX researcher. Below are ${texts.length} App Store reviews of Notion for iOS, each as "[n] author: review".

Synthesize what gets in the way of people using Notion on iPhone and iPad (and what they love). Identify every distinct theme. For each theme give a short name, a one-sentence insight, how many reviews raise it, and 3–6 supporting verbatim quotes, each with the reviewer's name exactly as written.

Return ONLY JSON: {"themes":[{"name":"...","insight":"...","reviewCount":0,"quotes":[{"author":"...","text":"exact quote"}]}]}

${corpus}`;
  const res = await fetch(`${process.env.OPENAI_BASE_URL}/chat/completions`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
    body: JSON.stringify({ model, messages: [{ role: "user", content: prompt }], max_tokens: 32000, reasoning_effort: "medium" }),
  });
  if (!res.ok) throw new Error(`baseline failed ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const raw = await res.text();
  mkdirSync(join(root, "results"), { recursive: true });
  writeFileSync(join(root, "results/reviews-baseline.raw.txt"), raw);
  const data: any = JSON.parse(raw);
  const text: string = data.choices?.[0]?.message?.content ?? "";
  const json = JSON.parse(text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1));
  const pred = { label: `Single prompt (${model})`, model, usage: data.usage ?? null, themes: json.themes };
  const out = flag("--out") ?? join(root, `results/reviews-baseline-${texts.length}.json`);
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, `${JSON.stringify(pred, null, 2)}\n`);
  const score = scoreReviews(pred);
  writeFileSync(out.replace(/\.json$/, ".score.json"), `${JSON.stringify(score, null, 2)}\n`);
  const { invented, ...head } = score;
  console.log(JSON.stringify(head, null, 2));
  console.log(invented.slice(0, 8));
} else if (mode === "score") {
  const pred = JSON.parse(readFileSync(argv[1]!, "utf8"));
  const result = scoreReviews(pred);
  writeFileSync(argv[1]!.replace(/\.json$/, ".score.json"), `${JSON.stringify(result, null, 2)}
`);
  const { invented, ...head } = result;
  console.log(JSON.stringify(head, null, 2));
  console.log(invented.slice(0, 8));
}
