/**
 * Finds a quote inside its source text and returns the exact source span.
 *
 * The stored note text is always `source.slice(start, end)`, never the
 * caller's string, so a note can only ever contain words the source holds.
 */

export type LocateResult =
  | {
      ok: true;
      start: number;
      end: number;
      text: string;
      match: "exact" | "normalized";
    }
  | {
      ok: false;
      reason: "not_found" | "not_contiguous" | "too_short" | "too_long";
      nearest?: string;
    };

export interface LocateOptions {
  /** Spans already used by other notes of this source; matches must not overlap them. */
  taken?: Array<[number, number]>;
  minChars?: number;
  maxChars?: number;
}

const SINGLE_QUOTES = new Set(["‘", "’", "‚", "‛", "′", "`"]);
const DOUBLE_QUOTES = new Set(["“", "”", "„", "‟", "″", "«", "»"]);
const DASHES = new Set(["‐", "‑", "‒", "–", "—", "―", "−"]);
const ZERO_WIDTH = new Set(["​", "‌", "‍", "﻿", "­"]);
const TRIM_CHARS = /^[\s"'‘’“”«»]+|[\s"'‘’“”«»]+$/g;
const ELISION = /…|\.{3,}|\[\s*\.+\s*\]/;

function canonicalChar(ch: string): string {
  if (SINGLE_QUOTES.has(ch)) return "'";
  if (DOUBLE_QUOTES.has(ch)) return '"';
  if (DASHES.has(ch)) return "-";
  return ch.toLowerCase();
}

/**
 * Lowercases, unifies quote marks and dashes, drops zero-width characters and
 * collapses whitespace runs. `map[i]` is the index in `s` where normalised
 * character `i` starts; `ends[i]` is where it ends.
 */
export function normalizeForMatch(s: string): { norm: string; map: number[]; ends: number[] } {
  let norm = "";
  const map: number[] = [];
  const ends: number[] = [];
  let i = 0;
  let lastWasSpace = false;
  for (const ch of s) {
    const start = i;
    i += ch.length;
    if (ZERO_WIDTH.has(ch)) continue;
    if (/\s/.test(ch)) {
      if (lastWasSpace) {
        ends[ends.length - 1] = i;
        continue;
      }
      lastWasSpace = true;
      norm += " ";
      map.push(start);
      ends.push(i);
      continue;
    }
    lastWasSpace = false;
    const canon = canonicalChar(ch);
    for (const out of canon) {
      norm += out;
      map.push(start);
      ends.push(i);
    }
  }
  return { norm, map, ends };
}

function overlapsTaken(start: number, end: number, taken: Array<[number, number]>): boolean {
  return taken.some(([ts, te]) => start < te && ts < end);
}

function tokens(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/[‘’]/g, "'")
    .split(/[^\p{L}\p{N}']+/u)
    .filter((t) => t.length > 0);
}

function nearestPassage(source: string, quote: string): string | undefined {
  const want = new Set(tokens(quote));
  if (want.size === 0) return undefined;
  let best: { score: number; text: string } | undefined;
  const sentenceRe = /[^.!?\n]+[.!?]*/g;
  for (const m of source.matchAll(sentenceRe)) {
    const sentence = m[0].trim();
    if (!sentence) continue;
    const have = new Set(tokens(sentence));
    let hit = 0;
    for (const t of want) if (have.has(t)) hit += 1;
    const score = hit / want.size;
    if (!best || score > best.score) best = { score, text: sentence };
  }
  if (!best || best.score < 0.4) return undefined;
  return best.text.length > 300 ? `${best.text.slice(0, 300)}` : best.text;
}

export function locateQuote(source: string, rawQuote: string, opts: LocateOptions = {}): LocateResult {
  const taken = opts.taken ?? [];
  const minChars = opts.minChars ?? 12;
  const maxChars = opts.maxChars ?? 600;
  const quote = rawQuote.replace(TRIM_CHARS, "");

  if (ELISION.test(quote)) return { ok: false, reason: "not_contiguous" };
  if (quote.length < minChars) return { ok: false, reason: "too_short" };
  if (quote.length > maxChars) return { ok: false, reason: "too_long" };

  for (let from = source.indexOf(quote); from !== -1; from = source.indexOf(quote, from + 1)) {
    const end = from + quote.length;
    if (!overlapsTaken(from, end, taken)) {
      return { ok: true, start: from, end, text: source.slice(from, end), match: "exact" };
    }
  }

  const src = normalizeForMatch(source);
  const q = normalizeForMatch(quote).norm.trim();
  if (q.length > 0) {
    for (let from = src.norm.indexOf(q); from !== -1; from = src.norm.indexOf(q, from + 1)) {
      const start = src.map[from];
      const end = src.ends[from + q.length - 1];
      if (!overlapsTaken(start, end, taken)) {
        return { ok: true, start, end, text: source.slice(start, end), match: "normalized" };
      }
    }
  }

  return { ok: false, reason: "not_found", nearest: nearestPassage(source, quote) };
}
