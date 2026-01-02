import { parse } from "@babel/parser";
import traverseModule from "@babel/traverse";
import type { NodePath } from "@babel/traverse";
import type * as t from "@babel/types";
import MagicString from "magic-string";
import { existsSync } from "fs";
import { resolve } from "path";
import type { SetupOptions, TransformResult } from "../types";

// Handle both ESM and CommonJS default exports
const traverse = (traverseModule as any).default || traverseModule;

const PLUGIN_IMPORT = "@mcpc-tech/unplugin-dev-inspector-mcp";
const PLUGIN_VAR_NAME = "DevInspector";

export function transformViteConfig(code: string, options: SetupOptions): TransformResult {
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
      plugins: ["typescript", "jsx"],
    });

    let lastImportEnd = 0;
    let pluginsArrayStart = -1;
    let firstPluginStart = -1;
    let hasPluginsArray = false;

    // Find last import and plugins array
    traverse(ast, {
      ImportDeclaration(path: NodePath<t.ImportDeclaration>) {
        if (path.node.loc) {
          lastImportEnd = Math.max(lastImportEnd, path.node.loc.end.line);
        }
      },
      ObjectProperty(path: NodePath<t.ObjectProperty>) {
        if (
          path.node.key.type === "Identifier" &&
          path.node.key.name === "plugins" &&
          path.node.value.type === "ArrayExpression"
        ) {
          hasPluginsArray = true;
          if (path.node.value.start !== null && path.node.value.start !== undefined) {
            pluginsArrayStart = path.node.value.start;

            // Find first plugin call
            const elements = path.node.value.elements;
            if (
              elements.length > 0 &&
              elements[0]?.start !== null &&
              elements[0]?.start !== undefined
            ) {
              firstPluginStart = elements[0].start;
            }
          }
        }
      },
    });

    // Add import statement after last import
    const lines = code.split("\n");
    const importLine = `import ${PLUGIN_VAR_NAME} from '${PLUGIN_IMPORT}';\n`;

    if (lastImportEnd > 0) {
      // Insert after last import
      let insertPos = 0;
      for (let i = 0; i < lastImportEnd; i++) {
        insertPos += lines[i].length + 1; // +1 for newline
      }
      s.appendLeft(insertPos, importLine);
    } else {
      // No imports found, add at the beginning
      s.prepend(importLine);
    }

    // Add DevInspector to plugins array
    if (hasPluginsArray && firstPluginStart > -1) {
      // Insert before first plugin
      const pluginOptions = options.entryPath 
        ? `{\n      enabled: true,\n      entry: '${options.entryPath}',\n      autoInject: false,\n    }`
        : `{ enabled: true }`;
      const pluginCall = `${PLUGIN_VAR_NAME}.vite(${pluginOptions}),\n    `;
      s.appendLeft(firstPluginStart, pluginCall);
    } else if (hasPluginsArray && pluginsArrayStart > -1) {
      // Empty plugins array, insert inside
      const pluginOptions = options.entryPath 
        ? `{\n      enabled: true,\n      entry: '${options.entryPath}',\n      autoInject: false,\n    }`
        : `{ enabled: true }`;
      const pluginCall = `\n    ${PLUGIN_VAR_NAME}.vite(${pluginOptions}),\n  `;
      s.appendLeft(pluginsArrayStart + 1, pluginCall);
    } else {
      return {
        success: false,
        modified: false,
        error: "Could not find plugins array in config",
        message: "Please add DevInspector manually to your plugins array",
      };
    }

    return {
      success: true,
      modified: true,
      code: s.toString(),
      message: "Successfully added DevInspector to Vite config",
    };
  } catch (error) {
    return {
      success: false,
      modified: false,
      error: error instanceof Error ? error.message : String(error),
      message: "Failed to transform Vite config",
    };
  }
}

export function detectViteConfig(cwd: string): string | null {
  const patterns = ["vite.config.ts", "vite.config.js", "vite.config.mjs"];
  for (const pattern of patterns) {
    const configPath = resolve(cwd, pattern);
    if (existsSync(configPath)) {
      return configPath;
    }
  }
  return null;
}
