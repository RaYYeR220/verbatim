import {
  createSharesTable,
  index,
  integer,
  now,
  ownableColumns,
  real,
  table,
  text,
} from "@agent-native/core/db/schema";

export const studies = table("studies", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  question: text("question"),
  createdAt: text("created_at").notNull().default(now()),
  updatedAt: text("updated_at").notNull().default(now()),
  ...ownableColumns(),
});

export const studyShares = createSharesTable("study_shares");

export const participants = table(
  "participants",
  {
    id: text("id").primaryKey(),
    studyId: text("study_id").notNull(),
    label: text("label").notNull(),
    segment: text("segment"),
    attrsJson: text("attrs_json").notNull().default("{}"),
    createdAt: text("created_at").notNull().default(now()),
  },
  (t) => ({ byStudy: index("idx_participants_study").on(t.studyId) }),
);

export const sources = table(
  "sources",
  {
    id: text("id").primaryKey(),
    studyId: text("study_id").notNull(),
    participantId: text("participant_id"),
    kind: text("kind", {
      enum: ["interview", "ticket", "review", "slack", "clip", "note"],
    })
      .notNull()
      .default("interview"),
    title: text("title").notNull(),
    text: text("text").notNull(),
    segmentsJson: text("segments_json").notNull().default("[]"),
    mediaUrl: text("media_url"),
    externalRefJson: text("external_ref_json"),
    createdAt: text("created_at").notNull().default(now()),
  },
  (t) => ({ byStudy: index("idx_sources_study").on(t.studyId) }),
);

export const notes = table(
  "notes",
  {
    id: text("id").primaryKey(),
    studyId: text("study_id").notNull(),
    sourceId: text("source_id").notNull(),
    charStart: integer("char_start").notNull(),
    charEnd: integer("char_end").notNull(),
    text: text("text").notNull(),
    speaker: text("speaker"),
    tMs: integer("t_ms"),
    themeId: text("theme_id"),
    x: real("x").notNull().default(0),
    y: real("y").notNull().default(0),
    tagsJson: text("tags_json").notNull().default("[]"),
    sentiment: text("sentiment", { enum: ["pos", "neg", "neu", "mixed"] }),
    createdBy: text("created_by").notNull().default("user"),
    verifiedAt: text("verified_at"),
    createdAt: text("created_at").notNull().default(now()),
    updatedAt: text("updated_at").notNull().default(now()),
  },
  (t) => ({
    byStudyTheme: index("idx_notes_study_theme").on(t.studyId, t.themeId),
    bySource: index("idx_notes_source").on(t.sourceId),
  }),
);

export const themes = table(
  "themes",
  {
    id: text("id").primaryKey(),
    studyId: text("study_id").notNull(),
    name: text("name").notNull(),
    color: text("color").notNull().default("slate"),
    x: real("x").notNull().default(0),
    y: real("y").notNull().default(0),
    summary: text("summary"),
    rev: text("rev").notNull(),
    createdBy: text("created_by").notNull().default("user"),
    createdAt: text("created_at").notNull().default(now()),
    updatedAt: text("updated_at").notNull().default(now()),
  },
  (t) => ({ byStudy: index("idx_themes_study").on(t.studyId) }),
);

export const insights = table(
  "insights",
  {
    id: text("id").primaryKey(),
    studyId: text("study_id").notNull(),
    themeId: text("theme_id"),
    claim: text("claim").notNull(),
    noteIdsJson: text("note_ids_json").notNull().default("[]"),
    status: text("status", { enum: ["verified", "anecdote"] }).notNull(),
    checkJson: text("check_json").notNull().default("{}"),
    rev: text("rev").notNull(),
    createdBy: text("created_by").notNull().default("user"),
    createdAt: text("created_at").notNull().default(now()),
    updatedAt: text("updated_at").notNull().default(now()),
  },
  (t) => ({ byStudy: index("idx_insights_study").on(t.studyId) }),
);

export const comments = table(
  "comments",
  {
    id: text("id").primaryKey(),
    studyId: text("study_id").notNull(),
    targetType: text("target_type", {
      enum: ["note", "theme", "insight", "board"],
    }).notNull(),
    targetId: text("target_id"),
    body: text("body").notNull(),
    authorEmail: text("author_email").notNull(),
    status: text("status", { enum: ["open", "working", "done"] })
      .notNull()
      .default("open"),
    replyBody: text("reply_body"),
    createdAt: text("created_at").notNull().default(now()),
    updatedAt: text("updated_at").notNull().default(now()),
  },
  (t) => ({ byStudy: index("idx_comments_study").on(t.studyId) }),
);

export const boardEvents = table(
  "board_events",
  {
    id: text("id").primaryKey(),
    studyId: text("study_id").notNull(),
    actor: text("actor").notNull(),
    actorEmail: text("actor_email"),
    action: text("action").notNull(),
    summary: text("summary").notNull(),
    payloadJson: text("payload_json").notNull().default("{}"),
    createdAt: text("created_at").notNull().default(now()),
  },
  (t) => ({ byStudyTime: index("idx_board_events_study").on(t.studyId, t.createdAt) }),
);

export type StudyRow = typeof studies.$inferSelect;
export type ParticipantRow = typeof participants.$inferSelect;
export type SourceRow = typeof sources.$inferSelect;
export type NoteRow = typeof notes.$inferSelect;
export type ThemeRow = typeof themes.$inferSelect;
export type InsightRow = typeof insights.$inferSelect;
export type CommentRow = typeof comments.$inferSelect;
export type BoardEventRow = typeof boardEvents.$inferSelect;
