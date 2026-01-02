import { createUnplugin } from "unplugin";
import path from "path";
import type { Connect } from "vite";
import { setupMcpMiddleware } from "../middleware/mcproute-middleware";
import { setupInspectorMiddleware } from "../middleware/inspector-middleware";
import { setupAcpMiddleware } from "../middleware/acp-middleware";
import { type McpConfigOptions, updateMcpConfigs } from "./config-updater";
import { launchBrowserWithDevTools } from "./browser-launcher";
import {
  getPublicBaseUrl,
  isChromeDisabled,
  stripTrailingSlash,
} from "./helpers";
import type { AcpOptions, Agent } from "../../client/constants/types";
import { initStdioInterceptor } from "./stdio-interceptor";

export interface DevInspectorOptions extends McpConfigOptions, AcpOptions {
  /**
   * Enable/disable the plugin
   * @default true (automatically disabled in production)
   */
  enabled?: boolean;

  /**
   * Custom host for MCP server URL
   * Useful when behind a proxy or in Docker containers
   * If not specified, uses the Vite server host config
   * @example "localhost" or "my-dev-server.local"
   */
  host?: string;

  /**
   * Custom port for MCP server URL
   * Useful when behind a proxy or port forwarding (e.g., Docker, SSH tunnels)
   * If not specified, uses the Vite server port config
   * @example 3000
   */
  port?: number;

  /**
   * Public base URL (including protocol) that editors/browsers should use to reach the dev server.
   *
   * Use this when the dev server runs in a container or behind a reverse proxy where the externally
   * reachable URL is different from the internal host/port (e.g. https://your-domain.com).
   *
   * If provided, it will be used for MCP config auto-update and console output.
   *
   * @example "https://your-domain.com"
   */
  publicBaseUrl?: string;

  /**
   * Custom agents configuration
   * If provided, these will be merged with or replace the default agents
   * @see AVAILABLE_AGENTS https://github.com/mcpc-tech/dev-inspector-mcp/blob/main/packages/unplugin-dev-inspector/client/constants/agents.ts
   */
  agents?: Agent[];

  /**
   * Filter which agents are visible in the UI
   * Only agents with names in this list will be shown (applies after merging custom agents)
   * If not specified or empty array, all agents are visible
   * @example ['Claude Code', 'Gemini CLI', 'My Custom Agent']
   */
  visibleAgents?: string[];

  /**
   * Default agent name to use
   * @default "Claude Code"
   * @see https://github.com/mcpc-tech/dev-inspector-mcp/blob/main/packages/unplugin-dev-inspector/client/constants/agents.ts
   */
  defaultAgent?: string;

  /**
   * Auto-inject inspector into HTML files
   * Set to false for non-HTML projects (miniapps, library bundles)
   * @default true
   */
  autoInject?: boolean;

  /**
   * Custom virtual module name
   * Useful if the default name conflicts with your project
   * @default "virtual:dev-inspector-mcp"
   * @example "virtual:my-inspector" or "virtual:custom-mcp"
   */
  virtualModuleName?: string;

  /**
   * Automatically open browser with Chrome DevTools when dev server starts
   * Uses Chrome DevTools Protocol for full debugging capabilities (console, network, etc.)
   * @default false
   */
  autoOpenBrowser?: boolean;

  /**
   * Disable Chrome DevTools integration entirely (chrome_devtools tool + related prompts).
   * Can also be controlled via DEV_INSPECTOR_DISABLE_CHROME=1
   * @default false
   */
  disableChrome?: boolean;

  /**
   * Custom browser launch URL
   * If not specified, uses the dev server URL (e.g., http://localhost:5173)
   * @example "http://localhost:5173/dashboard"
   */
  browserUrl?: string;

  /**
   * Whether to show the inspector bar UI
   * Set to false if you only want to use the editor integration
   * @default true
   */
  /**
   * Whether to show the inspector bar UI
   * Set to false if you only want to use the editor integration
   * @default true
   */
  showInspectorBar?: boolean;

  /**
   * Entry file to safely inject the inspector import.
   * Useful when `autoInject: false` or when using a framework where HTML injection is insufficient.
   * Can also be set via `DEV_INSPECTOR_ENTRY` environment variable.
   *
   * @example "src/main.tsx"
   */
  entry?: string;
}

export type TransformFunction = (
  code: string,
  id: string,
) =>
  | Promise<string | { code: string; map?: any } | null>
  | string
  | { code: string; map?: any }
  | null;

