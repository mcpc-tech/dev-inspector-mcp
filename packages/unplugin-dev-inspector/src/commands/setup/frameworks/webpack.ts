import { parse } from "@babel/parser";
import traverseModule from "@babel/traverse";
import type { NodePath } from "@babel/traverse";
import type * as t from "@babel/types";
import MagicString from "magic-string";
import type { SetupOptions, TransformResult } from "../types";
import { detectConfigFile, getInsertPosition, parseObjectExpression, serializeObject } from "../utils";

// Handle both ESM and CommonJS default exports
const traverse = (traverseModule as any).default || traverseModule;

const PLUGIN_IMPORT = "@mcpc-tech/unplugin-dev-inspector-mcp";
const PLUGIN_VAR_NAME = "DevInspector";

export function transformWebpackConfig(code: string, options: SetupOptions): TransformResult {
  try {
    const s = new MagicString(code);
    const isESM = code.includes("import ") && !code.includes("require(");

    const ast = parse(code, {
      sourceType: "module",
      plugins: ["typescript"],
    });

    let lastImportEnd = 0;
    let pluginsArrayStart = -1;

    let hasImport = false;
    let hasPluginUsage = false;
    let importedVarName = PLUGIN_VAR_NAME;
    let existingOptionsNode: t.ObjectExpression | null = null;
    let usageStart = -1;
    let usageEnd = -1;

    // Find last import/require and plugins array
    traverse(ast, {
      ImportDeclaration(path: NodePath<t.ImportDeclaration>) {
        if (path.node.loc) lastImportEnd = Math.max(lastImportEnd, path.node.loc.end.line);
        if (path.node.source.value === PLUGIN_IMPORT) {
          hasImport = true;
          const specifier = path.node.specifiers.find((s) => s.type === "ImportDefaultSpecifier");
          if (specifier && specifier.local.type === "Identifier") {
            importedVarName = specifier.local.name;
          }
        }
      },
      VariableDeclaration(path: NodePath<t.VariableDeclaration>) {
        if (path.node.loc && !isESM) lastImportEnd = Math.max(lastImportEnd, path.node.loc.end.line);
        path.node.declarations.forEach((decl) => {
          if (
            decl.init?.type === "CallExpression" &&
            decl.init.callee.type === "Identifier" &&
            decl.init.callee.name === "require" &&
            decl.init.arguments[0]?.type === "StringLiteral" &&
            decl.init.arguments[0].value === PLUGIN_IMPORT
          ) {
            hasImport = true;
            if (decl.id.type === "Identifier") importedVarName = decl.id.name;
          }
        });
      },
      ObjectProperty(path: NodePath<t.ObjectProperty>) {
        if (
          path.node.key.type === "Identifier" &&
          path.node.key.name === "plugins" &&
          path.node.value.type === "ArrayExpression"
        ) {
          if (path.node.value.start !== null && path.node.value.start !== undefined) {
            pluginsArrayStart = path.node.value.start;
            const elements = path.node.value.elements;

            elements.forEach((element) => {
              if (
                element &&
                element.type === "CallExpression" &&
                element.callee.type === "MemberExpression" &&
                element.callee.object.type === "Identifier" &&
                element.callee.object.name === importedVarName &&
                element.callee.property.type === "Identifier" &&
                element.callee.property.name === "webpack"
              ) {
                hasPluginUsage = true;
                if (typeof element.start === 'number' && typeof element.end === 'number') {
                    usageStart = element.start;
                    usageEnd = element.end;
                }
                if (element.arguments.length > 0 && element.arguments[0].type === "ObjectExpression") {
                  existingOptionsNode = element.arguments[0];
                }
              }
            });
          }
        }
      },
    });

    // Add import statement
    if (!hasImport) {
      const importLine = isESM
        ? `import ${PLUGIN_VAR_NAME} from '${PLUGIN_IMPORT}';\n`
        : `const ${PLUGIN_VAR_NAME} = require('${PLUGIN_IMPORT}');\n`;

      if (lastImportEnd > 0) {
        const insertPos = getInsertPosition(code, lastImportEnd);
        s.appendLeft(insertPos, importLine);
      } else {
        s.prepend(importLine);
      }
    }

     // Build CLI options
    const cliConfig: Record<string, any> = {};
    if (options.entryPath) {
        cliConfig.entry = options.entryPath;
        cliConfig.autoInject = false;
    }
    if (options.jsonOptions) Object.assign(cliConfig, options.jsonOptions);
    if (options.updateConfig !== undefined) cliConfig.updateConfig = options.updateConfig;
    if (options.disableChrome !== undefined) cliConfig.disableChrome = options.disableChrome;
    if (options.autoOpenBrowser !== undefined) cliConfig.autoOpenBrowser = options.autoOpenBrowser;
    if (options.defaultAgent !== undefined) cliConfig.defaultAgent = options.defaultAgent;
    if (options.visibleAgents !== undefined) cliConfig.visibleAgents = options.visibleAgents;
    if (options.publicBaseUrl !== undefined) cliConfig.publicBaseUrl = options.publicBaseUrl;


    // Add DevInspector to plugins array
    if (hasPluginUsage) {
      const mergedConfig = existingOptionsNode ? parseObjectExpression(existingOptionsNode) : {};
      Object.assign(mergedConfig, cliConfig);

      if (usageStart > -1 && usageEnd > -1) {
          const newPluginCall = `${importedVarName}.webpack(${serializeObject(mergedConfig, 6)})`;
          s.overwrite(usageStart, usageEnd, newPluginCall);
      }

    } else {
      if (pluginsArrayStart > -1) {
        const finalConfig = { enabled: true, ...cliConfig };
        const pluginCall = `\n    ${importedVarName}.webpack(${serializeObject(finalConfig, 6)}),`;
        s.appendLeft(pluginsArrayStart + 1, pluginCall);
      } else {
        return {
          success: false,
          modified: false,
          error: "Could not find plugins array in config",
          message: "Please add DevInspector manually to your plugins array",
        };
      }
    }

    if (s.toString() === code) {
      return { success: true, modified: false, message: "DevInspector is already configured in this file" };
    }

    return { success: true, modified: true, code: s.toString(), message: "Successfully added DevInspector to Webpack config" };
  } catch (error) {
    return { success: false, modified: false, error: error instanceof Error ? error.message : String(error), message: "Failed to transform Webpack config" };
  }
}

export function detectWebpackConfig(cwd: string): string | null {
  return detectConfigFile(cwd, ["webpack.config.ts", "webpack.config.js", "webpack.config.cjs", "webpack.config.mjs"]);
}
