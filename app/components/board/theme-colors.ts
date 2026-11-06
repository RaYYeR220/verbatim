/** Board hues. Stored theme colours are names; the UI maps them onto the Verbatim palette. */
const PALETTE: Record<string, string> = {
  rust: "var(--vb-rust)",
  ochre: "var(--vb-ochre)",
  moss: "var(--vb-moss)",
  teal: "var(--vb-teal)",
  steel: "var(--vb-steel)",
  plum: "var(--vb-plum)",
  clay: "var(--vb-clay)",
  slate: "var(--vb-slate)",
  // legacy names written by earlier boards
  persimmon: "var(--vb-rust)",
  amber: "var(--vb-ochre)",
  olive: "var(--vb-moss)",
  indigo: "var(--vb-steel)",
  rose: "var(--vb-plum)",
  sky: "var(--vb-teal)",
};

const ORDER = ["var(--vb-rust)", "var(--vb-steel)", "var(--vb-ochre)", "var(--vb-moss)", "var(--vb-teal)", "var(--vb-plum)", "var(--vb-clay)", "var(--vb-slate)"];

/**
 * A theme's hue. Themes are coloured by their position on the board so that
 * neighbours never share a hue, whatever name was stored.
 */
export function themeHue(color: string | undefined, index: number): string {
  if (index >= 0) return ORDER[index % ORDER.length]!;
  return (color && PALETTE[color]) || "var(--vb-slate)";
}
