# Design

Verbatim is a wall of customer words you can read. The design keeps the words legible at every zoom and lets colour mean one thing: which theme a quote belongs to.

## Principles

- **The quote is the interface.** Notes are short passages in the body face, never truncated into icons. Zoomed out, the board becomes a mosaic of theme colours; zoomed in, every card reads as a sentence with its speaker, timestamp or rating underneath.
- **Colour is data.** Theme hues are the only saturated colour in the app. Chrome stays ink on a warm light ground, with 1px hairlines instead of shadows.
- **Everything shows its source.** A card opens to its exact span in the transcript or review; an insight shows the quotes it counts; the activity feed says who did what (you, the agent, an automation, an MCP client).
- **The agent is visible, not loud.** The agent's cursor and labels use steel blue and sit on the cards it is changing. It never moves anything a person is dragging.

## Tokens (`app/global.css`)

| Token | Light | Use |
|---|---|---|
| `--vb-ground` | `#f1f1ee` | page and canvas |
| `--vb-ink` | `#1b1b19` | text; hairlines at 7–11% |
| `--vb-wall` | ink at 16% | unsorted notes and the zoomed-out wall |
| `--vb-rust` `--vb-ochre` `--vb-moss` `--vb-teal` `--vb-steel` `--vb-plum` `--vb-clay` `--vb-slate` | | theme hues, assigned in board order |
| `--vb-ease` | `cubic-bezier(.16,1,.3,1)` | every entrance and reveal |

Dark mode redefines the same tokens on `#0b0d11` with brighter hues.

## Type

- Display: General Sans 500, tracked −0.03em (headings, theme names, the landing).
- Body: Figtree Variable (notes, insights, the source viewer).
- Data: Geist Mono Variable, only for real data: speakers, timestamps, counts, ratings, ids.

## Shape and motion

- 2px radius on cards, chips and frames; the only pill is the primary call to action.
- New notes fade and rise in with a short stagger as the agent adds them; the board refits when its shape changes while you follow the agent.
- Semantic zoom: near shows full cards, mid shows text lines, far shows colour blocks with screen-space theme labels.
