# Claims and their evidence

Each public statement about Verbatim, tagged by how it can be checked.

- **REPRODUCIBLE** — a script in this repo recomputes it.
- **VERIFIED-LIVE** — you can see it on the live app.
- **MODELED** — an estimate, not a measurement.
- **NOT CLAIMED** — things we deliberately do not say.

| Claim | Tier | Evidence |
|---|---|---|
| A note can only be an exact passage of its source | REPRODUCIBLE | `server/verbatim/locate.test.ts` (12 cases incl. invented, elided and curly-quote quotes); `scripts/smoke-actions.mjs` |
| Notes that drift from their source are flagged | REPRODUCIBLE | `server/verbatim/rules.test.ts` (tampered count); board health "changed" |
| Insights on one voice are labelled anecdotes; missing citations are refused | REPRODUCIBLE | `rules.test.ts`; `scripts/smoke-actions.mjs` (422 `invalid_citation`) |
| A claim's stated count must match its evidence ("N of M participants", "N reviewers", "N notes") | REPRODUCIBLE | `server/verbatim/claim-counts.test.ts` (9 cases incl. subgroups, spelled-out numbers, non-people numbers left alone); `scripts/smoke-actions.mjs` (422 `count_mismatch`); board health `count_mismatch` |
| Concurrent edits to a theme fail with a typed conflict instead of overwriting | REPRODUCIBLE | `scripts/smoke-actions.mjs` (409 `save_conflict`) |
| On 500 public reviews, Verbatim put 500 of 500 reviewers on the board; one chat prompt quoted 186 | REPRODUCIBLE | `results/verbatim-reviews-500.json`, `results/reviews-baseline-500.json`, `scripts/eval/reviews.ts`, `scripts/eval/board-stats.mjs`, `results/SUMMARY.md` |
| The single prompt's 192 review quotes were all verbatim | REPRODUCIBLE | `results/reviews-baseline-500.score.json` |
| The server refused 9 agent quotes on that run, 2 of them silent "corrections" of a customer's words | REPRODUCIBLE | `results/verbatim-reviews-500.json` → `refusedQuotes` |
| On the 8-interview benchmark both approaches found all 7 planted themes, the minority finding and both sides of the disagreement | REPRODUCIBLE | `results/score-*-8.json`, `scripts/eval/score.ts`, `fixtures/eval/answer-key.json` |
| The single prompt cited 1 interview quote that is not in any transcript; Verbatim cited 0 | REPRODUCIBLE | `results/score-baseline-8.json`, `results/score-verbatim-8.json` |
| Anyone can try the board and the agent without signing up | VERIFIED-LIVE | https://verbatim-flame.vercel.app → Open the live board |
| The agent's cursor follows the cards its actions touch | VERIFIED-LIVE | Try it study → Synthesize with agent |
| A readout can be shared by link and read signed out; an agent handed the link reads it as JSON | VERIFIED-LIVE | Readout → Share → General access: Anyone with the link → open `/r/<study>` in a private window; the page's discovery script points to `/api/readout-context.json` |
| MCP clients reach the same actions over OAuth (search-quotes, show-theme, add-source, add-comment…) | VERIFIED-LIVE | add `https://verbatim-flame.vercel.app/mcp` as a connector; the consent screen accepts a guest workspace |
| A Clips call comes in with its transcript: every quote keeps the speaker and the second it was said | VERIFIED-LIVE | Settings → Integrations → add `https://clips.agent-native.com/mcp`, then Add sources → Clips → Import |
| The 500-review synthesis cost about $2.70 in model calls | MODELED | token counts of our run × list prices |
| Verbatim's agent reads interviews better than a good single prompt | NOT CLAIMED | the benchmark shows parity |
| The interview benchmark represents real customers | NOT CLAIMED | it is fictional and labelled as such (`fixtures/eval/README.md`) |
| Theme quality is guaranteed | NOT CLAIMED | themes are the agent's and your judgement; only quotes and counts are guaranteed |
