/**
 * Chrome DevTools MCP integration.
 *
 * Wraps `chrome-devtools-mcp` (>=0.20.x) as an agentic sub-server via
 * `@mcpc-tech/core`.  Tool names in 0.20.x no longer carry a `chrome_`
 * prefix — they are accessed as `chrome.<tool>` inside the mcpc scope.
 *
 * Exposed chrome tools referenced here:
 *   chrome.navigate_page  chrome.list_pages   chrome.select_page
 *   chrome.close_page     chrome.new_page
 *   chrome.click          chrome.hover        chrome.fill
 *   chrome.fill_form      chrome.press_key    chrome.drag
 *   chrome.wait_for       chrome.take_screenshot
 *   chrome.list_network_requests  chrome.get_network_request
 *   chrome.list_console_messages  chrome.get_console_message
 *   chrome.evaluate_script
 */

import path from "node:path";
import fs from "node:fs";
import { createRequire } from "node:module";

// ── Binary path ───────────────────────────────────────────────────────────────

export function getChromeDevToolsBinPath(): string {
  const require = createRequire(import.meta.url);
  const pkgPath = require.resolve("chrome-devtools-mcp/package.json");
  const pkgDir = path.dirname(pkgPath);
  // 0.20.x: stdio entry moved to bin/chrome-devtools-mcp.js
  // 0.12.x: was build/src/index.js
  const binPath = path.join(pkgDir, "./build/src/bin/chrome-devtools-mcp.js");
  const legacyPath = path.join(pkgDir, "./build/src/index.js");
  return fs.existsSync(binPath) ? binPath : legacyPath;
}

// ── mcpc server config ────────────────────────────────────────────────────────

/**
 * Build the agentic chrome_devtools sub-server config consumed by `mcpc()`.
 *
 * In @mcpc-tech/core the deps.mcpServers key becomes the MCP scope prefix,
 * so a server registered as `chrome` exposes tools as `chrome.<name>`.
 * The `refs` option tells the agentic wrapper which tools to surface.
 */
export function buildChromeDevToolsServerConfig(opts: {
  isAutomated: boolean;
  defaultUrl: string;
}) {
  return {
    name: "chrome_devtools",
    description: `Chrome DevTools for full browser diagnostics (network, console, screenshots, interaction). ${
      opts.isAutomated ? "Chrome is already connected." : "Ask the user before navigating."
    } Default URL: ${opts.defaultUrl}`,
    options: {
      refs: [
        // page management
        '<tool name="chrome.navigate_page"/>',
        '<tool name="chrome.list_pages"/>',
        '<tool name="chrome.select_page"/>',
        '<tool name="chrome.close_page"/>',
        '<tool name="chrome.new_page"/>',
        // interaction
        '<tool name="chrome.click"/>',
        '<tool name="chrome.hover"/>',
        '<tool name="chrome.fill"/>',
        '<tool name="chrome.fill_form"/>',
        '<tool name="chrome.press_key"/>',
        '<tool name="chrome.drag"/>',
        '<tool name="chrome.wait_for"/>',
        // capture
        '<tool name="chrome.take_screenshot"/>',
        // network & console
        '<tool name="chrome.list_network_requests"/>',
        '<tool name="chrome.get_network_request"/>',
        '<tool name="chrome.list_console_messages"/>',
        '<tool name="chrome.get_console_message"/>',
        // script
        '<tool name="chrome.evaluate_script"/>',
      ] as unknown as any,
    },
    deps: {
      mcpServers: {
        chrome: {
          transportType: "stdio" as const,
          command: "node",
          args: [getChromeDevToolsBinPath(), "--autoConnect"],
        },
      },
    },
  };
}

// ── Prompt helpers (Chrome mode) ──────────────────────────────────────────────

/**
 * Tool names used when calling Chrome tools through the mcpc agentic tool.
 * mcpc sanitizes scoped names (dots → underscores), so chrome.navigate_page
 * becomes chrome_navigate_page in the `tool` field.
 */
export const CHROME_TOOL = {
  list_network_requests: "chrome_list_network_requests",
  get_network_request: "chrome_get_network_request",
  list_console_messages: "chrome_list_console_messages",
  get_console_message: "chrome_get_console_message",
} as const;
