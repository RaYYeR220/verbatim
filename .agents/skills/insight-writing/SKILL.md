---
name: insight-writing
description: >-
  How to write evidence-backed insights with write-insight and keep the board
  honest with check-board. Use when the person asks for insights, findings, a
  summary, a readout, recommendations, or "what did we learn".
---

# Insight writing

## An insight is a claim plus its proof

- One sentence a product team can act on, with the count: "5 of 8 teams lose receipts when capture runs offline, usually on trains or flights."
- Cite the notes that prove it (`noteIds`), from as many different voices as support it. Pick quotes that say it best, not every note.
- `write-insight` returns `status`: `verified` (≥ 2 voices) or `anecdote` (1 voice). Report anecdotes as anecdotes. If it refuses with `invalid_citation`, re-read the board — a note was deleted or never existed.
- Counts come from the board (`voiceCount` on the theme), never from memory.
- When editing an existing insight pass its `rev` as `expectedRev`. On `save_conflict`, someone edited it after you read it: redo your change on `details.current`.

## Order of a readout

1. The research question and what was analysed ("8 interviews, 186 verbatim notes").
2. Insights ordered by voices, strongest first, each with one or two quotes and speakers.
3. Minority findings and contradictions, labelled as such.
4. What the evidence does not show (decoys people might assume).

## Done means

`check-board` returns `done: true` (0 unsorted, 0 tampered, every theme has an insight) — or you state exactly what remains and why it is intentional.
