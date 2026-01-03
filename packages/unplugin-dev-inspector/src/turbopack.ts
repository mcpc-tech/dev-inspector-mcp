import path from "node:path";
import { fileURLToPath } from "node:url";
import { getPublicBaseUrl, isChromeDisabled } from "./utils/helpers";
import { startStandaloneServer } from "./utils/standalone-server";
import { setupMcpMiddleware } from "./middleware/mcproute-middleware";
import { setupInspectorMiddleware } from "./middleware/inspector-middleware";
import { setupAcpMiddleware } from "./middleware/acp-middleware";
import { updateMcpConfigs } from "./utils/config-updater";
import { initStdioInterceptor } from "./utils/stdio-interceptor";
import type { Connect } from "vite";

import type { DevInspectorOptions } from "./core";

// Module-level flag to prevent duplicate server/browser launches
let serverStarted = false;
let browserLaunchScheduled = false;

// Store the actual port after server starts
let actualPort: number | null = null;

export interface TurbopackDevInspectorOptions extends DevInspectorOptions {
  /**
   * Enable/disable the plugin
   * @default true in development
   */
  enabled?: boolean;
}

/**
 * Start the standalone MCP server (called once)
 */
async function ensureStandaloneServer(options: TurbopackDevInspectorOptions): Promise<number> {
  if (serverStarted && actualPort) {
    return actualPort;
  }
  serverStarted = true;

  const chromeDisabled = isChromeDisabled(options.disableChrome);

  const { server, host, port } = await startStandaloneServer({
    port: options.port,
    host: options.host,
  });

  actualPort = port;

  const serverContext = {
    host,
    port,
    disableChrome: chromeDisabled,
  };

  const displayHost = host === "0.0.0.0" ? "localhost" : host;
  const publicBase = getPublicBaseUrl({
    publicBaseUrl: options.publicBaseUrl,
    host: displayHost,
    port,
  });
  const baseUrl = `${publicBase}/__mcp__/sse`;
  console.log(`[dev-inspector] 📡 MCP: ${baseUrl}\n`);

  // Initialize console/stdio interception
  initStdioInterceptor();

  await setupMcpMiddleware(
    server as unknown as Connect.Server,
    serverContext,
  );

  setupAcpMiddleware(
    server as unknown as Connect.Server,
    serverContext,
    {
      acpMode: options.acpMode,
      acpModel: options.acpModel,
      acpDelay: options.acpDelay,
    },
  );

  // Auto-update MCP configs
  const root = process.cwd();
  await updateMcpConfigs(root, baseUrl, {
    updateConfig: options.updateConfig,
    updateConfigServerName: options.updateConfigServerName,
    updateConfigAdditionalServers: options.updateConfigAdditionalServers,
    customEditors: options.customEditors,
  });

  setupInspectorMiddleware(server as unknown as Connect.Server, {
    agents: options.agents,
    visibleAgents: options.visibleAgents,
    defaultAgent: options.defaultAgent,
    showInspectorBar: options.showInspectorBar,
  });

  // Auto-open browser with Chrome DevTools
  if (options.autoOpenBrowser && !chromeDisabled) {
    const { launchBrowserWithDevTools } = await import("./utils/browser-launcher");
    const targetUrl = options.browserUrl || `http://${displayHost}:3000`;
    setTimeout(async () => {
      const success = await launchBrowserWithDevTools({
        url: targetUrl,
        serverContext,
      });
      if (success) {
        console.log(`[dev-inspector] 🌐 Browser opened: ${targetUrl}`);
      } else {
        console.log(
          `[dev-inspector] 💡 Use "launch_chrome_devtools" prompt to open browser manually.\n`,
        );
      }
    }, 1000);
  } else if (chromeDisabled) {
    console.log(
      `[dev-inspector] 📴 Chrome integration disabled (DEV_INSPECTOR_DISABLE_CHROME=1 or disableChrome: true)`,
    );
  } else {
    console.log(
      `[dev-inspector] ⚠️  autoOpenBrowser: false - Console/Network context unavailable`,
    );
    console.log(
      `[dev-inspector] 💡 Use "launch_chrome_devtools" prompt or "chrome_devtools" tool to open browser manually.\n`,
    );
  }

  return port;
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

  // Start standalone server immediately when config is loaded
  // This runs synchronously during Next.js config loading
  if (!serverStarted) {
    ensureStandaloneServer(options).catch((err) => {
      console.error("[dev-inspector] Failed to start standalone server:", err);
    });
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
