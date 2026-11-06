import { agentNativePath, appPath } from "@agent-native/core/client/api-path";
import { useEffect, useLayoutEffect, useRef, useState } from "react";

import { formatDay } from "./format";
import { OpenBoardButton } from "./OpenBoardButton";
import type { CardState, ShownQuote, Wall, WallData } from "./wall-engine";
import { WALL_SUMMARY, type StackHue } from "./wall-summary";

export const HUES: Record<StackHue, string> = {
  moss: "#5f8f4e",
  rust: "#c8553d",
  steel: "#4f6fb0",
  teal: "#2f8a8a",
  ochre: "#c99a2e",
};
export const REFUSED = 9;

const STACKS = WALL_SUMMARY.stacks;
const STACK_HUES = STACKS.map((s) => HUES[s.hue]);
const FONT_LOADS = [
  '400 10px "Figtree Variable"',
  '600 10px "Figtree Variable"',
  '500 104px "General Sans"',
];

/** What the stacks show before (and without) the wall: the real totals. */
const KEY_CARDS: CardState[] = STACKS.map((s) => ({
  quotes: s.notes,
  voices: s.voices,
  on: false,
  done: false,
  shown: null,
  old: [],
}));
const WAITING_CARDS: CardState[] = STACKS.map(() => ({
  quotes: 0,
  voices: 0,
  on: false,
  done: false,
  shown: null,
  old: [],
}));

const useIsoLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

function waitForFonts(): Promise<void> {
  const fonts = document.fonts;
  if (!fonts) return Promise.resolve();
  const loads = Promise.all([...FONT_LOADS.map((f) => fonts.load(f)), fonts.ready]).then(
    () => undefined,
    () => undefined,
  );
  return Promise.race([loads, new Promise<void>((r) => window.setTimeout(r, 2600))]);
}

function StackQuote({ q }: { q: ShownQuote }) {
  const ref = useRef<HTMLParagraphElement>(null);
  const [clip, setClip] = useState(false);
  useIsoLayoutEffect(() => {
    const p = ref.current;
    setClip(Boolean(p && p.scrollHeight > p.clientHeight + 1));
  }, [q.id]);
  return (
    <div className="vbl-st-in">
      <p ref={ref} className="vbl-st-q" data-clip={clip || undefined}>
        “{q.text}”
      </p>
      <p className="vbl-st-meta">
        {q.author} · ★ {q.stars} · {formatDay(q.date)}
      </p>
    </div>
  );
}

function Stack({ index, card }: { index: number; card: CardState }) {
  const s = STACKS[index];
  if (!s) return null;
  const old = card.old[0];
  return (
    <div
      className="vbl-stack"
      data-stack={index}
      data-on={card.on || undefined}
      data-done={card.done || undefined}
      style={{ "--c": HUES[s.hue] } as React.CSSProperties}
    >
      <div className="vbl-st-head">
        <i className="vbl-sw" aria-hidden="true" />
        <span title={s.name}>{s.name}</span>
      </div>
      <div className="vbl-st-count">
        <b>{card.quotes}</b> quotes · <b>{card.voices}</b> voices
      </div>
      <div className="vbl-st-body">
        {card.shown ? (
          <>
            <StackQuote key={card.shown.id} q={card.shown} />
            {old ? <p className="vbl-st-old">“{old.text}”</p> : null}
          </>
        ) : (
          <>
            <div className="vbl-st-skel" aria-hidden="true">
              <i />
              <i />
              <i />
            </div>
            {card.quotes === 0 ? <p className="vbl-st-wait">waiting for the agent</p> : null}
          </>
        )}
      </div>
    </div>
  );
}

function Mark() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
      <rect x="1" y="1" width="16" height="16" rx="2" fill="#1b1b19" />
      <rect x="4" y="5.5" width="10" height="1.6" rx=".8" fill="#f1f1ee" opacity=".38" />
      <rect x="4" y="8.6" width="6.5" height="1.6" rx=".8" fill="#c8553d" />
      <rect x="4" y="11.7" width="8" height="1.6" rx=".8" fill="#f1f1ee" opacity=".38" />
    </svg>
  );
}

export function Wordmark({ className = "vbl-mark" }: { className?: string }) {
  return (
    <span className={className}>
      <Mark />
      Verbatim
    </span>
  );
}

const SR_WALL =
  `Behind the headline, the full text of ${WALL_SUMMARY.sources} public App Store reviews of Notion for iOS forms a wall. ` +
  `Each of the ${WALL_SUMMARY.notes} exact quotes in it is tinted by theme, and the five largest themes lift out into stacks: ` +
  STACKS.map((s) => `${s.name}, ${s.notes} quotes from ${s.voices} reviewers`).join("; ") +
  ".";

