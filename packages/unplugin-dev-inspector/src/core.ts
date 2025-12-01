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
          // Return dev-only code that is tree-shaken in production
          return `
// Development-only code - completely removed in production builds
if (import.meta.env.DEV) {
  if (typeof document !== 'undefined') {
    // Create inspector element
    const inspector = document.createElement('dev-inspector-mcp');
    document.body.appendChild(inspector);

    // Dynamically load inspector script (only in dev)
    const script = document.createElement('script');
    // Use Vite dev server host/port/base from environment so this works behind proxies
    const host = import.meta.env.VITE_DEV_SERVER_HOST || 'localhost';
    const port = import.meta.env.VITE_DEV_SERVER_PORT || '5173';
    const base = import.meta.env.BASE_URL || '/';
    const origin = import.meta.env.VITE_DEV_SERVER_ORIGIN ||
      // Fallback to window.location.origin if available (e.g. when running via proxy)
      (typeof window !== 'undefined' ? window.location.origin : 'http://' + host + ':' + port);

      let baseUrl = origin + base;
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

        transformIndexHtml(html) {
          const autoInject = options.autoInject ?? true;
          if (!autoInject) return html;

          // Inject inspector client element and a small bootstrap that
          // computes the correct absolute URL to the inspector script
          return html.replace(
            "</body>",
            `<dev-inspector-mcp></dev-inspector-mcp><script>
(function() {
  if (!window.__DEV_INSPECTOR_LOADED__) {
    window.__DEV_INSPECTOR_LOADED__ = true;
    var script = document.createElement('script');
    var host = (window.__VITE_DEV_SERVER_HOST__ || 'localhost');
    var port = (window.__VITE_DEV_SERVER_PORT__ || '5173');
    var base = (window.__VITE_DEV_BASE__ || '/');
    var origin = window.__VITE_DEV_SERVER_ORIGIN__ || window.location.origin || ('http://' + host + ':' + port);
    var baseUrl = origin + base;
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

        async configureServer(server) {
          if (enableMcp) {
            const viteHost = server.config.server.host;
            const serverContext = {
              // Priority: user option > Vite config > fallback to 'localhost'
              // Normalize Vite host: if true, use '0.0.0.0', otherwise use the string value or 'localhost'
              host: options.host ?? (typeof viteHost === 'string' ? viteHost : (viteHost === true ? '0.0.0.0' : 'localhost')),
              port: options.port ?? server.config.server.port ?? 5173,
            };

            // Display MCP connection instructions
            const displayHost = serverContext.host === '0.0.0.0' ? 'localhost' : serverContext.host;
            const sseUrl = `http://${displayHost}:${serverContext.port}/__mcp__/sse?puppetId=chrome`;
            console.log(`[dev-inspector] 📡 MCP: ${sseUrl}\n`);

            await setupMcpMiddleware(server.middlewares, serverContext);
            setupAcpMiddleware(server.middlewares, serverContext, {
              acpMode: options.acpMode,
              acpModel: options.acpModel,
              acpDelay: options.acpDelay,
            });

            // Auto-update MCP configs for detected editors
            const root = server.config.root;
            await updateMcpConfigs(root, sseUrl, {
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
