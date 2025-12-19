import { useState, useCallback } from "react";
import type { Client } from "@modelcontextprotocol/sdk/client";
import type { ConsoleMessage, NetworkRequest } from "../types";

export interface ContextData {
  consoleMessages: ConsoleMessage[];
  networkRequests: NetworkRequest[];
  loading: boolean;
  error: string | null;
}

/**
 * Hook to fetch and manage context data from chrome_devtools MCP tool
 * @param client - MCP client instance (passed from useMcp hook in parent component)
 * @param isClientReady - whether the client is ready
 */
export function useContextData(client: Client | null, isClientReady: boolean) {
  const [data, setData] = useState<ContextData>({
    consoleMessages: [],
    networkRequests: [],
    loading: false,
    error: null,
  });

  const fetchContextData = useCallback(async () => {
    if (!client || !isClientReady) {
      setData((prev) => ({
        ...prev,
        error: "MCP client not ready",
      }));
      return;
    }

    setData((prev) => ({ ...prev, loading: true, error: null }));

    try {
      // Call chrome_devtools tool to get console messages
      const consoleResult = await client.callTool({
        name: "chrome_devtools",
        arguments: {
          useTool: "chrome_list_console_messages",
          hasDefinitions: ["chrome_list_console_messages"],
          chrome_list_console_messages: {},
        },
      });

      // Call chrome_devtools tool to get network requests
      const networkResult = await client.callTool({
        name: "chrome_devtools",
        arguments: {
          useTool: "chrome_list_network_requests",
          hasDefinitions: ["chrome_list_network_requests"],
          chrome_list_network_requests: {},
        },
      });

      // Parse console messages from response
      const consoleContent = (consoleResult as { content?: Array<{ text?: string }> })?.content;
      const consoleText = consoleContent?.map((item) => item.text).join("\n") || "";
      const consoleMessages = parseConsoleMessages(consoleText);

      // Parse network requests from response
      const networkContent = (networkResult as { content?: Array<{ text?: string }> })?.content;
      const networkText = networkContent?.map((item) => item.text).join("\n") || "";
      const networkRequests = parseNetworkRequests(networkText);

      setData({
        consoleMessages,
        networkRequests,
        loading: false,
        error: null,
      });
    } catch (error) {
      console.error("[useContextData] Failed to fetch context data:", error);
      setData((prev) => ({
        ...prev,
        loading: false,
        error: error instanceof Error ? error.message : String(error),
      }));
    }
  }, [client, isClientReady]);

  return {
    ...data,
    refresh: fetchContextData,
  };
}

/**
 * Parse console messages from MCP response text
 * Format: msgid=123 [level] message text
 */
function parseConsoleMessages(text: string): ConsoleMessage[] {
  if (!text) return [];

  const messages: ConsoleMessage[] = [];
  const lines = text.split("\n");

  for (const line of lines) {
    const match = line.match(/msgid=(\d+)\s+\[([^\]]+)\]\s+(.+)/);
    if (match) {
      const [, msgid, level, messageText] = match;
      messages.push({
        msgid: parseInt(msgid),
        level,
        text: messageText,
      });
    }
  }

  return messages.reverse(); // Show newest first
}

/**
 * Parse network requests from MCP response text
 * Format: reqid=123 METHOD url [status]
 */
function parseNetworkRequests(text: string): NetworkRequest[] {
  if (!text) return [];

  const requests: NetworkRequest[] = [];
  const lines = text.split("\n");

  for (const line of lines) {
    const match = line.match(/reqid=(\d+)\s+(GET|POST|PUT|DELETE|PATCH)\s+([^\s]+)\s+\[([^\]]+)\]/);
    if (match) {
      const [, reqid, method, url, status] = match;
      requests.push({
        reqid: parseInt(reqid),
        method,
        url,
        status: normalizeStatus(status),
      });
    }
  }

  return requests.reverse(); // Show newest first
}

/**
 * Normalize status text for display - extract only the status code
 * KISS: Show "304" instead of "failed - 304"
 */
function normalizeStatus(status: string): string {
  const codeMatch = status.match(/\b(\d{3})\b/);
  return codeMatch ? codeMatch[1] : status;
}
