import { createUnplugin } from "unplugin";
import { setupMcpMiddleware } from "./middleware/mcproute-middleware";
import { setupInspectorMiddleware } from "./middleware/inspector-middleware";
import { setupAcpMiddleware } from "./middleware/acp-middleware";
import { transformJSX } from "./compiler/jsx-transform";
import { compileVue } from "./compiler/vue-transform";
import { updateMcpConfigs, type McpConfigOptions } from "./utils/config-updater";
import type { Agent, AcpOptions } from "../client/constants/types";

export interface DevInspectorOptions extends McpConfigOptions, AcpOptions {
  /**
   * Enable/disable the plugin
   * @default true (automatically disabled in production)
   */
  enabled?: boolean;

  /**
   * Enable MCP server for AI integration
   * @default true
   */
  enableMcp?: boolean;

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
   * Custom agents configuration
   * If provided, these will be merged with or replace the default agents
   * @see AVAILABLE_AGENTS https://github.com/mcpc-tech/dev-inspector-mcp/blob/main/packages/unplugin-dev-inspector/client/constants/agents.ts
   */
  agents?: Agent[];

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
}

export const unplugin = createUnplugin<DevInspectorOptions | undefined>(
  (options = {}) => {
    const enabled = options.enabled ?? process.env.NODE_ENV !== "production";
    const enableMcp = options.enableMcp ?? true;
    const virtualModuleName = options.virtualModuleName ?? 'virtual:dev-inspector-mcp';

    // Resolved server config (populated by Vite's configResolved hook)
    let resolvedHost = options.host || 'localhost';
    let resolvedPort = options.port || 5173;

    if (!enabled) {
      return {
        name: "unplugin-dev-inspector",
      };
    }

    return {
      name: "unplugin-dev-inspector",

      enforce: "pre",

      resolveId(id) {
        if (id === virtualModuleName) {
          return '\0' + virtualModuleName;
        }
      },

      load(id) {
        if (id === '\0' + virtualModuleName) {
          // Use resolved host/port from Vite config
          const host = resolvedHost;
          const port = resolvedPort;

          // Return dev-only code that is tree-shaken in production
          return `
// Development-only code - completely removed in production builds
if (import.meta.env.DEV) {
  if (typeof document !== 'undefined') {
    // Create inspector element
    const inspector = document.createElement('dev-inspector-mcp');
    document.body.appendChild(inspector);

    // Store dev server config globally (injected at build time)
    window.__DEV_INSPECTOR_CONFIG__ = {
      host: '${host}',
      port: '${port}',
      base: import.meta.env.BASE_URL || '/'
    };

    // Dynamically load inspector script (only in dev)
    const script = document.createElement('script');
    const config = window.__DEV_INSPECTOR_CONFIG__;
    let baseUrl = 'http://' + config.host + ':' + config.port + config.base;
    if (baseUrl.endsWith('/')) {
      baseUrl = baseUrl.slice(0, -1);
    }
    script.src = baseUrl + '/__inspector__/inspector.iife.js';
    script.type = 'module';
    document.head.appendChild(script);
  }
}
`;
        }
      },

      async transform(code, id) {
        if (id.includes('node_modules')) return null;

        if (id.match(/\.(jsx|tsx)$/)) {
          try {
            return await transformJSX({ code, id });
          } catch (error) {
            console.error(`[dev-inspector] Failed to transform ${id}:`, error);
            return null;
          }
        }

        if (id.match(/\.vue$/)) {
          try {
            return await compileVue({ code, id });
          } catch (error) {
            console.error(`[dev-inspector] Failed to transform ${id}:`, error);
            return null;
          }
        }

        return null;
      },

      // Vite-specific hooks
      vite: {
        apply: "serve",

        configResolved(config) {
          // Capture resolved Vite config for virtual module
          const viteHost = config.server.host;
          resolvedHost = options.host ?? (typeof viteHost === 'string' ? viteHost : (viteHost === true ? '0.0.0.0' : 'localhost'));
          resolvedPort = options.port ?? config.server.port ?? 5173;
          // Use 'localhost' for display when host is '0.0.0.0'
          if (resolvedHost === '0.0.0.0') {
            resolvedHost = 'localhost';
          }
        },

        transformIndexHtml: {
          order: 'pre',
          handler(html, ctx) {
            const autoInject = options.autoInject ?? true;
            if (!autoInject) return html;

            // Get server config from context
            const server = ctx.server;
            const viteHost = server?.config.server.host;
            const host = options.host ?? (typeof viteHost === 'string' ? viteHost : (viteHost === true ? '0.0.0.0' : 'localhost'));
            const port = options.port ?? server?.config.server.port ?? 5173;
            const base = server?.config.base ?? '/';

            // Use 'localhost' for display when host is '0.0.0.0'
            const displayHost = host === '0.0.0.0' ? 'localhost' : host;

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
      base: '${base}'
    };
    var script = document.createElement('script');
    var config = window.__DEV_INSPECTOR_CONFIG__;
    var baseUrl = 'http://' + config.host + ':' + config.port + config.base;
    if (baseUrl.endsWith('/')) {
      baseUrl = baseUrl.slice(0, -1);
    }
    script.src = baseUrl + '/__inspector__/inspector.iife.js';
    script.type = 'module';
    document.head.appendChild(script);
  }
})();
</script></body>`
            );
          },
        },

        async configureServer(server) {
          if (enableMcp) {
            const viteHost = server.config.server.host;
            const serverContext = {
              // Priority: user option > Vite config > fallback to 'localhost'
              // Normalize Vite host: if true, use '0.0.0.0', otherwise use the string value or 'localhost'
              host: options.host ?? (typeof viteHost === 'string' ? viteHost : (viteHost === true ? '0.0.0.0' : 'localhost')),
              port: options.port ?? server.config.server.port ?? 5173,
            };

            // Display MCP connection instructions (base URL, clientId added per editor)
            const displayHost = serverContext.host === '0.0.0.0' ? 'localhost' : serverContext.host;
            const baseUrl = `http://${displayHost}:${serverContext.port}/__mcp__/sse`;
            console.log(`[dev-inspector] 📡 MCP: ${baseUrl}\n`);

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
              updateConfigAdditionalServers: options.updateConfigAdditionalServers,
              customEditors: options.customEditors,
            });
          }
          setupInspectorMiddleware(server.middlewares, {
            agents: options.agents,
            defaultAgent: options.defaultAgent,
          });
        },

        handleHotUpdate() { },
      },

      // Webpack-specific hooks
      webpack(compiler) {
        // Webpack implementation would go here
        console.log("⚠️  Webpack support coming soon");
      },

      // Rollup-specific hooks
      rollup: {
        // Rollup implementation
      },

      // esbuild-specific hooks
      esbuild: {
        setup(build) {
          // esbuild implementation
        },
      },
    };
  }
);

export default unplugin;
