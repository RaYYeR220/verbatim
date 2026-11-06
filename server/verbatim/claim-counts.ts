// Counts in a claim must match the evidence. "85 reviewers describe crashes"
// is checked against the voices the insight cites and the voices its theme
// holds; in "5 of 8 participants" the 8 may not exceed the study. A number
// that is not about people or notes ("3 weeks", "$119.99", "iOS 18") is left
// alone, and so is a vague quantity ("most reviewers").

export interface ClaimCountContext {
  /** Distinct voices among the cited notes. */
  citedVoices: number;
  /** Cited notes. */
  citedNotes: number;
  /** Distinct voices in the insight's theme, when it has one. */
  themeVoices?: number | undefined;
  /** Notes in the insight's theme, when it has one. */
  themeNotes?: number | undefined;
  /** Distinct voices across the study (participants, reviewers). */
  studyVoices: number;
  /** Sources in the study. */
  studySources: number;
}

export interface ClaimCountIssue {
  said: number;
  /** people = a count of voices, notes = a count of notes, total = the "of M" in "N of M". */
  about: "people" | "notes" | "total";
  /** The numbers the evidence supports for this count. */
  allowed: number[];
  text: string;
}

const NUMBER_WORDS: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17,
  eighteen: 18, nineteen: 19, twenty: 20,
};
const PEOPLE = "participants?|interviewees?|respondents?|reviewers?|people|persons?|users?|customers?|teams?|voices?|admins?";
const NOTES = "notes?|quotes?|reviews?|mentions?|comments?";
const NOUN = `(${PEOPLE}|${NOTES})`;
const NUM = String.raw`(?<![\d.,$£€#])(\d+)(?![\d%]|\.\d)`;
const ADJ = String.raw`(?:[a-z][a-z'-]*\s+)?`;
const FRACTION = new RegExp(String.raw`\b${NUM}\s+(?:out\s+)?of\s+(?:the\s+|all\s+)?${NUM}\s+${ADJ}${NOUN}\b`, "gi");
const SINGLE = new RegExp(String.raw`\b${NUM}\s+${ADJ}${NOUN}\b`, "gi");
const PEOPLE_RE = new RegExp(`^(?:${PEOPLE})$`, "i");

function normalize(claim: string): string {
  return claim
    .replace(/\b(\d{1,3}(?:,\d{3})+)\b/g, (m) => m.replace(/,/g, ""))
    .replace(new RegExp(`\\b(${Object.keys(NUMBER_WORDS).join("|")})\\b`, "gi"), (w) => String(NUMBER_WORDS[w.toLowerCase()]));
}

const uniq = (xs: Array<number | undefined>) =>
  [...new Set(xs.filter((x): x is number => typeof x === "number" && x > 0))].sort((a, b) => a - b);

export function claimCountIssues(claim: string, ctx: ClaimCountContext): ClaimCountIssue[] {
  const text = normalize(claim);
  const people = uniq([ctx.citedVoices, ctx.themeVoices]);
  const notes = uniq([ctx.citedNotes, ctx.themeNotes, ctx.citedVoices, ctx.themeVoices]);
  const totals = uniq([ctx.studyVoices, ctx.studySources]);
  const issues: ClaimCountIssue[] = [];
  const taken: Array<[number, number]> = [];

  const check = (said: number, noun: string, match: string) => {
    const about = PEOPLE_RE.test(noun) ? "people" : "notes";
    const allowed = about === "people" ? people : notes;
    if (allowed.length > 0 && !allowed.includes(said)) issues.push({ said, about, allowed, text: match });
  };

  for (const m of text.matchAll(FRACTION)) {
    taken.push([m.index, m.index + m[0].length]);
    check(Number(m[1]), m[3]!, m[0]);
    // "4 of 4 small-team admins" counts out of a subgroup, which the board
    // can't check; a denominator larger than the study (or smaller than its
    // own numerator) is wrong either way.
    const total = Number(m[2]);
    const most = Math.max(0, ...totals);
    if (most > 0 && (total > most || total < Number(m[1]))) issues.push({ said: total, about: "total", allowed: [most], text: m[0] });
  }
  for (const m of text.matchAll(SINGLE)) {
    const start = m.index;
    if (taken.some(([a, b]) => start >= a && start < b)) continue;
    check(Number(m[1]), m[2]!, m[0]);
  }
  return issues;
}

/** One line the agent can act on, e.g. for a refusal or a board-health note. */
export function describeCountIssues(issues: ClaimCountIssue[]): string {
  return issues
    .map((i) =>
      i.about === "total"
        ? `"${i.text}" counts out of ${i.said}, but the study has ${i.allowed[0]}.`
        : `"${i.text}" says ${i.said} ${i.about === "people" ? "voices" : "notes"}, but the evidence shows ${i.allowed.join(" or ")}.`,
    )
    .join(" ");
}
