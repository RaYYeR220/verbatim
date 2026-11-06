/**
 * The legible wall: every source of the demo corpus set as faint text behind
 * the hero, with each note's exact span tinted in its theme. One theme at a
 * time, its spans ink up, lift and travel into their stack, leaving a dotted
 * gap where the words were. Hovering a sentence that holds a note shows it.
 *
 * The wall text is drawn once per page; span fragments are pre-rendered into
 * a text atlas so a frame is only image blits.
 */

export interface WallData {
  v: number;
  study: string;
  stacks: number;
  themes: { name: string; notes: number; voices: number }[];
  sources: [text: string, author: string, stars: number, date: string][];
  notes: [source: number, start: number, end: number, theme: number][];
}

export interface ShownQuote {
  id: number;
  text: string;
  author: string;
  stars: number;
  date: string;
}

export interface CardState {
  quotes: number;
  voices: number;
  on: boolean;
  done: boolean;
  shown: ShownQuote | null;
  old: ShownQuote[];
}

export interface WallOptions {
  data: WallData;
  /** One colour per stack, in stack order. */
  hues: readonly string[];
  reduce: boolean;
  onCards: (cards: CardState[]) => void;
  onPage: (page: number, pages: number) => void;
}

export interface WallPerf {
  frames: number;
  total: number;
  max: number;
}

export interface Wall {
  perf: WallPerf;
  destroy(): void;
}

type Bold = 0 | 1;
type QState = "rest" | "ink" | "lift" | "fly" | "gone";

interface Tok {
  s: number;
  e: number;
  text: string;
  lead: boolean;
  q: number;
  sq: boolean;
  sent: number;
  bold: Bold;
  br: boolean;
  x: number;
  w: number;
  li: number;
}

interface Frag {
  q: number;
  li: number;
  x: number;
  w: number;
  text: string;
  bold: Bold;
  ax: number;
  ay: number;
  aw: number;
}

interface Quote {
  i: number;
  src: number;
  s: number;
  e: number;
  theme: number;
  k: number;
  author: string;
  stars: number;
  date: string;
  view: ShownQuote;
  frags: Frag[];
  toks: number[];
  sents: Set<number>;
  page: number;
  st: QState;
}

interface Plan {
  S: number;
  L: number;
  A: number;
  on: boolean;
  below: boolean;
  side: number;
  jx: number;
  jy: number;
  arrived: boolean;
}

interface Layout {
  m: number;
  gut: number;
  N: number;
  colW: number;
  top: number;
  R: number;
  lines: number[][];
  perPage: number;
  pages: number;
  mob: boolean;
  sentToks: Map<number, number[]>;
}

interface Card extends CardState {
  auth: Set<number>;
  last: number;
  pending: Quote | null;
  pendingOn: Quote | null;
  hadOn: boolean;
}

const LH = 14;
const BASE = 10.4;
const FAMILY = '"Figtree Variable", Figtree, system-ui, sans-serif';
const FONT: readonly [string, string] = [`400 10px ${FAMILY}`, `600 10px ${FAMILY}`];
const WALL_INK: readonly [string, string] = ["rgba(27,27,25,.165)", "rgba(27,27,25,.2)"];
const NOTE_INK: readonly [string, string] = ["rgba(27,27,25,.25)", "rgba(27,27,25,.29)"];
const NEUTRAL = "#7b7a74";
const MS = 0.25;

/* timeline (seconds) */
const T0 = 0.9;
const TG = 4.1;
const INK = 0.6;
const LIFT = 0.3;
const WIN = 1.3;
const FLY = 1.2;
const HOLD = 9.5;
const REFILL = 1.5;
const REST = 0.58;

const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function formatDay(iso: string): string {
  return `${MON[Number(iso.slice(5, 7)) - 1] ?? ""} ${Number(iso.slice(8, 10))}`;
}

const easeInOut = (p: number) => (p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2);
const bez = (p0: number, p1: number, p2: number, p3: number, t: number) => {
  const u = 1 - t;
  return u * u * u * p0 + 3 * u * u * t * p1 + 3 * u * t * t * p2 + t * t * t * p3;
};
const rnd = (seed: number) => {
  let s = seed >>> 0;
  return () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296;
};
const CLOSERS = ".!?…\"'”’)]";

