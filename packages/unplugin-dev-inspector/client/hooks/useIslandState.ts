import { useMemo } from "react";
import type { ChatStatus, UIMessage } from "ai";
import { processMessage, extractToolName } from "../utils/messageProcessor";

export type IslandState =
  | "idle" // No messages, not expanded
  | "expanded" // User is typing (input focused)
  | "submitted" // status === "submitted", waiting for first response
  | "thinking" // Assistant message with text parts only
  | "executing" // Has tool-call part in "input-available" state
  | "result" // Has text after tool, or status === "ready"
  | "error"; // status === "error"

export interface IslandContext {
  uiState: "expanded" | "collapsed";
  chatStatus: ChatStatus;
  toolName: string | null;
  displayText: string;
  isStreaming: boolean;
  lastMessage?: UIMessage;
}

/**
 * Derives the Dynamic Island state from AI SDK messages and status
 */
export function useIslandState(
  messages: UIMessage[],
  status: ChatStatus,
  isExpanded: boolean,
): IslandContext {
  return useMemo(() => {
    // 1. Analyze Chat State
    const lastMessage = messages[messages.length - 1];
    const isStreaming = status === "streaming";
    let toolName: string | null = null;
    let displayText = "";

    if (lastMessage && lastMessage.role === "assistant") {
      const processed = processMessage(lastMessage);
      displayText = processed.displayText;
      
      // Prioritize active tool call, then extracted tool name
      toolName = processed.toolCall || extractToolName(lastMessage);
    }

    // 2. Determine UI State
    // UI state is primarily controlled by isExpanded, but we might want to override keys
    // For now, it maps directly, keeping UI logic pure.
    const uiState = isExpanded ? "expanded" : "collapsed";

    return {
      uiState,
      chatStatus: status,
      toolName,
      displayText,
      isStreaming,
      lastMessage
    };
  }, [messages, status, isExpanded]);
}
