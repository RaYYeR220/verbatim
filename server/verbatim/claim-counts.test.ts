import { describe, expect, it } from "vitest";

import { claimCountIssues, type ClaimCountContext } from "./claim-counts.js";

const ctx = (over: Partial<ClaimCountContext> = {}): ClaimCountContext => ({
  citedVoices: 5,
  citedNotes: 9,
  themeVoices: 5,
  themeNotes: 9,
  studyVoices: 8,
  studySources: 8,
  ...over,
});

describe("claimCountIssues", () => {
  it("accepts 'N of M participants' when N is the cited voices and M the study's voices", () => {
    expect(claimCountIssues("5 of 8 participants lose receipts when upload fails.", ctx())).toEqual([]);
  });

  it("refuses a people count that matches neither the cited voices nor the theme", () => {
    const issues = claimCountIssues("6 of 8 participants lose receipts.", ctx());
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({ said: 6, about: "people", allowed: [5] });
  });

  it("refuses a denominator larger than the study", () => {
    const issues = claimCountIssues("5 of 9 participants lose receipts.", ctx());
    expect(issues[0]).toMatchObject({ said: 9, about: "total", allowed: [8] });
  });

  it("accepts a subgroup denominator it cannot check", () => {
    expect(claimCountIssues("4 of 4 small-team admins cannot model a one-approver flow.", ctx({ citedVoices: 4, themeVoices: 4 }))).toEqual([]);
  });

  it("accepts the theme's voice count when the insight cites a sample of it", () => {
    expect(claimCountIssues("85 reviewers describe freezes and crashes.", ctx({ citedVoices: 40, citedNotes: 40, themeVoices: 85, themeNotes: 85 }))).toEqual([]);
  });

  it("flags a note count the theme no longer shows, with an adjective in between", () => {
    const issues = claimCountIssues(
      "The 158 positive notes come from users who run their lives in Notion.",
      ctx({ citedVoices: 40, citedNotes: 40, themeVoices: 161, themeNotes: 161, studyVoices: 500, studySources: 500 }),
    );
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({ said: 158, about: "notes" });
    expect(issues[0]!.allowed).toContain(161);
  });

  it("reads spelled-out numbers", () => {
    expect(claimCountIssues("Three of eight participants want a dark mode.", ctx({ citedVoices: 3 }))).toEqual([]);
    expect(claimCountIssues("Two participants want a dark mode.", ctx({ citedVoices: 3, themeVoices: 3 }))[0]).toMatchObject({ said: 2 });
  });

  it("ignores numbers that are not about people or notes", () => {
    expect(claimCountIssues("Users paid $119.99 and waited 3 weeks on iOS 18 for 2 fixes.", ctx())).toEqual([]);
    expect(claimCountIssues("Most reviewers want offline mode.", ctx())).toEqual([]);
    expect(claimCountIssues("2 of the 5 who lose receipts are field staff.", ctx())).toEqual([]);
  });

  it("reads thousands separators", () => {
    expect(claimCountIssues("1,284 reviewers mention sync.", ctx({ themeVoices: 1284 }))).toEqual([]);
  });
});
