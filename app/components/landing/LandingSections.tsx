import { agentNativePath, appPath } from "@agent-native/core/client/api-path";

import { formatDate, formatDay } from "./format";
import { HUES, REFUSED, Wordmark } from "./Hero";
import { WALL_SUMMARY } from "./wall-summary";

/** The single-prompt baseline, measured on the same 500 reviews with the same model. */
const BASELINE = {
  voices: 186,
  themes: 33,
  quotes: 192,
  measured: "Nov 6 2026",
};

const KINDS = [
  "Interviews",
  "Clips calls",
  "App Store reviews",
  "Support tickets",
  "CSV",
  "Webhook",
];

export function HowItWorks() {
  const { insight } = WALL_SUMMARY;
  const hue =
    HUES[
      WALL_SUMMARY.stacks.find((s) => s.name === insight.theme)?.hue ?? "rust"
    ];
  return (
    <section className="vbl-sec" id="how" aria-labelledby="vbl-how">
      <div className="vbl-wrap">
        <p className="vbl-kicker">How it works</p>
        <h2 className="vbl-h2" id="vbl-how">
          From raw evidence to a board anyone can check.
        </h2>
        <ol className="vbl-steps">
          <li className="vbl-step">
            <span className="vbl-step-n">1</span>
            <h3>Drop in the evidence</h3>
            <p>
              Interviews, Clips calls, reviews, support tickets, a CSV export or
              a webhook. Every source stays whole, so every quote keeps its
              exact place in it.
            </p>
            <div className="vbl-step-x">
              <ul className="vbl-kinds" aria-label="Source kinds">
                {KINDS.map((k) => (
                  <li key={k}>{k}</li>
                ))}
              </ul>
            </div>
          </li>
          <li className="vbl-step">
            <span className="vbl-step-n">2</span>
            <h3>Sort it together</h3>
            <p>
              The agent cuts verbatim quotes and files them into themes. You
              drag, rename and comment; it follows your moves instead of undoing
              them.
            </p>
            <div className="vbl-step-x">
              <figure
                className="vbl-note"
                style={{ "--c": hue } as React.CSSProperties}
              >
                <blockquote>“{insight.example.text}”</blockquote>
                <figcaption>
                  <span>
                    {insight.example.author} · ★ {insight.example.stars} ·{" "}
                    {formatDay(insight.example.date)}
                  </span>
                  <span className="vbl-filed">
                    → <i className="vbl-sw" aria-hidden="true" />
                    {insight.theme}
                  </span>
                </figcaption>
              </figure>
            </div>
          </li>
          <li className="vbl-step">
            <span className="vbl-step-n">3</span>
            <h3>Every number opens</h3>
            <p>
              Insights cite their quotes, and every count opens to the people
              behind it. A number in a deck is one click from the customer who
              said it.
            </p>
            <div className="vbl-step-x">
              <div className="vbl-claim">
                <p>{insight.claim}</p>
                <p className="vbl-claim-m">
                  <span>
                    cites <b>{insight.cites}</b> quotes
                  </span>
                  <span>·</span>
                  <span>
                    <b>{insight.voices}</b> reviewers open behind it
                  </span>
                </p>
              </div>
            </div>
          </li>
        </ol>
      </div>
    </section>
  );
}

function Fix({ fix }: { fix: (typeof WALL_SUMMARY)["refusals"][number] }) {
  const { quote, word } = fix;
  const lang =
    fix.language === "Turkish"
      ? "tr"
      : fix.language === "Russian"
        ? "ru"
        : undefined;
  let d = 0;
  while (d < word.source.length && word.source[d] === word.proposed[d]) d++;
  const before = quote.text.slice(0, word.at);
  const after = quote.text.slice(word.at + word.source.length);
  const split = (w: string) =>
    [w.slice(0, d), w.slice(d, d + 1), w.slice(d + 1)] as const;
  const [s0, s1, s2] = split(word.source);
  const [p0, p1, p2] = split(word.proposed);
  return (
    <figure className="vbl-fix">
      <figcaption>
        {fix.language} · {fix.author} · ★ {fix.stars} · {formatDate(fix.date)}
      </figcaption>
      <blockquote lang={lang}>
        {before}
        <u>{word.source}</u>
        {after}
      </blockquote>
      <dl className="vbl-diff">
        <dt>In the review</dt>
        <dd lang={lang}>
          <span className="vbl-w-ok">
            {s0}
            <b>{s1}</b>
            {s2}
          </span>
        </dd>
        <dt>The model wrote</dt>
        <dd lang={lang}>
          <span className="vbl-w-bad">
            {p0}
            <b>{p1}</b>
            {p2}
          </span>
          <span className="vbl-verdict">refused · not in the source</span>
        </dd>
        <dt>On the board</dt>
        <dd>
          <span className="vbl-span">
            chars {quote.start}–{quote.end} · the customer’s spelling
          </span>
        </dd>
      </dl>
    </figure>
  );
}

