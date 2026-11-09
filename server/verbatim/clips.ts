import { fail } from "@agent-native/core/action";
import { callMcpTool, listVisibleMcpTools } from "@agent-native/core/mcp-client";

import type { Segment } from "./parse-source.js";

/**
 * Clips (clips.agent-native.com) is reached through the person's own MCP
 * connection to it, so imports and comments act with their Clips identity.
 */
export const CLIPS_ORIGIN = "https://clips.agent-native.com";

/** Tools any Clips MCP server lists, used to recognise the person's Clips connection. */
const CLIPS_MARKERS = ["search-recordings", "get-recording-player-data", "list-comments", "reply-to-comment", "create-recording-upload"];
const bareName = (name: string) => (name.includes("__") ? name.split("__").pop()! : name);

/**
 * Finds the person's Clips connection and the tool to call on it. Clips serves
 * a compact catalog, so a tool it doesn't list (list-recordings, add-comment)
 * is still addressed by name on the server that lists the known Clips tools.
 */
async function resolveClipsTool(toolName: string) {
  const tools = await listVisibleMcpTools().catch(() => []);
  const listed = tools.find((t) => bareName(t.name) === toolName);
  if (listed) return { serverId: listed.serverId, name: bareName(listed.name) };
  const clips = tools.find((t) => CLIPS_MARKERS.includes(bareName(t.name)));
  if (!clips) {
    fail(
      "Clips isn't connected for you yet. Open Settings → Integrations, add the MCP server https://clips.agent-native.com/mcp and sign in to Clips, then try again.",
      { errorCode: "clips_not_connected", statusCode: 409 },
    );
  }
  return { serverId: clips.serverId, name: toolName };
}

/** The structured payload of an MCP tool result (structuredContent, or JSON text content). */
function payload(result: unknown): any {
  const r = result as { structuredContent?: unknown; content?: Array<{ type: string; text?: string }>; isError?: boolean };
  if (r?.isError) {
    const msg = r.content?.find((c) => c.type === "text")?.text ?? "Clips returned an error.";
    fail(msg, { errorCode: "clips_error", statusCode: 502 });
  }
  if (r?.structuredContent) return r.structuredContent;
  const text = r?.content?.find((c) => c.type === "text")?.text;
  if (!text) return r;
  try {
    return JSON.parse(text);
  } catch {
    return { text };
  }
}

export async function callClips(toolName: string, args: Record<string, unknown>) {
  const { serverId, name } = await resolveClipsTool(toolName);
  return payload(await callMcpTool(serverId, name, args));
}

/** Like callClips, but a tool Clips refuses comes back as `ok: false` (a missing connection still throws). */
export async function tryClips(toolName: string, args: Record<string, unknown>): Promise<{ ok: true; data: any } | { ok: false; error: string }> {
  await resolveClipsTool(toolName);
  try {
    return { ok: true, data: await callClips(toolName, args) };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

export interface ClipsTranscript {
  title: string;
  recordingId: string;
  durationMs: number | null;
  text: string;
  segments: Segment[];
  speakers: string[];
}

/** Reads a recording's complete transcript, page by page, exactly as Clips stores it. */
export async function readClipsTranscript(recordingId: string): Promise<ClipsTranscript> {
  let offset: number | undefined;
  let title = "Clips recording";
  let durationMs: number | null = null;
  const seen = new Set<string>();
  const raw: Array<{ startMs: number; text: string; speaker?: string | null }> = [];
  for (let page = 0; page < 40; page += 1) {
    const data = await callClips("get-recording-player-data", { recordingId, ...(offset !== undefined ? { transcriptOffset: offset } : {}) });
    const rec = data?.recording ?? data;
    title = rec?.title ?? title;
    durationMs = typeof rec?.durationMs === "number" ? rec.durationMs : durationMs;
    const t = data?.transcript;
    if (!t) fail("This recording has no transcript yet.", { errorCode: "clips_no_transcript", statusCode: 409 });
    for (const s of (t.segments ?? []) as Array<{ startMs: number; text: string; speaker?: string | null }>) {
      const key = `${s.startMs}:${s.text}`;
      if (seen.has(key) || !s.text?.trim()) continue;
      seen.add(key);
      raw.push(s);
    }
    if (t.nextFullTextOffset === null || t.nextFullTextOffset === undefined) {
      if (raw.length === 0 && typeof t.fullText === "string" && t.fullText.trim()) {
        raw.push({ startMs: 0, text: t.fullText });
      }
      break;
    }
    offset = t.nextFullTextOffset;
  }
  raw.sort((a, b) => a.startMs - b.startMs);
  let text = "";
  const segments: Segment[] = [];
  const speakers: string[] = [];
  for (const s of raw) {
    if (text) text += "\n";
    const start = text.length;
    text += s.text.trim();
    const speaker = s.speaker ?? null;
    segments.push({ start, end: text.length, speaker, tMs: s.startMs });
    if (speaker && !speakers.includes(speaker)) speakers.push(speaker);
  }
  return { title, recordingId, durationMs, text, segments, speakers };
}

export const clipsRecordingUrl = (recordingId: string, tMs?: number | null) =>
  `${CLIPS_ORIGIN}/r/${encodeURIComponent(recordingId)}${tMs ? `?t=${Math.floor(tMs / 1000)}` : ""}`;
