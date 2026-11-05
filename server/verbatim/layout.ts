export interface LayoutOptions {
  cardW?: number;
  cardH?: number;
  gap?: number;
  /** Note columns inside one theme frame. */
  cols?: number;
}

export interface FrameRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface BoardLayout {
  themes: Record<string, FrameRect>;
  notes: Record<string, { x: number; y: number }>;
}

export const FRAME_HEADER = 56;
export const FRAME_PAD = 16;
const FRAME_GAP = 48;
const UNSORTED_GAP = 72;

/**
 * Deterministic board layout: theme frames packed into the shortest of a few
 * columns (in the order given), notes in a grid inside their frame, unsorted
 * notes stacked in a column left of x = 0.
 */
export function layoutBoard(
  input: { themes: { id: string }[]; notes: { id: string; themeId: string | null }[] },
  opts: LayoutOptions = {},
): BoardLayout {
  const cardW = opts.cardW ?? 240;
  const cardH = opts.cardH ?? 120;
  const gap = opts.gap ?? 16;
  const cols = opts.cols ?? 3;

  const byTheme = new Map<string, string[]>();
  for (const t of input.themes) byTheme.set(t.id, []);
  const unsorted: string[] = [];
  for (const n of input.notes) {
    const list = n.themeId ? byTheme.get(n.themeId) : undefined;
    if (list) list.push(n.id);
    else unsorted.push(n.id);
  }

  const frameW = FRAME_PAD * 2 + cols * cardW + (cols - 1) * gap;
  const boardCols = Math.max(1, Math.min(4, Math.ceil(Math.sqrt(input.themes.length))));
  const colHeights = new Array<number>(boardCols).fill(0);

  const out: BoardLayout = { themes: {}, notes: {} };
  for (const t of input.themes) {
    const ids = byTheme.get(t.id) ?? [];
    const rows = Math.max(1, Math.ceil(ids.length / cols));
    const h = FRAME_HEADER + rows * cardH + (rows - 1) * gap + FRAME_PAD;
    let col = 0;
    for (let c = 1; c < boardCols; c += 1) if (colHeights[c] < colHeights[col]) col = c;
    const frame = { x: col * (frameW + FRAME_GAP), y: colHeights[col], w: frameW, h };
    colHeights[col] += h + FRAME_GAP;
    out.themes[t.id] = frame;
    ids.forEach((id, i) => {
      out.notes[id] = {
        x: frame.x + FRAME_PAD + (i % cols) * (cardW + gap),
        y: frame.y + FRAME_HEADER + Math.floor(i / cols) * (cardH + gap),
      };
    });
  }
  unsorted.forEach((id, i) => {
    out.notes[id] = { x: -(cardW + UNSORTED_GAP), y: i * (cardH + gap) };
  });
  return out;
}
