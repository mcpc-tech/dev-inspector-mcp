import type { NextConfig } from "next";
import UnpluginDevInspector from "@mcpc-tech/unplugin-dev-inspector-mcp";

const nextConfig: NextConfig = {
  webpack: (config) => {
    config.plugins.push(
      UnpluginDevInspector.webpack({
        enabled: true,
      })
    );
    return config;
  },
};

export default nextConfig;
