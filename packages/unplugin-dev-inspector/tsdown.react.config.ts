import { defineConfig } from "tsdown";
import fs from "fs";
import path from "path";

export default defineConfig({
  entry: ["client/react.ts"],
  format: ["esm"],
  outDir: "dist/react",
  clean: false, // Don't clean - we want to keep other build outputs
  dts: true,
  hash: false,
  platform: "browser",
  external: [
    // React - provided by user's project
    "react",
    "react-dom",
    "react/jsx-runtime",
    // AI SDK
    "ai",
    "@ai-sdk/react",
    // MCP SDK
    "@modelcontextprotocol/sdk",
    "@modelcontextprotocol/sdk/client",
    "@modelcontextprotocol/sdk/client/sse.js",
    "@modelcontextprotocol/sdk/types.js",
    // Internal dependencies that we want to keep external
    "@mcpc-tech/cmcp",
  ],
  plugins: [
    {
      name: "asset-inline-handler",
      resolveId(id, _importer) {
        // Handle ?raw (SVG) and ?png imports
        const match = id.match(/\?(raw|png)$/);
        if (!match) return null;

        const suffix = match[0];
        const cleanId = id.replace(suffix, "");
        const importerDir = _importer
          ? path.dirname(_importer.replace(/\?.*$/, ""))
          : process.cwd();
        const resolved = path.resolve(importerDir, cleanId);
        return {
          id: resolved + suffix,
          moduleSideEffects: false,
        };
      },
      load(id) {
        if (id.endsWith("?raw")) {
          const content = fs.readFileSync(id.replace("?raw", ""), "utf-8");
          return `export default ${JSON.stringify(content)}`;
        }
        if (id.endsWith("?png")) {
          const content = fs.readFileSync(id.replace("?png", ""));
          return `export default "data:image/png;base64,${content.toString("base64")}"`;
        }
        return null;
      },
    },
  ],
});
