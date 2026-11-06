import type { BoardHealth, InsightCheck } from "./rules.js";

export const THEME_COLORS = [
  "persimmon",
  "teal",
  "amber",
  "indigo",
  "rose",
  "olive",
  "sky",
  "plum",
] as const;
export type ThemeColor = (typeof THEME_COLORS)[number] | "slate";

export interface BoardStudy {
  id: string;
  title: string;
  question: string | null;
  visibility: string;
  ownerEmail: string;
  updatedAt: string;
}

export interface BoardParticipant {
  id: string;
  label: string;
  segment: string | null;
}

export interface BoardSource {
  id: string;
  title: string;
  kind: string;
  participantId: string | null;
  chars: number;
  noteCount: number;
  mediaUrl: string | null;
  externalRef: Record<string, unknown> | null;
}

export interface BoardNote {
  id: string;
  sourceId: string;
  participantId: string | null;
  text: string;
  speaker: string | null;
  tMs: number | null;
  themeId: string | null;
  x: number;
  y: number;
  tags: string[];
  sentiment: string | null;
  createdBy: string;
  verified: boolean;
  matchesSource: boolean;
}

export interface BoardTheme {
  id: string;
  name: string;
  color: string;
  x: number;
  y: number;
  summary: string | null;
  rev: string;
  createdBy: string;
  noteCount: number;
  voiceCount: number;
}

export interface BoardInsight {
  id: string;
  themeId: string | null;
  claim: string;
  noteIds: string[];
  status: "verified" | "anecdote";
  rev: string;
  createdBy: string;
  check: InsightCheck;
}

export interface BoardComment {
  id: string;
  targetType: string;
  targetId: string | null;
  body: string;
  authorEmail: string;
  status: string;
  replyBody: string | null;
  createdAt: string;
}

export interface BoardPayload {
  study: BoardStudy;
  participants: BoardParticipant[];
  sources: BoardSource[];
  notes: BoardNote[];
  themes: BoardTheme[];
  insights: BoardInsight[];
  comments: BoardComment[];
  health: BoardHealth;
}
