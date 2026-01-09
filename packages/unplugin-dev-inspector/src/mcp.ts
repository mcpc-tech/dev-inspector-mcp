import { createClientExecServer } from "@mcpc-tech/cmcp";
import { mcpc } from "@mcpc-tech/core";
import {
  type CallToolResult,
  GetPromptRequestSchema,
  type GetPromptResult,
  type JSONRPCMessage,
  ListPromptsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import path from "node:path";
import { createRequire } from "node:module";
import { PROMPT_SCHEMAS } from "./prompt-schemas.js";
import { TOOL_SCHEMAS } from "./tool-schemas.js";
import { isChromeDisabled, stripTrailingSlash } from "./utils/helpers.js";
import {
  getLogById,
  getLogs,
  getNetworkRequests,
  getRequestById,
  getStdioById,
  getStdioLogs,
} from "./utils/log-storage.js";

/**
 * Get Chrome DevTools binary path from npm package, then use node to run it, faster/stabler than npx
 */
function getChromeDevToolsBinPath(): string {
  // Use createRequire for CJS compatibility (import.meta.resolve is ESM-only)
  const require = createRequire(import.meta.url);
  const chromeDevToolsPkgPath = require.resolve(
    "chrome-devtools-mcp/package.json",
  );
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

import type { Prompt } from "../client/constants/types";

export interface ServerContext {
  host?: string;
  port?: number;
  /**
   * Disable Chrome DevTools integration (chrome-devtools-mcp tool + related prompts).
   * Useful for CI/headless/cloud environments.
   */
  disableChrome?: boolean;
  /**
   * Whether the client supports automation (e.g. Chrome DevTools automation).
   * If false, we should guide the user to open the browser manually.
   */
  isAutomated?: boolean;

  prompts?: Prompt[];
  defaultPrompts?: boolean | string[];
}

/**
 * Create and configure the MCP server for source inspection
 */
export async function createInspectorMcpServer(serverContext?: ServerContext): Promise<any> {
  const {
    disableChrome,
    prompts: userPrompts = [],
    defaultPrompts = true // Default to true (enabled)
  } = serverContext || {};

  const chromeDisabled = isChromeDisabled(disableChrome);
  const isAutomated = serverContext?.isAutomated ?? false;

  console.log(
    `[dev-inspector] Chrome DevTools integration is ${chromeDisabled ? "disabled" : "enabled"
    }`,
  );
  if (userPrompts.length > 0) {
    console.log(`[dev-inspector] Loaded ${userPrompts.length} custom prompts`);
  }

  if (defaultPrompts === false) {
    console.log(`[dev-inspector] Default prompts disabled by config`);
  } else if (Array.isArray(defaultPrompts)) {
    console.log(`[dev-inspector] Default prompts whitelist: ${defaultPrompts.join(', ')}`);
  }

  const chromeDevToolsServers = chromeDisabled ? [] : [
    {
      name: "chrome_devtools",
      description: `Access Chrome DevTools for browser diagnostics.

Provides tools for inspecting network requests, console logs, and performance metrics.

${isAutomated
          ? "Chrome is already open and connected. You can use this tool to inspect the page directly."
          : "The client does not support automation. You MUST ask the user for confirmation before navigating to any URL."
        }

Default dev server URL: ${process.env.DEV_INSPECTOR_PUBLIC_BASE_URL ||
        `http://${serverContext?.host || "localhost"}:${serverContext?.port || 5173
        }`
        }
`,
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
        title:
          "A tool for inspecting and interacting with the development environment.",
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
    {
      ...TOOL_SCHEMAS.capture_area_context,
    },
  ]);

  // Prompts
  mcpServer.setRequestHandler(ListPromptsRequestSchema, async (_request) => {
    const defaultUrl = process.env.DEV_INSPECTOR_PUBLIC_BASE_URL
      ? stripTrailingSlash(process.env.DEV_INSPECTOR_PUBLIC_BASE_URL)
      : `http://${serverContext?.host || "localhost"}:${serverContext?.port || 5173
      }`;

    // Map user prompts to MCP prompt format
    const mappedUserPrompts = userPrompts.map(p => ({
      name: p.name,
      description: p.description,
      arguments: p.arguments,
    }));

    // Default built-in prompts
    const allDefaultPrompts = [
      {
        ...PROMPT_SCHEMAS.capture_element,
      },
      {
        ...PROMPT_SCHEMAS.view_inspections,
      },
      {
        ...PROMPT_SCHEMAS.get_stdio_messages,
      },
      ...(!chromeDisabled
        ? [
          {
            ...PROMPT_SCHEMAS.launch_chrome_devtools,
            description:
              `Launch Chrome DevTools and navigate to the dev server for debugging and inspection. Default URL: ${defaultUrl}. You can use this default URL or provide a custom one.`,
            arguments: [
              {
                name: "url",
                description:
                  `The URL to navigate to. Press Enter to use default: ${defaultUrl}`,
                required: false,
              },
            ],
          },
        ]
        : []),
      {
        ...PROMPT_SCHEMAS.get_network_requests,
      },
      {
        ...PROMPT_SCHEMAS.get_console_messages,
      },
    ];

    // Filter default prompts based on configuration
    let filteredDefaultPrompts: typeof allDefaultPrompts = [];
    if (defaultPrompts === true) {
      filteredDefaultPrompts = allDefaultPrompts;
    } else if (Array.isArray(defaultPrompts)) {
      filteredDefaultPrompts = allDefaultPrompts.filter(p => defaultPrompts.includes(p.name));
    }

    return {
      prompts: [
        ...filteredDefaultPrompts,
        ...mappedUserPrompts
      ]
    };
  });

  // Helper to filter prompts based on configuration
  const filterPrompts = (promptsToFilter: any[]) => {
    if (defaultPrompts === true) return promptsToFilter;
    if (defaultPrompts === false) return [];
    if (Array.isArray(defaultPrompts)) {
      return promptsToFilter.filter(p => defaultPrompts.includes(p.name));
    }
    return promptsToFilter;
  };

  // Helper function to refresh chrome state (network requests and console messages)
  async function refreshChromeState(returnType: 'network' | 'console' | 'all' = 'all'): Promise<GetPromptResult> {
    if (chromeDisabled) {
      // Use local storage
      const requests = getNetworkRequests();
      const logs = getLogs();

      const requestOptions = requests
        .map((r) => {
          // Truncate long URLs
          const truncatedUrl = r.url.length > 60
            ? r.url.substring(0, 57) + "..."
            : r.url;
          return `reqid=${r.id} ${r.method} ${truncatedUrl} [${r.status}]`;
        })
        .reverse() // Newest first to match Chrome DevTools order
        .join("\n");

      const messageOptions = logs
        .map((l) => {
          const text = l.args
            .map((arg) => {
              if (typeof arg === "object" && arg !== null) {
                try {
                  return JSON.stringify(arg);
                } catch {
                  return String(arg);
                }
              }
              return String(arg);
            })
            .join(" ");
          const truncatedText = text.length > 1000
            ? text.substring(0, 997) + "..."
            : text;
          return `msgid=${l.id} [${l.type}] ${truncatedText}`;
        })
        .reverse() // Newest first to match Chrome DevTools order
        .join("\n");

      // Dynamically update prompts (same as chrome version but with local data)
      mcpServer.setRequestHandler(
        ListPromptsRequestSchema,
        async (_request) => {
          return {
            prompts: [
              ...filterPrompts([
                { ...PROMPT_SCHEMAS.capture_element },
                { ...PROMPT_SCHEMAS.view_inspections },
                // When disabled, we still offer these prompts but powered by local storage
                {
                  ...PROMPT_SCHEMAS.get_network_requests,
                  arguments: [
                    {
                      name: "reqid",
                      description:
                        `Optional. The request ID to get details for. If omitted, only refreshes and lists requests.\n\nAvailable requests:\n${requestOptions || "No requests available"
                        }`,
                      required: false,
                    },
                  ],
                },
                {
                  ...PROMPT_SCHEMAS.get_console_messages,
                  arguments: [
                    {
                      name: "msgid",
                      description:
                        `Optional. The message ID to get details for. If omitted, only refreshes and lists messages.\n\nAvailable messages:\n${messageOptions || "No messages available"
                        }`,
                      required: false,
                    },
                  ],
                },
              ]),
              ...userPrompts.map(p => ({
                name: p.name,
                description: p.description,
                arguments: p.arguments,
              }))
            ],
          };
        },
      );

      await mcpServer.sendPromptListChanged();

      let text = "";
      if (returnType === 'network' || returnType === 'all') {
        text += `Network Requests:\n${requestOptions || "No requests"}\n\n`;
      }
      if (returnType === 'console' || returnType === 'all') {
        text += `Console Messages:\n${messageOptions || "No messages"}`;
      }

      return {
        messages: [
          {
            role: "user",
            content: {
              type: "text",
              text: text.trim(),
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
    const requestsText =
      networkResult?.content?.map((item) => item.text).join("\n") || "";
    const reqIdMatches = requestsText.matchAll(
      /reqid=(\d+)\s+(GET|POST|PUT|DELETE|PATCH)\s+([^\s]+)\s+\[([^\]]+)\]/g,
    );
    const requestOptions = Array.from(reqIdMatches)
      .map((match) => {
        const [, reqId, method, url, status] = match;
        // Truncate long URLs to 60 characters with ellipsis
        const truncatedUrl = url.length > 60
          ? url.substring(0, 57) + "..."
          : url;
        return `  ${reqId}: ${method} ${truncatedUrl} [${status}]`;
      })
      .reverse() // Show newest requests first
      .join("\n");

    // Extract msgIds from the console messages text
    const messagesText =
      consoleResult?.content?.map((item) => item.text).join("\n") || "";
    const msgIdMatches = messagesText.matchAll(
      /msgid=(\d+)\s+\[([^\]]+)\]\s+(.+)/g,
    );
    const messageOptions = Array.from(msgIdMatches)
      .map((match) => {
        const [, msgId, level, text] = match;
        // Truncate long messages to 60 characters with ellipsis
        const truncatedText = text.length > 60
          ? text.substring(0, 57) + "..."
          : text;
        return `  ${msgId}: [${level}] ${truncatedText}`;
      })
      .reverse() // Show newest messages first
      .join("\n");

    // Dynamically update the prompts arguments
    mcpServer.setRequestHandler(ListPromptsRequestSchema, async (_request) => {
      const usernamePromptsMapped = userPrompts.map(p => ({
        name: p.name,
        description: p.description,
        arguments: p.arguments,
      }));

      return {
        prompts: [
          ...filterPrompts([
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
                      description:
                        `Optional. The request ID to get details for. If omitted, only refreshes and lists requests.\n\nAvailable requests:\n${requestOptions || "No requests available"
                        }`,
                      required: false,
                    },
                  ],
                },
                {
                  ...PROMPT_SCHEMAS.get_console_messages,
                  arguments: [
                    {
                      name: "msgid",
                      description:
                        `Optional. The message ID to get details for. If omitted, only refreshes and lists messages.\n\nAvailable messages:\n${messageOptions || "No messages available"
                        }`,
                      required: false,
                    },
                  ],
                },
              ]
              : []),
            ...usernamePromptsMapped,
          ]),
        ],
      };
    });

    await mcpServer.sendPromptListChanged();

    // Combine results based on type
    const combinedContent = [];
    if (returnType === 'network' || returnType === 'all') {
      combinedContent.push(...(networkResult?.content || []));
    }
    if (returnType === 'console' || returnType === 'all') {
      combinedContent.push(...(consoleResult?.content || []));
    }

    return {
      messages: combinedContent.map((item) => ({
        role: "user" as const,
        content: item,
      })),
    } as GetPromptResult;
  }

  mcpServer.setRequestHandler(GetPromptRequestSchema, async (request) => {
    const promptName = request.params.name;

    // Check if it's a user prompt
    const userPrompt = userPrompts.find(p => p.name === promptName);
    if (userPrompt) {
      // Basic argument interpolation: replace {{argName}} with value
      let text = userPrompt.template || userPrompt.description || userPrompt.name;
      if (request.params.arguments) {
        for (const [key, value] of Object.entries(request.params.arguments)) {
          text = text.replace(new RegExp(`{{${key}}}`, 'g'), String(value));
        }
      }

      return {
        messages: [{
          role: "user",
          content: {
            type: "text",
            text: text
          },
        }],
      } as GetPromptResult;
    }

    if (chromeDisabled) {
      if (promptName === "get_network_requests") {
        const refreshResult = await refreshChromeState('network');
        const reqidStr = request.params.arguments?.reqid as string | undefined;
        if (!reqidStr) return refreshResult;

        const req = getRequestById(parseInt(reqidStr));
        if (req) {
          return {
            messages: [
              {
                role: "user",
                content: {
                  type: "text",
                  text: req.details || JSON.stringify(req, null, 2),
                },
              },
            ],
          } as GetPromptResult;
        }
        return {
          messages: [{
            role: "user",
            content: { type: "text", text: "Request not found" },
          }],
        } as GetPromptResult;
      }

      if (promptName === "get_console_messages") {
        const refreshResult = await refreshChromeState('console');
        const msgidStr = request.params.arguments?.msgid as string | undefined;
        if (!msgidStr) return refreshResult;

        const log = getLogById(parseInt(msgidStr));
        if (log) {
          return {
            messages: [
              {
                role: "user",
                content: {
                  type: "text",
                  text: JSON.stringify(log, null, 2),
                },
              },
            ],
          } as GetPromptResult;
        }
        return {
          messages: [{
            role: "user",
            content: { type: "text", text: "Log not found" },
          }],
        } as GetPromptResult;
      }

      // For launch_chrome_devtools when disabled, show warning
      if (promptName === "launch_chrome_devtools") {
        return {
          messages: [
            {
              role: "user",
              content: {
                type: "text",
                text:
                  "Chrome integration is disabled. Enable it by unsetting DEV_INSPECTOR_DISABLE_CHROME or setting it to 0/false.",
              },
            },
          ],
        } as GetPromptResult;
      }
    }

    switch (promptName) {
      case "capture_element": {
        const automated = request.params.arguments?.automated === "true";
        const element = (await callMcpMethod(mcpServer, "tools/call", {
          name: "capture_element_context",
          arguments: {
            automated,
          },
        })) as CallToolResult;

        return {
          messages: element?.content.map((item) => ({
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
          messages: inspections?.content.map((item) => ({
            role: "user",
            content: item,
          })) || [],
        } as GetPromptResult;
      }

      case "launch_chrome_devtools": {
        const defaultUrl = process.env.DEV_INSPECTOR_PUBLIC_BASE_URL
          ? stripTrailingSlash(process.env.DEV_INSPECTOR_PUBLIC_BASE_URL)
          : `http://${serverContext?.host || "localhost"}:${serverContext?.port || 5173
          }`;
        const url = (request.params.arguments?.url as string | undefined) ||
          defaultUrl;

        try {
          new URL(url);
        } catch {
          return {
            messages: [
              {
                role: "user",
                content: {
                  type: "text",
                  text:
                    `Error: Invalid URL format: "${url}". Please provide a valid URL (e.g., http://localhost:5173)`,
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
                  text: `Error launching Chrome DevTools: ${error instanceof Error ? error.message : String(error)
                    }`,
                },
              },
            ],
          } as GetPromptResult;
        }
      }

      case "get_network_requests": {
        // Always refresh first
        const refreshResult = await refreshChromeState('network');

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
                  text: `Error getting network request: ${error instanceof Error ? error.message : String(error)
                    }`,
                },
              },
            ],
          } as GetPromptResult;
        }
      }

      case "get_console_messages": {
        // Always refresh first
        const refreshResultConsole = await refreshChromeState('console');

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
                  text: `Error getting console message: ${error instanceof Error ? error.message : String(error)
                    }`,
                },
              },
            ],
          } as GetPromptResult;
        }
      }

      case "get_stdio_messages": {
        const stdioLogs = getStdioLogs();
        const stdioIdStr = request.params.arguments?.stdioid as
          | string
          | undefined;

        // Format logs list
        const formattedMessages = stdioLogs
          .map((log) => {
            const truncatedData = log.data.length > 1000
              ? log.data.substring(0, 997) + "..."
              : log.data;
            return `stdioid=${log.id} [${log.stream}] ${truncatedData}`;
          })
          .reverse(); // Newest first

        // If specific ID requested, return that log
        if (stdioIdStr) {
          const stdioId = parseInt(stdioIdStr);
          if (isNaN(stdioId)) {
            return {
              messages: [{
                role: "user",
                content: { type: "text", text: "Invalid stdio ID" },
              }],
            } as GetPromptResult;
          }
          const log = getStdioById(stdioId);
          if (log) {
            return {
              messages: [{
                role: "user",
                content: { type: "text", text: JSON.stringify(log, null, 2) },
              }],
            } as GetPromptResult;
          }
          return {
            messages: [{
              role: "user",
              content: { type: "text", text: "Stdio message not found" },
            }],
          } as GetPromptResult;
        }

        // Update prompt with available messages
        mcpServer.setRequestHandler(
          ListPromptsRequestSchema,
          async (_request) => {
            const defaultUrl = process.env.DEV_INSPECTOR_PUBLIC_BASE_URL
              ? stripTrailingSlash(process.env.DEV_INSPECTOR_PUBLIC_BASE_URL)
              : `http://${serverContext?.host || "localhost"}:${serverContext?.port || 5173
              }`;

            return {
              prompts: [
                { ...PROMPT_SCHEMAS.capture_element },
                { ...PROMPT_SCHEMAS.view_inspections },
                {
                  ...PROMPT_SCHEMAS.get_stdio_messages,
                  arguments: [{
                    name: "stdioid",
                    description:
                      `Optional. The stdio message ID to get details for.\n\nAvailable messages:\n${formattedMessages.join("\n") || "No stdio messages"
                      }`,
                    required: false,
                  }],
                },
                ...(!chromeDisabled
                  ? [
                    {
                      ...PROMPT_SCHEMAS.launch_chrome_devtools,
                      description:
                        `Launch Chrome DevTools and navigate to the dev server. Default URL: ${defaultUrl}`,
                      arguments: [{
                        name: "url",
                        description:
                          `URL to navigate to. Default: ${defaultUrl}`,
                        required: false,
                      }],
                    },
                    { ...PROMPT_SCHEMAS.get_network_requests },
                    { ...PROMPT_SCHEMAS.get_console_messages },
                  ]
                  : []),
              ],
            };
          },
        );

        await mcpServer.sendPromptListChanged();

        return {
          messages: [{
            role: "user",
            content: {
              type: "text",
              text: `Stdio Messages (Terminal Output):\n${formattedMessages.join("\n") || "No stdio messages"
                }`,
            },
          }],
        } as GetPromptResult;
      }

      default:
        throw new Error(`Unknown promptId: ${promptName}`);
    }
  });

  return mcpClientExecServer;
}
