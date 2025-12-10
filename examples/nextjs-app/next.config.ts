import type { NextConfig } from "next";
import UnpluginDevInspector, { turbopackDevInspector } from "@mcpc-tech/unplugin-dev-inspector-mcp";

/**
 * Next.js configuration with both Webpack and Turbopack support
 * 
 * - Webpack mode: `next dev` (uses webpack config below)
 * - Turbopack mode: `next dev --turbopack` (uses turbopack config below)
 */
const nextConfig: NextConfig = {
  // Webpack configuration (default mode: `next dev`)
  webpack: (config) => {
    config.plugins.push(
      UnpluginDevInspector.webpack({
        enabled: true,
        autoOpenBrowser: true,
        browserUrl: 'http://localhost:3000'
      })
    );
    return config;
  },

  // Turbopack configuration (`next dev --turbopack`)
  // Note: Also requires running `npx dev-inspector-server` for MCP endpoints
  turbopack: {
    rules: turbopackDevInspector({
      enabled: true,
      autoOpenBrowser: true,
      browserUrl: 'http://localhost:3000'
    }),
  },
};

export default nextConfig;
