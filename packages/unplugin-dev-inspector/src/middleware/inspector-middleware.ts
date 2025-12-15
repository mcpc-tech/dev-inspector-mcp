import type { Connect } from "vite";
import type { IncomingMessage, ServerResponse } from "http";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { dirname } from "path";
import type { Agent } from "../../client/constants/types";
import { handleCors } from "../utils/cors";

// ESM equivalent of __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Get the inspector client script content
 * Tries multiple paths to locate the bundled inspector script
 */
function getInspectorScript(): string | null {
  const possiblePaths = [
    path.resolve(process.cwd(), "packages/unplugin-dev-inspector/client/dist/inspector.iife.js"),
    path.resolve(__dirname, "../../client/dist/inspector.iife.js"),
    path.resolve(__dirname, "../client/dist/inspector.iife.js"),
    path.resolve(
      process.cwd(),
      "node_modules/@mcpc-tech/unplugin-dev-inspector-mcp/client/dist/inspector.iife.js",
    ),
  ];

  for (const scriptPath of possiblePaths) {
    try {
      if (fs.existsSync(scriptPath)) {
        return fs.readFileSync(scriptPath, "utf-8");
      }
    } catch (error) {
      continue;
    }
  }

  console.warn("⚠️  Inspector script not found. Run `pnpm build:client` first.");
  return null;
}

function getInspectorCSS(): string | null {
  const possiblePaths = [
    path.resolve(process.cwd(), "packages/unplugin-dev-inspector/client/dist/inspector.css"),
    path.resolve(__dirname, "../../client/dist/inspector.css"),
    path.resolve(__dirname, "../client/dist/inspector.css"),
    path.resolve(
      process.cwd(),
      "node_modules/@mcpc-tech/unplugin-dev-inspector-mcp/client/dist/inspector.css",
    ),
  ];

  for (const cssPath of possiblePaths) {
    try {
      if (fs.existsSync(cssPath)) {
        return fs.readFileSync(cssPath, "utf-8");
      }
    } catch (error) {
      continue;
    }
  }

  console.warn("⚠️  Inspector CSS not found. Run `pnpm build:client` first.");
  return null;
}

export interface InspectorConfig {
  /**
   * @see AVAILABLE_AGENTS https://github.com/mcpc-tech/dev-inspector-mcp/blob/main/packages/unplugin-dev-inspector/client/constants/agents.ts
   */
  agents?: Agent[];
  /**
   * Filter which agents are visible (applies after merging custom agents)
   * @example ['Claude Code', 'Gemini CLI']
   */
  visibleAgents?: string[];
  /**
   * @default "Claude Code"
   * @see AVAILABLE_AGENTS https://github.com/mcpc-tech/dev-inspector-mcp/blob/main/packages/unplugin-dev-inspector/client/constants/agents.ts
   */
  defaultAgent?: string;

  /**
   * @default true
   */
  showInspectorBar?: boolean;
}

export function setupInspectorMiddleware(middlewares: Connect.Server, config?: InspectorConfig) {
  let cachedScript: string | null = null;
  let cachedCSS: string | null = null;
  let filesChecked = false;

  middlewares.use((req: IncomingMessage, res: ServerResponse, next: () => void) => {
    // Handle CORS for inspector endpoints
    if (req.url?.startsWith("/__inspector__")) {
      if (handleCors(req, res)) return;
    }

    if (!filesChecked) {
      cachedScript = getInspectorScript();
      cachedCSS = getInspectorCSS();
      filesChecked = true;
    }

    if (req.url === "/__inspector__/inspector.iife.js") {
      if (cachedScript) {
        res.statusCode = 200;
        res.setHeader("Content-Type", "application/javascript");
        res.setHeader("Cache-Control", "no-cache");
        res.end(cachedScript);
        return;
      }
      res.statusCode = 404;
      res.end("Inspector script not found");
      return;
    }

    if (req.url === "/__inspector__/inspector.css") {
      if (cachedCSS) {
        res.statusCode = 200;
        res.setHeader("Content-Type", "text/css");
        res.setHeader("Cache-Control", "no-cache");
        res.end(cachedCSS);
        return;
      }
      res.statusCode = 404;
      res.end("Inspector CSS not found");
      return;
    }

    if (req.url === "/__inspector__/config.json") {
      res.statusCode = 200;
      res.setHeader("Content-Type", "application/json");
      res.setHeader("Cache-Control", "no-cache");
      res.end(JSON.stringify(config || {}));
      return;
    }

    next();
  });
}
