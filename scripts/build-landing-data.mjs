#!/usr/bin/env node
// Builds the landing page's wall from an exported board.
//
//   node scripts/build-landing-data.mjs [fixtures/landing/notion-board.json]
//
// Writes:
//   public/landing/wall.json               the corpus text, every note's span and the five stacks
//   app/components/landing/wall-summary.ts  the few real numbers and strings the page renders before the wall loads

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const input = resolve(root, process.argv[2] ?? "fixtures/landing/notion-board.json");
const wallOut = resolve(root, "public/landing/wall.json");
const summaryOut = resolve(root, "app/components/landing/wall-summary.ts");

/** The five stacks take the five largest themes by voices, in this hue order. */
const STACK_HUES = ["moss", "rust", "steel", "teal", "ochre"];
/** The two refusals the page shows: the model "corrected" a customer's spelling. */
const REFUSALS = [
  { find: "Türkçe desteği", source: "alacaktım", proposed: "alacaktim", language: "Turkish" },
  { find: "Идея не плохая", source: "объеденить", proposed: "объединить", language: "Russian" },
];

const fail = (msg) => {
  console.error(`build-landing-data: ${msg}`);
  process.exit(1);
};

const board = JSON.parse(readFileSync(input, "utf8"));
const { sources, notes, themes, insights } = board;
if (!Array.isArray(sources) || !Array.isArray(notes) || !Array.isArray(themes)) fail("not a board export");

/* ---------- sources ---------- */
const TITLE = /^(.*) · (\d)★ · (\d{4}-\d{2}-\d{2})$/;
const srcIndex = new Map();
const wallSources = sources.map((s, i) => {
  const m = TITLE.exec(s.title);
  if (!m) fail(`unexpected source title: ${s.title}`);
  srcIndex.set(s.id, i);
  return [s.text, m[1], Number(m[2]), m[3]];
});

/* ---------- themes: the five largest by voices become the stacks ---------- */
const voices = new Map();
const noteCounts = new Map();
for (const n of notes) {
  if (!voices.has(n.themeId)) voices.set(n.themeId, new Set());
  voices.get(n.themeId).add(n.sourceId);
  noteCounts.set(n.themeId, (noteCounts.get(n.themeId) ?? 0) + 1);
}
const ranked = themes
  .map((t) => ({
    id: t.id,
    name: t.name,
    notes: noteCounts.get(t.id) ?? 0,
    voices: voices.get(t.id)?.size ?? 0,
    exported: { notes: t.noteCount, voices: t.voiceCount },
  }))
  .sort((a, b) => b.voices - a.voices || b.notes - a.notes || a.name.localeCompare(b.name));
for (const t of ranked) {
  if (t.notes !== t.exported.notes || t.voices !== t.exported.voices) {
    fail(`theme "${t.name}" counts drift: notes ${t.notes}/${t.exported.notes}, voices ${t.voices}/${t.exported.voices}`);
  }
}
const themeIndex = new Map(ranked.map((t, i) => [t.id, i]));

/* ---------- notes: every span is checked against its source ---------- */
const wallNotes = notes
  .map((n) => {
    const si = srcIndex.get(n.sourceId);
    if (si === undefined) fail(`note ${n.id} has no source`);
    const text = sources[si].text;
    if (text.slice(n.charStart, n.charEnd) !== n.text) fail(`note ${n.id} is not an exact span of its source`);
    const ti = themeIndex.get(n.themeId);
    return [si, n.charStart, n.charEnd, ti ?? -1];
  })
  .sort((a, b) => a[0] - b[0] || a[1] - b[1]);
for (let i = 1; i < wallNotes.length; i++) {
  const [ps, , pe] = wallNotes[i - 1];
  const [s, st] = wallNotes[i];
  if (s === ps && st < pe) fail(`overlapping notes in source ${s}`);
}

const wall = {
  v: 1,
  study: board.study?.title ?? "",
  stacks: STACK_HUES.length,
  themes: ranked.map((t) => ({ name: t.name, notes: t.notes, voices: t.voices })),
  sources: wallSources,
  notes: wallNotes,
};
mkdirSync(dirname(wallOut), { recursive: true });
writeFileSync(wallOut, JSON.stringify(wall));

/* ---------- summary for the static page ---------- */
const parseTitle = (title) => {
  const m = TITLE.exec(title);
  return { author: m[1], stars: Number(m[2]), date: m[3] };
};
const stacks = ranked.slice(0, STACK_HUES.length).map((t, i) => ({
  name: t.name,
  hue: STACK_HUES[i],
  notes: t.notes,
  voices: t.voices,
}));

const insightTheme = ranked.find((t) => t.name === "Buggy, freezes and crashes") ?? ranked[1];
const insight = insights.find((x) => x.themeId === insightTheme.id && x.status === "verified");
if (!insight) fail("no verified insight for the example theme");
const cited = insight.noteIds.map((id) => notes.find((n) => n.id === id)).filter(Boolean);
const example = cited.find((n) => n.text.includes("force-close")) ?? cited[0];
if (!example) fail("the example insight cites no notes");

const refusals = REFUSALS.map((r) => {
  const src = sources.find((s) => s.text.includes(r.find));
  if (!src) fail(`no source contains "${r.find}"`);
  if (!src.text.includes(r.source)) fail(`source does not contain "${r.source}"`);
  const note = notes.find((n) => n.sourceId === src.id && n.text.includes(r.source));
  if (!note) fail(`no exact note holds "${r.source}"`);
  if (r.source.length !== r.proposed.length) fail("a fix must keep the word length");
  return {
    language: r.language,
    ...parseTitle(src.title),
    quote: { text: note.text, start: note.charStart, end: note.charEnd },
    word: { source: r.source, proposed: r.proposed, at: note.text.indexOf(r.source) },
  };
});

const summary = {
  study: wall.study,
  sources: sources.length,
  notes: notes.length,
  themes: themes.length,
  stacks,
  insight: {
    theme: insightTheme.name,
    claim: insight.claim,
    cites: insight.noteIds.length,
    notes: insightTheme.notes,
    voices: insightTheme.voices,
    example: {
      text: example.text,
      ...parseTitle(sources[srcIndex.get(example.sourceId)].title),
    },
  },
  refusals,
};
mkdirSync(dirname(summaryOut), { recursive: true });
writeFileSync(
  summaryOut,
  `// Generated by scripts/build-landing-data.mjs from ${input.slice(root.length + 1).replaceAll("\\", "/")}. Do not edit.\n\n` +
    `export const WALL_SUMMARY = ${JSON.stringify(summary, null, 2)} as const;\n\n` +
    `export type StackHue = (typeof WALL_SUMMARY)["stacks"][number]["hue"];\n`,
);

const kb = (Buffer.byteLength(JSON.stringify(wall)) / 1024).toFixed(0);
console.log(
  `wall.json: ${wallSources.length} sources, ${wallNotes.length} notes, ${ranked.length} themes, ${kb} KB\n` +
    stacks.map((s) => `  ${s.hue.padEnd(5)} ${s.name} · ${s.notes} quotes · ${s.voices} voices`).join("\n"),
);
