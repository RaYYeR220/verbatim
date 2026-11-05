import { describe, expect, it } from "vitest";

import { layoutBoard } from "./layout.js";

const rects = (out: ReturnType<typeof layoutBoard>, w = 240, h = 120) =>
  Object.entries(out.notes).map(([id, p]) => ({ id, x: p.x, y: p.y, w, h }));

const intersects = (a: { x: number; y: number; w: number; h: number }, b: typeof a) =>
  a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

describe("layoutBoard", () => {
  const input = {
    themes: [{ id: "t1" }, { id: "t2" }, { id: "t3" }, { id: "t4" }],
    notes: [
      ...Array.from({ length: 7 }, (_, i) => ({ id: `a${i}`, themeId: "t1" })),
      ...Array.from({ length: 2 }, (_, i) => ({ id: `b${i}`, themeId: "t2" })),
      ...Array.from({ length: 4 }, (_, i) => ({ id: `c${i}`, themeId: "t3" })),
      { id: "d0", themeId: "t4" },
      ...Array.from({ length: 5 }, (_, i) => ({ id: `u${i}`, themeId: null })),
    ],
  };

  it("is deterministic", () => {
    expect(layoutBoard(input)).toEqual(layoutBoard(input));
  });

  it("never overlaps two note cards", () => {
    const rs = rects(layoutBoard(input));
    for (let i = 0; i < rs.length; i += 1) {
      for (let j = i + 1; j < rs.length; j += 1) {
        expect(intersects(rs[i], rs[j]), `${rs[i].id} vs ${rs[j].id}`).toBe(false);
      }
    }
  });

  it("puts every note inside its theme frame", () => {
    const out = layoutBoard(input);
    for (const n of input.notes.filter((n) => n.themeId)) {
      const f = out.themes[n.themeId!];
      const p = out.notes[n.id];
      expect(p.x).toBeGreaterThanOrEqual(f.x);
      expect(p.x + 240).toBeLessThanOrEqual(f.x + f.w);
      expect(p.y).toBeGreaterThanOrEqual(f.y);
      expect(p.y + 120).toBeLessThanOrEqual(f.y + f.h);
    }
  });

  it("places unsorted notes left of x = 0", () => {
    const out = layoutBoard(input);
    for (let i = 0; i < 5; i += 1) expect(out.notes[`u${i}`].x + 240).toBeLessThanOrEqual(0);
  });
});