export const createDevInspectorPlugin = (
  name: string,
  transformFactory: (options: DevInspectorOptions) => TransformFunction,
) => {
  return createUnplugin<DevInspectorOptions | undefined>((options = {}) => {
    const enabled = options.enabled ?? process.env.NODE_ENV !== "production";
    const virtualModuleName = options.virtualModuleName ??
      "virtual:dev-inspector-mcp";
    // Alternative module name for Webpack (doesn't support virtual: scheme)
    const webpackModuleName = virtualModuleName.replace("virtual:", "");

    // Populated by Vite's apply() hook.
    let viteCommand: "serve" | "build" | undefined;

    // Resolved server config (populated by Vite's configResolved hook)
    let resolvedHost = options.host || "localhost";
    let resolvedPort = options.port || 5173;

    const transformImpl = transformFactory(options);

    const chromeDisabled = isChromeDisabled(options.disableChrome);

    // Resolve entry file for auto-injection
    const entryOption = process.env.DEV_INSPECTOR_ENTRY || options.entry;
    const resolvedEntry = entryOption
      ? path.resolve(process.cwd(), entryOption)
      : null;

    const transform: TransformFunction = (code, id) => {
      // Never transform production builds.
      if (!enabled) return null;
      if (viteCommand && viteCommand !== "serve") return null;

      // Auto-inject import if this is the entry file
      if (resolvedEntry && id === resolvedEntry) {
        // Prepend the import
        const injection = `import '${virtualModuleName}';\n`;
        // Pass modified code to transformImpl or return it
        const result = transformImpl(code, id);
        if (typeof result === "string") {
          return injection + result;
        } else if (result && typeof result === "object" && "code" in result) {
          return { ...result, code: injection + result.code };
        } else {
          return injection + code;
        }
      }

      return transformImpl(code, id);
    };

    const createNoopVirtualModule = () => {
      // Keep this file side-effect free so a bare import can be tree-shaken.
      return `
// Production build - no-op
export function registerInspectorTool(_tool) {
  // No-op in production
}
`;
    };

    return {
      name,
      enforce: "pre",

      resolveId(id) {
        // Support both 'virtual:dev-inspector-mcp' (Vite) and 'dev-inspector-mcp' (Webpack)
        if (id === virtualModuleName || id === webpackModuleName) {
          return "\0" + virtualModuleName;
        }
      },

      load(id) {
        if (id === "\0" + virtualModuleName) {
          // During production builds (or when disabled), provide a no-op module so
          // builds never fail even if user code still imports the virtual module.
          if (!enabled || viteCommand === "build") {
            return createNoopVirtualModule();
          }

          // Use resolved host/port from Vite config
          // Use resolved host/port from Vite config
          const host = resolvedHost;
          const port = resolvedPort;
          const showInspectorBar = options.showInspectorBar ?? true;
          // Use helper to respect Env > Option priority
          const publicBaseUrl = getPublicBaseUrl({
            publicBaseUrl: options.publicBaseUrl,
            host,
            port,
          });
          const injectedBaseUrl = publicBaseUrl
            ? stripTrailingSlash(publicBaseUrl)
            : undefined;

          // Return dev-only code that works in both Vite and Webpack
          // Uses typeof check to avoid SSR issues and works with both bundlers
          return `
// Development-only code - removed in production builds

// Global tools registry
if (typeof window !== 'undefined') {
  if (!window.__INSPECTOR_TOOLS__) {
    window.__INSPECTOR_TOOLS__ = [];
  }
  // Exposed for the inspector client to retrieve tools
  window.__getInspectorTools = () => window.__INSPECTOR_TOOLS__;
}

/**
 * Register a custom tool for the inspector
 * Only registers in development mode
 */
export function registerInspectorTool(tool) {
  // Skip in production (when bundler replaces import.meta.env.DEV with false)
  if (!import.meta.env.DEV) return;
  if (typeof window === 'undefined') return;
  
  window.__INSPECTOR_TOOLS__ = window.__INSPECTOR_TOOLS__ || [];
  window.__INSPECTOR_TOOLS__.push(tool);
}

if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  // Skip if already loaded (e.g., by HTML injection)
  if (window.__DEV_INSPECTOR_LOADED__) {
    // Already initialized, skip
  } else {
    window.__DEV_INSPECTOR_LOADED__ = true;
    
    // Create inspector element
    const inspector = document.createElement('dev-inspector-mcp');
    document.body.appendChild(inspector);

    // Store dev server config globally
    window.__DEV_INSPECTOR_CONFIG__ = {
      host: '${host}',
      port: '${port}',
      base: '/',
      baseUrl: ${
            injectedBaseUrl
              ? `'${injectedBaseUrl.replace(/'/g, "\\'")}'`
              : "undefined"
          },
      showInspectorBar: ${showInspectorBar},
      disableChrome: ${chromeDisabled}
    };

    // Dynamically load inspector script
    const script = document.createElement('script');
    const config = window.__DEV_INSPECTOR_CONFIG__;
    let baseUrl = config.baseUrl || ('http://' + config.host + ':' + config.port + config.base);
    if (baseUrl.endsWith('/')) baseUrl = baseUrl.slice(0, -1);
    script.src = baseUrl + '/__inspector__/inspector.js';
    script.type = 'module';
    document.head.appendChild(script);
  }
}
`;
        }
      },

      transform,

      // Vite-specific hooks
      vite: {
        apply(_config, env) {
          viteCommand = env.command;
          return true;
        },

        configResolved(config) {
          // Capture resolved Vite config for virtual module
          const viteHost = config.server.host;
          resolvedHost = options.host ??
            (typeof viteHost === "string"
              ? viteHost
              : viteHost === true
              ? "0.0.0.0"
              : "localhost");
          resolvedPort = options.port ?? config.server.port ?? 5173;
          // Use 'localhost' for display when host is '0.0.0.0'
          if (resolvedHost === "0.0.0.0") {
            resolvedHost = "localhost";
          }
        },

        transformIndexHtml: {
          order: "pre",
          handler(html, ctx) {
            if (!enabled) return html;
            if (viteCommand !== "serve") return html;
            const autoInject = options.autoInject ?? true;
            if (!autoInject) return html;

            // Get server config from context
            const server = ctx.server;
            const viteHost = server?.config.server.host;
            const host = options.host ??
              (typeof viteHost === "string"
                ? viteHost
                : viteHost === true
                ? "0.0.0.0"
                : "localhost");
            const port = options.port ?? server?.config.server.port ?? 5173;
            const base = server?.config.base ?? "/";
            const showInspectorBar = options.showInspectorBar ?? true;
            // Use helper to respect Env > Option priority
            const publicBaseUrl = getPublicBaseUrl({
              publicBaseUrl: options.publicBaseUrl,
              host,
              port,
            });

            // Use 'localhost' for display when host is '0.0.0.0'
            const displayHost = host === "0.0.0.0" ? "localhost" : host;

            // Inject inspector client element and a small bootstrap that
            // computes the correct absolute URL to the inspector script
            // Store the dev server config globally so client code can use it
            return html.replace(
              "</body>",
              `<dev-inspector-mcp></dev-inspector-mcp><script>
