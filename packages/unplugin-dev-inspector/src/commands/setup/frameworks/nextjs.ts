import { parse } from "@babel/parser";
import traverseModule from "@babel/traverse";
import type { NodePath } from "@babel/traverse";
import type * as t from "@babel/types";
import MagicString from "magic-string";
import type { SetupOptions, TransformResult } from "../types";
import { detectConfigFile, getInsertPosition, getPluginOptions } from "../utils";

// Handle both ESM and CommonJS default exports
const traverse = (traverseModule as any).default || traverseModule;

const PLUGIN_IMPORT = "@mcpc-tech/unplugin-dev-inspector-mcp";
const PLUGIN_VAR_NAME = "DevInspector";

export function transformNextConfig(code: string, options: SetupOptions): TransformResult {
  try {
    // Check if already configured
    if (code.includes(PLUGIN_IMPORT)) {
      return {
        success: true,
        modified: false,
        message: "DevInspector is already configured in this file",
      };
    }

    const s = new MagicString(code);
    const ast = parse(code, {
      sourceType: "module",
      plugins: ["typescript"],
    });

    let lastImportEnd = 0;
    let nextConfigStart = -1;
    let hasWebpackProperty = false;

    // Find last import and nextConfig object
    traverse(ast, {
      ImportDeclaration(path: NodePath<t.ImportDeclaration>) {
        if (path.node.loc) {
          lastImportEnd = Math.max(lastImportEnd, path.node.loc.end.line);
        }
      },
      VariableDeclarator(path: NodePath<t.VariableDeclarator>) {
        if (
          path.node.id.type === "Identifier" &&
          path.node.id.name === "nextConfig" &&
          path.node.init?.type === "ObjectExpression"
        ) {
          if (path.node.init.start !== null && path.node.init.start !== undefined) {
            nextConfigStart = path.node.init.start;
          }

          // Check if webpack property exists
          path.node.init.properties.forEach((prop) => {
            if (
              prop.type === "ObjectProperty" &&
              prop.key.type === "Identifier" &&
              prop.key.name === "webpack"
            ) {
              hasWebpackProperty = true;
            }
          });
        }
      },
    });

    // Add import statement
    const importLine = `import ${PLUGIN_VAR_NAME}, { turbopackDevInspector } from '${PLUGIN_IMPORT}';\n`;

    if (lastImportEnd > 0) {
      const insertPos = getInsertPosition(code, lastImportEnd);
      s.appendLeft(insertPos, importLine);
    } else {
      s.prepend(importLine);
    }

    // Add webpack and turbopack configuration
    if (nextConfigStart > -1 && !hasWebpackProperty) {
      const pluginOptions = getPluginOptions(options, 8);
      const webpackConfig = `
  webpack: (config) => {
    config.plugins.push(
      ${PLUGIN_VAR_NAME}.webpack(${pluginOptions})
    );
    return config;
  },
  turbopack: {
    rules: turbopackDevInspector(${pluginOptions}),
  },`;
      s.appendLeft(nextConfigStart + 1, webpackConfig);
    } else if (hasWebpackProperty) {
      return {
        success: false,
        modified: false,
        message:
          "Webpack property already exists. Please add DevInspector manually to avoid conflicts",
      };
    } else {
      return {
        success: false,
        modified: false,
        error: "Could not find nextConfig object",
        message: "Please add DevInspector manually to your Next.js config",
      };
    }

    return {
      success: true,
      modified: true,
      code: s.toString(),
      message: "Successfully added DevInspector to Next.js config",
    };
  } catch (error) {
    return {
      success: false,
      modified: false,
      error: error instanceof Error ? error.message : String(error),
      message: "Failed to transform Next.js config",
    };
  }
}

export function detectNextConfig(cwd: string): string | null {
  return detectConfigFile(cwd, ["next.config.ts", "next.config.js", "next.config.mjs"]);
}
