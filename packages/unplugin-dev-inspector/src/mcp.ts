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
import type { Prompt } from "../client/constants/types";

// Constants
const TRUNCATE_URL_LENGTH = 60;
const TRUNCATE_MESSAGE_LENGTH = 180;

// Helper: Create text message for GetPromptResult
function textMessage(text: string): GetPromptResult {
  return { messages: [{ role: "user", content: { type: "text", text } }] };
}

// Helper: Convert CallToolResult content to GetPromptResult messages
function toolResultToPrompt(result: CallToolResult | null | undefined): GetPromptResult {
  const content = result?.content;
  if (!content || !Array.isArray(content) || content.length === 0) {
    return textMessage("No result. Please try again.");
  }
  return { messages: content.map((item) => ({ role: "user" as const, content: item })) };
}

// Helper: Truncate string
function truncate(str: string, maxLen: number): string {
  return str.length > maxLen ? str.substring(0, maxLen - 3) + "..." : str;
}

// Get Chrome DevTools binary path
function getChromeDevToolsBinPath(): string {
  const require = createRequire(import.meta.url);
  const pkgPath = require.resolve("chrome-devtools-mcp/package.json");
  return path.join(path.dirname(pkgPath), "./build/src/index.js");
}

// Call MCP server method and wait for response
function callMcpMethod(
  mcpServer: Awaited<ReturnType<typeof mcpc>>,
  method: string,
  params?: unknown,
): Promise<unknown> {
  const messageId = Date.now();
  return new Promise((resolve) => {
    if (!mcpServer.transport) throw new Error("MCP server transport not initialized");

    mcpServer.transport.onmessage?.({
      method,
      params: params as Record<string, unknown>,
      jsonrpc: "2.0",
      id: messageId,
    } as JSONRPCMessage);

    const originalSend = mcpServer.transport.send;
    mcpServer.transport.send = function (payload: JSONRPCMessage) {
      const p = payload as { id: number; result: unknown };
      if (p.id === messageId) {
        resolve(p.result);
        mcpServer.transport!.send = originalSend;
      }
      return originalSend.call(this, payload);
    };
  });
}

export interface ServerContext {
  host?: string;
  port?: number;
  disableChrome?: boolean;
  isAutomated?: boolean;
  prompts?: Prompt[];
  defaultPrompts?: boolean | string[];
}

