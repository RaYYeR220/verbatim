import { describe, expect, it } from "vitest";

import { actorFromCtx, actorLabel } from "./actor.js";

describe("actorFromCtx", () => {
  it("maps each caller to an actor", () => {
    expect(actorFromCtx({ caller: "frontend" })).toBe("user");
    expect(actorFromCtx({ caller: "tool" })).toBe("agent");
    expect(actorFromCtx({ caller: "tool", automation: { id: "a" } })).toBe("automation");
    expect(actorFromCtx({ caller: "mcp" })).toBe("mcp");
    expect(actorFromCtx({ caller: "a2a" })).toBe("a2a");
    expect(actorFromCtx({ caller: "cli" })).toBe("cli");
    expect(actorFromCtx({ caller: "mcp-widget-write" })).toBe("user");
    expect(actorFromCtx(undefined)).toBe("user");
  });

  it("labels an MCP client by name", () => {
    expect(actorLabel("mcp", { caller: "mcp", mcpClient: { name: "Claude" } })).toBe("Claude via MCP");
    expect(actorLabel("agent", { caller: "tool" })).toBe("Agent");
  });
});
