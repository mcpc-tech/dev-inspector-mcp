/**
 * Native (self-implemented) MCP tools.
 *
 * These tools rely entirely on the client-side interceptor
 * (no Chrome DevTools / CDP required).
 * Both `get_network_requests` and `get_console_messages` are **always**
 * registered here when Chrome is disabled.
 */

import { TOOL_SCHEMAS } from "./tool-schemas.js";
import {
  getLogById,
  getLogs,
  getNetworkRequests,
  getRequestById,
  getStdioById,
  getStdioLogs,
} from "./utils/log-storage.js";

/** Minimal interface required — compatible with both McpServer and ComposableMCPServer. */
type ToolRegistrar = { tool: (...args: any[]) => any };

// Constants
const TRUNCATE_URL_LENGTH = 60;
const TRUNCATE_MESSAGE_LENGTH = 180;

function truncate(str: string, maxLen: number): string {
  return str.length > maxLen ? str.substring(0, maxLen - 3) + "..." : str;
}

/**
 * Register `get_network_requests` and `get_console_messages` tools
 * using the client-side intercepted log storage (no CDP).
 */
export function registerNativeNetworkTool(mcpServer: ToolRegistrar) {
  mcpServer.tool(
    TOOL_SCHEMAS.get_network_requests.name,
    TOOL_SCHEMAS.get_network_requests.description,
    TOOL_SCHEMAS.get_network_requests.inputSchema,
    async ({ reqid }: { reqid?: number }) => {
      if (reqid !== undefined) {
        const req = getRequestById(reqid);
        return {
          content: [
            {
              type: "text" as const,
              text: req ? req.details || JSON.stringify(req, null, 2) : "Not found",
            },
          ],
        };
      }
      const text = getNetworkRequests()
        .map(
          (r) => `reqid=${r.id} ${r.method} ${truncate(r.url, TRUNCATE_URL_LENGTH)} [${r.status}]`,
        )
        .reverse()
        .join("\n");
      return { content: [{ type: "text" as const, text: text || "No network requests" }] };
    },
  );
}

export function registerNativeConsoleTool(mcpServer: ToolRegistrar) {
  mcpServer.tool(
    TOOL_SCHEMAS.get_console_messages.name,
    TOOL_SCHEMAS.get_console_messages.description,
    TOOL_SCHEMAS.get_console_messages.inputSchema,
    async ({ msgid }: { msgid?: number }) => {
      if (msgid !== undefined) {
        const log = getLogById(msgid);
        return {
          content: [
            { type: "text" as const, text: log ? JSON.stringify(log, null, 2) : "Not found" },
          ],
        };
      }
      const text = getLogs()
        .map((l) => {
          const msg = l.args
            .map((a) => (typeof a === "object" ? JSON.stringify(a) : String(a)))
            .join(" ");
          return `msgid=${l.id} [${l.type}] ${truncate(msg, TRUNCATE_MESSAGE_LENGTH)}`;
        })
        .reverse()
        .join("\n");
      return { content: [{ type: "text" as const, text: text || "No console messages" }] };
    },
  );
}

export function registerStdioTool(mcpServer: ToolRegistrar) {
  mcpServer.tool(
    TOOL_SCHEMAS.get_stdio_messages.name,
    TOOL_SCHEMAS.get_stdio_messages.description,
    TOOL_SCHEMAS.get_stdio_messages.inputSchema,
    async ({ stdioid }: { stdioid?: number }) => {
      if (stdioid !== undefined) {
        const log = getStdioById(stdioid);
        return {
          content: [
            { type: "text" as const, text: log ? JSON.stringify(log, null, 2) : "Not found" },
          ],
        };
      }
      const text = getStdioLogs()
        .map((l) => `stdioid=${l.id} [${l.stream}] ${truncate(l.data, TRUNCATE_MESSAGE_LENGTH)}`)
        .reverse()
        .join("\n");
      return { content: [{ type: "text" as const, text: text || "No stdio messages" }] };
    },
  );
}

// ── Prompt helpers (native mode) ─────────────────────────────────────────────

export function getNativeNetworkText(reqid?: string): string {
  if (reqid) {
    const req = getRequestById(parseInt(reqid));
    return req ? req.details || JSON.stringify(req, null, 2) : "Not found";
  }
  const text = getNetworkRequests()
    .map((r) => `reqid=${r.id} ${r.method} ${truncate(r.url, TRUNCATE_URL_LENGTH)} [${r.status}]`)
    .reverse()
    .join("\n");
  return `Network Requests:\n${text || "No requests"}`;
}

export function getNativeConsoleText(msgid?: string): string {
  if (msgid) {
    const log = getLogById(parseInt(msgid));
    return log ? JSON.stringify(log, null, 2) : "Not found";
  }
  const text = getLogs()
    .map((l) => {
      const msg = l.args
        .map((a) => (typeof a === "object" ? JSON.stringify(a) : String(a)))
        .join(" ");
      return `msgid=${l.id} [${l.type}] ${truncate(msg, TRUNCATE_MESSAGE_LENGTH)}`;
    })
    .reverse()
    .join("\n");
  return `Console Messages:\n${text || "No messages"}`;
}

export function getStdioText(stdioid?: string): string {
  if (stdioid) {
    const log = getStdioById(parseInt(stdioid));
    return log ? JSON.stringify(log, null, 2) : "Not found";
  }
  const text = getStdioLogs()
    .map((l) => `stdioid=${l.id} [${l.stream}] ${truncate(l.data, TRUNCATE_MESSAGE_LENGTH)}`)
    .reverse()
    .join("\n");
  return `Stdio Messages:\n${text || "No messages"}`;
}
