import { useCallback, useState } from "react";
import type { Client } from "@modelcontextprotocol/sdk/client";
import type { ConsoleMessage, NetworkRequest, StdioMessage } from "../types";

export interface ContextData {
  consoleMessages: ConsoleMessage[];
  networkRequests: NetworkRequest[];
  stdioMessages: StdioMessage[];
  loading: boolean;
  error: string | null;
}

/**
 * Hook to fetch and manage context data from chrome_devtools MCP tool
 * @param client - MCP client instance (passed from useMcp hook in parent component)
 * @param isClientReady - whether the client is ready
 * @param isEnabled - whether to enable data fetching (default: true)
 */
export function useContextData(
  client: Client | null,
  isClientReady: boolean,
  isEnabled: boolean = true,
) {
  const [data, setData] = useState<ContextData>({
    consoleMessages: [],
    networkRequests: [],
    stdioMessages: [],
    loading: false,
    error: null,
  });

  const fetchContextData = useCallback(async () => {
    if (!isEnabled) {
      return;
    }

    if (!client || !isClientReady) {
      setData((prev) => ({
        ...prev,
        error: "MCP client not ready",
      }));
      return;
    }

    setData((prev) => ({ ...prev, loading: true, error: null }));

    try {
      let consoleText = "";
      let networkText = "";
      let stdioMessagesOrEmpty: StdioMessage[] = [];

      try {
        // Try using tools first (Chrome enabled mode)
        const consoleResult = await client.callTool({
          name: "chrome_devtools",
          arguments: {
            useTool: "chrome_list_console_messages",
            hasDefinitions: ["chrome_list_console_messages"],
            chrome_list_console_messages: {},
          },
        });

        const networkResult = await client.callTool({
          name: "chrome_devtools",
          arguments: {
            useTool: "chrome_list_network_requests",
            hasDefinitions: ["chrome_list_network_requests"],
            chrome_list_network_requests: {},
          },
        });

        const consoleContent =
          (consoleResult as { content?: Array<{ text?: string }> })?.content;
        consoleText = consoleContent?.map((item) => item.text).join("\n") || "";

        const networkContent =
          (networkResult as { content?: Array<{ text?: string }> })?.content;
        networkText = networkContent?.map((item) => item.text).join("\n") || "";
      } catch (e) {
        // Fallback to prompts (Chrome disabled / local mode)
        // When using prompts, we can get data from the prompt result
        // Note: In local mode (mcp.ts), we put both console and network in the same prompt result for convenience,
        // but here we can try calling the specific prompts.

        // Actually, my mcp.ts implementation for local mode puts EVERYTHING in the result of ANY of the refresh calls.
        // But let's try calling get_console_messages and get_network_requests prompts individually if possible.
        // However, the prompt result structure might be different (list of messages).

        try {
          const consolePrompt = await client.getPrompt({
            name: "get_console_messages",
          });
          const networkPrompt = await client.getPrompt({
            name: "get_network_requests",
          });

          // The prompt result messages content is where the text is.
          // In local mode mcp.ts, we return a single message with combined text.
          // Let's parse that.

          const consoleMsg = consolePrompt.messages[0]?.content;
          const networkMsg = networkPrompt.messages[0]?.content;

          const fullText =
            (consoleMsg?.type === "text" ? consoleMsg.text : "") +
            "\n" +
            (networkMsg?.type === "text" ? networkMsg.text : "");

          // Allow the parsers to just extract what they can find from the combined text
          consoleText = fullText;
          networkText = fullText;
        } catch (promptError) {
          console.error(
            "[useContextData] Prompts fallback failed:",
            promptError,
          );
          throw e; // Throw original error if fallback fails
        }
      }

      // Try getting stdio messages via Direct API (bypassing MCP) - Independent of Chrome
      try {
        const config = typeof window !== "undefined"
          ? (window as any).__DEV_INSPECTOR_CONFIG__
          : null;
        let baseUrl = "";
        if (config) {
          baseUrl = config.baseUrl ||
            (`http://${config.host}:${config.port}${config.base || "/"}`);
          if (baseUrl.endsWith("/")) baseUrl = baseUrl.slice(0, -1);
        }

        const res = await fetch(`${baseUrl}/__inspector__/stdio`);
        if (res.ok) {
          const logs = await res.json();
          // logs is Array<{id, stream, data, timestamp}> (server StdioLog)
          // client StdioMessage is { stdioid, stream, data }
          stdioMessagesOrEmpty = logs.map((log: any) => ({
            stdioid: log.id,
            stream: log.stream,
            data: log.data,
          })).reverse(); // Newest first
        }
      } catch (e) {
        console.warn("[useContextData] Failed to fetch stdio messages:", e);
      }

      const consoleMessages = parseConsoleMessages(consoleText);
      const networkRequests = parseNetworkRequests(networkText);
      const stdioMessages = stdioMessagesOrEmpty;

      setData({
        consoleMessages,
        networkRequests,
        stdioMessages,
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

  return messages; // MCP returns in correct order (newest first)
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
    const match = line.match(
      /reqid=(\d+)\s+(GET|POST|PUT|DELETE|PATCH)\s+([^\s]+)\s+\[([^\]]+)\]/,
    );
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

  return requests; // MCP returns in correct order (newest first)
}

/**
 * Normalize status text for display - extract only the status code
 * KISS: Show "304" instead of "failed - 304"
 */
function normalizeStatus(status: string): string {
  const codeMatch = status.match(/\b(\d{3})\b/);
  return codeMatch ? codeMatch[1] : status;
}
