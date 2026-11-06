export interface Segment {
  start: number;
  end: number;
  speaker: string | null;
  tMs: number | null;
}

export interface ParsedSource {
  text: string;
  segments: Segment[];
  speakers: string[];
}

export type TranscriptFormat = "auto" | "vtt" | "srt" | "plain";

const TIMING = /^\s*((?:\d{1,2}:)?\d{1,2}:\d{2}[.,]\d{1,3})\s*-->\s*((?:\d{1,2}:)?\d{1,2}:\d{2}[.,]\d{1,3})/;
const SPEAKER_PREFIX = /^([\p{Lu}][\p{L}\p{M}'’ .-]{0,38}):\s+(.+)$/u;
const VOICE_TAG = /^<v(?:\.[^\s>]+)?\s+([^>]+)>/;

function toMs(stamp: string): number {
  const parts = stamp.replace(",", ".").split(":");
  const secs = Number(parts.pop() ?? 0);
  const mins = Number(parts.pop() ?? 0);
  const hours = Number(parts.pop() ?? 0);
  return Math.round(((hours * 60 + mins) * 60 + secs) * 1000);
}

function detect(raw: string): Exclude<TranscriptFormat, "auto"> {
  if (/^﻿?WEBVTT/.test(raw.trimStart())) return "vtt";
  if (raw.split(/\r?\n/).some((l) => TIMING.test(l))) return "srt";
  return "plain";
}

interface Piece {
  body: string;
  speaker: string | null;
  tMs: number | null;
}

function assemble(pieces: Piece[]): ParsedSource {
  let text = "";
  const segments: Segment[] = [];
  const speakers: string[] = [];
  for (const piece of pieces) {
    if (!piece.body) continue;
    if (text.length > 0) text += "\n";
    const start = text.length;
    text += piece.body;
    segments.push({ start, end: text.length, speaker: piece.speaker, tMs: piece.tMs });
    if (piece.speaker && !speakers.includes(piece.speaker)) speakers.push(piece.speaker);
  }
  return { text, segments, speakers };
}

function parseCues(raw: string): ParsedSource {
  const blocks = raw.replace(/\r\n?/g, "\n").split(/\n{2,}/);
  const pieces: Piece[] = [];
  let speaker: string | null = null;
  for (const block of blocks) {
    const lines = block.split("\n");
    const timingIndex = lines.findIndex((l) => TIMING.test(l));
    if (timingIndex === -1) continue;
    const stamp = TIMING.exec(lines[timingIndex] ?? "")?.[1];
    const tMs = stamp ? toMs(stamp) : null;
    let body = lines
      .slice(timingIndex + 1)
      .map((l) => l.trim())
      .filter(Boolean)
      .join(" ");
    const voice = VOICE_TAG.exec(body);
    if (voice) {
      speaker = (voice[1] ?? "").trim() || speaker;
      body = body.slice(voice[0].length);
    }
    body = body.replace(/<[^>]+>/g, "").trim();
    const prefixed = !voice ? SPEAKER_PREFIX.exec(body) : null;
    if (prefixed) {
      speaker = (prefixed[1] ?? "").trim() || speaker;
      body = (prefixed[2] ?? "").trim();
    }
    pieces.push({ body, speaker, tMs });
  }
  return assemble(pieces);
}

function parsePlain(raw: string): ParsedSource {
  const text = raw.replace(/\r\n?/g, "\n").trim();
  const lines = text.split("\n");
  if (!lines.some((l) => SPEAKER_PREFIX.test(l.trim()))) {
    return {
      text,
      segments: text ? [{ start: 0, end: text.length, speaker: null, tMs: null }] : [],
      speakers: [],
    };
  }
  const pieces: Piece[] = [];
  let speaker: string | null = null;
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const m = SPEAKER_PREFIX.exec(trimmed);
    if (m) {
      speaker = (m[1] ?? "").trim() || speaker;
      pieces.push({ body: (m[2] ?? "").trim(), speaker, tMs: null });
    } else {
      pieces.push({ body: trimmed, speaker, tMs: null });
    }
  }
  return assemble(pieces);
}

export function parseTranscript(raw: string, format: TranscriptFormat = "auto"): ParsedSource {
  const f = format === "auto" ? detect(raw) : format;
  return f === "plain" ? parsePlain(raw) : parseCues(raw);
}

export function segmentAt(segments: Segment[], offset: number): Segment | null {
  for (const s of segments) {
    if (offset >= s.start && offset < s.end) return s;
  }
  return null;
}

export interface FeedbackRow {
  author: string | null;
  title: string | null;
  body: string;
  rating: number | null;
  date: string | null;
  externalId: string | null;
}

function parseCsvRecords(raw: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  const s = raw.replace(/^﻿/, "");
  for (let i = 0; i < s.length; i += 1) {
    const ch = s[i];
    if (inQuotes) {
      if (ch === '"') {
        if (s[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
      continue;
    }
    if (ch === '"') inQuotes = true;
    else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && s[i + 1] === "\n") i += 1;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += ch;
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim().length > 0));
}

const HEADER_ALIASES: Record<keyof FeedbackRow, string[]> = {
  author: ["author", "user", "name", "username", "reviewer", "customer"],
  title: ["title", "subject", "summary", "headline"],
  body: ["body", "review", "text", "content", "comment", "message", "feedback", "description"],
  rating: ["rating", "stars", "score"],
  date: ["date", "created_at", "createdat", "updated", "timestamp", "submitted_at"],
  externalId: ["id", "review_id", "ticket_id", "external_id"],
};

export function parseFeedbackCsv(raw: string): FeedbackRow[] {
  const [header, ...records] = parseCsvRecords(raw);
  if (!header) return [];
  const names = header.map((h) => h.trim().toLowerCase());
  const col = (key: keyof FeedbackRow) => names.findIndex((n) => HEADER_ALIASES[key].includes(n));
  const idx = {
    author: col("author"),
    title: col("title"),
    body: col("body"),
    rating: col("rating"),
    date: col("date"),
    externalId: col("externalId"),
  };
  const read = (rec: string[], i: number): string | null => {
    if (i < 0) return null;
    const v = rec[i]?.trim();
    return v ? v : null;
  };
  const out: FeedbackRow[] = [];
  for (const rec of records) {
    const body = idx.body >= 0 ? (rec[idx.body] ?? "").trim() : "";
    if (!body) continue;
    const ratingRaw = read(rec, idx.rating);
    const rating = ratingRaw === null ? null : Number.parseFloat(ratingRaw);
    out.push({
      externalId: read(rec, idx.externalId),
      author: read(rec, idx.author),
      rating: rating === null || Number.isNaN(rating) ? null : rating,
      date: read(rec, idx.date),
      title: read(rec, idx.title),
      body,
    });
  }
  return out;
}