/** Sentence index per character: a sentence ends at . ! ? … followed by space, or at a line break. */
function sentIds(text: string, ids: Int32Array, start: number): number {
  const n = text.length;
  let id = start;
  for (let i = 0; i < n; i++) {
    ids[i] = id;
    const c = text[i];
    if (c === "\n") {
      id++;
      continue;
    }
    if (c === "." || c === "!" || c === "?" || c === "…") {
      let j = i + 1;
      while (j < n && CLOSERS.includes(text[j] ?? "")) {
        ids[j] = id;
        j++;
      }
      if (j >= n || /\s/.test(text[j] ?? "")) id++;
      i = j - 1;
    }
  }
  return id + 1;
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

export function mountWall(root: HTMLElement, opts: WallOptions): Wall {
  const { data, hues, reduce } = opts;
  const STACKS = Math.min(data.stacks, hues.length);
  const q$ = <T extends Element>(sel: string) => root.querySelector<T>(sel);

  const foundA = q$<HTMLCanvasElement>("canvas[data-wall='a']");
  const foundB = q$<HTMLCanvasElement>("canvas[data-wall='b']");
  const foundFx = q$<HTMLCanvasElement>("canvas[data-wall-fx]");
  const foundChip = q$<HTMLElement>("[data-wall-chip]");
  const foundTag = q$<HTMLElement>("[data-wall-tag]");
  const foundCtx = foundFx?.getContext("2d");
  if (!foundA || !foundB || !foundFx || !foundChip || !foundTag || !foundCtx) {
    throw new Error("wall: missing canvas or chip elements");
  }
  const cvA: HTMLCanvasElement = foundA;
  const cvB: HTMLCanvasElement = foundB;
  const fx: HTMLCanvasElement = foundFx;
  const chip: HTMLElement = foundChip;
  const tag: HTMLElement = foundTag;
  const fctx: CanvasRenderingContext2D = foundCtx;

  /* ======================= data ======================= */
  const Q: Quote[] = data.notes.map(([src, s, e, theme], i) => {
    const [, author, stars, date] = data.sources[src] ?? ["", "", 0, ""];
    const text = (data.sources[src]?.[0] ?? "").slice(s, e);
    return {
      i,
      src,
      s,
      e,
      theme,
      k: theme >= 0 && theme < STACKS ? theme : -1,
      author,
      stars,
      date,
      view: { id: i, text, author, stars, date },
      frags: [],
      toks: [],
      sents: new Set<number>(),
      page: 0,
      st: "rest",
    };
  });
  const bySource: Quote[][] = data.sources.map(() => []);
  for (const q of Q) bySource[q.src]?.push(q);
  const groups = Array.from({ length: STACKS }, (_, k) => {
    const qs = Q.filter((q) => q.k === k);
    return { qs, total: qs.length, voices: new Set(qs.map((q) => q.src)).size, hue: hues[k] ?? NEUTRAL, pat: null as CanvasPattern | null };
  });

  /* ======================= tokens + sentences ======================= */
  const TOK: Tok[] = [];
  let sentCount = 0;
  data.sources.forEach(([text], src) => {
    if (!text) return;
    const nl = text.indexOf("\n");
    const titleEnd = nl < 0 ? text.length : nl;
    const sids = new Int32Array(text.length);
    const next = sentIds(text, sids, sentCount);
    const spans = bySource[src] ?? [];
    const cuts = new Set<number>();
    for (const q of spans) {
      cuts.add(q.s);
      cuts.add(q.e);
    }
    let first = true;
    const push = (a: number, b: number, lead: boolean) => {
      let qi = -1;
      for (const q of spans) {
        if (a >= q.s && b <= q.e) {
          qi = q.i;
          break;
        }
      }
      const tk: Tok = {
        s: a,
        e: b,
        text: text.slice(a, b),
        lead,
        q: qi,
        sq: qi >= 0 && (Q[qi]?.k ?? -1) >= 0,
        sent: sids[a] ?? sentCount,
        bold: a < titleEnd ? 1 : 0,
        br: first,
        x: 0,
        w: 0,
        li: 0,
      };
      first = false;
      if (qi >= 0) Q[qi]?.toks.push(TOK.length);
      TOK.push(tk);
    };
    const re = /\S+/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text))) {
      const s = m.index;
      const e = s + m[0].length;
      let a = s;
      for (let k = s + 1; k < e; k++) {
        if (cuts.has(k)) {
          push(a, k, a === s);
          a = k;
        }
      }
      push(a, e, a === s);
    }
    sentCount = next;
  });
  const sentQ = new Map<number, number>();
  for (const t of TOK) if (t.q >= 0 && !sentQ.has(t.sent)) sentQ.set(t.sent, t.q);
  for (const t of TOK) if (t.q >= 0) Q[t.q]?.sents.add(t.sent);

  /* ======================= measurement ======================= */
  const mctx = document.createElement("canvas").getContext("2d");
  const wcache: [Map<string, number>, Map<string, number>] = [new Map(), new Map()];
  const mw = (text: string, bold: Bold) => {
    const c = wcache[bold];
    let w = c.get(text);
    if (w === undefined) {
      if (mctx) {
        mctx.font = FONT[bold];
        w = mctx.measureText(text).width;
      } else w = text.length * 5;
      c.set(text, w);
    }
    return w;
  };

  /* ======================= state ======================= */
  let W = 0;
  let H = 0;
  let DPR = 1;
  let L: Layout | null = null;
  let curWall = cvA;
  let page = 0;
  let maskCv: HTMLCanvasElement | null = null;
  let maskA = new Float32Array(1);
  let maskW = 1;
  let maskH = 1;
  let atlas: HTMLCanvasElement | null = null;
  let targets: { x: number; y: number }[] = [];
  let plan: Plan[] | null = null;
  let dirty = true;
  let vt = 0;
  let cycleN = 0;
  let refillAt = -1;
  let visible = true;
  let raf = 0;
  let lastNow = -1;
  let hover: { q: number } | { none: true } | null = null;
  const perf: WallPerf = { frames: 0, total: 0, max: 0 };
  const timers: number[] = [];

  const SORT_END = T0 + STACKS * TG + 0.6;
  const CYCLE = SORT_END + HOLD;

  const cards: Card[] = groups.map(() => ({
    quotes: 0,
    voices: 0,
    on: false,
    done: false,
    shown: null,
    old: [],
    auth: new Set<number>(),
    last: 0,
    pending: null,
    pendingOn: null,
    hadOn: false,
  }));
  let cardsDirty = true;
  const emitCards = () => {
    if (!cardsDirty) return;
    cardsDirty = false;
    opts.onCards(cards.map((c) => ({ quotes: c.quotes, voices: c.voices, on: c.on, done: c.done, shown: c.shown, old: c.old.slice() })));
  };

  /* ======================= layout ======================= */
  const pageOf = (li: number) => (L ? Math.floor(li / L.perPage) : 0);
  const lineXY = (li: number): [number, number] => {
    if (!L) return [0, 0];
    const r0 = li % L.perPage;
    const c = Math.floor(r0 / L.R);
    const r = r0 % L.R;
    return [L.m + c * (L.colW + L.gut), L.top + r * LH];
  };

  function layout() {
    const r = root.getBoundingClientRect();
    W = Math.max(1, Math.round(r.width));
    H = Math.max(1, Math.round(r.height));
    DPR = Math.min(2, window.devicePixelRatio || 1);
    const mob = W < 640;
    const m = mob ? 12 : 18;
    const gut = mob ? 16 : 22;
    const base = mob ? 158 : 214;
    const N = Math.max(2, Math.floor((W - 2 * m + gut) / (base + gut)));
    const colW = (W - 2 * m - (N - 1) * gut) / N;
    const top = 8;
    const R = Math.floor((H - top) / LH) + 1;
    const lines: number[][] = [];
    let line: number[] | null = null;
    let x = 0;
    for (let ti = 0; ti < TOK.length; ti++) {
      const t = TOK[ti]!;
      const w = mw(t.text, t.bold);
      const sp = t.lead ? mw(" ", t.bold) : 0;
      if (!line || t.br || (t.lead && x > 0 && x + sp + w > colW)) {
        line = [];
        lines.push(line);
        x = 0;
      }
      t.x = x > 0 ? x + sp : 0;
      t.w = w;
      t.li = lines.length - 1;
      x = t.x + w;
      line.push(ti);
    }
    const perPage = N * R;
    const pages = Math.max(1, Math.ceil(lines.length / perPage));
    const lay: Layout = { m, gut, N, colW, top, R, lines, perPage, pages, mob, sentToks: new Map() };
    L = lay;

    for (const q of Q) q.frags = [];
    let cur: Frag | null = null;
    for (const t of TOK) {
      if (t.q < 0) {
        cur = null;
        continue;
      }
      if (!cur || cur.q !== t.q || cur.li !== t.li || cur.bold !== t.bold) {
        cur = { q: t.q, li: t.li, x: t.x, w: t.w, text: t.text, bold: t.bold, ax: -1, ay: 0, aw: 0 };
        Q[t.q]?.frags.push(cur);
      } else {
        cur.text += (t.lead ? " " : "") + t.text;
        cur.w = t.x + t.w - cur.x;
      }
    }
    for (const q of Q) q.page = pageOf(q.frags[0]?.li ?? 0);
    TOK.forEach((t, ti) => {
      if (!sentQ.has(t.sent)) return;
      let a = lay.sentToks.get(t.sent);
      if (!a) lay.sentToks.set(t.sent, (a = []));
      a.push(ti);
    });
    page = page % pages;
    sizeCanvas(cvA);
    sizeCanvas(cvB);
    sizeCanvas(fx);
    buildPatterns();
    buildMask();
    buildAtlas(page);
    renderWall(curWall, page);
    computeTargets();
    opts.onPage(page, pages);
    dirty = true;
  }

  function sizeCanvas(cv: HTMLCanvasElement) {
    cv.width = Math.round(W * DPR);
    cv.height = Math.round(H * DPR);
    cv.style.width = `${W}px`;
    cv.style.height = `${H}px`;
  }

  /* ---------- text atlas: this page's span fragments, pre-rendered in their hue ---------- */
  function buildAtlas(p: number) {
    if (!L) return;
    const AW = 2048;
    const pa = p * L.perPage;
    const pb = pa + L.perPage;
    let x = 0;
    let y = 0;
    const all: Frag[] = [];
    for (const g of groups) {
      for (const q of g.qs) {
        const onPage = q.page === p;
        for (const f of q.frags) {
          f.ax = -1;
          if (onPage || (f.li >= pa && f.li < pb)) all.push(f);
        }
      }
    }
    for (const f of all) {
      const w = Math.ceil(f.w) + 3;
      if (x + w > AW) {
        x = 0;
        y += LH;
      }
      f.ax = x;
      f.ay = y;
      f.aw = w;
      x += w;
    }
    const AH = y + LH;
    const cv = atlas ?? document.createElement("canvas");
    cv.width = AW * DPR;
    cv.height = AH * DPR;
    const c = cv.getContext("2d");
    if (!c) return;
    c.setTransform(DPR, 0, 0, DPR, 0, 0);
    c.clearRect(0, 0, AW, AH);
    c.textBaseline = "alphabetic";
    for (const f of all) {
      c.font = FONT[f.bold];
      c.fillStyle = groups[Q[f.q]?.k ?? 0]?.hue ?? NEUTRAL;
      c.fillText(f.text, f.ax + 1, f.ay + BASE);
    }
    atlas = cv;
  }

  /* dotted "gap" pattern per hue */
  function buildPatterns() {
    for (const g of groups) {
      const p = document.createElement("canvas");
      p.width = 3 * DPR;
      p.height = DPR;
      const pc = p.getContext("2d");
      if (!pc) continue;
      pc.fillStyle = g.hue;
      pc.fillRect(0, 0, 1.2 * DPR, DPR);
      g.pat = fctx.createPattern(p, "repeat");
      g.pat?.setTransform(new DOMMatrix([1 / DPR, 0, 0, 1 / DPR, 0, 0]));
    }
  }

  /* ---------- clearing mask: a soft frosted field behind every block of copy ---------- */
  function buildMask() {
    const hr = root.getBoundingClientRect();
    maskW = Math.max(1, Math.ceil(W * MS));
    maskH = Math.max(1, Math.ceil(H * MS));
    const cv = maskCv ?? document.createElement("canvas");
    cv.width = maskW;
    cv.height = maskH;
    const c = cv.getContext("2d", { willReadFrequently: true });
    if (!c) return;
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.clearRect(0, 0, maskW, maskH);
    c.setTransform(MS, 0, 0, MS, 0, 0);
    const rects: [number, number, number, number][] = [];
    const add = (r: DOMRect, px: number, py: number) =>
      rects.push([r.left - hr.left - px, r.top - hr.top - py, r.width + 2 * px, r.height + 2 * py]);
    const lineRects = (node: Element, px: number, py: number) => {
      const rg = document.createRange();
      rg.selectNodeContents(node);
      for (const r of Array.from(rg.getClientRects())) if (r.width > 2) add(r, px, py);
    };
    const top = q$("[data-frost-top]")?.getBoundingClientRect();
    const bottom = q$("[data-frost-bottom]")?.getBoundingClientRect();
    if (top && bottom) {
      const cx = (top.left + top.right) / 2 - hr.left;
      const cy = (top.top + bottom.bottom) / 2 - hr.top;
      const rx = Math.max(1, top.width * 0.62);
      const ry = Math.max(1, (bottom.bottom - top.top) * 0.78);
      c.save();
      c.translate(cx, cy);
      c.scale(rx, ry);
      const gr = c.createRadialGradient(0, 0, 0, 0, 0, 1);
      gr.addColorStop(0, "rgba(0,0,0,.6)");
      gr.addColorStop(0.7, "rgba(0,0,0,.3)");
      gr.addColorStop(1, "rgba(0,0,0,0)");
      c.fillStyle = gr;
      c.beginPath();
      c.arc(0, 0, 1, 0, Math.PI * 2);
      c.fill();
      c.restore();
    }
    root.querySelectorAll<HTMLElement>("[data-clear]").forEach((node) => {
      const [px = 14, py = 8] = (node.dataset.clearPad ?? "").split(",").filter(Boolean).map(Number);
      const mode = node.dataset.clear;
      if (mode === "lines") lineRects(node, px, py);
      else if (mode === "spans") node.querySelectorAll("[data-line]").forEach((ln) => Array.from(ln.getClientRects()).forEach((r) => add(r, px, py)));
      else add(node.getBoundingClientRect(), px, py);
    });
    c.shadowColor = "#000";
    c.shadowBlur = 26 * MS;
    c.fillStyle = "#000";
    for (const [x, y, w, h] of rects) c.fillRect(x, y, w, h);
    c.shadowBlur = 0;
    maskCv = cv;
    const d = c.getImageData(0, 0, maskW, maskH).data;
    maskA = new Float32Array(maskW * maskH);
    for (let i = 0; i < maskA.length; i++) maskA[i] = (d[i * 4 + 3] ?? 0) / 255;
  }
  /** How much of the wall shows through at (x, y): 0..1. */
  const vis = (x: number, y: number) => {
    const mx = Math.min(maskW - 1, Math.max(0, (x * MS) | 0));
    const my = Math.min(maskH - 1, Math.max(0, (y * MS) | 0));
    return 1 - (maskA[my * maskW + mx] ?? 0);
  };

  /* ---------- the wall (everything but the stack spans), drawn once per page ---------- */
  function renderWall(cv: HTMLCanvasElement, p: number) {
    const c = cv.getContext("2d");
    if (!c || !L) return;
    c.setTransform(DPR, 0, 0, DPR, 0, 0);
    c.globalCompositeOperation = "source-over";
    c.clearRect(0, 0, W, H);
    c.textBaseline = "alphabetic";
    const a = p * L.perPage;
    const b = Math.min(L.lines.length, a + L.perPage);
    for (let li = a; li < b; li++) {
      const [lx, ly] = lineXY(li);
      let run = "";
      let rx = 0;
      let rb: Bold = 0;
      let rn = false;
      const flush = () => {
        if (run) {
          c.font = FONT[rb];
          c.fillStyle = (rn ? NOTE_INK : WALL_INK)[rb];
          c.fillText(run, lx + rx, ly + BASE);
        }
        run = "";
      };
      for (const ti of L.lines[li] ?? []) {
        const t = TOK[ti]!;
        if (t.sq) {
          flush();
          continue;
        }
        const isNote = t.q >= 0;
        if (!run || t.bold !== rb || isNote !== rn) {
          flush();
          run = t.text;
          rx = t.x;
          rb = t.bold;
          rn = isNote;
        } else run += (t.lead ? " " : "") + t.text;
      }
      flush();
    }
    if (maskCv) {
      c.globalCompositeOperation = "destination-out";
      c.drawImage(maskCv, 0, 0, W, H);
      c.globalCompositeOperation = "source-over";
    }
  }

  /* ---------- where each stack receives its quotes ---------- */
  function computeTargets() {
    const hr = root.getBoundingClientRect();
    targets = groups.map((_, k) => {
      const r = q$(`[data-stack='${k}']`)?.getBoundingClientRect();
      if (!r) return { x: W / 2, y: H - 120 };
      return L?.mob
        ? { x: r.left - hr.left + 14, y: r.top - hr.top + r.height / 2 - 6 }
        : { x: r.left - hr.left + 14, y: r.top - hr.top + 80 };
    });
  }

  /* ======================= timeline ======================= */
  const posOf = (q: Quote): [number, number] => {
    const f = q.frags[0];
    if (!f) return [0, 0];
    const [lx, ly] = lineXY(f.li);
    return [lx + f.x, ly];
  };
  const dist = (q: Quote, tg: { x: number; y: number }) => {
    const [x, y] = posOf(q);
    return Math.hypot(x - tg.x, y - tg.y);
  };

  function makePlan() {
    const R = rnd(7 + cycleN * 31);
    const next: Plan[] = new Array(Q.length);
    groups.forEach((g, k) => {
      const S = T0 + k * TG;
      const tg = targets[k] ?? { x: W / 2, y: H };
      const on = g.qs.filter((q) => q.page === page).sort((a, b) => dist(b, tg) - dist(a, tg));
      const off = g.qs.filter((q) => q.page !== page);
      on.forEach((q, n) => {
        const L0 = S + INK + LIFT + (on.length > 1 ? (n / (on.length - 1)) * (WIN * 0.8) : 0);
        next[q.i] = { S, L: L0, A: L0 + FLY + R() * 0.25, on: true, below: false, side: Math.sign(posOf(q)[0] - W / 2 || R() - 0.5), jx: R(), jy: R(), arrived: false };
      });
      off.forEach((q) => {
        const L0 = S + INK + LIFT + 0.1 + R() * (WIN + 0.4);
        next[q.i] = { S, L: L0, A: L0 + FLY * 0.95 + R() * 0.2, on: false, below: q.page > page, side: R() < 0.5 ? -1 : 1, jx: R(), jy: R(), arrived: false };
      });
    });
    plan = next;
  }

  function flightPath(q: Quote, pl: Plan): [number, number, number, number, number, number, number, number] {
    const tg = targets[q.k] ?? { x: W / 2, y: H };
    let x0: number;
    let y0: number;
    if (pl.on) [x0, y0] = posOf(q);
    else {
      const f = q.frags[0];
      const [lx] = f ? lineXY(f.li) : [0];
      x0 = tg.x + Math.max(-240, Math.min(240, lx + (f?.x ?? 0) - tg.x));
      y0 = pl.below ? H + 16 + pl.jy * 90 : -30 - pl.jy * 150;
    }
    const tx = tg.x + (pl.jx - 0.5) * 30;
    const ty = tg.y + (pl.jy - 0.5) * 10;
    let c1x: number;
    let c1y: number;
    let c2x: number;
    let c2y: number;
    if (pl.on) {
      const out = pl.side * Math.min(220, 80 + Math.abs(x0 - W / 2) * 0.25);
      c1x = x0 + out;
      c1y = y0 - 26;
      c2x = tx + pl.side * 70;
      c2y = ty - 150 - pl.jy * 60;
    } else if (pl.below) {
      c1x = x0;
      c1y = H - 40;
      c2x = tx + pl.side * 40;
      c2y = ty + 110;
    } else {
      c1x = x0 + pl.side * 260;
      c1y = y0 + 260;
      c2x = tx + pl.side * 90;
      c2y = ty - 160;
    }
    return [x0, y0, c1x, c1y, c2x, c2y, tx, ty];
  }

  /* ---------- stacks ---------- */
  function showQuote(cd: Card, q: Quote) {
    if (cd.shown?.id === q.i) return;
    if (cd.shown && !L?.mob) {
      cd.old.unshift(cd.shown);
      cd.old.length = Math.min(cd.old.length, 2);
    }
    cd.shown = q.view;
    cardsDirty = true;
  }
  function resetCards() {
    for (const cd of cards) {
      cd.quotes = 0;
      cd.voices = 0;
      cd.auth.clear();
      cd.shown = null;
      cd.old = [];
      cd.pending = cd.pendingOn = null;
      cd.last = 0;
      cd.hadOn = false;
      cd.on = cd.done = false;
    }
    cardsDirty = true;
  }
  function arrive(q: Quote, pl: Plan) {
    const cd = cards[q.k];
    if (!cd) return;
    cd.quotes++;
    cd.auth.add(q.src);
    cd.voices = cd.auth.size;
    cd.pending = q;
    if (pl.on) cd.pendingOn = q;
    cardsDirty = true;
  }
  /** Each stack shows the newest quote the visitor actually saw leave the wall. */
  function flushCards(t: number) {
    for (const cd of cards) {
      if (t - cd.last < 0.42) continue;
      let q = cd.pendingOn;
      if (!q && cd.pending && !cd.hadOn) q = cd.pending;
      if (!q) continue;
      showQuote(cd, q);
      cd.last = t;
      if (q === cd.pendingOn) cd.hadOn = true;
      cd.pending = cd.pendingOn = null;
    }
  }
  function keyState() {
    resetCards();
    cards.forEach((cd, k) => {
      const g = groups[k]!;
      cd.quotes = g.total;
      cd.voices = g.voices;
      const on = g.qs.filter((q) => q.page === page);
      const pick = on.length ? on : g.qs;
      if (pick[1]) showQuote(cd, pick[1]);
      if (pick[0]) showQuote(cd, pick[0]);
      cd.done = true;
    });
    cardsDirty = true;
    dirty = true;
  }

  /* ======================= drawing ======================= */
  function drawFrag(f: Frag, x: number, y: number, alpha: number) {
    if (alpha <= 0.003 || f.ax < 0 || !atlas) return;
    fctx.globalAlpha = alpha;
    fctx.drawImage(atlas, f.ax * DPR, f.ay * DPR, f.aw * DPR, LH * DPR, x - 1, y, f.aw, LH);
  }

  function draw(t: number) {
    if (!L) return;
    const t0 = performance.now();
    const c = fctx;
    c.setTransform(DPR, 0, 0, DPR, 0, 0);
    c.globalAlpha = 1;
    c.clearRect(0, 0, W, H);
    const pa = page * L.perPage;
    const pb = pa + L.perPage;
    const refillP = refillAt >= 0 ? Math.min(1, (t - refillAt) / REFILL) : 1;
    const hq = hover && "q" in hover ? hover.q : -1;
    const hQuote = hq >= 0 ? Q[hq] : undefined;

    // 1) the sentence under the pointer, lit beneath the spans
    if (hQuote) {
      c.textBaseline = "alphabetic";
      for (const sid of hQuote.sents) {
        for (const ti of L.sentToks.get(sid) ?? []) {
          const tk = TOK[ti]!;
          if (tk.sq || tk.li < pa || tk.li >= pb) continue;
          const [lx, ly] = lineXY(tk.li);
          const own = tk.q === hq;
          c.globalAlpha = own ? 0.92 : 0.74 * Math.max(0.25, vis(lx + tk.x, ly + 7));
          c.font = FONT[tk.bold];
          c.fillStyle = "#1b1b19";
          c.fillText(tk.text, lx + tk.x, ly + BASE);
        }
      }
      if (hQuote.k < 0) {
        c.globalAlpha = 0.7;
        c.fillStyle = NEUTRAL;
        for (const f of hQuote.frags) {
          if (f.li < pa || f.li >= pb) continue;
          const [lx, ly] = lineXY(f.li);
          c.fillRect(lx + f.x, ly + BASE + 2, f.w, 1);
        }
      }
    }

    // 2) stack spans on this page: rest, ink, lifted, or the gap they left
    for (const g of groups) {
      for (const q of g.qs) {
        const pl = plan?.[q.i];
        let st: QState = "rest";
        let p = 0;
        if (reduce) st = "gone";
        else if (pl && refillAt < 0) {
          if (t >= pl.A) st = "gone";
          else if (t >= pl.L) st = "fly";
          else if (t >= pl.S + INK) {
            st = "lift";
            p = Math.min(1, (t - pl.S - INK) / LIFT);
          } else if (t >= pl.S) {
            st = "ink";
            p = (t - pl.S) / INK;
          }
        }
        q.st = st;
        const lit = q.i === hq;
        for (const f of q.frags) {
          if (f.li < pa || f.li >= pb) continue;
          const [lx, ly] = lineXY(f.li);
          const x = lx + f.x;
          const v = vis(x + f.w * 0.5, ly + 7);
          if (st === "gone" || st === "fly") {
            if (st === "fly" && pl && t - pl.L < 0.5) continue;
            const ga = (lit ? 0.85 : 0.42) * Math.max(lit ? 0.4 : 0, v);
            if (ga > 0.01 && g.pat) {
              c.globalAlpha = ga;
              c.fillStyle = g.pat;
              c.fillRect(x, ly + BASE + 1.5, f.w, 1);
            }
            continue;
          }
          let a = REST;
          let dy = 0;
          let ul = 0;
          if (st === "ink") {
            a = REST + (1 - REST) * p;
            ul = p;
          } else if (st === "lift") {
            a = 1;
            ul = 1;
            dy = -3 * easeInOut(p);
          }
          if (lit) {
            a = 1;
            ul = 1;
          }
          a *= (lit ? Math.max(0.45, v) : v) * refillP;
          drawFrag(f, x, ly + dy, a);
          if (ul > 0 && a > 0.02) {
            c.globalAlpha = a * ul * 0.9;
            c.fillStyle = g.hue;
            c.fillRect(x, ly + dy + BASE + 2, f.w, 1);
          }
        }
      }
    }

    // 3) spans in flight: above the clearing, beneath the copy
    if (plan && refillAt < 0 && !reduce) {
      const mob = L.mob;
      for (const g of groups) {
        for (const q of g.qs) {
          const pl = plan[q.i];
          if (!pl || t < pl.L || t >= pl.A) continue;
          const pr = (t - pl.L) / (pl.A - pl.L);
          const e = easeInOut(pr);
          const P = flightPath(q, pl);
          const bx = bez(P[0], P[2], P[4], P[6], e);
          const by = bez(P[1], P[3], P[5], P[7], e);
          let a = pr > 0.68 ? 1 - (pr - 0.68) / 0.32 : 1;
          const floor = mob ? 0.1 : 0.32;
          const k2 = Math.min(1, Math.max(0, (pr - 0.62) / 0.25));
          a *= (floor + (1 - floor) * vis(bx + 20, by + 7)) * (1 - k2) + k2;
          if (pl.on) {
            const [ox, oy] = posOf(q);
            const v0 = vis(ox + 10, oy + 7);
            a *= v0 + (1 - v0) * Math.min(1, pr / 0.3);
          } else a *= Math.min(1, pr / 0.2) * 0.8;
          if (a <= 0.003) continue;
          const f0 = q.frags[0];
          if (!f0) continue;
          if (!pl.on) {
            // spans from other pages of the wall travel as quiet line silhouettes
            c.globalAlpha = a * 0.5;
            c.fillStyle = g.hue;
            const n = Math.min(3, q.frags.length);
            for (let k = 0; k < n; k++) {
              const f = q.frags[k]!;
              c.fillRect(bx + (k === 0 ? 0 : f.x - f0.x) * 0.5, by + k * 4, Math.max(8, f.w * 0.5), 1.5);
            }
            continue;
          }
          const s = 1 + 0.12 * Math.sin(Math.PI * e);
          c.globalAlpha = a;
          for (let k = 0; k < q.frags.length; k++) {
            const f = q.frags[k]!;
            if (f.ax < 0 || !atlas) continue;
            const dx = (k === 0 ? 0 : f.x - f0.x) * s;
            const dy = k * LH * s;
            c.drawImage(atlas, f.ax * DPR, f.ay * DPR, f.aw * DPR, LH * DPR, bx + dx - 1, by + dy, f.aw * s, LH * s);
          }
        }
      }
    }
    c.globalAlpha = 1;
    const dt = performance.now() - t0;
    perf.frames++;
    perf.total += dt;
    if (dt > perf.max) perf.max = dt;
  }

  /* ======================= loop ======================= */
  function setPhases(t: number) {
    groups.forEach((_, k) => {
      const S = T0 + k * TG;
      const E = S + TG;
      const on = t >= S && t < E;
      const done = on || t >= E - 0.4;
      const cd = cards[k]!;
      if (cd.on !== on || cd.done !== done) {
        cd.on = on;
        cd.done = done;
        cardsDirty = true;
      }
    });
  }

  function tick(now: number) {
    raf = requestAnimationFrame(tick);
    const dt = lastNow < 0 ? 0 : Math.min(0.1, (now - lastNow) / 1000);
    lastNow = now;
    if (!visible) return;
    vt += dt;
    let animating = false;
    if (refillAt >= 0) {
      animating = true;
      if (vt - refillAt >= REFILL) {
        refillAt = -1;
        vt = 0;
        cycleN++;
        makePlan();
      }
    } else if (plan) {
      for (const q of Q) {
        const pl = plan[q.i];
        if (pl && !pl.arrived && vt >= pl.A) {
          pl.arrived = true;
          arrive(q, pl);
        }
      }
      flushCards(vt);
      setPhases(vt);
      animating = vt < SORT_END + 0.6;
      if (vt >= CYCLE) startRefill();
    }
    if (animating || dirty) {
      draw(vt);
      dirty = false;
    }
    emitCards();
  }

  function startRefill() {
    if (!L) return;
    refillAt = vt;
    page = (page + 1) % L.pages;
    const next = curWall === cvA ? cvB : cvA;
    buildAtlas(page);
    renderWall(next, page);
    next.style.opacity = "1";
    curWall.style.opacity = "0";
    curWall = next;
    opts.onPage(page, L.pages);
    plan = null;
    resetCards();
  }

  function idle() {
    raf = requestAnimationFrame(idle);
    if (dirty && visible) {
      draw(0);
      dirty = false;
    }
    emitCards();
  }

  /* ======================= hover: only real notes light up ======================= */
  function hitTest(x: number, y: number): Tok | null {
    if (!L || vis(x, y) < 0.35) return null;
    const pitch = L.colW + L.gut;
    const col = Math.floor((x - L.m + L.gut / 2) / pitch);
    if (col < 0 || col >= L.N) return null;
    const row = Math.floor((y - L.top) / LH);
    if (row < 0 || row >= L.R) return null;
    const toks = L.lines[page * L.perPage + col * L.R + row];
    if (!toks?.length) return null;
    const rx = x - (L.m + col * pitch);
    let best = -1;
    let bd = 1e9;
    for (const ti of toks) {
      const t = TOK[ti]!;
      const d = rx < t.x ? t.x - rx : rx > t.x + t.w ? rx - t.x - t.w : 0;
      if (d < bd) {
        bd = d;
        best = ti;
      }
    }
    return bd > 26 ? null : (TOK[best] ?? null);
  }

  function fillChip(q: Quote) {
    const filed = q.st === "gone" || q.st === "fly";
    const hue = q.k >= 0 ? (groups[q.k]?.hue ?? NEUTRAL) : NEUTRAL;
    const head = el("div", "vbl-ch-t");
    const sw = el("i", "vbl-sw");
    sw.style.background = hue;
    head.append(sw, document.createTextNode(data.themes[q.theme]?.name ?? ""));
    const meta = `${q.author} · ★ ${q.stars} · ${formatDay(q.date)} · chars ${q.s}–${q.e}${filed ? " · lifted to its stack" : ""}`;
    chip.replaceChildren(head, el("p", "vbl-ch-q", `“${q.view.text}”`), el("p", "vbl-ch-m", meta));
  }

  function clearHover() {
    if (hover && "q" in hover) dirty = true;
    hover = null;
    chip.classList.remove("is-shown");
    tag.classList.remove("is-shown");
  }

  function onMove(ev: PointerEvent) {
    if (!L || ev.pointerType === "touch") return;
    const target = ev.target instanceof Element ? ev.target : null;
    if (target?.closest("a,button,[data-stack],[data-no-wall-hover]")) return clearHover();
    const hr = root.getBoundingClientRect();
    const x = ev.clientX - hr.left;
    const y = ev.clientY - hr.top;
    const tk = hitTest(x, y);
    if (!tk) return clearHover();
    const qi = tk.q >= 0 ? tk.q : (sentQ.get(tk.sent) ?? -1);
    if (qi < 0) {
      if (hover && "q" in hover) dirty = true;
      hover = { none: true };
      chip.classList.remove("is-shown");
      tag.style.transform = `translate(${Math.min(W - 230, x + 14)}px,${y + 16}px)`;
      tag.classList.add("is-shown");
      return;
    }
    tag.classList.remove("is-shown");
    const q = Q[qi];
    if (!q) return clearHover();
    if (!hover || !("q" in hover) || hover.q !== qi) {
      hover = { q: qi };
      dirty = true;
      fillChip(q);
    }
    const cw = chip.offsetWidth || 320;
    const ch = chip.offsetHeight || 120;
    let cx = x + 16;
    let cy = y + 18;
    if (cx + cw > W - 10) cx = x - cw - 16;
    if (cy + ch > H - 10) cy = y - ch - 14;
    chip.style.transform = `translate(${Math.max(8, cx)}px,${Math.max(8, cy)}px)`;
    chip.classList.add("is-shown");
  }

  /* ======================= boot ======================= */
  function refreshGeometry() {
    if (!L) return;
    buildMask();
    renderWall(curWall, page);
    computeTargets();
    dirty = true;
  }

  function restart() {
    refillAt = -1;
    layout();
    if (reduce) keyState();
    else {
      resetCards();
      vt = 0;
      makePlan();
    }
    dirty = true;
  }

  let lastSize = "";
  let resizeT = 0;
  const onResize = () => {
    window.clearTimeout(resizeT);
    resizeT = window.setTimeout(() => {
      const r = root.getBoundingClientRect();
      const size = `${Math.round(r.width)}x${Math.round(r.height)}`;
      if (size === lastSize) return;
      lastSize = size;
      restart();
    }, 140);
  };

  const io = new IntersectionObserver((entries) => {
    for (const en of entries) {
      visible = en.isIntersecting;
      if (visible) dirty = true;
    }
  });

  layout();
  const r0 = root.getBoundingClientRect();
  lastSize = `${Math.round(r0.width)}x${Math.round(r0.height)}`;
  if (reduce) {
    keyState();
    draw(0);
    raf = requestAnimationFrame(idle);
  } else {
    makePlan();
    raf = requestAnimationFrame(tick);
  }
  emitCards();
  // the copy settles after its entrance; re-cut the clearing where it landed
  timers.push(window.setTimeout(refreshGeometry, reduce ? 0 : 1500));
  void document.fonts?.ready.then(() => timers.push(window.setTimeout(refreshGeometry, 50)));

  root.addEventListener("pointermove", onMove);
  root.addEventListener("pointerleave", clearHover);
  window.addEventListener("resize", onResize);
  io.observe(root);

  return {
    perf,
    destroy() {
      cancelAnimationFrame(raf);
      window.clearTimeout(resizeT);
      for (const id of timers) window.clearTimeout(id);
      root.removeEventListener("pointermove", onMove);
      root.removeEventListener("pointerleave", clearHover);
      window.removeEventListener("resize", onResize);
      io.disconnect();
      clearHover();
    },
  };
}
