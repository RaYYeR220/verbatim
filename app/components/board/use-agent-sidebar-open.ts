import {
  getAgentSidebarState,
  SIDEBAR_STATE_CHANGE_EVENT,
  type AgentSidebarStateChangeDetail,
} from "@agent-native/core/client/agent-sidebar-state";
import { useEffect, useState } from "react";

/** Whether the agent chat panel is open, so the board can give it room. */
export function useAgentSidebarOpen(): boolean {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    setOpen(Boolean(getAgentSidebarState()?.open));
    const onChange = (e: Event) => {
      const detail = (e as CustomEvent<AgentSidebarStateChangeDetail>).detail;
      if (detail && typeof detail.open === "boolean") setOpen(detail.open);
    };
    window.addEventListener(SIDEBAR_STATE_CHANGE_EVENT, onChange);
    return () => window.removeEventListener(SIDEBAR_STATE_CHANGE_EVENT, onChange);
  }, []);
  return open;
}
