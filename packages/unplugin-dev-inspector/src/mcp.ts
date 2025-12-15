import { createClientExecServer } from "@mcpc-tech/cmcp";
import { mcpc } from "@mcpc-tech/core";
import {
  GetPromptRequestSchema,
  ListPromptsRequestSchema,
  type CallToolResult,
  type GetPromptResult,
  type JSONRPCMessage,
} from "@modelcontextprotocol/sdk/types.js";
import path from "node:path";
import { createRequire } from "node:module";
import { PROMPT_SCHEMAS } from "./prompt-schemas.js";
import { TOOL_SCHEMAS } from "./tool-schemas.js";
import { isChromeDisabled, stripTrailingSlash } from "./utils/helpers.js";

/**
 * Get Chrome DevTools binary path from npm package, then use node to run it, faster/stabler than npx
 */
function getChromeDevToolsBinPath(): string {
  // Use createRequire for CJS compatibility (import.meta.resolve is ESM-only)
  const require = createRequire(import.meta.url);
  const chromeDevToolsPkgPath = require.resolve("chrome-devtools-mcp/package.json");
  const chromeDevTools = path.dirname(chromeDevToolsPkgPath);
  return path.join(chromeDevTools, "./build/src/index.js");
}

/**
 * Call MCP server method and wait for response
 * @param mcpServer - The MCP server instance
 * @param method - The method name to call
 * @param params - Optional parameters for the method
 * @returns Promise that resolves with the method result
 */
function callMcpMethod(
  mcpServer: Awaited<ReturnType<typeof mcpc>>,
  method: string,
  params?: unknown,
): Promise<unknown> {
  const messageId = Date.now();
  const message = {
    method,
    params: params as Record<string, unknown>,
    jsonrpc: "2.0" as const,
    id: messageId,
  };

  return new Promise((resolve) => {
    if (!mcpServer.transport) {
      throw new Error("MCP server transport not initialized");
    }
    mcpServer.transport.onmessage?.(message as JSONRPCMessage);

    const originalSend = mcpServer.transport.send;
    mcpServer.transport.send = function (payload: JSONRPCMessage) {
      const payloadObj = payload as {
        id: number;
        result: unknown;
      };
      if (payloadObj.id === messageId) {
        resolve(payloadObj.result);
        if (!mcpServer.transport) {
          throw new Error("MCP server transport not initialized");
        }
        mcpServer.transport.send = originalSend;
      }
      return originalSend.call(this, payload);
    };
  });
}

export interface ServerContext {
  host?: string;
  port?: number;
  /**
   * Disable Chrome DevTools integration (chrome-devtools-mcp tool + related prompts).
   * Useful for CI/headless/cloud environments.
   */
  disableChrome?: boolean;
}

/**
 * Create and configure the MCP server for source inspection
 */
