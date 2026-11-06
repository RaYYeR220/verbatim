---
name: extract-verbatim
description: >-
  How to turn one source (interview transcript, call, review, ticket) into
  verbatim quote notes with add-notes. Use whenever a source has no notes yet
  or the person asks you to pull quotes, observations or evidence from it.
---

# Extract verbatim notes

## Rule

A note is one observation in the customer's exact words. You choose WHICH words; the source decides WHAT they are. `add-notes` stores the located span, never your string.

## Steps

1. Many short sources (reviews, tickets, survey answers): call `list-unread-sources` and extract from the whole batch in one or two `add-notes` calls; repeat until `remaining` is 0. Long transcripts: `get-source {sourceId}`, paging with `offset` when `truncated`.
2. Skip the interviewer, small talk, and filler. Keep what reveals a goal, a pain, a workaround, a number, a moment of delight, or a request.
3. One idea per note, 12–300 characters, copied character-for-character from `text`: same order, no "…", no fixing grammar, no merging two sentences that are far apart. Prefer the shortest passage that still makes sense alone.
4. Batch ≤ 40 notes per `add-notes` call; set `sentiment` when obvious; add 1–3 short `tags` (e.g. `offline`, `pricing`, `onboarding`) only when they help sorting.
5. Read `rejected`. For `not_found` with `nearest`, resend using an exact substring of `nearest`; otherwise drop it. Never retry the same text twice.
6. Expect roughly 8–25 notes per 30-minute interview and 1–3 per review. Every source should end up with at least one note — a voice that is not on the board does not count anywhere. `check-board` lists unread sources. Covering every distinct point matters more than volume — keep a single participant's unusual point (accessibility, a security worry): minority voices are often the finding.

## Report

"Pulled 17 verbatim notes from Dana's interview (2 quotes refused: not in the transcript)." Then continue to sorting unless asked to stop.
