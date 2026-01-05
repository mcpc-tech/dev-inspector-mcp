import type { Connect } from "vite";
import type { IncomingMessage, ServerResponse } from "http";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { dirname } from "path";
import type { Agent, Prompt } from "../../client/constants/types";
import { handleCors } from "../utils/cors";
import {
  addLog,
  addNetworkRequest,
  getRequestById,
  getStdioById,
  getStdioLogs,
} from "../utils/log-storage";

// ESM equivalent of __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Maximum request body size (10MB)
const MAX_BODY_SIZE = 10 * 1024 * 1024;

/**
 * Get the inspector client script content
 * Tries multiple paths to locate the bundled inspector script
 */
function getInspectorScript(): string | null {
  const possiblePaths = [
    path.resolve(
      process.cwd(),
      "packages/unplugin-dev-inspector/client/dist/inspector.js",
    ),
    path.resolve(__dirname, "../../client/dist/inspector.js"),
    path.resolve(__dirname, "../client/dist/inspector.js"),
    path.resolve(
      process.cwd(),
      "node_modules/@mcpc-tech/unplugin-dev-inspector-mcp/client/dist/inspector.js",
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

  console.warn(
    "⚠️  Inspector script not found. Run `pnpm build:client` first.",
  );
  return null;
}

function getInspectorCSS(): string | null {
  const possiblePaths = [
    path.resolve(
      process.cwd(),
      "packages/unplugin-dev-inspector/client/dist/inspector.css",
    ),
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
   * Custom prompts configuration
   */
  prompts?: Prompt[];
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

  /**
   * Configure which default built-in prompts to enable. Can be true (all), false (none), or an array of prompt names to whitelist.
   */
  defaultPrompts?: boolean | string[];
}

export function setupInspectorMiddleware(
  middlewares: Connect.Server,
  config?: InspectorConfig,
) {
  let cachedScript: string | null = null;
  let cachedCSS: string | null = null;
  let filesChecked = false;

  middlewares.use(
    (req: IncomingMessage, res: ServerResponse, next: () => void) => {
      // Handle CORS for inspector endpoints
      if (req.url?.startsWith("/__inspector__")) {
        if (handleCors(req, res)) return;
      }

      if (!filesChecked) {
        cachedScript = getInspectorScript();
        cachedCSS = getInspectorCSS();
        filesChecked = true;
      }

      if (req.url === "/__inspector__/inspector.js") {
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

      // Serve code-split chunks from /__inspector__/
      if (req.url?.startsWith("/__inspector__/") && req.url.endsWith(".js")) {
        const chunkName = req.url.replace("/__inspector__/", "");
        const possibleChunkPaths = [
          path.resolve(
            process.cwd(),
            "packages/unplugin-dev-inspector/client/dist",
            chunkName,
          ),
          path.resolve(__dirname, "../../client/dist", chunkName),
          path.resolve(__dirname, "../client/dist", chunkName),
          path.resolve(
            process.cwd(),
            "node_modules/@mcpc-tech/unplugin-dev-inspector-mcp/client/dist",
            chunkName,
          ),
        ];

        for (const chunkPath of possibleChunkPaths) {
          try {
            if (fs.existsSync(chunkPath)) {
              const content = fs.readFileSync(chunkPath, "utf-8");
              res.statusCode = 200;
              res.setHeader("Content-Type", "application/javascript");
              res.setHeader(
                "Cache-Control",
                "public, max-age=31536000, immutable",
              );
              res.end(content);
              return;
            }
          } catch (error) {
            continue;
          }
        }
        // If chunk not found, fall through to next handler
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

      if (req.url === "/__inspector__/log" && req.method === "POST") {
        let body = "";
        let bodySize = 0;

        req.on("data", (chunk) => {
          bodySize += chunk.length;
          // Reject immediately if too large - don't accumulate
          if (bodySize > MAX_BODY_SIZE) {
            res.statusCode = 413;
            res.end("Request body too large");
            req.destroy();
            return;
          }
          // Only accumulate if under limit
          body += chunk.toString();
        });

        req.on("end", () => {
          if (bodySize > MAX_BODY_SIZE) return;

          try {
            const { type, data } = JSON.parse(body);
            if (type === "console") {
              addLog(data.type, data.args);
            } else if (type === "network") {
              addNetworkRequest(data);
            }
            res.statusCode = 200;
            res.end("ok");
          } catch {
            res.statusCode = 400;
            res.end("Invalid JSON");
          }
        });
        return;
      }

      // GET /__inspector__/request-details/:id - Fetch network request details by ID
      const requestDetailsMatch = req.url?.match(
        /^\/__inspector__\/request-details\/(\d+)$/,
      );
      if (requestDetailsMatch && req.method === "GET") {
        const reqid = parseInt(requestDetailsMatch[1]);

        // Validate ID is a positive integer
        if (!Number.isInteger(reqid) || reqid <= 0) {
          res.statusCode = 400;
          res.end("Invalid request ID");
          return;
        }

        const request = getRequestById(reqid);

        if (request && request.details) {
          res.statusCode = 200;
          res.setHeader("Content-Type", "text/plain");
          res.end(request.details);
        } else if (request) {
          res.statusCode = 200;
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify(request, null, 2));
        } else {
          res.statusCode = 404;
          res.end("Request not found");
        }
        return;
      }

      // GET /__inspector__/stdio - Get all stdio logs
      if (req.url === "/__inspector__/stdio" && req.method === "GET") {
        const stdioLogs = getStdioLogs();
        res.statusCode = 200;
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify(stdioLogs));
        return;
      }

      // GET /__inspector__/stdio/:id - Get specific stdio log by ID
      const stdioDetailsMatch = req.url?.match(
        /^\/__inspector__\/stdio\/(\d+)$/,
      );
      if (stdioDetailsMatch && req.method === "GET") {
        const stdioid = parseInt(stdioDetailsMatch[1]);

        if (!Number.isInteger(stdioid) || stdioid <= 0) {
          res.statusCode = 400;
          res.end("Invalid stdio ID");
          return;
        }

        const stdioLog = getStdioById(stdioid);

        if (stdioLog) {
          res.statusCode = 200;
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify(stdioLog));
        } else {
          res.statusCode = 404;
          res.end("Stdio log not found");
        }
        return;
      }

      next();
    },
  );
}
