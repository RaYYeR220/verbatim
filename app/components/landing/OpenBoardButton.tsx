import { appApiPath, appPath } from "@agent-native/core/client/api-path";
import { useCallback, useEffect, useRef, useState } from "react";

type State = "idle" | "pending" | "failed";

/** Starts (or resumes) a guest workspace with the demo board, then opens it. */
export function OpenBoardButton() {
  const [state, setState] = useState<State>("idle");
  const busy = useRef(false);

  useEffect(() => {
    // Coming back from the board through the back button restores this page from cache.
    const onShow = (ev: PageTransitionEvent) => {
      if (!ev.persisted) return;
      busy.current = false;
      setState("idle");
    };
    window.addEventListener("pageshow", onShow);
    return () => window.removeEventListener("pageshow", onShow);
  }, []);

  const open = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    setState("pending");
    try {
      const res = await fetch(appApiPath("/api/guest"), {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "same-origin",
        body: "{}",
      });
      if (!res.ok) throw new Error(`guest workspace: ${res.status}`);
      const body: unknown = await res.json();
      const redirect =
        body &&
        typeof body === "object" &&
        "redirect" in body &&
        typeof body.redirect === "string" &&
        body.redirect.startsWith("/")
          ? body.redirect
          : "/studies";
      window.location.assign(appPath(redirect));
    } catch {
      busy.current = false;
      setState("failed");
    }
  }, []);

  const pending = state === "pending";
  return (
    <>
      <button
        type="button"
        className="vbl-cta"
        onClick={() => void open()}
        aria-disabled={pending || undefined}
        aria-busy={pending || undefined}
        data-pending={pending || undefined}
      >
        <span className="vbl-cta-l">
          <span data-l="idle">Open the live board</span>
          <span data-l="pending" aria-hidden={!pending}>
            Opening the board…
          </span>
        </span>
        <span className="vbl-cta-ic" aria-hidden="true">
          {pending ? (
            <span className="vbl-cta-dot" />
          ) : (
            <svg width="16" height="16" viewBox="0 0 16 16">
              <path
                d="M3 8h9M8.5 4.5 12 8l-3.5 3.5"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          )}
        </span>
      </button>
      {state === "failed" ? (
        <p className="vbl-cta-err" role="status">
          The board didn’t open. Try again in a moment.
        </p>
      ) : null}
    </>
  );
}
