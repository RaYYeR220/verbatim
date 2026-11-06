import { describe, expect, it } from "vitest";

import { computeBoardHealth, evaluateInsight, type NoteLite } from "./rules.js";

const note = (id: string, over: Partial<NoteLite> = {}): NoteLite => ({
  id,
  sourceId: `src_${id}`,
  participantId: `par_${id}`,
  themeId: "thm_a",
  verified: true,
  textMatchesSource: true,
  ...over,
});

const byId = (...ns: NoteLite[]) => new Map(ns.map((n) => [n.id, n]));

describe("evaluateInsight", () => {
  it("is verified with two notes from two participants", () => {
    const r = evaluateInsight(["a", "b"], byId(note("a"), note("b")));
    expect(r).toMatchObject({ status: "verified", participants: 2, missing: [] });
  });

  it("is an anecdote when every note comes from one participant", () => {
    const r = evaluateInsight(
      ["a", "b"],
      byId(note("a", { participantId: "par_1" }), note("b", { participantId: "par_1" })),
    );
    expect(r.status).toBe("anecdote");
    expect(r.participants).toBe(1);
  });

  it("is invalid when a cited note does not exist", () => {
    const r = evaluateInsight(["a", "ghost"], byId(note("a"), note("b")));
    expect(r.status).toBe("invalid");
    expect(r.missing).toEqual(["ghost"]);
  });

  it("is invalid when a cited note no longer matches its source", () => {
    const r = evaluateInsight(["a", "b"], byId(note("a"), note("b", { textMatchesSource: false })));
    expect(r.status).toBe("invalid");
    expect(r.reasons.join(" ")).toMatch(/does not match/);
  });

  it("counts a source with no participant as its own voice", () => {
    const r = evaluateInsight(
      ["a", "b"],
      byId(note("a", { participantId: null }), note("b", { participantId: null })),
    );
    expect(r.participants).toBe(2);
  });
});

describe("computeBoardHealth", () => {
  it("counts unsorted, unverified and tampered notes", () => {
    const h = computeBoardHealth({
      notes: [
        note("a"),
        note("b", { themeId: null }),
        note("c", { verified: false }),
        note("d", { textMatchesSource: false }),
      ],
      themes: [{ id: "thm_a", name: "Setup is painful" }],
      insights: [],
    });
    expect(h).toMatchObject({ notes: 4, unsorted: 1, unverified: 1, tampered: 1, themes: 1 });
    expect(h.uncitedThemes).toEqual(["thm_a"]);
  });

  it("lists sources with no notes as unread", () => {
    const h = computeBoardHealth({ notes: [note("a")], themes: [{ id: "thm_a", name: "A" }], insights: [], sourceIds: ["src_a", "src_b"] });
    expect(h.unreadSources).toEqual(["src_b"]);
    expect(h.sources).toBe(2);
  });

  it("lists themes backed by fewer than two participants", () => {
    const h = computeBoardHealth({
      notes: [note("a", { themeId: "thm_thin", participantId: "p1" }), note("b", { themeId: "thm_thin", participantId: "p1" })],
      themes: [{ id: "thm_thin", name: "One voice" }],
      insights: [],
    });
    expect(h.thinThemes).toEqual(["thm_thin"]);
  });

  it("flags an insight whose claim states a count the theme no longer shows", () => {
    const notes = [note("a"), note("b"), note("c")];
    const themes = [{ id: "thm_a", name: "A" }];
    const fresh = computeBoardHealth({ notes, themes, insights: [{ id: "ins_1", themeId: "thm_a", status: "verified", noteIds: ["a", "b"], claim: "3 participants say so." }] });
    expect(fresh.countMismatches).toEqual([]);
    const stale = computeBoardHealth({ notes, themes, insights: [{ id: "ins_1", themeId: "thm_a", status: "verified", noteIds: ["a", "b"], claim: "4 participants say so." }] });
    expect(stale.countMismatches).toEqual(["ins_1"]);
    expect(stale.issues.map((i) => i.kind)).toContain("count_mismatch");
    expect(stale.score).toBe(95);
  });

  it("scores a clean board 100 and never goes below 0", () => {
    const clean = computeBoardHealth({
      notes: [note("a"), note("b")],
      themes: [{ id: "thm_a", name: "A" }],
      insights: [{ id: "ins_1", themeId: "thm_a", status: "verified", noteIds: ["a", "b"] }],
    });
    expect(clean.score).toBe(100);
    const awful = computeBoardHealth({
      notes: Array.from({ length: 10 }, (_, i) => note(`n${i}`, { textMatchesSource: false, themeId: null })),
      themes: [],
      insights: [],
    });
    expect(awful.score).toBe(0);
  });
});
