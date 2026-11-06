# Verbatim

**Every insight, in the customer's own words.**

Drop in interviews, calls and feedback. Verbatim's agent cuts every source into exact quotes and sorts them into themes with you, live, on one board. Nothing on it is paraphrased: a note can only be a passage the source actually contains, and every count on the board opens to the people behind it.

Built on [Agent-Native](https://github.com/BuilderIO/agent-native). **Try it live, no sign-up: https://verbatim-flame.vercel.app**

Reviewing? Start with [JUDGES.md](JUDGES.md) (five minutes), [CLAIMS.md](CLAIMS.md) (every claim and how to check it) and [results/SUMMARY.md](results/SUMMARY.md) (every number, rendered from the run files).

## Why

Paste 500 reviews into a chat window and you get a wall of text: 33 themes, a few quotes each, counts nobody can check. We measured it on the same 500 public App Store reviews of Notion for iOS:

| | One chat prompt (same model) | Verbatim |
|---|---|---|
| Reviewers whose words appear in the synthesis | 186 of 500 | 500 of 500 |
| Theme counts you can open to the quotes | 0 of 33 | 13 of 13 |
| Quotes checked against their source | none | every one (542) |
| What you can do with it | read it | sort, split, comment, hand it to the agent again |

The model behind the chat prompt quoted honestly: all 192 of its quotes are verbatim. Models rarely invent quotes anymore. They do quietly fix them. On the same run Verbatim's server refused two notes where the agent had "corrected" a customer: a Turkish reviewer's `alacaktım` became `alacaktim`, and a Russian reviewer's typo `объеденить` became `объединить`. Both went back on the board exactly as written.

## How it works

1. **Drop in the evidence.** Interview transcripts (WebVTT, SRT, `Name: text`), Clips call recordings, app reviews and tickets as CSV, or a feedback inbox any tool can POST to.
2. **Sort it together.** The agent reads each source and proposes quotes; `add-notes` locates every quote inside its source and stores that exact span with speaker and timestamp, refusing anything that is not there. The agent and you move cards on the same board through the same `move-notes` action. Its cursor sits on the cards it is changing, and it follows your moves instead of undoing them.
3. **Every number opens.** Insights cite their notes. `write-insight` counts the distinct voices behind a claim, marks single-voice claims as anecdotes, refuses citations that are missing or no longer match their source, and refuses a claim whose stated count the evidence doesn't show ("7 of 8 participants" when 5 people said it). Board health tracks unread sources, unsorted notes, anything that drifted from its source, and insights whose theme has since grown past the number they state.

## One action, every surface

Each capability is one `defineAction()` in `actions/`, so the board UI, the in-app agent, HTTP, MCP, A2A and the CLI all run the same code with the same checks.

| Surface | What it does here |
|---|---|
| Board UI | Drag, lasso, rename, comment, select passages in a source to add them |
| In-app agent | Extracts, sorts, writes insights, answers comments, keeps going until `check-board` is done |
| Claude / ChatGPT (MCP) | `search-quotes`, `show-theme` (renders the live theme card inline), `add-source`, `add-comment` |
| Other agents (A2A) | Ask a study for evidence or add a source to it |
| Automations | Board events (`verbatim.source.added`, `verbatim.notes.added`, `verbatim.insight.written`) and webhook inboxes |
| Share link | The readout at `/r/<study>` for anyone with the link (framework sharing); an agent handed the link reads the same report as JSON |
| CLI | `pnpm action search-quotes --query "offline"` |

Agent-Native pieces in use: shared actions, application state (the agent sees the board and your selection), live sync, collaborative presence (the agent's cursor), `saveIfCurrent` (human and agent edits never silently overwrite each other), approval gates (the agent asks before deleting or merging a theme a person made), MCP Apps, the event bus, framework sharing with agent-readable links, and the MCP client (Clips import).

## Run it

```bash
corepack enable
pnpm install
cp .env.example .env   # add a model key: ANTHROPIC_API_KEY, or OPENAI_API_KEY (+ OPENAI_BASE_URL for any OpenAI-compatible endpoint)
pnpm dev
```

Then seed a demo study and open it:

```bash
node scripts/seed-study.mjs eval        # 8 interviews (synthetic benchmark set, labelled as such)
node scripts/seed-study.mjs reviews     # 500 public App Store reviews
```

## Evaluation

`fixtures/eval` holds 8 interview transcripts written as a labelled synthetic benchmark (fictional product, fictional people) with an answer key: 7 planted themes including a single-participant accessibility finding and a disagreement, plus 2 decoy topics nobody raises.

```bash
node --import tsx scripts/eval/baseline.ts          # the single-prompt baseline
node scripts/eval/export-board.mjs <studyId> results/verbatim-8.json
node --import tsx scripts/eval/score.ts results/verbatim-8.json
node --import tsx scripts/eval/reviews.ts score results/reviews-baseline-500.json
```

`score.ts` checks every quote with the same locator the app uses and reports quote fidelity, speaker attribution, theme recall, the minority theme, both sides of the disagreement, and decoy themes. Results from our runs are in `results/`; `node scripts/eval/report.mjs` renders them into [results/SUMMARY.md](results/SUMMARY.md). `python -I scripts/data/verify_key.py` checks the answer key against the transcripts.

## Honest limits

- The agent's synthesis is not smarter than a good single prompt on a small, clean set: on our 8-interview benchmark both found all 7 planted themes (the single prompt cited 82 of 83 quotes verbatim, Verbatim 49 of 49). Verbatim's difference is that the result is a board you can check and change, not that the model reads better.
- Reviews have no timestamps, so review notes carry author, rating and date instead.
- Theme colours cycle after eight themes.

## Data

`fixtures/reviews` contains public App Store customer reviews of Notion for iOS, quoted for research; authors are App Store nicknames. `fixtures/eval` is entirely fictional.

## License

MIT
