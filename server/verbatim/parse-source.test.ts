import { describe, expect, it } from "vitest";

import { parseFeedbackCsv, parseTranscript, segmentAt } from "./parse-source.js";

const VTT = `WEBVTT

00:00:04.120 --> 00:00:09.800
<v Interviewer>Thanks for joining. How did the first week go?

00:01:05.200 --> 00:01:09.000
<v Dana Okafor>Setup was painful.
Honestly I almost gave up.

00:01:09.500 --> 00:01:12.000
The receipts never uploaded on the train.
`;

const SRT = `1
00:00:01,000 --> 00:00:03,500
Interviewer: What do you use today?

2
00:00:04,000 --> 00:00:08,250
Sam: Spreadsheets, mostly. It's a mess.
`;

describe("parseTranscript", () => {
  it("reads VTT voice tags, timestamps and multi-line cues", () => {
    const p = parseTranscript(VTT);
    expect(p.text).toBe(
      "Thanks for joining. How did the first week go?\nSetup was painful. Honestly I almost gave up.\nThe receipts never uploaded on the train.",
    );
    expect(p.segments[1]).toMatchObject({ speaker: "Dana Okafor", tMs: 65200 });
    expect(p.text.slice(p.segments[1]!.start, p.segments[1]!.end)).toBe(
      "Setup was painful. Honestly I almost gave up.",
    );
    // a cue without a voice tag keeps the previous speaker
    expect(p.segments[2]!.speaker).toBe("Dana Okafor");
    expect(p.speakers).toEqual(["Interviewer", "Dana Okafor"]);
  });

  it("parses SRT cues with Name: prefixes", () => {
    const p = parseTranscript(SRT);
    expect(p.segments).toHaveLength(2);
    expect(p.segments[1]).toMatchObject({ speaker: "Sam", tMs: 4000 });
    expect(p.text.slice(p.segments[1]!.start, p.segments[1]!.end)).toBe(
      "Spreadsheets, mostly. It's a mess.",
    );
  });

  it("parses plain 'Name: text' lines and keeps unlabelled text", () => {
    const p = parseTranscript("Interviewer: Why did you switch?\nPriya: Our old tool lost receipts.\nIt happened twice.", "plain");
    expect(p.segments.map((s) => s.speaker)).toEqual(["Interviewer", "Priya", "Priya"]);
    expect(p.segments.every((s) => s.tMs === null)).toBe(true);
  });

  it("treats free text with no speakers as one segment", () => {
    const p = parseTranscript("The app crashes whenever I open a PDF receipt.");
    expect(p.segments).toEqual([{ start: 0, end: 46, speaker: null, tMs: null }]);
  });
});

describe("segmentAt", () => {
  it("resolves an offset inside the second cue", () => {
    const p = parseTranscript(VTT);
    const offset = p.text.indexOf("almost gave up");
    expect(segmentAt(p.segments, offset)?.speaker).toBe("Dana Okafor");
    expect(segmentAt(p.segments, offset)?.tMs).toBe(65200);
  });
});

describe("parseFeedbackCsv", () => {
  it("handles quoted commas and newlines inside a body", () => {
    const rows = parseFeedbackCsv(
      'id,author,rating,date,title,body\n1,ana,2,2026-11-01,"Slow, again","It lags.\nEvery time, on iPad."\n',
    );
    expect(rows).toEqual([
      {
        externalId: "1",
        author: "ana",
        rating: 2,
        date: "2026-11-01",
        title: "Slow, again",
        body: "It lags.\nEvery time, on iPad.",
      },
    ]);
  });

  it("maps review/stars/user headers", () => {
    const rows = parseFeedbackCsv("user,stars,review\nbo,5,Love the new sidebar\n");
    expect(rows[0]).toMatchObject({ author: "bo", rating: 5, body: "Love the new sidebar", title: null });
  });

  it("skips rows with an empty body", () => {
    expect(parseFeedbackCsv("author,body\nx,\ny,hello there\n")).toHaveLength(1);
  });
});
