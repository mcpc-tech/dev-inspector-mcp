import path from "node:path";
import { fileURLToPath } from "node:url";

import type { DevInspectorOptions } from "./core";

// Module-level flag to prevent duplicate browser launches
let browserLaunchScheduled = false;

export interface TurbopackDevInspectorOptions extends DevInspectorOptions {
  /**
   * Enable/disable the plugin
   * @default true in development
   */
  enabled?: boolean;
}

/**
 * Returns the Turbopack rules config for dev-inspector.
 *
 * Usage in next.config.ts:
 * ```ts
 * const nextConfig: NextConfig = {
 *   turbopack: {
 *     rules: turbopackDevInspector()
 *   }
 * }
 * ```
 */
export function turbopackDevInspector(options: TurbopackDevInspectorOptions = {}): any {
  // Current file is in dist/, so we go up one level to find the loader
  // In CJS/ESM dist structure, loader is in the same directory usually
  let loaderPath = "";

  if (typeof __dirname !== "undefined") {
    loaderPath = path.resolve(__dirname, "./loader.js");
  } else {
    // ESM fallback
    try {
      const currentDir = path.dirname(fileURLToPath(import.meta.url));
      loaderPath = path.resolve(currentDir, "./loader.js");
    } catch {
      // If all else fails, rely on package resolution?
      // Better to assume structure relative to this file
      loaderPath = "./loader.js";
    }
  }

  // Default to enabled in development only if not specified
  const enabled = options.enabled ?? process.env.NODE_ENV !== "production";

  if (!enabled) {
    return {};
  }

  // Handle auto-open browser (only once)
  if (
    options.autoOpenBrowser &&
    !browserLaunchScheduled &&
    typeof process !== "undefined" &&
    process.env.NODE_ENV !== "production"
  ) {
    browserLaunchScheduled = true;

    // Run asynchronously to not block config loading
    const { launchBrowserWithDevTools } = require("./utils/browser-launcher");
    const host = options.host || "localhost";
    const port = options.port || 8888; // Default Standalone MCP Server port
    const publicBaseUrl = options.publicBaseUrl || process.env.DEV_INSPECTOR_PUBLIC_BASE_URL;

    // We delay slightly to ensure dev server is up
    setTimeout(async () => {
      // Only try to open if we haven't already (simple check to avoid reload spam if possible)
      try {
        // Default to Next.js port 3000 for browser URL if not specified
        // But use the MCP server port (8888) for the server connection
        await launchBrowserWithDevTools({
          url: options.browserUrl || publicBaseUrl || `http://${host}:3000`,
          serverContext: { host, port },
        });
      } catch (e) {
        console.error("[dev-inspector] Failed to open browser:", e);
      }
    }, 3000);
  }

  // Use broad file pattern that works for all Next.js versions
  // This covers all JavaScript/TypeScript files that need transformation
  const files = "**/*.{jsx,tsx,js,ts,mjs,mts}";

  return {
    [files]: {
      loaders: [
        {
          loader: loaderPath,
          options: options,
        },
      ],
    },
  };
}
