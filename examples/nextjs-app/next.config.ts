import type { NextConfig } from "next";
import UnpluginDevInspector from "@mcpc-tech/unplugin-dev-inspector-mcp";

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
      })
    );
    return config;
  },

  // Turbopack configuration (`next dev --turbopack`)
  // Note: Also requires running `npx dev-inspector-server` for MCP endpoints
  turbopack: {
    rules: {
      // Transform TSX files to inject data-source attributes
      "src/**/*.tsx": {
        loaders: ["@mcpc-tech/unplugin-dev-inspector-mcp/loader"],
        as: "*.tsx",
      },
      "src/**/*.jsx": {
        loaders: ["@mcpc-tech/unplugin-dev-inspector-mcp/loader"],
        as: "*.jsx",
      },
    },
  },
};

export default nextConfig;