export async function createInspectorMcpServer(serverContext?: ServerContext): Promise<any> {
  const {
    disableChrome,
    prompts: userPrompts = [],
    defaultPrompts = true,
  } = serverContext || {};

  const chromeDisabled = isChromeDisabled(disableChrome);
  const isAutomated = serverContext?.isAutomated ?? false;
  const getDefaultUrl = () =>
    process.env.DEV_INSPECTOR_PUBLIC_BASE_URL
      ? stripTrailingSlash(process.env.DEV_INSPECTOR_PUBLIC_BASE_URL)
      : `http://${serverContext?.host || "localhost"}:${serverContext?.port || 5173}`;

  console.log(`[dev-inspector] Chrome DevTools: ${chromeDisabled ? "disabled" : "enabled"}`);

  // Chrome DevTools server config
  const chromeDevToolsServers = chromeDisabled
    ? []
    : [
        {
          name: "chrome_devtools",
          description: `Chrome DevTools for browser diagnostics. ${
            isAutomated ? "Chrome is connected." : "Ask user before navigating."
          } Default URL: ${getDefaultUrl()}`,
          options: {
            refs: [
              '<tool name="chrome.navigate_page"/>',
              '<tool name="chrome.list_pages"/>',
              '<tool name="chrome.select_page"/>',
              '<tool name="chrome.close_page"/>',
              '<tool name="chrome.new_page"/>',
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
      { name: "dev-inspector", version: "1.0.0", title: "Dev environment inspection tool" },
      { capabilities: { tools: { listChanged: true }, sampling: {}, prompts: { listChanged: true } } },
    ],
    chromeDevToolsServers,
  );

  // Server-side tools (when Chrome is disabled, use local storage)
  if (chromeDisabled) {
    mcpServer.tool(
      TOOL_SCHEMAS.get_network_requests.name,
      TOOL_SCHEMAS.get_network_requests.description,
      TOOL_SCHEMAS.get_network_requests.inputSchema,
      async ({ reqid }: { reqid?: number }) => {
        if (reqid !== undefined) {
          const req = getRequestById(reqid);
          return { content: [{ type: "text" as const, text: req ? (req.details || JSON.stringify(req, null, 2)) : "Not found" }] };
        }
        const text = getNetworkRequests()
          .map((r) => `reqid=${r.id} ${r.method} ${truncate(r.url, TRUNCATE_URL_LENGTH)} [${r.status}]`)
          .reverse()
          .join("\n");
        return { content: [{ type: "text" as const, text: text || "No network requests" }] };
      },
    );

    mcpServer.tool(
      TOOL_SCHEMAS.get_console_messages.name,
      TOOL_SCHEMAS.get_console_messages.description,
      TOOL_SCHEMAS.get_console_messages.inputSchema,
      async ({ msgid }: { msgid?: number }) => {
        if (msgid !== undefined) {
          const log = getLogById(msgid);
          return { content: [{ type: "text" as const, text: log ? JSON.stringify(log, null, 2) : "Not found" }] };
        }
        const text = getLogs()
          .map((l) => {
            const msg = l.args.map((a) => (typeof a === "object" ? JSON.stringify(a) : String(a))).join(" ");
            return `msgid=${l.id} [${l.type}] ${truncate(msg, TRUNCATE_MESSAGE_LENGTH)}`;
          })
          .reverse()
          .join("\n");
        return { content: [{ type: "text" as const, text: text || "No console messages" }] };
      },
    );
  }

  // Stdio tool (always available)
  mcpServer.tool(
    TOOL_SCHEMAS.get_stdio_messages.name,
    TOOL_SCHEMAS.get_stdio_messages.description,
    TOOL_SCHEMAS.get_stdio_messages.inputSchema,
    async ({ stdioid }: { stdioid?: number }) => {
      if (stdioid !== undefined) {
        const log = getStdioById(stdioid);
        return { content: [{ type: "text" as const, text: log ? JSON.stringify(log, null, 2) : "Not found" }] };
      }
      const text = getStdioLogs()
        .map((l) => `stdioid=${l.id} [${l.stream}] ${truncate(l.data, TRUNCATE_MESSAGE_LENGTH)}`)
        .reverse()
        .join("\n");
      return { content: [{ type: "text" as const, text: text || "No stdio messages" }] };
    },
  );

  // Client tools (executed in browser)
  const mcpClientExecServer = createClientExecServer(mcpServer, "inspector");
  mcpClientExecServer.registerClientToolSchemas([
    TOOL_SCHEMAS.capture_element_context,
    TOOL_SCHEMAS.capture_area_context,
    TOOL_SCHEMAS.list_inspections,
    TOOL_SCHEMAS.update_inspection_status,
    TOOL_SCHEMAS.execute_page_script,
    TOOL_SCHEMAS.get_page_info,
  ]);

  // Helper: Map user prompts
  const mapUserPrompts = () => userPrompts.map((p) => ({ name: p.name, description: p.description, arguments: p.arguments }));

  // Helper: Filter prompts by config
  const filterPrompts = <T extends { name: string }>(prompts: T[]): T[] => {
    if (defaultPrompts === true) return prompts;
    if (defaultPrompts === false) return [];
    if (Array.isArray(defaultPrompts)) return prompts.filter((p) => defaultPrompts.includes(p.name));
    return prompts;
  };

  // Helper: Call Chrome DevTools tool
  const callChromeTool = async (toolName: string, args: Record<string, unknown> = {}) => {
    return (await callMcpMethod(mcpServer, "tools/call", {
      name: "chrome_devtools",
      arguments: { useTool: toolName, hasDefinitions: [toolName], [toolName]: args },
    })) as CallToolResult;
  };

  // Helper: Call client tool
  const callClientTool = async (name: string, args: Record<string, unknown> = {}) => {
    return (await callMcpMethod(mcpServer, "tools/call", { name, arguments: args })) as CallToolResult;
  };

  // Prompts list handler
  mcpServer.setRequestHandler(ListPromptsRequestSchema, async () => {
    const defaultUrl = getDefaultUrl();
    const builtInPrompts = [
      PROMPT_SCHEMAS.capture_element_context,
      PROMPT_SCHEMAS.capture_area_context,
      PROMPT_SCHEMAS.list_inspections,
      PROMPT_SCHEMAS.get_stdio_messages,
      ...(!chromeDisabled
        ? [
            { ...PROMPT_SCHEMAS.launch_chrome_devtools, description: `Launch Chrome DevTools. Default: ${defaultUrl}` },
            PROMPT_SCHEMAS.get_network_requests,
            PROMPT_SCHEMAS.get_console_messages,
          ]
        : [PROMPT_SCHEMAS.get_network_requests, PROMPT_SCHEMAS.get_console_messages]),
    ];
    return { prompts: [...filterPrompts(builtInPrompts), ...mapUserPrompts()] };
  });

  // Prompt handler
  mcpServer.setRequestHandler(GetPromptRequestSchema, async (request) => {
    const { name: promptName, arguments: args } = request.params;

    // User prompt
    const userPrompt = userPrompts.find((p) => p.name === promptName);
    if (userPrompt) {
      let text = userPrompt.template || userPrompt.description || userPrompt.name;
      if (args) {
        for (const [k, v] of Object.entries(args)) {
          text = text.replace(new RegExp(`{{${k}}}`, "g"), String(v));
        }
      }
      return textMessage(text);
    }

    // Built-in prompts
    switch (promptName) {
      case "capture_element_context": {
        const result = await callClientTool("capture_element_context", { selector: args?.selector });
        return toolResultToPrompt(result);
      }

      case "capture_area_context": {
        const result = await callClientTool("capture_area_context", { containerSelector: args?.containerSelector });
        return toolResultToPrompt(result);
      }

      case "list_inspections":
        return toolResultToPrompt(await callClientTool("list_inspections"));

      case "get_stdio_messages": {
        const stdioid = args?.stdioid;
        if (stdioid) {
          const log = getStdioById(parseInt(stdioid as string));
          return textMessage(log ? JSON.stringify(log, null, 2) : "Not found");
        }
        const text = getStdioLogs()
          .map((l) => `stdioid=${l.id} [${l.stream}] ${truncate(l.data, TRUNCATE_MESSAGE_LENGTH)}`)
          .reverse()
          .join("\n");
        return textMessage(`Stdio Messages:\n${text || "No messages"}`);
      }

      case "launch_chrome_devtools": {
        if (chromeDisabled) return textMessage("Chrome integration is disabled.");
        const url = (args?.url as string) || getDefaultUrl();
        try {
          new URL(url);
        } catch {
          return textMessage(`Invalid URL: "${url}"`);
        }
        try {
          const result = await callChromeTool("chrome_navigate_page", { url });
          return toolResultToPrompt(result);
        } catch (e) {
          return textMessage(`Error: ${e instanceof Error ? e.message : String(e)}`);
        }
      }

      case "get_network_requests": {
        const reqid = args?.reqid;
        if (chromeDisabled) {
          if (reqid) {
            const req = getRequestById(parseInt(reqid as string));
            return textMessage(req ? (req.details || JSON.stringify(req, null, 2)) : "Not found");
          }
          const text = getNetworkRequests()
            .map((r) => `reqid=${r.id} ${r.method} ${truncate(r.url, TRUNCATE_URL_LENGTH)} [${r.status}]`)
            .reverse()
            .join("\n");
          return textMessage(`Network Requests:\n${text || "No requests"}`);
        }
        // Chrome mode
        if (reqid) {
          return toolResultToPrompt(await callChromeTool("chrome_get_network_request", { reqid: parseInt(reqid as string) }));
        }
        return toolResultToPrompt(await callChromeTool("chrome_list_network_requests"));
      }

      case "get_console_messages": {
        const msgid = args?.msgid;
        if (chromeDisabled) {
          if (msgid) {
            const log = getLogById(parseInt(msgid as string));
            return textMessage(log ? JSON.stringify(log, null, 2) : "Not found");
          }
          const text = getLogs()
            .map((l) => {
              const msg = l.args.map((a) => (typeof a === "object" ? JSON.stringify(a) : String(a))).join(" ");
              return `msgid=${l.id} [${l.type}] ${truncate(msg, TRUNCATE_MESSAGE_LENGTH)}`;
            })
            .reverse()
            .join("\n");
          return textMessage(`Console Messages:\n${text || "No messages"}`);
        }
        // Chrome mode
        if (msgid) {
          return toolResultToPrompt(await callChromeTool("chrome_get_console_message", { msgid: parseInt(msgid as string) }));
        }
        return toolResultToPrompt(await callChromeTool("chrome_list_console_messages"));
      }

      default:
        throw new Error(`Unknown prompt: ${promptName}`);
    }
  });

  return mcpClientExecServer;
}
