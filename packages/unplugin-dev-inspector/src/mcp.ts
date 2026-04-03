/**
 * Inspector MCP server factory.
 *
 * Assembles the server from two independent modules:
 *   - mcp-chrome.ts  – Chrome DevTools (cdp) tools  (optional)
 *   - mcp-native.ts  – client-interceptor tools      (always available)
 *
 * Chrome mode is enabled unless `disableChrome` is set or the env var
 * `DEV_INSPECTOR_DISABLE_CHROME=1` is present.
 */

import { createClientExecServer } from "@mcpc-tech/cmcp";
import { mcpc } from "@mcpc-tech/core";
import {
  type CallToolResult,
  GetPromptRequestSchema,
  type GetPromptResult,
  type JSONRPCMessage,
  ListPromptsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { PROMPT_SCHEMAS } from "./prompt-schemas.js";
import { TOOL_SCHEMAS } from "./tool-schemas.js";
import { isChromeDisabled, stripTrailingSlash } from "./utils/helpers.js";
import { buildChromeDevToolsServerConfig, CHROME_TOOL } from "./mcp-chrome.js";
import {
  registerNativeNetworkTool,
  registerNativeConsoleTool,
  registerStdioTool,
  getNativeNetworkText,
  getNativeConsoleText,
  getStdioText,
} from "./mcp-native.js";

import type { Prompt } from "../client/constants/types";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ServerContext {
  host?: string;
  port?: number;
  /** The app dev server URL (e.g. http://localhost:5173). Used as default navigate target. */
  appUrl?: string;
  disableChrome?: boolean;
  isAutomated?: boolean;
  prompts?: Prompt[];
  defaultPrompts?: boolean | string[];
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function textMessage(text: string): GetPromptResult {
  return { messages: [{ role: "user", content: { type: "text", text } }] };
}

function toolResultToPrompt(result: CallToolResult | null | undefined): GetPromptResult {
  const content = result?.content;
  if (!content || !Array.isArray(content) || content.length === 0) {
    return textMessage("No result. Please try again.");
  }
  return { messages: content.map((item) => ({ role: "user" as const, content: item })) };
}

/**
 * Inject a synthetic JSONRPC request into the transport and resolve when the
 * matching response arrives.  Used to call tools on the same server from
 * prompt handlers.
 */
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

// ── Factory ───────────────────────────────────────────────────────────────────

export async function createInspectorMcpServer(serverContext?: ServerContext): Promise<any> {
  const { disableChrome, prompts: userPrompts = [], defaultPrompts = true } = serverContext || {};

  const chromeDisabled = isChromeDisabled(disableChrome);
  const isAutomated = serverContext?.isAutomated ?? false;

  const getMcpUrl = () =>
    process.env.DEV_INSPECTOR_PUBLIC_BASE_URL
      ? stripTrailingSlash(process.env.DEV_INSPECTOR_PUBLIC_BASE_URL)
      : `http://${serverContext?.host ?? "localhost"}:${serverContext?.port ?? 6137}`;

  console.log(`[dev-inspector] Chrome DevTools: ${chromeDisabled ? "disabled" : "enabled"}`);

  // ── Create mcpc server ────────────────────────────────────────────────────

  const chromeServerConfigs = chromeDisabled
    ? []
    : [buildChromeDevToolsServerConfig({ isAutomated, defaultUrl: getMcpUrl() })];

  const mcpServer = await mcpc(
    [
      { name: "dev-inspector", version: "1.0.0", title: "Dev environment inspection tool" },
      {
        capabilities: {
          tools: { listChanged: true },
          prompts: { listChanged: true },
        },
      },
    ],
    chromeServerConfigs,
  );

  // ── Register server-side tools ────────────────────────────────────────────

  // Network & console: native (interceptor) when Chrome is off; Chrome handles
  // them directly when Chrome is on (they are exposed via the agentic tool).
  if (chromeDisabled) {
    registerNativeNetworkTool(mcpServer);
    registerNativeConsoleTool(mcpServer);
  }

  // Stdio is always native (dev server stdout/stderr, not a browser concept).
  registerStdioTool(mcpServer);

  // ── Register client-side (CMCP) tools ─────────────────────────────────────

  const mcpClientExecServer = createClientExecServer(mcpServer as any, "inspector");
  mcpClientExecServer.registerClientToolSchemas([
    TOOL_SCHEMAS.capture_element_context,
    TOOL_SCHEMAS.capture_area_context,
    TOOL_SCHEMAS.list_inspections,
    TOOL_SCHEMAS.update_inspection_status,
    TOOL_SCHEMAS.execute_page_script,
    TOOL_SCHEMAS.get_page_info,
  ]);

  // ── Prompt helpers ────────────────────────────────────────────────────────

  const mapUserPrompts = () =>
    userPrompts.map((p) => ({ name: p.name, description: p.description, arguments: p.arguments }));

  const filterPrompts = <T extends { name: string }>(prompts: T[]): T[] => {
    if (defaultPrompts === true) return prompts;
    if (defaultPrompts === false) return [];
    if (Array.isArray(defaultPrompts))
      return prompts.filter((p) => defaultPrompts.includes(p.name));
    return prompts;
  };

  /** Call a tool on the mcpc server (including agentic Chrome sub-tools). */
  const callTool = async (name: string, args: Record<string, unknown> = {}) =>
    (await callMcpMethod(mcpServer, "tools/call", {
      name,
      arguments: args,
    })) as CallToolResult;

  /**
   * Call a Chrome DevTools sub-tool through the agentic `chrome_devtools` wrapper.
   * New mcpc format (0.3.42+): { tool: "<name>", args: { ...params } }
   */
  const callChromeTool = async (toolName: string, args: Record<string, unknown> = {}) =>
    (await callMcpMethod(mcpServer, "tools/call", {
      name: "chrome_devtools",
      arguments: { tool: toolName, args },
    })) as CallToolResult;

  // ── Prompt list ───────────────────────────────────────────────────────────

  mcpServer.setRequestHandler(ListPromptsRequestSchema, async () => {
    const builtInPrompts = [
      PROMPT_SCHEMAS.capture_element_context,
      PROMPT_SCHEMAS.capture_area_context,
      PROMPT_SCHEMAS.list_inspections,
      PROMPT_SCHEMAS.get_stdio_messages,
      PROMPT_SCHEMAS.get_network_requests,
      PROMPT_SCHEMAS.get_console_messages,
    ];
    return { prompts: [...filterPrompts(builtInPrompts), ...mapUserPrompts()] };
  });

  // ── Prompt handler ────────────────────────────────────────────────────────

  mcpServer.setRequestHandler(GetPromptRequestSchema, async (request) => {
    const { name: promptName, arguments: args } = request.params;

    // User-defined prompts
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

    switch (promptName) {
      case "capture_element_context":
        return toolResultToPrompt(
          await callTool("capture_element_context", { selector: args?.selector }),
        );

      case "capture_area_context":
        return toolResultToPrompt(
          await callTool("capture_area_context", { containerSelector: args?.containerSelector }),
        );

      case "list_inspections":
        return toolResultToPrompt(await callTool("list_inspections"));

      case "get_stdio_messages":
        return textMessage(getStdioText(args?.stdioid as string | undefined));

      case "get_network_requests": {
        const reqid = args?.reqid as string | undefined;
        if (!chromeDisabled) {
          // Chrome mode — delegate to Chrome DevTools
          if (reqid) {
            return toolResultToPrompt(
              await callChromeTool(CHROME_TOOL.get_network_request, {
                reqid: parseInt(reqid),
              }),
            );
          }
          return toolResultToPrompt(await callChromeTool(CHROME_TOOL.list_network_requests));
        }
        // Native mode
        return textMessage(getNativeNetworkText(reqid));
      }

      case "get_console_messages": {
        const msgid = args?.msgid as string | undefined;
        if (!chromeDisabled) {
          if (msgid) {
            return toolResultToPrompt(
              await callChromeTool(CHROME_TOOL.get_console_message, {
                msgid: parseInt(msgid),
              }),
            );
          }
          return toolResultToPrompt(await callChromeTool(CHROME_TOOL.list_console_messages));
        }
        // Native mode
        return textMessage(getNativeConsoleText(msgid));
      }

      default:
        throw new Error(`Unknown prompt: ${promptName}`);
    }
  });

  return mcpClientExecServer;
}
