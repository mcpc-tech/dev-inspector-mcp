import { defineConfig } from "tsdown";

export default defineConfig({
  entry: ["src/index.ts", "src/next.tsx", "src/loader.ts", "src/cli.ts"],
  format: ["esm", "cjs"],
  clean: true,
  dts: true,
  hash: false,
  shims: true,  // Add shims for import.meta.url in CJS
  // Bundle ESM-only packages for CJS compatibility
  noExternal: [
    "@mcpc-tech/cmcp",
    "@mcpc-tech/core",
    "@mcpc-tech/acp-ai-provider",
  ],
  external: [
    // Bundler integrations - provided by user's project
    "vite",
    "webpack",
    "rollup",
    "esbuild",
    "rspack",
    "unplugin",
    // Node built-ins
    "fs",
    "path",
    "http",
    "crypto",
    "url",
    // Vue compiler - optional peer dependency
    "@vue/compiler-sfc",
    "@vue/compiler-core",
    "@vue/shared",
    // React/Vue - provided by user's project
    "react",
    "react-dom",
    "vue",
    // Runtime dependencies that support CJS
    "@modelcontextprotocol/sdk",
    "@agentclientprotocol/sdk",
    "chrome-devtools-mcp",
    "mcp-remote",
    "ai",
    "zod",
  ],
  define: {
    "process.env.NODE_ENV": '"production"',
  },
});
