---
name: respond-to-board-edits
description: >-
  How to handle comments left on notes, themes and insights and how to follow
  a person's manual moves on the board. Use when there are open comments, when
  the person says "look at what I did", or before any re-sort.
---

# Respond to board edits

## Comments are requests

1. Read open comments from `get-board` (`comments` with status `open`).
2. `resolve-comment {commentId, status: "working"}` so the person sees you picked it up.
3. Do the work with normal actions ("split this into pricing vs billing" → `create-theme` + `move-notes`; "is this real?" → `get-source` around the note's span and answer with the surrounding context).
4. `resolve-comment {commentId, status: "done", replyBody}` — one or two sentences: what changed, with counts. "Split into 'Pricing is unclear' (6 notes, 4 voices) and 'Invoices arrive late' (3 notes, 2 voices)."

## Following manual moves

- `list-activity` shows events by actor. Events by `user` are the person's decisions.
- If they moved notes A, B, C into a theme, look for unsorted notes that share the same reason and move those too, then tell them the rule you inferred so they can correct it.
- If they renamed a theme, keep the new name and adjust its summary to match.
- Never move a note a person placed unless they ask.