export function Verified() {
  const total = WALL_SUMMARY.sources;
  return (
    <section className="vbl-sec" id="verified" aria-labelledby="vbl-verified">
      <div className="vbl-wrap">
        <p className="vbl-kicker">How quotes are verified</p>
        <h2 className="vbl-h2 vbl-h2-wide" id="vbl-verified">
          Models don’t invent quotes anymore. They quietly fix them.
        </h2>
        <div className="vbl-proofgrid">
          <div>
            <p className="vbl-lede">
              On our run over {total} reviews, the agent proposed quotes and the
              server checked every one against its source, character for
              character. {REFUSED} were refused. Two were the model silently
              “correcting” a customer.
            </p>
            <p className="vbl-lede">
              A refused quote never reaches the board. The agent goes back to
              the source and files the exact words, spelling and all.
            </p>
          </div>
          <div className="vbl-fixes">
            {WALL_SUMMARY.refusals.map((f) => (
              <Fix key={f.author} fix={f} />
            ))}
          </div>
        </div>

        <div className="vbl-vs">
          <h3>The same model, two ways</h3>
          <table>
            <thead>
              <tr>
                <th scope="col">
                  <span className="sr-only">Measure</span>
                </th>
                <th scope="col">One chat prompt (same model)</th>
                <th scope="col">Verbatim</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <th scope="row">Quoted voices</th>
                <td className="vbl-a" data-label="One chat prompt">
                  <span className="vbl-n">
                    {BASELINE.voices} of {total}
                  </span>
                </td>
                <td className="vbl-b" data-label="Verbatim">
                  <span className="vbl-n">
                    {total} of {total}
                  </span>
                </td>
              </tr>
              <tr>
                <th scope="row">Theme counts you can open</th>
                <td className="vbl-a" data-label="One chat prompt">
                  <span className="vbl-n">0 of {BASELINE.themes}</span>
                </td>
                <td className="vbl-b" data-label="Verbatim">
                  <span className="vbl-n">
                    {WALL_SUMMARY.themes} of {WALL_SUMMARY.themes}
                  </span>
                </td>
              </tr>
              <tr>
                <th scope="row">Quotes checked against the source</th>
                <td className="vbl-a" data-label="One chat prompt">
                  none
                </td>
                <td className="vbl-b" data-label="Verbatim">
                  every one (<span className="vbl-n">{WALL_SUMMARY.notes}</span>
                  )
                </td>
              </tr>
              <tr>
                <th scope="row">Can you move it?</th>
                <td className="vbl-a" data-label="One chat prompt">
                  a wall of text
                </td>
                <td className="vbl-b" data-label="Verbatim">
                  a shared board
                </td>
              </tr>
            </tbody>
          </table>
          <p className="vbl-vs-note">
            Measured {BASELINE.measured} on the same {total} reviews; the single
            prompt’s {BASELINE.quotes} quotes were all verbatim — the gap is
            coverage and proof, not honesty.
          </p>
        </div>
      </div>
    </section>
  );
}

const SURFACES: { name: string; how: string; actions: string[] }[] = [
  {
    name: "The board",
    how: "you drag a quote into a theme",
    actions: ["move-notes"],
  },
  {
    name: "In-app agent",
    how: "cuts sources, files quotes, writes insights",
    actions: ["add-notes", "move-notes", "write-insight"],
  },
  {
    name: "Claude, ChatGPT",
    how: "over MCP; theme cards render inline",
    actions: ["show-theme", "search-quotes"],
  },
  { name: "Other agents", how: "over A2A", actions: ["search-quotes"] },
  {
    name: "Automations",
    how: "webhook in → filed on the board; Slack digest",
    actions: ["add-notes"],
  },
  {
    name: "CLI",
    how: "pnpm action search-quotes --query crash",
    actions: ["search-quotes"],
  },
];

export function AgentNative() {
  return (
    <section className="vbl-sec" id="agent-native" aria-labelledby="vbl-an">
      <div className="vbl-wrap">
        <p className="vbl-kicker">Built on Agent-Native</p>
        <h2 className="vbl-h2" id="vbl-an">
          One action, every surface.
        </h2>
        <p className="vbl-lede">
          Everything the board can do is an action. The same code answers a drag
          on the board, a request in chat, another agent, an automation and the
          command line, so every surface sees the same board.
        </p>
        <ul className="vbl-surfaces">
          {SURFACES.map((s) => (
            <li key={s.name}>
              <span className="vbl-s-name">{s.name}</span>
              <span className="vbl-s-how">{s.how}</span>
              <span className="vbl-s-acts">
                {s.actions.map((a) => (
                  <code key={a}>{a}</code>
                ))}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

export function LandingFooter() {
  return (
    <footer className="vbl-footer">
      <div className="vbl-wrap">
        <Wordmark />
        <p>
          Reviews are public App Store reviews, quoted for research; authors are
          App Store nicknames. © 2026 Verbatim
        </p>
        <nav aria-label="Footer">
          <a href="#">GitHub</a>
          <a href={appPath("/studies")}>Open app</a>
          <a href={agentNativePath("/_agent-native/sign-in")}>Sign in</a>
        </nav>
      </div>
    </footer>
  );
}
