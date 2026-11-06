import {
  appBasePath,
  appPathFromLocalRoute,
} from "@agent-native/core/client/api-path";
import { useAgentRouteState } from "@agent-native/core/client/navigation";

import {
  chatThreadPath,
  HOME_PATH,
  isChatPathname,
  NEW_CHAT_PATH,
  threadIdFromPath,
} from "@/lib/chat-paths";
import { TAB_ID } from "@/lib/tab-id";

export interface NavigationState {
  view?: string;
  path?: string;
  publicPath?: string;
  threadId?: string;
  studyId?: string;
  sourceId?: string;
}

const STUDY_PATH = /^\/studies\/([^/]+)(?:\/(sources|insights|readout)(?:\/([^/]+))?)?\/?$/;

/** The study, source and sub-view a pathname points at, if any. */
export function studyRouteFromPath(pathname: string): { studyId: string; sub: string | null; sourceId: string | null } | null {
  const m = STUDY_PATH.exec(pathname);
  if (!m) return null;
  return { studyId: m[1]!, sub: m[2] ?? null, sourceId: m[2] === "sources" ? (m[3] ?? null) : null };
}

export function useNavigationState() {
  useAgentRouteState<NavigationState>({
    browserTabId: TAB_ID,
    requestSource: TAB_ID,
    getNavigationState: ({ pathname }) => navigationStateForPath(pathname),
    getCommandPath: commandPathForNavigation,
  });
}

export function commandPathForNavigation(command: NavigationState): string {
  const fallbackPath = pathForCommand(command);
  const path = typeof command?.path === "string" ? command.path : "";
  if (!path) return fallbackPath;

  const basePath = appBasePath();
  if (!basePath) return path;

  const suffixIndex = path.search(/[?#]/);
  const pathname = suffixIndex === -1 ? path : path.slice(0, suffixIndex);
  const suffix = suffixIndex === -1 ? "" : path.slice(suffixIndex);
  const publicPath =
    typeof command?.publicPath === "string" ? command.publicPath : "";
  const publicPathSuffixIndex = publicPath.search(/[?#]/);
  const declaredPublicPath =
    publicPathSuffixIndex === -1
      ? publicPath
      : publicPath.slice(0, publicPathSuffixIndex);
  const publicViewPath = appPathFromLocalRoute(pathForView(command?.view));
  if (
    matchesPathPrefix(pathname, basePath) &&
    (matchesPathPrefix(pathname, publicViewPath) ||
      (declaredPublicPath && declaredPublicPath === pathname))
  ) {
    return `${pathname.slice(basePath.length) || "/"}${suffix}`;
  }
  return path;
}

function matchesPathPrefix(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

export function navigationStateForPath(pathname: string): NavigationState {
  const threadId = threadIdFromPath(pathname);
  const study = studyRouteFromPath(pathname);
  return {
    view: viewForPath(pathname),
    path: pathname,
    publicPath: appPathFromLocalRoute(pathname),
    ...(threadId ? { threadId } : {}),
    ...(study ? { studyId: study.studyId } : {}),
    ...(study?.sourceId ? { sourceId: study.sourceId } : {}),
  };
}

function viewForPath(pathname: string): string {
  const study = studyRouteFromPath(pathname);
  if (study) return study.sub === "sources" && study.sourceId ? "source" : study.sub === "insights" ? "insights" : study.sub === "readout" ? "readout" : "board";
  if (pathname === "/studies" || pathname === "/studies/") return "studies";
  if (isChatPathname(pathname)) return "chat";
  if (pathname === HOME_PATH) return "home";
  if (pathname.startsWith("/database")) return "database";
  if (pathname.startsWith("/extensions")) return "extensions";
  if (pathname.startsWith("/observability")) return "observability";
  if (pathname.startsWith("/settings/agent") || pathname.startsWith("/agent")) {
    return "agent";
  }
  if (pathname.startsWith("/settings")) return "settings";
  if (pathname.startsWith("/team")) return "settings";
  return "chat";
}

function pathForView(view?: string): string {
  switch (view) {
    case "studies":
    case "board":
      return "/studies";
    case "chat":
    case "ask":
      return NEW_CHAT_PATH;
    case "home":
      return HOME_PATH;
    case "database":
      return "/database";
    case "extensions":
      return "/extensions";
    case "observability":
      return "/observability";
    case "agent":
      return "/settings/agent";
    case "settings":
      return "/settings";
    case "team":
      return "/settings/organization";
    default:
      return HOME_PATH;
  }
}

export function pathForCommand(command: any): string {
  const studyId = typeof command?.studyId === "string" ? encodeURIComponent(command.studyId) : "";
  if (studyId && ["board", "source", "insights", "readout"].includes(command?.view)) {
    const q = new URLSearchParams();
    if (typeof command?.note === "string") q.set("note", command.note);
    if (typeof command?.theme === "string") q.set("theme", command.theme);
    const sourceId = typeof command?.sourceId === "string" ? encodeURIComponent(command.sourceId) : "";
    const base =
      command.view === "source" && sourceId
        ? `/studies/${studyId}/sources/${sourceId}`
        : command.view === "insights" || command.view === "readout"
          ? `/studies/${studyId}/${command.view}`
          : `/studies/${studyId}`;
    return q.size ? `${base}?${q.toString()}` : base;
  }
  const path = pathForView(command?.view);
  if (command?.view !== "chat" && command?.view !== "ask") return path;
  const threadId =
    typeof command?.threadId === "string" ? command.threadId.trim() : "";
  return threadId ? chatThreadPath(threadId) : path;
}
