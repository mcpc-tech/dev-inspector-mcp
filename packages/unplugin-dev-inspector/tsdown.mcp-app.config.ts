import { defineConfig } from "tsdown";
import postcss from "postcss";
import tailwindcss from "@tailwindcss/postcss";
import fs from "fs";
import path from "path";

export default defineConfig({
    entry: ["client/mcp-app/index.tsx"],
    format: ["esm"],
    outDir: "dist/mcp-app",
    clean: true,
    dts: false,
    noExternal: [/.*/],
    platform: "browser",
    define: {
        "process.env.NODE_ENV": '"production"',
        "__IS_MCP_APP__": "true",
        "window.__IS_MCP_APP__": "true",
    },
    minify: true,
    treeshake: true,
    plugins: [
        {
            name: "path-alias-resolver",
            resolveId(id, _importer) {
                if (id === "client/lib/utils") {
                    return path.resolve(process.cwd(), "client/lib/utils.ts");
                }
                if (id.startsWith("client/components/ui/")) {
                    const componentName = id.split("/").pop();
                    return path.resolve(process.cwd(), `client/components/ui/${componentName}.tsx`);
                }
                return null;
            },
        },
        {
            name: "asset-inline-handler",
            resolveId(id, _importer) {
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
        {
            name: "asset-handler",
            resolveId(id) {
                if (/\.(ttf|woff|woff2|eot|otf|png|jpg|jpeg|gif)$/.test(id)) {
                    return { id, external: true };
                }
                return null;
            },
        },
        {
            name: "css-handler",
            resolveId(id) {
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
                            optimize: { minify: true },
                        }),
                    ]).process(cssInput, {
                        from: path.join(clientDir, "styles.css"),
                        to: undefined,
                    });

                    if (!fs.existsSync("dist/mcp-app")) {
                        fs.mkdirSync("dist/mcp-app", { recursive: true });
                    }
                    fs.writeFileSync("dist/mcp-app/styles.css", result.css);
                    return `import "data:text/css;base64,${Buffer.from(result.css).toString('base64')}"`;
                }
                return null;
            },
        },

        {
            name: "html-bundler",
            async writeBundle() {
                const distDir = path.resolve(process.cwd(), "dist/mcp-app");
                const jsFile = path.join(distDir, "index.js");
                const cssFile = path.join(distDir, "styles.css");
                const htmlOut = path.join(distDir, "context-selector.html");

                if (!fs.existsSync(jsFile)) return;

                const jsContent = fs.readFileSync(jsFile, "utf-8");
                const cssContent = fs.existsSync(cssFile) ? fs.readFileSync(cssFile, "utf-8") : "";

                const html = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8" />
    <title>Context Selector</title>
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <style>
        ${cssContent}
    </style>
</head>
<body>
    <div id="root"></div>
    <script type="module">
        ${jsContent}
    </script>
</body>
</html>`;

                fs.writeFileSync(htmlOut, html);
                console.log("Successfully bundled MCP App to", htmlOut);
            },
        },
    ],
});