export async function createInspectorMcpServer(serverContext?: ServerContext) {
  const chromeDisabled = isChromeDisabled(serverContext?.disableChrome);

  const chromeDevToolsServers = chromeDisabled
    ? []
    : [
        {
          name: "chrome_devtools",
          description: `Access Chrome DevTools for browser diagnostics.

Provides tools for inspecting network requests, console logs, and performance metrics.

If Chrome is already open, this tool can connect to it directly. Otherwise, call chrome_navigate_page first to launch Chrome.
Default dev server URL: ${process.env.DEV_INSPECTOR_PUBLIC_BASE_URL || `http://${serverContext?.host || "localhost"}:${serverContext?.port || 5173}`}

You MUST ask the user for confirmation before navigating to any URL.`,
          options: {
            refs: [
              // Page navigation and management
              '<tool name="chrome.navigate_page"/>',
              '<tool name="chrome.list_pages"/>',
              '<tool name="chrome.select_page"/>',
              '<tool name="chrome.close_page"/>',
              '<tool name="chrome.new_page"/>',
              // Element interaction
              '<tool name="chrome.click"/>',
              '<tool name="chrome.hover"/>',
              '<tool name="chrome.fill"/>',
              '<tool name="chrome.fill_form"/>',
              '<tool name="chrome.press_key"/>',
              '<tool name="chrome.drag"/>',
              '<tool name="chrome.wait_for"/>',
              // Debugging and inspection
              '<tool name="chrome.evaluate_script"/>',
              '<tool name="chrome.take_screenshot"/>',
              '<tool name="chrome.take_snapshot"/>',
              // Network inspection
              '<tool name="chrome.list_network_requests"/>',
              '<tool name="chrome.get_network_request"/>',
              // Console inspection
              '<tool name="chrome.list_console_messages"/>',
              '<tool name="chrome.get_console_message"/>',
              // Performance analysis
              '<tool name="chrome.performance_start_trace"/>',
              '<tool name="chrome.performance_stop_trace"/>',
              '<tool name="chrome.performance_analyze_insight"/>',
              // Dialogs and page settings
              '<tool name="chrome.handle_dialog"/>',
              '<tool name="chrome.resize_page"/>',
              '<tool name="chrome.emulate"/>',
            ] as unknown as any,
          },
          deps: {
            mcpServers: {
              chrome: {
                transportType: "stdio" as const,
                command: "node",
                args: [getChromeDevToolsBinPath()],
              },
            },
          },
        },
      ];

  const mcpServer = await mcpc(
    [
      {
        name: "dev-inspector",
        version: "1.0.0",
        title: "A tool for inspecting and interacting with the development environment.",
      },
      {
        capabilities: {
          tools: {
            listChanged: true,
          },
          sampling: {},
          prompts: {
            listChanged: true,
          },
        },
      },
    ],
    chromeDevToolsServers,
  );

  const mcpClientExecServer = createClientExecServer(mcpServer, "inspector");

  // Client tools
  mcpClientExecServer.registerClientToolSchemas([
    {
      ...TOOL_SCHEMAS.capture_element_context,
    },
    {
      ...TOOL_SCHEMAS.list_inspections,
    },
    {
      ...TOOL_SCHEMAS.update_inspection_status,
    },
    {
      ...TOOL_SCHEMAS.execute_page_script,
    },
  ]);

  // Prompts
  mcpServer.setRequestHandler(ListPromptsRequestSchema, async (_request) => {
    const defaultUrl = process.env.DEV_INSPECTOR_PUBLIC_BASE_URL
      ? stripTrailingSlash(process.env.DEV_INSPECTOR_PUBLIC_BASE_URL)
      : `http://${serverContext?.host || "localhost"}:${serverContext?.port || 5173}`;

    return {
      prompts: [
        {
          ...PROMPT_SCHEMAS.capture_element,
        },
        {
          ...PROMPT_SCHEMAS.view_inspections,
        },
        ...(!chromeDisabled
          ? [
              {
                ...PROMPT_SCHEMAS.launch_chrome_devtools,
                description: `Launch Chrome DevTools and navigate to the dev server for debugging and inspection. Default URL: ${defaultUrl}. You can use this default URL or provide a custom one.`,
                arguments: [
                  {
                    name: "url",
                    description: `The URL to navigate to. Press Enter to use default: ${defaultUrl}`,
                    required: false,
                  },
                ],
              },
              {
                ...PROMPT_SCHEMAS.get_network_requests,
              },
              {
                ...PROMPT_SCHEMAS.get_console_messages,
              },
            ]
          : []),
      ],
    };
  });

  // Helper function to refresh chrome state (network requests and console messages)
  async function refreshChromeState(): Promise<GetPromptResult> {
    if (chromeDisabled) {
      return {
        messages: [
          {
            role: "user" as const,
            content: {
              type: "text",
              text: "Chrome integration is disabled (set DEV_INSPECTOR_DISABLE_CHROME=0 to enable).",
            },
          },
        ],
      } as GetPromptResult;
    }
    // Get network requests
    const networkResult = (await callMcpMethod(mcpServer, "tools/call", {
      name: "chrome_devtools",
      arguments: {
        useTool: "chrome_list_network_requests",
        hasDefinitions: ["chrome_list_network_requests"],
        chrome_list_network_requests: {},
      },
    })) as CallToolResult;

    // Get console messages
    const consoleResult = (await callMcpMethod(mcpServer, "tools/call", {
      name: "chrome_devtools",
      arguments: {
        useTool: "chrome_list_console_messages",
        hasDefinitions: ["chrome_list_console_messages"],
        chrome_list_console_messages: {},
      },
    })) as CallToolResult;

    // Extract reqIds from the network requests text
    const requestsText = networkResult?.content?.map((item) => item.text).join("\n") || "";
    const reqIdMatches = requestsText.matchAll(
      /reqid=(\d+)\s+(GET|POST|PUT|DELETE|PATCH)\s+([^\s]+)\s+\[([^\]]+)\]/g,
    );
    const requestOptions = Array.from(reqIdMatches)
      .map((match) => {
        const [, reqId, method, url, status] = match;
        // Truncate long URLs to 60 characters with ellipsis
        const truncatedUrl = url.length > 60 ? url.substring(0, 57) + "..." : url;
        return `  ${reqId}: ${method} ${truncatedUrl} [${status}]`;
      })
      .reverse() // Show newest requests first
      .join("\n");

    // Extract msgIds from the console messages text
    const messagesText = consoleResult?.content?.map((item) => item.text).join("\n") || "";
    const msgIdMatches = messagesText.matchAll(/msgid=(\d+)\s+\[([^\]]+)\]\s+(.+)/g);
    const messageOptions = Array.from(msgIdMatches)
      .map((match) => {
        const [, msgId, level, text] = match;
        // Truncate long messages to 60 characters with ellipsis
        const truncatedText = text.length > 60 ? text.substring(0, 57) + "..." : text;
        return `  ${msgId}: [${level}] ${truncatedText}`;
      })
      .reverse() // Show newest messages first
      .join("\n");

    // Dynamically update the prompts arguments
    mcpServer.setRequestHandler(ListPromptsRequestSchema, async (_request) => {
      return {
        prompts: [
          {
            ...PROMPT_SCHEMAS.capture_element,
          },
          {
            ...PROMPT_SCHEMAS.view_inspections,
          },
          ...(!chromeDisabled
            ? [
                {
                  ...PROMPT_SCHEMAS.launch_chrome_devtools,
                },
                {
                  ...PROMPT_SCHEMAS.get_network_requests,
                  // TODO: currently, MCP prompt arguments are not typed, and can only be strings,
                  // see https://github.com/modelcontextprotocol/modelcontextprotocol/issues/136
                  arguments: [
                    {
                      name: "reqid",
                      description: `Optional. The request ID to get details for. If omitted, only refreshes and lists requests.\n\nAvailable requests:\n${requestOptions || "No requests available"}`,
                      required: false,
                    },
                  ],
                },
                {
                  ...PROMPT_SCHEMAS.get_console_messages,
                  arguments: [
                    {
                      name: "msgid",
                      description: `Optional. The message ID to get details for. If omitted, only refreshes and lists messages.\n\nAvailable messages:\n${messageOptions || "No messages available"}`,
                      required: false,
                    },
                  ],
                },
              ]
            : []),
        ],
      };
    });

    await mcpServer.sendPromptListChanged();

    // Combine both results
    const combinedContent = [...(networkResult?.content || []), ...(consoleResult?.content || [])];

    return {
      messages: combinedContent.map((item) => ({
        role: "user" as const,
        content: item,
      })),
    } as GetPromptResult;
  }

  mcpServer.setRequestHandler(GetPromptRequestSchema, async (request) => {
    const promptName = request.params.name as keyof typeof PROMPT_SCHEMAS;

    if (
      chromeDisabled &&
      (promptName === "launch_chrome_devtools" ||
        promptName === "get_network_requests" ||
        promptName === "get_console_messages")
    ) {
      return {
        messages: [
          {
            role: "user",
            content: {
              type: "text",
              text: "Chrome integration is disabled. Enable it by unsetting DEV_INSPECTOR_DISABLE_CHROME or setting it to 0/false.",
            },
          },
        ],
      } as GetPromptResult;
    }

    switch (promptName) {
      case "capture_element": {
        const element = (await callMcpMethod(mcpServer, "tools/call", {
          name: "capture_element_context",
          arguments: {},
        })) as CallToolResult;

        return {
          messages:
            element?.content.map((item) => ({
              role: "user",
              content: item,
            })) || [],
        } as GetPromptResult;
      }

      case "view_inspections": {
        const inspections = (await callMcpMethod(mcpServer, "tools/call", {
          name: "list_inspections",
          arguments: {},
        })) as CallToolResult;

        return {
          messages:
            inspections?.content.map((item) => ({
              role: "user",
              content: item,
            })) || [],
        } as GetPromptResult;
      }

      case "launch_chrome_devtools": {
        const defaultUrl = process.env.DEV_INSPECTOR_PUBLIC_BASE_URL
          ? stripTrailingSlash(process.env.DEV_INSPECTOR_PUBLIC_BASE_URL)
          : `http://${serverContext?.host || "localhost"}:${serverContext?.port || 5173}`;
        const url = (request.params.arguments?.url as string | undefined) || defaultUrl;

        try {
          new URL(url);
        } catch {
          return {
            messages: [
              {
                role: "user",
                content: {
                  type: "text",
                  text: `Error: Invalid URL format: "${url}". Please provide a valid URL (e.g., http://localhost:5173)`,
                },
              },
            ],
          } as GetPromptResult;
        }

        try {
          const result = (await callMcpMethod(mcpServer, "tools/call", {
            name: "chrome_devtools",
            arguments: {
              useTool: "chrome_navigate_page",
              hasDefinitions: ["chrome_navigate_page"],
              chrome_navigate_page: {
                url,
              },
            },
          })) as CallToolResult;

          // Auto-refresh chrome state after navigation to populate network requests and console messages
          await refreshChromeState();

          return {
            messages: (result?.content || []).map((item) => ({
              role: "user" as const,
              content: item,
            })),
          } as GetPromptResult;
        } catch (error) {
          return {
            messages: [
              {
                role: "user",
                content: {
                  type: "text",
                  text: `Error launching Chrome DevTools: ${error instanceof Error ? error.message : String(error)}`,
                },
              },
            ],
          } as GetPromptResult;
        }
      }

      case "get_network_requests": {
        // Always refresh first
        const refreshResult = await refreshChromeState();

        const reqidStr = request.params.arguments?.reqid as string | undefined;

        // If no reqid provided, just return the refresh result (list of requests)
        if (!reqidStr) {
          return refreshResult;
        }

        const reqid = parseInt(reqidStr);
        try {
          const result = (await callMcpMethod(mcpServer, "tools/call", {
            name: "chrome_devtools",
            arguments: {
              useTool: "chrome_get_network_request",
              hasDefinitions: ["chrome_get_network_request"],
              chrome_get_network_request: {
                reqid,
              },
            },
          })) as CallToolResult;

          return {
            messages: (result?.content || []).map((item) => ({
              role: "user" as const,
              content: item,
            })),
          } as GetPromptResult;
        } catch (error) {
          return {
            messages: [
              {
                role: "user",
                content: {
                  type: "text",
                  text: `Error getting network request: ${error instanceof Error ? error.message : String(error)}`,
                },
              },
            ],
          } as GetPromptResult;
        }
      }

      case "get_console_messages": {
        // Always refresh first
        const refreshResultConsole = await refreshChromeState();

        const msgidStr = request.params.arguments?.msgid as string | undefined;

        // If no msgid provided, just return the refresh result (list of messages)
        if (!msgidStr) {
          return refreshResultConsole;
        }

        const msgid = parseInt(msgidStr);
        try {
          const result = (await callMcpMethod(mcpServer, "tools/call", {
            name: "chrome_devtools",
            arguments: {
              useTool: "chrome_get_console_message",
              hasDefinitions: ["chrome_get_console_message"],
              chrome_get_console_message: {
                msgid,
              },
            },
          })) as CallToolResult;

          return {
            messages: (result?.content || []).map((item) => ({
              role: "user" as const,
              content: item,
            })),
          } as GetPromptResult;
        } catch (error) {
          return {
            messages: [
              {
                role: "user",
                content: {
                  type: "text",
                  text: `Error getting console message: ${error instanceof Error ? error.message : String(error)}`,
                },
              },
            ],
          } as GetPromptResult;
        }
      }

      default:
        throw new Error(`Unknown promptId: ${promptName}`);
    }
  });

  return mcpClientExecServer;
}
