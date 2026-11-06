import { useActionQuery } from "@agent-native/core/client/hooks";
import { IconLayoutBoard, IconPlus } from "@tabler/icons-react";
import { Link, useLocation } from "react-router";

import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

interface StudyRow {
  id: string;
  title: string;
  notes: number;
  sources: number;
}

/** The Verbatim mark: an ink tile with one quote-coloured line. */
export function VerbatimMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 18 18" aria-hidden="true" className={className}>
      <rect x="1" y="1" width="16" height="16" rx="2" fill="currentColor" />
      <rect x="4" y="8.2" width="7" height="2" rx="1" fill="var(--vb-rust)" />
    </svg>
  );
}

export function StudiesNav({ collapsed }: { collapsed: boolean }) {
  const location = useLocation();
  const { data } = useActionQuery("list-studies", {} as never);
  const studies = ((data as { studies?: StudyRow[] } | undefined)?.studies ?? []).slice(0, 12);
  const onList = location.pathname === "/studies";

  const allLink = (
    <Link
      to="/studies"
      aria-current={onList ? "page" : undefined}
      aria-label={collapsed ? "Studies" : undefined}
      className={cn(
        "flex items-center text-sidebar-accent-foreground transition-colors hover:bg-sidebar-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring",
        onList && "bg-sidebar-accent",
        collapsed ? "size-8 justify-center rounded" : "h-8 w-full gap-3 rounded px-3 text-sm font-medium",
      )}
    >
      <IconLayoutBoard className="size-4 shrink-0" strokeWidth={1.7} />
      <span className={collapsed ? "sr-only" : "truncate"}>Studies</span>
    </Link>
  );

  if (collapsed) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>{allLink}</TooltipTrigger>
        <TooltipContent side="right">Studies</TooltipContent>
      </Tooltip>
    );
  }

  return (
    <div className="px-2">
      {allLink}
      {studies.length > 0 ? (
        <ul className="mt-1 flex flex-col gap-px pb-3" aria-label="Your studies">
          {studies.map((s) => {
            const active = location.pathname.startsWith(`/studies/${s.id}`);
            return (
              <li key={s.id}>
                <Link
                  to={`/studies/${s.id}`}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "group flex h-8 items-center gap-2 rounded px-3 text-[13px] text-sidebar-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                    active && "bg-sidebar-accent text-sidebar-accent-foreground",
                  )}
                >
                  <span className="min-w-0 flex-1 truncate">{s.title}</span>
                  <span className="shrink-0 font-[family-name:var(--vb-mono)] text-[10.5px] text-muted-foreground tabular-nums">
                    {s.notes}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      ) : null}
      <Link
        to="/studies?new=1"
        className="flex h-8 items-center gap-2 rounded px-3 text-[13px] text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
      >
        <IconPlus className="size-3.5" strokeWidth={1.8} />
        New study
      </Link>
    </div>
  );
}
