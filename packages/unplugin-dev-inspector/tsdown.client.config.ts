import { defineConfig } from "tsdown";
import postcss from "postcss";
import tailwindcss from "@tailwindcss/postcss";
import fs from "fs";
import path from "path";

export default defineConfig({
  entry: ["client/inspector.tsx"],
  format: ["iife"],
  outDir: "client/dist",
  clean: true,
  dts: false,
  external: [], // Don't externalize anything
  noExternal: [/@mcpc-tech\/cmcp/, /.*/], // Bundle everything including @mcpc-tech/cmcp
  platform: "browser",
  globalName: "DevInspector",
  define: {
    "process.env.NODE_ENV": '"production"',
  },
  minify: true,
  treeshake: true,
  plugins: [
    {
      name: "path-alias-resolver",
      resolveId(id, importer) {
        // Resolve client/lib/utils to actual path
        if (id === "client/lib/utils") {
          return path.resolve(process.cwd(), "client/lib/utils.ts");
        }
        // Resolve client/components/ui/* to actual paths (without .tsx extension in import)
        if (id.startsWith("client/components/ui/")) {
          const componentName = id.split("/").pop(); // Get last part (e.g., "card")
          return path.resolve(process.cwd(), `client/components/ui/${componentName}.tsx`);
        }
        return null;
      },
    },
    {
      name: "asset-inline-handler",
      enforce: "pre",
      resolveId(id, importer) {
        // Handle ?raw (SVG) and ?png imports
        const match = id.match(/\?(raw|png)$/);
        if (!match) return null;

        const suffix = match[0];
        const cleanId = id.replace(suffix, "");
        const importerDir = importer ? path.dirname(importer.replace(/\?.*$/, "")) : process.cwd();
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
    {
      name: "asset-handler",
      resolveId(id) {
        // Handle binary assets (fonts, images, etc.) - externalize
        if (/\.(ttf|woff|woff2|eot|otf|png|jpg|jpeg|gif)$/.test(id)) {
          return { id, external: true };
        }
        return null;
      },
    },
    {
      name: "css-handler",
      resolveId(id) {
        // Redirect CSS imports to our virtual module
        if (id.endsWith("styles.css")) {
          return "\0virtual:styles";
        }
        return null;
      },
      async load(id) {
        if (id === "\0virtual:styles") {
          const cssInput = fs.readFileSync("client/styles.css", "utf-8");

          const clientDir = path.resolve(process.cwd(), "client");
          const result = await postcss([
            tailwindcss({
              base: clientDir,
              optimize: {
                minify: false,
              },
            }),
          ]).process(cssInput, {
            from: path.join(clientDir, "styles.css"),
            to: undefined,
          });

          // Ensure dist directory exists for reference file
          if (!fs.existsSync("client/dist")) {
            fs.mkdirSync("client/dist", {
              recursive: true,
            });
          }

          // Write the processed CSS file for reference
          fs.writeFileSync("client/dist/inspector.css", result.css);

          // Return the processed CSS as a default export
          return `export default ${JSON.stringify(result.css)}`;
        }
        return null;
      },
    },
  ],
});