export function Hero() {
  const rootRef = useRef<HTMLElement>(null);
  const [cards, setCards] = useState<CardState[]>(KEY_CARDS);
  const [wallPage, setWallPage] = useState<{ page: number; pages: number } | null>(null);
  const [ready, setReady] = useState(false);
  const [mobile, setMobile] = useState(false);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    setMobile(window.matchMedia("(max-width: 860px)").matches);
    if (!reduce) setCards(WAITING_CARDS);
    const ctrl = new AbortController();
    let wall: Wall | null = null;
    let cancelled = false;
    void (async () => {
      try {
        const [res, engine] = await Promise.all([
          fetch(appPath("/landing/wall.json"), { signal: ctrl.signal }),
          import("./wall-engine"),
        ]);
        if (!res.ok) throw new Error(`wall: ${res.status}`);
        const data = (await res.json()) as WallData;
        await waitForFonts();
        if (cancelled) return;
        wall = engine.mountWall(root, {
          data,
          hues: STACK_HUES,
          reduce,
          onCards: setCards,
          onPage: (page, pages) => setWallPage({ page, pages }),
        });
        if (import.meta.env.DEV) Object.assign(window, { __verbatimWall: wall });
        setReady(true);
      } catch {
        if (!cancelled) setCards(KEY_CARDS);
      }
    })();
    return () => {
      cancelled = true;
      ctrl.abort();
      wall?.destroy();
    };
  }, []);

  return (
    <section className="vbl-hero" ref={rootRef} aria-labelledby="vbl-h1" data-wall-ready={ready || undefined}>
      <div className="vbl-walls" aria-hidden="true">
        <canvas className="vbl-wall" data-wall="a" />
        <canvas className="vbl-wall" data-wall="b" style={{ opacity: 0 }} />
        <canvas className="vbl-wall" data-wall-fx="" />
      </div>

      <header className="vbl-nav">
        <a
          className="vbl-reveal"
          style={{ "--i": 0 } as React.CSSProperties}
          href={appPath("/")}
          aria-label="Verbatim home"
          data-clear="box"
          data-clear-pad="14,12"
        >
          <Wordmark />
        </a>
        <nav className="vbl-links vbl-reveal" style={{ "--i": 1 } as React.CSSProperties} aria-label="Primary" data-clear="box" data-clear-pad="14,12">
          <a href="#how">How it works</a>
          <a href="#verified">Proof</a>
          <a className="vbl-signin" href={agentNativePath("/_agent-native/sign-in")}>
            Sign in
          </a>
          <a className="vbl-open" href={appPath("/studies")}>
            Open app
          </a>
        </nav>
      </header>

      <div className="vbl-stage">
        <a
          className="vbl-eyebrow vbl-reveal"
          style={{ "--i": 1 } as React.CSSProperties}
          href="#agent-native"
          data-clear="box"
          data-clear-pad="14,8"
        >
          <i aria-hidden="true">
            {STACKS.map((s) => (
              <b key={s.hue} style={{ background: HUES[s.hue] }} />
            ))}
          </i>
          Built on Agent-Native
        </a>
        <h1
          id="vbl-h1"
          className="vbl-h1 vbl-reveal"
          style={{ "--i": 2 } as React.CSSProperties}
          data-clear="spans"
          data-clear-pad="18,-4"
          data-frost-top=""
        >
          <span data-line="">Every insight, in the</span>
          <span className="vbl-br" /> <span data-line="">customer’s own words.</span>
        </h1>
        <p className="vbl-sub vbl-reveal" style={{ "--i": 3 } as React.CSSProperties} data-clear="lines" data-clear-pad="16,6">
          Drop in interviews, calls and feedback. Verbatim’s agent cuts every source into exact quotes and sorts them into
          themes with you, live, on one board. Nothing on it is paraphrased.
        </p>
        <div
          className="vbl-actions vbl-reveal"
          style={{ "--i": 4 } as React.CSSProperties}
          data-clear="box"
          data-clear-pad="18,10"
          data-frost-bottom=""
        >
          <OpenBoardButton />
          <a className="vbl-more" href="#verified">
            How quotes are verified
          </a>
        </div>
        <p className="vbl-proof vbl-reveal" style={{ "--i": 5 } as React.CSSProperties} data-clear="lines" data-clear-pad="14,6">
          {WALL_SUMMARY.sources} sources · {WALL_SUMMARY.notes} exact quotes · {REFUSED} paraphrases refused
        </p>
        <div
          className="vbl-stacks vbl-reveal"
          style={{ "--i": 6 } as React.CSSProperties}
          aria-label={`Quotes sorted into the ${STACKS.length} largest themes`}
          role="group"
          data-clear="box"
          data-clear-pad="14,14"
        >
          {cards.map((card, i) => (
            <Stack key={STACKS[i]?.name ?? i} index={i} card={card} />
          ))}
        </div>
      </div>

      <div className="vbl-foot vbl-reveal" style={{ "--i": 7 } as React.CSSProperties}>
        <span data-clear="lines" data-clear-pad="12,6">
          Live demo corpus · <b>{WALL_SUMMARY.sources}</b> public App Store reviews of Notion for iOS
        </span>
        {wallPage ? (
          <span data-clear="lines" data-clear-pad="12,6">
            wall: all <b>{WALL_SUMMARY.sources}</b> reviews · <b>{WALL_SUMMARY.notes}</b> exact spans · page{" "}
            <b>{wallPage.page + 1}</b>/{wallPage.pages}
            {mobile ? "" : " · hover a sentence"}
          </span>
        ) : null}
      </div>

      <div className="vbl-chip" data-wall-chip="" aria-hidden="true" />
      <div className="vbl-tag" data-wall-tag="" aria-hidden="true">
        no exact span · stays on the wall
      </div>
      <p className="sr-only">{SR_WALL}</p>
    </section>
  );
}
