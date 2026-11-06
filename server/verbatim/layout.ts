export interface LayoutOptions {
  cardW?: number;
  cardH?: number;
  gap?: number;
  /** Widest a row of theme frames may get before wrapping. */
  maxRowWidth?: number;
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
export const FRAME_GAP = 56;
const UNSORTED_GAP = 72;

/** Note columns for a theme: 3 for small themes, wider for big ones so frames stay roughly square. */
export function columnsFor(count: number): number {
  if (count <= 9) return 3;
  return Math.min(10, Math.max(3, Math.round(Math.sqrt(count * 1.6))));
}

/**
 * Deterministic board layout: theme frames shelf-packed left to right in the
 * order given (wrapping at `maxRowWidth`), notes in a grid inside their frame,
 * unsorted notes in a column left of x = 0.
 */
export function layoutBoard(
  input: { themes: { id: string }[]; notes: { id: string; themeId: string | null }[] },
  opts: LayoutOptions = {},
): BoardLayout {
  const cardW = opts.cardW ?? 240;
  const cardH = opts.cardH ?? 120;
  const gap = opts.gap ?? 16;

  const byTheme = new Map<string, string[]>();
  for (const t of input.themes) byTheme.set(t.id, []);
  const unsorted: string[] = [];
  for (const n of input.notes) {
    const list = n.themeId ? byTheme.get(n.themeId) : undefined;
    if (list) list.push(n.id);
    else unsorted.push(n.id);
  }

  const sizes = input.themes.map((t) => {
    const ids = byTheme.get(t.id) ?? [];
    const cols = columnsFor(ids.length);
    const rows = Math.max(1, Math.ceil(ids.length / cols));
    return {
      id: t.id,
      ids,
      cols,
      w: FRAME_PAD * 2 + cols * cardW + (cols - 1) * gap,
      h: FRAME_HEADER + rows * cardH + (rows - 1) * gap + FRAME_PAD,
    };
  });
  const widest = sizes.reduce((m, s) => Math.max(m, s.w), 0);
  const maxRowWidth = opts.maxRowWidth ?? Math.max(widest * 2.4, 3200);

  const out: BoardLayout = { themes: {}, notes: {} };
  let x = 0;
  let y = 0;
  let rowH = 0;
  for (const s of sizes) {
    if (x > 0 && x + s.w > maxRowWidth) {
      x = 0;
      y += rowH + FRAME_GAP;
      rowH = 0;
    }
    const frame = { x, y, w: s.w, h: s.h };
    out.themes[s.id] = frame;
    s.ids.forEach((id, i) => {
      out.notes[id] = {
        x: frame.x + FRAME_PAD + (i % s.cols) * (cardW + gap),
        y: frame.y + FRAME_HEADER + Math.floor(i / s.cols) * (cardH + gap),
      };
    });
    x += s.w + FRAME_GAP;
    rowH = Math.max(rowH, s.h);
  }
  unsorted.forEach((id, i) => {
    out.notes[id] = { x: -(cardW + UNSORTED_GAP), y: i * (cardH + gap) };
  });
  return out;
}
