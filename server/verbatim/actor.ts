import type { ActionRunContext } from "@agent-native/core/action";

export type Actor = "user" | "agent" | "automation" | "mcp" | "a2a" | "cli" | "http";

type CtxLike = Partial<Pick<ActionRunContext, "caller" | "automation" | "networkProtocol" | "mcpClient">> | undefined;

/** Who performed a call, for the activity feed and the agent cursor. */
export function actorFromCtx(ctx: unknown): Actor {
  const c = (ctx ?? undefined) as CtxLike;
  switch (c?.caller) {
    case "tool":
      if (c.automation) return "automation";
      if (c.networkProtocol === "a2a") return "a2a";
      if (c.networkProtocol === "mcp") return "mcp";
      return "agent";
    case "automation":
      return "automation";
    case "mcp":
    case "webmcp":
      return "mcp";
    case "a2a":
      return "a2a";
    case "cli":
      return "cli";
    case "http":
      return "http";
    default:
      return "user";
  }
}

export const isMachineActor = (a: Actor) => a !== "user";

/** A short label for the agent cursor, e.g. "Agent" or "Claude via MCP". */
export function actorLabel(actor: Actor, ctx: unknown): string {
  const c = (ctx ?? undefined) as CtxLike;
  if (actor === "mcp") return c?.mcpClient?.name ? `${c.mcpClient.name} via MCP` : "External agent";
  if (actor === "automation") return "Automation";
  if (actor === "a2a") return "Connected agent";
  return "Agent";
}