(function() {
  if (!window.__DEV_INSPECTOR_LOADED__) {
    window.__DEV_INSPECTOR_LOADED__ = true;
    // Store dev server config for client-side use (e.g., config-loader.ts)
    window.__DEV_INSPECTOR_CONFIG__ = {
      host: '${displayHost}',
      port: '${port}',
      base: '${base}',
      baseUrl: ${
                publicBaseUrl
                  ? `'${publicBaseUrl.replace(/'/g, "\\'")}'`
                  : "undefined"
              },
      showInspectorBar: ${showInspectorBar},
      disableChrome: ${chromeDisabled}
    };
    var script = document.createElement('script');
    var config = window.__DEV_INSPECTOR_CONFIG__;

    // Keep it simple: prefer explicit injected baseUrl override; otherwise use host/port.
    var baseUrl = config.baseUrl || ('http://' + config.host + ':' + config.port + (config.base || '/'));
    if (baseUrl.endsWith('/')) {
      baseUrl = baseUrl.slice(0, -1);
    }

    script.src = baseUrl + '/__inspector__/inspector.js';
    script.type = 'module';
    document.head.appendChild(script);
  }
})();
</script></body>`,
            );
          },
        },

        async configureServer(server) {
          if (!enabled) return;
          const viteHost = server.config.server.host;
          const serverContext = {
            host: options.host ??
              (typeof viteHost === "string"
                ? viteHost
                : viteHost === true
                ? "0.0.0.0"
                : "localhost"),
            port: options.port ?? server.config.server.port ?? 5173,
            disableChrome: chromeDisabled,
          };

          const displayHost = serverContext.host === "0.0.0.0"
            ? "localhost"
            : serverContext.host;
          const publicBase = getPublicBaseUrl({
            publicBaseUrl: options.publicBaseUrl,
            host: displayHost,
            port: serverContext.port,
          });
          const baseUrl = `${publicBase}/__mcp__/sse`;
          console.log(`[dev-inspector] 📡 MCP: ${baseUrl}\n`);

          // Initialize console/stdio interception
          initStdioInterceptor();

          await setupMcpMiddleware(server.middlewares, serverContext);
          setupAcpMiddleware(server.middlewares, serverContext, {
            acpMode: options.acpMode,
            acpModel: options.acpModel,
            acpDelay: options.acpDelay,
          });

          // Auto-update MCP configs for detected editors
          const root = server.config.root;
          await updateMcpConfigs(root, baseUrl, {
            updateConfig: options.updateConfig,
            updateConfigServerName: options.updateConfigServerName,
            updateConfigAdditionalServers:
              options.updateConfigAdditionalServers,
            customEditors: options.customEditors,
          });

          // Auto-open browser with Chrome DevTools
          const autoOpenBrowser = options.autoOpenBrowser ?? false;
          if (autoOpenBrowser && !chromeDisabled) {
            const targetUrl = options.browserUrl ?? publicBase;
            // Delay browser launch to ensure server is ready
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
          setupInspectorMiddleware(server.middlewares, {
            agents: options.agents,
            visibleAgents: options.visibleAgents,
            defaultAgent: options.defaultAgent,
            showInspectorBar: options.showInspectorBar,
          });
        },

        handleHotUpdate() {},
      },

      // Webpack-specific hooks
      webpack(compiler) {
        if (!enabled) return;

        if (compiler.options.mode !== "development") return;

        compiler.hooks.beforeCompile.tapAsync(
          "UnpluginDevInspector",
          async (params, callback) => {
            try {
              const { startStandaloneServer } = await import(
                "./standalone-server"
              );
              const { server, host, port, isNew } = await startStandaloneServer(
                {
                  port: options.port,
                  host: options.host,
                },
              );

              // Update global resolved Host/Port for the load() hook
              resolvedHost = host;
              resolvedPort = port;

              // Only setup and log once when server is newly created
              if (!isNew) {
                callback();
                return;
              }

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
              console.log(`[dev-inspector] 📡 MCP (Standalone): ${baseUrl}\n`);

              // Initialize console/stdio interception
              initStdioInterceptor();

              setupMcpMiddleware(
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
              const root = compiler.context;
              await updateMcpConfigs(root, baseUrl, {
                updateConfig: options.updateConfig,
                updateConfigServerName: options.updateConfigServerName,
                updateConfigAdditionalServers:
                  options.updateConfigAdditionalServers,
                customEditors: options.customEditors,
              });

              // Auto-open browser with Chrome DevTools
              const autoOpenBrowser = options.autoOpenBrowser ?? false;
              if (autoOpenBrowser && !chromeDisabled) {
                const targetUrl = options.browserUrl ?? publicBase;
                // Delay browser launch to ensure server is ready
                console.log(`[dev-inspector] 🔄 Auto-opening browser in 1s...`);
                setTimeout(async () => {
                  try {
                    const success = await launchBrowserWithDevTools({
                      url: targetUrl,
                      serverContext,
                    });
                    if (success) {
                      console.log(
                        `[dev-inspector] 🌐 Browser opened: ${targetUrl}`,
                      );
                    } else {
                      console.log(
                        `[dev-inspector] 💡 Use "launch_chrome_devtools" prompt to open browser manually.\n`,
                      );
                    }
                  } catch (err) {
                    console.error(
                      `[dev-inspector] ❌ Browser launch error:`,
                      err,
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
                  `[dev-inspector] 💡 Use "launch_chrome_devtools" prompt to enable.\n`,
                );
              }

              setupInspectorMiddleware(server as unknown as Connect.Server, {
                agents: options.agents,
                visibleAgents: options.visibleAgents,
                defaultAgent: options.defaultAgent,
              });

              callback();
            } catch (e) {
              console.error(
                "[dev-inspector] Failed to start standalone server:",
                e,
              );
              callback();
            }
          },
        );
      },

      // Rollup-specific hooks
      rollup: {
        // Rollup implementation
      },

      // esbuild-specific hooks
      esbuild: {
        setup(_build) {
          // esbuild implementation
        },
      },
    };
  });
};
