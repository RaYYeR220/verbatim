import { describe, expect, it } from "vitest";

import { locateQuote, normalizeForMatch } from "./locate.js";

describe("locateQuote", () => {
  it("exact match returns the source slice", () => {
    const source = "I love it. The setup was painful.";
    const r = locateQuote(source, "The setup was painful.");
    expect(r).toEqual({
      ok: true,
      start: 11,
      end: 33,
      text: "The setup was painful.",
      match: "exact",
    });
  });

  it("normalises curly quotes, dashes and whitespace but stores the source text", () => {
    const source = "He said “it’s  slow” today — every single time";
    const r = locateQuote(source, "it's slow\" today - every single time");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.match).toBe("normalized");
    expect(r.text).toBe(source.slice(r.start, r.end));
    expect(r.text).toBe("it’s  slow” today — every single time");
  });

  it("matches case-insensitively and across line breaks", () => {
    const source = "Dana: Honestly the\nexport to QuickBooks breaks every month.";
    const r = locateQuote(source, "honestly the export to quickbooks breaks every month");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.text).toBe("Honestly the\nexport to QuickBooks breaks every month");
  });

  it("takes the next occurrence when the first span is already used", () => {
    const source = "it is way too slow. it is way too slow.";
    const r = locateQuote(source, "it is way too slow.", { taken: [[0, 19]] });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.start).toBe(20);
  });

  it("rejects an elided quote as not_contiguous", () => {
    const source = "I hate how the pricing page hides the per-seat cost.";
    expect(locateQuote(source, "I hate … the pricing page")).toMatchObject({
      ok: false,
      reason: "not_contiguous",
    });
    expect(locateQuote(source, "I hate ... the pricing page")).toMatchObject({
      ok: false,
      reason: "not_contiguous",
    });
  });

  it("accepts an ellipsis that is part of the source text", () => {
    const source = "Stick with it… it’s worth it! Five stars.";
    const r = locateQuote(source, "Stick with it... it's worth it!");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.text).toBe("Stick with it… it’s worth it!");
    expect(locateQuote(source, "Stick with it… it’s worth it!")).toMatchObject({ ok: true, match: "exact" });
  });

  it("rejects an invented quote and suggests the nearest real passage", () => {
    const source =
      "We tried it for a week. Honestly the onboarding took forever and nobody on my team finished it.";
    const r = locateQuote(source, "the onboarding took way too long");
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toBe("not_found");
    expect(r.nearest).toContain("onboarding took forever");
  });

  it("rejects short fragments of a normal-length source", () => {
    expect(locateQuote("ok fine, but the sync keeps failing on my phone", "ok fine")).toMatchObject({
      ok: false,
      reason: "too_short",
    });
  });

  it("lets a tiny source be quoted whole", () => {
    expect(locateQuote(".\nnice app", "nice app")).toMatchObject({ ok: true, text: "nice app" });
    expect(locateQuote("Yay\n(:", "Yay")).toMatchObject({ ok: true });
  });

  it("rejects quotes longer than the maximum", () => {
    const long = "word ".repeat(200);
    expect(locateQuote(long, long.trim())).toMatchObject({ ok: false, reason: "too_long" });
  });

  it("trims surrounding quote marks and whitespace from the agent's input", () => {
    const source = "The camera button does nothing with VoiceOver on.";
    const r = locateQuote(source, '  "The camera button does nothing with VoiceOver on."  ');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.text).toBe("The camera button does nothing with VoiceOver on.");
  });
});

describe("normalizeForMatch", () => {
  it("keeps a map from normalised index back to the original index", () => {
    const { norm, map } = normalizeForMatch("A  “B”");
    expect(norm).toBe('a "b"');
    expect(map[norm.indexOf("b")]).toBe(4);
  });
});
