import { describe, expect, it } from "vitest";

import { readoutFrom } from "./readout.js";
import type { BoardPayload } from "./types.js";

const note = (id: string, themeId: string | null, sourceId = "src_1", speaker = "Dana") =>
  ({ id, sourceId, themeId, text: `quote ${id}`, speaker, tMs: 1000 }) as BoardPayload["notes"][number];

const board = (): BoardPayload =>
  ({
    study: { id: "stu_1", title: "Study", question: "Why?", visibility: "public" },
    sources: [
      { id: "src_1", title: "Dana — Ops lead" },
      { id: "src_2", title: "Ravi — CFO" },
    ],
    notes: [note("n1", "thm_small"), note("n2", "thm_big"), note("n3", "thm_big", "src_2", "Ravi"), note("n4", "thm_big"), note("n5", null)],
    themes: [
      { id: "thm_small", name: "Small", voiceCount: 1, noteCount: 1 },
      { id: "thm_big", name: "Big", voiceCount: 2, noteCount: 3 },
    ],
    insights: [{ id: "ins_1", themeId: "thm_big", claim: "Two people say so.", noteIds: ["n3", "n2"], status: "verified" }],
  }) as unknown as BoardPayload;

describe("readoutFrom", () => {
  it("orders themes by distinct voices and keeps each theme's board colour", () => {
    const r = readoutFrom(board());
    expect(r.sections.map((s) => s.name)).toEqual(["Big", "Small"]);
    expect(r.sections.map((s) => s.colorIndex)).toEqual([1, 0]);
  });

  it("uses the quotes an insight cites as its evidence, in citation order", () => {
    const big = readoutFrom(board()).sections[0]!;
    expect(big.evidence.map((q) => q.noteId)).toEqual(["n3", "n2"]);
    expect(big.insights).toEqual([{ claim: "Two people say so.", status: "verified", cited: 2 }]);
    expect(big.evidence[0]).toMatchObject({ speaker: "Ravi", source: "Ravi — CFO", text: "quote n3" });
  });

  it("falls back to the theme's own notes when no insight cites them", () => {
    const small = readoutFrom(board()).sections[1]!;
    expect(small.insights).toEqual([]);
    expect(small.evidence.map((q) => q.noteId)).toEqual(["n1"]);
  });

  it("caps evidence per theme and counts the whole board", () => {
    const r = readoutFrom(board(), 1);
    expect(r.sections[0]!.evidence).toHaveLength(1);
    expect(r).toMatchObject({ sources: 2, notes: 5, themes: 2, study: { id: "stu_1", visibility: "public" } });
  });
});
