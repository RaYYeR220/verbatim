/**
 * Scores a synthesis against the Ledgerly answer key (fixtures/eval).
 *
 *   node --import tsx scripts/eval/score.ts <prediction.json> [--pids p1,p2,p7] [--out results/x.json]
 *
 * A prediction is { label, themes: [{ name, quotes: [{ pid?, speaker?, text }] }] }.
 * Quotes are checked against the transcripts with the same locator the app uses.
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { locateQuote } from "../../server/verbatim/locate.js";
import { parseTranscript, segmentAt } from "../../server/verbatim/parse-source.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
const key = JSON.parse(readFileSync(join(root, "fixtures/eval/answer-key.json"), "utf8"));
const people = JSON.parse(readFileSync(join(root, "fixtures/eval/participants.json"), "utf8"));

export interface PredQuote { pid?: string; speaker?: string; text: string }
export interface Prediction { label: string; themes: Array<{ name: string; quotes: PredQuote[] }> }

const argv = process.argv.slice(2);
const predPath = argv[0];
const flag = (n: string) => {
  const i = argv.indexOf(n);
  return i >= 0 ? argv[i + 1] : undefined;
};
const pids: string[] = (flag("--pids") ?? people.participants.map((p: any) => p.pid).join(",")).split(",");
const nameToPid = new Map<string, string>(people.participants.map((p: any) => [p.name.toLowerCase(), p.pid]));

const transcripts = new Map(
  pids.map((pid) => [pid, parseTranscript(readFileSync(join(root, `fixtures/eval/interviews/${pid}.vtt`), "utf8"), "vtt")]),
);

function resolvePid(q: PredQuote): string | null {
  if (q.pid && transcripts.has(q.pid)) return q.pid;
  const s = (q.speaker ?? "").toLowerCase().trim();
  if (!s) return null;
  for (const [name, pid] of nameToPid) if (name === s || name.startsWith(s) || s.startsWith(name.split(" ")[0]!)) return pid;
  return null;
}

type Span = { pid: string; start: number; end: number };
const keySpans = new Map<string, Span[]>();
for (const t of key.themes) {
  const spans: Span[] = [];
  for (const e of [...t.evidence, ...(t.extraEvidence ?? [])]) {
    const tr = transcripts.get(e.pid);
    if (!tr) continue;
    const i = tr.text.indexOf(e.quote);
    if (i >= 0) spans.push({ pid: e.pid, start: i, end: i + e.quote.length });
  }
  keySpans.set(t.id, spans);
}

const overlap = (a: Span, b: Span) => (a.pid === b.pid ? Math.max(0, Math.min(a.end, b.end) - Math.max(a.start, b.start)) : 0);

function locateAnywhere(text: string, preferred: string | null) {
  const order = preferred ? [preferred, ...pids.filter((p) => p !== preferred)] : pids;
  for (const pid of order) {
    const tr = transcripts.get(pid)!;
    const hit = locateQuote(tr.text, text, { minChars: 6, maxChars: 2000 });
    if (hit.ok) return { pid, start: hit.start, end: hit.end, speaker: segmentAt(tr.segments, hit.start)?.speaker ?? null };
  }
  return null;
}

const decoyRes = key.decoys.map((d: any) => ({ id: d.id, re: d.keywords.map((k: string) => new RegExp(k, "i")) }));

export function score(pred: Prediction) {
  let total = 0;
  let verbatim = 0;
  let invented = 0;
  let wrongPid = 0;
  let interviewer = 0;
  const themeMatches: Array<{ name: string; keyTheme: string | null; overlapChars: number; voices: string[] }> = [];
  const decoyHits: Array<{ theme: string; decoy: string }> = [];

  for (const theme of pred.themes) {
    const located: Span[] = [];
    for (const q of theme.quotes) {
      total += 1;
      const claimed = resolvePid(q);
      const hit = locateAnywhere(q.text, claimed);
      if (!hit) {
        invented += 1;
        continue;
      }
      verbatim += 1;
      const participantName = people.participants.find((p: any) => p.pid === hit.pid)?.name;
      if (hit.speaker && participantName && hit.speaker !== participantName) interviewer += 1;
      if (claimed && claimed !== hit.pid) wrongPid += 1;
      located.push({ pid: hit.pid, start: hit.start, end: hit.end });
    }
    let best: string | null = null;
    let bestChars = 0;
    for (const [tid, spans] of keySpans) {
      let chars = 0;
      for (const s of located) for (const k of spans) chars += overlap(s, k);
      if (chars > bestChars) {
        bestChars = chars;
        best = tid;
      }
    }
    themeMatches.push({ name: theme.name, keyTheme: best, overlapChars: bestChars, voices: [...new Set(located.map((s) => s.pid))] });
    const hay = `${theme.name} ${theme.quotes.map((q) => q.text).join(" ")}`;
    for (const d of decoyRes) if (d.re.some((r: RegExp) => r.test(theme.name))) decoyHits.push({ theme: theme.name, decoy: d.id });
    void hay;
  }

  const inScope = key.themes.filter((t: any) => t.participants.some((p: string) => pids.includes(p)));
  const found = new Set(themeMatches.map((m) => m.keyTheme).filter(Boolean) as string[]);
  const perTheme = inScope.map((t: any) => {
    const expected = t.participants.filter((p: string) => pids.includes(p));
    const voices = new Set(themeMatches.filter((m) => m.keyTheme === t.id).flatMap((m) => m.voices));
    const covered = expected.filter((p: string) => voices.has(p));
    return { id: t.id, name: t.name, found: found.has(t.id), voices: `${covered.length}/${expected.length}` };
  });
  const t6 = inScope.find((t: any) => t.id === "T6");
  const t7 = inScope.find((t: any) => t.id === "T7");
  let t7Stances: string | null = null;
  if (t7) {
    const voices = new Set(themeMatches.filter((m) => m.keyTheme === "T7").flatMap((m) => m.voices));
    const st = Object.entries(t7.stances as Record<string, string>).filter(([p]) => pids.includes(p));
    const seen = new Set(st.filter(([p]) => voices.has(p)).map(([, s]) => s));
    t7Stances = `${seen.size}/${new Set(st.map(([, s]) => s)).size} sides`;
  }

  return {
    label: pred.label,
    participants: pids.length,
    quotes: total,
    quoteFidelity: total ? verbatim / total : null,
    inventedQuotes: invented,
    misattributed: wrongPid,
    interviewerQuotedAsCustomer: interviewer,
    themesPredicted: pred.themes.length,
    themeRecall: `${perTheme.filter((t: { found: boolean }) => t.found).length}/${inScope.length}`,
    minorityThemeFound: t6 ? found.has("T6") : "n/a",
    contradictionSides: t7Stances ?? "n/a",
    decoyThemes: decoyHits.length,
    perTheme,
    themeMatches,
  };
}

if (predPath) {
  const pred: Prediction = JSON.parse(readFileSync(predPath, "utf8"));
  const result = score(pred);
  const out = flag("--out");
  if (out) {
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, `${JSON.stringify(result, null, 2)}\n`);
  }
  const { themeMatches, perTheme, ...headline } = result;
  console.log(JSON.stringify(headline, null, 2));
  console.table(perTheme);
}
