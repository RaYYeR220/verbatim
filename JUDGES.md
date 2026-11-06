# Review Verbatim in five minutes

Live app: **https://verbatim-flame.vercel.app** — no sign-up. "Open the live board" gives you your own workspace with three studies copied in.

## 1. The board (1 min)

You land on **Notion iOS — what 500 App Store reviewers say**: 500 public reviews, every one on the board as at least one exact quote, sorted into 13 themes.

- Zoom out (⌘/ctrl + scroll, or **Fit**) to see every voice at once; zoom in and every card is a passage of a real review with author, rating and date.
- The right panel: board health (500/500 voices, 0 unsorted, 0 changed), insights with the quotes they cite, the activity feed by actor.
- Double-click any card: the review opens with that exact span tinted. Select any other passage there and **Add as exact quote** — the same `add-notes` action the agent uses.

## 2. Watch the agent work (2 min)

Open **Try it: three raw interviews** in the sidebar and press **Synthesize with agent**.

- The agent reads the three transcripts, proposes quotes, and the server stores only the ones that are really in the source (`add-notes` refuses the rest). Cards fade in as they land; the agent's cursor sits on what it is changing.
- It creates themes, writes insights that count voices (single-voice claims are labelled anecdotes), tidies the board and keeps going until `check-board` reports done.

## 3. Work with it, not after it (1 min)

- Drag a card into another theme. Then ask the agent to "review the board" — it reads the activity feed, builds on your move, and will suggest rather than silently undo anything it disagrees with.
- Select a few cards → **Comment** → e.g. "split these into pricing vs billing". The agent picks up the comment, does it, and replies.
- Rename a theme while the agent edits it: the second write fails with a typed conflict instead of overwriting (`saveIfCurrent`).
- Ask it to delete or merge a theme you created: it has to ask first (approval gate).

## 4. Check the claims (1 min)

| Claim | Where to check |
|---|---|
| Every note is an exact span of its source | `server/verbatim/locate.ts` + `locate.test.ts`; `add-notes` stores `source.slice(start, end)`, never the model's string; `check-board` re-verifies every note on every read |
| The agent's quotes were refused when it changed a customer's words | `results/verbatim-reviews-500.json` → `refusedQuotes` (`alacaktım → alacaktim`, `объеденить → объединить`) |
| 500 of 500 reviewers on the board vs 186 quoted by one chat prompt | `results/SUMMARY.md` (rendered from the JSON by `scripts/eval/report.mjs`) |
| Same synthesis quality as a single prompt on the labelled interview set | `results/SUMMARY.md`; answer key `fixtures/eval/answer-key.json`; `scripts/eval/score.ts` |
| One action, every surface | `actions/*.ts` — each is one `defineAction()` used by the board UI, the agent, HTTP, MCP and the CLI |

Run it locally: `pnpm install && pnpm dev`, then `node scripts/seed-study.mjs eval` and `node scripts/smoke-actions.mjs`.
