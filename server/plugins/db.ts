import {
  ensureAdditiveColumns,
  getDbExec,
  runMigrations,
} from "@agent-native/core/db";

import * as schema from "../db/schema.js";

function isDrizzleTable(value: unknown): value is object {
  return (
    !!value &&
    typeof value === "object" &&
    Object.getOwnPropertySymbols(value).some((s) =>
      s.toString().includes("drizzle"),
    )
  );
}

const schemaTables = Object.values(schema).filter(isDrizzleTable);

export const runVerbatimMigrations = runMigrations(
  [
    {
      version: 1,
      name: "create-studies",
      sql: `CREATE TABLE IF NOT EXISTS studies (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  question TEXT,
  created_at TEXT NOT NULL DEFAULT now(),
  updated_at TEXT NOT NULL DEFAULT now(),
  owner_email TEXT NOT NULL DEFAULT 'local@localhost',
  org_id TEXT,
  visibility TEXT NOT NULL DEFAULT 'private'
);
CREATE TABLE IF NOT EXISTS study_shares (
  id TEXT PRIMARY KEY,
  resource_id TEXT NOT NULL,
  principal_type TEXT NOT NULL,
  principal_id TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'viewer',
  created_by TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT now(),
  notified_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_study_shares_resource ON study_shares (resource_id);
CREATE INDEX IF NOT EXISTS idx_studies_owner ON studies (owner_email, updated_at)`,
    },
    {
      version: 2,
      name: "create-participants-sources",
      sql: `CREATE TABLE IF NOT EXISTS participants (
  id TEXT PRIMARY KEY,
  study_id TEXT NOT NULL,
  label TEXT NOT NULL,
  segment TEXT,
  attrs_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_participants_study ON participants (study_id);
CREATE TABLE IF NOT EXISTS sources (
  id TEXT PRIMARY KEY,
  study_id TEXT NOT NULL,
  participant_id TEXT,
  kind TEXT NOT NULL DEFAULT 'interview',
  title TEXT NOT NULL,
  text TEXT NOT NULL,
  segments_json TEXT NOT NULL DEFAULT '[]',
  media_url TEXT,
  external_ref_json TEXT,
  created_at TEXT NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_sources_study ON sources (study_id)`,
    },
    {
      version: 3,
      name: "create-notes-themes-insights",
      sql: `CREATE TABLE IF NOT EXISTS notes (
  id TEXT PRIMARY KEY,
  study_id TEXT NOT NULL,
  source_id TEXT NOT NULL,
  char_start INTEGER NOT NULL,
  char_end INTEGER NOT NULL,
  text TEXT NOT NULL,
  speaker TEXT,
  t_ms INTEGER,
  theme_id TEXT,
  x DOUBLE PRECISION NOT NULL DEFAULT 0,
  y DOUBLE PRECISION NOT NULL DEFAULT 0,
  tags_json TEXT NOT NULL DEFAULT '[]',
  sentiment TEXT,
  created_by TEXT NOT NULL DEFAULT 'user',
  verified_at TEXT,
  created_at TEXT NOT NULL DEFAULT now(),
  updated_at TEXT NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_notes_study_theme ON notes (study_id, theme_id);
CREATE INDEX IF NOT EXISTS idx_notes_source ON notes (source_id);
CREATE TABLE IF NOT EXISTS themes (
  id TEXT PRIMARY KEY,
  study_id TEXT NOT NULL,
  name TEXT NOT NULL,
  color TEXT NOT NULL DEFAULT 'slate',
  x DOUBLE PRECISION NOT NULL DEFAULT 0,
  y DOUBLE PRECISION NOT NULL DEFAULT 0,
  summary TEXT,
  rev TEXT NOT NULL,
  created_by TEXT NOT NULL DEFAULT 'user',
  created_at TEXT NOT NULL DEFAULT now(),
  updated_at TEXT NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_themes_study ON themes (study_id);
CREATE TABLE IF NOT EXISTS insights (
  id TEXT PRIMARY KEY,
  study_id TEXT NOT NULL,
  theme_id TEXT,
  claim TEXT NOT NULL,
  note_ids_json TEXT NOT NULL DEFAULT '[]',
  status TEXT NOT NULL,
  check_json TEXT NOT NULL DEFAULT '{}',
  rev TEXT NOT NULL,
  created_by TEXT NOT NULL DEFAULT 'user',
  created_at TEXT NOT NULL DEFAULT now(),
  updated_at TEXT NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_insights_study ON insights (study_id)`,
    },
    {
      version: 4,
      name: "create-comments-events",
      sql: `CREATE TABLE IF NOT EXISTS comments (
  id TEXT PRIMARY KEY,
  study_id TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_id TEXT,
  body TEXT NOT NULL,
  author_email TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',
  reply_body TEXT,
  created_at TEXT NOT NULL DEFAULT now(),
  updated_at TEXT NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_comments_study ON comments (study_id);
CREATE TABLE IF NOT EXISTS board_events (
  id TEXT PRIMARY KEY,
  study_id TEXT NOT NULL,
  actor TEXT NOT NULL,
  actor_email TEXT,
  action TEXT NOT NULL,
  summary TEXT NOT NULL,
  payload_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_board_events_study ON board_events (study_id, created_at)`,
    },
  ],
  { table: "verbatim_migrations" },
);

export default async (nitroApp: any): Promise<void> => {
  await runVerbatimMigrations(nitroApp);
  try {
    const summary = await ensureAdditiveColumns({
      db: getDbExec(),
      tables: schemaTables,
    });
    if (summary.errors.length > 0) {
      console.warn("[db] ensureAdditiveColumns completed with errors:", summary.errors);
    }
  } catch (err) {
    console.warn(
      "[db] ensureAdditiveColumns failed (non-fatal):",
      err instanceof Error ? err.message : err,
    );
  }
};
