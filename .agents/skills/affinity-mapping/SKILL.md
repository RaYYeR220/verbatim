---
name: affinity-mapping
description: >-
  How to sort verbatim notes into themes on the board with create-theme,
  move-notes, merge-themes and layout-board. Use after extraction, when the
  person asks to cluster, group, sort, split or reorganise notes or themes.
---

# Affinity mapping

## Before you move anything

Call `list-activity`. Anything a person did on this board (moved a note, renamed or created a theme) is a decision: build on it, never undo it. If a person moved notes into a theme, infer why and apply the same rule to similar unsorted notes, then say what rule you applied.

## Naming themes

- Name the customer's problem or need in plain words, ≤ 6 words: "Receipts fail on bad signal", "Approvals too rigid for small teams".
- Not features ("Sync"), not sentiment ("Negative feedback"), not jargon ("Ingestion friction").
- One theme = one problem. If a theme needs "and", split it.

## Sorting

1. Read the board with `get-board` for small studies; for large ones (hundreds of notes) use `check-board` plus `list-notes {filter:"unsorted"}` page by page.
2. Draft 4–9 themes for an interview study, up to ~12 for large feedback sets. Create each with its first batch of notes: `create-theme {name, noteIds}`.
3. Move the rest with `move-notes` in batches (≤ 200). Leave true outliers unsorted rather than forcing them; say how many and why.
4. Merge near-duplicates with `merge-themes`; a theme on a single voice is either an anecdote worth keeping (label it) or should join a broader theme.
5. Mixed or contradictory evidence (two people love the mobile app, two say it's unusable) is a finding: keep both sides in one theme and say so in its summary, or make two themes that name the split.
6. Never fold a minority finding (accessibility, security, a single segment's blocker) or one side of a disagreement into a broader theme — those are exactly what a readout must not lose. Give each its own theme even with one voice.
7. `layout-board` once at the end of a sorting round, not after every move.
8. `update-theme {summary}` with one or two sentences per theme: who says it (voices / segment) and the strongest quote.
