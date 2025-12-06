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

import type { LoaderContext } from 'webpack';
import { transformJSX } from './compiler/jsx-transform';
import { compileVue } from './compiler/vue-transform';

export interface DevInspectorLoaderOptions {
    /**
     * Enable/disable the loader
     * @default true in development, false in production
     */
    enabled?: boolean;
}

export default function devInspectorLoader(
    this: LoaderContext<DevInspectorLoaderOptions>,
    source: string
): string {
    const options = this.getOptions() || {};
    const enabled = options.enabled ?? process.env.NODE_ENV !== 'production';

    if (!enabled) {
        return source;
    }

    const resourcePath = this.resourcePath;

    // Handle JSX/TSX files
    if (resourcePath.match(/\.(jsx|tsx)$/)) {
        try {
            const result = transformJSX({ code: source, id: resourcePath });
            if (result) {
                // If we have a source map, set it
                if (result.map && this.sourceMap) {
                    this.callback(null, result.code, result.map);
                    return '';
                }
                return result.code;
            }
        } catch (error) {
            console.error(`[dev-inspector-loader] Failed to transform ${resourcePath}:`, error);
        }
    }

    // Handle Vue files
    if (resourcePath.match(/\.vue$/)) {
        try {
            const result = compileVue({ code: source, id: resourcePath });
            if (result) {
                if (result.map && this.sourceMap) {
                    this.callback(null, result.code, result.map);
                    return '';
                }
                return result.code;
            }
        } catch (error) {
            console.error(`[dev-inspector-loader] Failed to transform ${resourcePath}:`, error);
        }
    }

    return source;
}

// Mark as raw loader to handle source as string
export const raw = false;
