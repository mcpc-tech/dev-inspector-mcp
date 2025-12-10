/**
 * Message processing utilities for extracting information from AI messages
 */

export interface MessageProcessingResult {
  displayText: string;
  toolOutput: string | null;
  toolCall: string | null;
}

/**
 * Extract display text from a message
 */
export function extractDisplayText(message: any): string {
  let text = "";

  if ("parts" in message && Array.isArray(message.parts)) {
    for (const messagePart of message.parts) {
      if (
        messagePart.type === "text" &&
        "text" in messagePart &&
        typeof messagePart.text === "string"
      ) {
        text += messagePart.text;
      }
    }
  } else if ("content" in message && typeof message.content === "string") {
    text = message.content;
  } else if ("text" in message && typeof message.text === "string") {
    text = message.text;
  }

  return text;
}

/**
 * Extract tool output/result from a message
 * Only returns tool output if it's the most recent content (no text after it)
 */
export function extractToolOutput(message: any): string | null {
  if (!("parts" in message) || !Array.isArray(message.parts)) {
    return null;
  }

  let toolOutput: string | null = null;
  let hasTextAfterTool = false;

  for (const part of message.parts) {
    // Check if there's text content after tool output
    if (
      toolOutput &&
      part.type === "text" &&
      "text" in part &&
      typeof part.text === "string" &&
      part.text.trim()
    ) {
      hasTextAfterTool = true;
      toolOutput = null; // Clear tool output if there's text after it
      break;
    }

    // Handle standard tool-result
    if (part.type === "tool-result" && "result" in part) {
      const result = part.result;

      if (typeof result === "string") {
        toolOutput = result;
        continue;
      }

      if (result && typeof result === "object") {
        if ("text" in result && typeof result.text === "string") {
          toolOutput = result.text;
          continue;
        }

        if (Array.isArray(result) && result.length > 0) {
          const firstItem = result[0];
          if (firstItem && typeof firstItem === "object" && "content" in firstItem) {
            const content = firstItem.content;
            if (
              content &&
              typeof content === "object" &&
              "text" in content &&
              typeof content.text === "string"
            ) {
              toolOutput = content.text;
              continue;
            }
          }
        }
      }
    }

    // Handle tool-acp.acp_provider_agent_dynamic_tool with output field
    // Only show if state is 'output-available' and no text follows
    if (
      part.type === "tool-acp.acp_provider_agent_dynamic_tool" &&
      "output" in part &&
      Array.isArray(part.output)
    ) {
      const output = part.output;
      if (output.length > 0) {
        const firstItem = output[0];
        if (firstItem && typeof firstItem === "object" && "content" in firstItem) {
          const content = firstItem.content;
          if (
            content &&
            typeof content === "object" &&
            "text" in content &&
            typeof content.text === "string"
          ) {
            toolOutput = content.text;
            continue;
          }
        }
      }
    }
  }

  return hasTextAfterTool ? null : toolOutput;
}

/**
 * Extract tool name from message parts
 */
export function extractToolName(message: any): string | null {
  if (!("parts" in message) || !Array.isArray(message.parts)) {
    return null;
  }

  // Scan in REVERSE to find the latest tool name
  for (let i = message.parts.length - 1; i >= 0; i--) {
    const part = message.parts[i];
    if (part.type === "tool-call" && "toolName" in part && typeof part.toolName === "string") {
      return part.toolName;
    }
    if (
      part.type === "tool-acp.acp_provider_agent_dynamic_tool" &&
      "input" in part &&
      typeof part.input === "object" &&
      part.input !== null &&
      "toolName" in part.input
    ) {
      // @ts-ignore - Custom structure handling
      return part.input.toolName;
    }
  }
  return null;
}

/**
 * Extract tool call name from a message
 * Returns the LAST active tool (input-available state) found in the message parts
 * Returns null if there's text content after the tool (indicating tool is done)
 */
export function extractToolCall(message: any, currentTool?: string | null): string | null {
  if ("parts" in message && Array.isArray(message.parts)) {
    let foundActiveToolCall: string | null = null;
    let lastToolIndex = -1;

    // IMPORTANT: Scan in REVERSE order to find the LATEST tool
    // We only care about the very last tool in the list.
    // If the last tool is done, then no tool is active.
    for (let i = message.parts.length - 1; i >= 0; i--) {
      const part = message.parts[i];

      // Check for ACP tool
      if (part.type === "tool-acp.acp_provider_agent_dynamic_tool") {
        const state = "state" in part ? part.state : null;

        // Only show tools in input-available state (actively running)
        if (state === "input-available") {
          if (
            "input" in part &&
            typeof part.input === "object" &&
            part.input !== null &&
            "toolName" in part.input
          ) {
            foundActiveToolCall = part.input.toolName;
            lastToolIndex = i;
          }
        }
        // Whether it was active or not, we found the latest tool. Stop searching.
        break;
      }

      // Check for standard tool-call
      if (part.type === "tool-call" && "toolName" in part && typeof part.toolName === "string") {
        foundActiveToolCall = part.toolName;
        lastToolIndex = i;
        break;
      }
    }

    // If we found a potential active tool, verify it hasn't ended (for tool-call)
    // For ACP tools, the state check above is sufficient, but checking for subsequent text doesn't hurt.
    if (foundActiveToolCall && lastToolIndex !== -1) {
      for (let i = lastToolIndex + 1; i < message.parts.length; i++) {
        const part = message.parts[i];
        if (
          part.type === "text" &&
          "text" in part &&
          typeof part.text === "string" &&
          part.text.trim()
        ) {
          // Found text after tool - tool is done, show text instead
          return null;
        }
        if (part.type === "tool-result") {
          // Found result after tool - tool is done
          return null;
        }
      }
      return foundActiveToolCall;
    }

    // If we have parts, we trust the parts. If no active tool was found, return null.
    return null;
  }

  // Use the provided currentTool if available (only if parts was missing)
  if (currentTool) {
    return currentTool;
  }

  // Fallback to toolInvocations
  if (
    "toolInvocations" in message &&
    Array.isArray(message.toolInvocations) &&
    message.toolInvocations.length > 0
  ) {
    const lastTool = message.toolInvocations[message.toolInvocations.length - 1];
    if (
      typeof lastTool === "object" &&
      lastTool !== null &&
      "toolName" in lastTool &&
      typeof lastTool.toolName === "string"
    ) {
      return lastTool.toolName;
    }
  }

  return null;
}

/**
 * Process a message and extract all relevant information
 */
export function processMessage(message: any, currentTool?: string | null): MessageProcessingResult {
  return {
    displayText: extractDisplayText(message),
    toolOutput: extractToolOutput(message),
    toolCall: extractToolCall(message, currentTool),
  };
}
