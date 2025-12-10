/**
 * Webpack loader for dev-inspector-mcp
 *
 * This loader can be used with Turbopack via next.config.js:
 *
 * ```js
 * module.exports = {
 *   turbopack: {
 *     rules: {
 *       '*.tsx': {
 *         loaders: ['@mcpc-tech/unplugin-dev-inspector-mcp/loader'],
 *         as: '*.js',
 *       },
 *       '*.jsx': {
 *         loaders: ['@mcpc-tech/unplugin-dev-inspector-mcp/loader'],
 *         as: '*.js',
 *       },
 *     },
 *   },
 * }
 * ```
 */

import type { LoaderContext } from "webpack";
import { transformCode } from "@code-inspector/core";

export interface DevInspectorLoaderOptions {
  /**
   * Enable/disable the loader
   * @default true in development, false in production
   */
  enabled?: boolean;
}

export default function devInspectorLoader(
  this: LoaderContext<DevInspectorLoaderOptions>,
  source: string,
): string {
  const options = this.getOptions() || {};
  const enabled = options.enabled ?? process.env.NODE_ENV !== "production";

  if (!enabled) {
    return source;
  }

  const resourcePath = this.resourcePath;

  // Handle JSX/TSX/Vue/Svelte files
  const isJsx = resourcePath.match(/\.(jsx|tsx|js|ts|mjs|mts)$/);
  const isVue = resourcePath.match(/\.vue$/);
  const isSvelte = resourcePath.match(/\.svelte$/);

  if (isJsx || isVue || isSvelte) {
    try {
      const fileType = isJsx ? "jsx" : isVue ? "vue" : "svelte";
      const code = transformCode({
        content: source,
        filePath: resourcePath,
        fileType,
        escapeTags: [],
        pathType: "absolute",
      });

      return code;
    } catch (error) {
      console.error(`[dev-inspector-loader] Failed to transform ${resourcePath}:`, error);
    }
  }

  return source;
}

// Mark as raw loader to handle source as string
export const raw = false;
