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

export function transformWebpackConfig(code: string, options: SetupOptions): TransformResult {
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
    const isESM = code.includes("import ") && !code.includes("require(");

    const ast = parse(code, {
      sourceType: "module",
      plugins: ["typescript"],
    });

    let lastImportEnd = 0;
    let pluginsArrayStart = -1;

    // Find last import/require and plugins array
    traverse(ast, {
      ImportDeclaration(path: NodePath<t.ImportDeclaration>) {
        if (path.node.loc) {
          lastImportEnd = Math.max(lastImportEnd, path.node.loc.end.line);
        }
      },
      VariableDeclaration(path: NodePath<t.VariableDeclaration>) {
        // Handle require statements in CommonJS
        if (path.node.loc && !isESM) {
          lastImportEnd = Math.max(lastImportEnd, path.node.loc.end.line);
        }
      },
      ObjectProperty(path: NodePath<t.ObjectProperty>) {
        if (
          path.node.key.type === "Identifier" &&
          path.node.key.name === "plugins" &&
          path.node.value.type === "ArrayExpression"
        ) {
          if (path.node.value.start !== null && path.node.value.start !== undefined) {
            pluginsArrayStart = path.node.value.start;
          }
        }
      },
    });

    // Add import statement
    const importLine = isESM
      ? `import ${PLUGIN_VAR_NAME} from '${PLUGIN_IMPORT}';\n`
      : `const ${PLUGIN_VAR_NAME} = require('${PLUGIN_IMPORT}');\n`;

    if (lastImportEnd > 0) {
      const insertPos = getInsertPosition(code, lastImportEnd);
      s.appendLeft(insertPos, importLine);
    } else {
      s.prepend(importLine);
    }

    // Add DevInspector to plugins array
    if (pluginsArrayStart > -1) {
      const pluginOptions = getPluginOptions(options, 6);
      const pluginCall = `\n    ${PLUGIN_VAR_NAME}.webpack(${pluginOptions}),`;
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
      message: "Successfully added DevInspector to Webpack config",
    };
  } catch (error) {
    return {
      success: false,
      modified: false,
      error: error instanceof Error ? error.message : String(error),
      message: "Failed to transform Webpack config",
    };
  }
}

export function detectWebpackConfig(cwd: string): string | null {
  return detectConfigFile(cwd, ["webpack.config.ts", "webpack.config.js", "webpack.config.cjs", "webpack.config.mjs"]);
}
