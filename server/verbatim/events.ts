import { emit, registerEvent } from "@agent-native/core/event-bus";
import { getRequestUserEmail } from "@agent-native/core/server/request-context";
import { z } from "zod";

/**
 * Board events other automations can trigger on, e.g. "when a source lands in
 * this study, extract and file it" or "when a theme reaches five voices, post
 * it to Slack".
 */
export const VERBATIM_EVENTS = {
  sourceAdded: {
    name: "verbatim.source.added",
    description: "A source (interview, call, review, ticket) was added to a study and has no notes yet.",
    payloadSchema: z.object({
      studyId: z.string(),
      studyTitle: z.string(),
      sourceId: z.string(),
      title: z.string(),
      kind: z.string(),
      chars: z.number(),
    }),
    example: {
      studyId: "stu_123",
      studyTitle: "Q4 onboarding interviews",
      sourceId: "src_456",
      title: "Interview — Dana Okafor",
      kind: "interview",
      chars: 14210,
    },
  },
  notesAdded: {
    name: "verbatim.notes.added",
    description: "Verbatim quote notes were added to a study (count includes how many quotes were refused).",
    payloadSchema: z.object({ studyId: z.string(), added: z.number(), refused: z.number(), sourceIds: z.array(z.string()) }),
    example: { studyId: "stu_123", added: 14, refused: 1, sourceIds: ["src_456"] },
  },
  themeGrew: {
    name: "verbatim.theme.grew",
    description: "A theme gained notes; carries its current note and voice counts.",
    payloadSchema: z.object({
      studyId: z.string(),
      themeId: z.string(),
      name: z.string(),
      notes: z.number(),
      voices: z.number(),
    }),
    example: { studyId: "stu_123", themeId: "thm_9", name: "Receipts fail on bad signal", notes: 9, voices: 5 },
  },
  insightWritten: {
    name: "verbatim.insight.written",
    description: "An insight was written or updated; status is verified (2+ voices) or anecdote.",
    payloadSchema: z.object({
      studyId: z.string(),
      insightId: z.string(),
      claim: z.string(),
      status: z.string(),
      voices: z.number(),
    }),
    example: {
      studyId: "stu_123",
      insightId: "ins_7",
      claim: "5 of 8 teams lose receipts when capture runs offline.",
      status: "verified",
      voices: 5,
    },
  },
} as const;

let registered = false;
export function registerVerbatimEvents() {
  if (registered) return;
  registered = true;
  for (const e of Object.values(VERBATIM_EVENTS)) {
    registerEvent({ name: e.name, description: e.description, payloadSchema: e.payloadSchema, example: e.example });
  }
}

type EventKey = keyof typeof VERBATIM_EVENTS;

/** Emits a board event for the current user's automations. Never throws. */
export function emitBoardEvent<K extends EventKey>(key: K, payload: z.infer<(typeof VERBATIM_EVENTS)[K]["payloadSchema"]>) {
  try {
    registerVerbatimEvents();
    const owner = getRequestUserEmail();
    if (!owner) return;
    emit(VERBATIM_EVENTS[key].name, payload, { owner });
  } catch {
    /* automations are optional */
  }
}
