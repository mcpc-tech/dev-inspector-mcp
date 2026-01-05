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

export function transformViteConfig(code: string, options: SetupOptions): TransformResult {
  try {
    const s = new MagicString(code);
    const ast = parse(code, {
      sourceType: "module",
      plugins: ["typescript", "jsx"],
    });

    let lastImportEnd = 0;
    let pluginsArrayStart = -1;
    let firstPluginStart = -1;
    let hasPluginsArray = false;

    let hasImport = false;
    let hasPluginUsage = false;
    let importedVarName = PLUGIN_VAR_NAME;
    let existingOptionsNode: t.ObjectExpression | null = null;
    let usageStart = -1;
    let usageEnd = -1;

    // Analyze existing config
    traverse(ast, {
      ImportDeclaration(path: NodePath<t.ImportDeclaration>) {
        if (path.node.source.value === PLUGIN_IMPORT) {
          hasImport = true;
          const defaultSpecifier = path.node.specifiers.find((s) => s.type === "ImportDefaultSpecifier");
          if (defaultSpecifier && defaultSpecifier.local.type === "Identifier") {
            importedVarName = defaultSpecifier.local.name;
          }
        }
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
            const elements = path.node.value.elements;
            
            elements.forEach((element) => {
              if (
                element &&
                element.type === "CallExpression" &&
                element.callee.type === "MemberExpression" &&
                element.callee.object.type === "Identifier" &&
                element.callee.object.name === importedVarName &&
                element.callee.property.type === "Identifier" &&
                element.callee.property.name === "vite"
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

            if (elements.length > 0 && typeof elements[0]?.start === 'number') {
              firstPluginStart = elements[0].start;
            }
          }
        }
      },
    });

    // Add import statement if missing
    if (!hasImport) {
      const importLine = `import ${PLUGIN_VAR_NAME} from '${PLUGIN_IMPORT}';\n`;
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

    if (hasPluginUsage) {
      const mergedConfig = existingOptionsNode ? parseObjectExpression(existingOptionsNode) : {};
      Object.assign(mergedConfig, cliConfig);

      if (usageStart > -1 && usageEnd > -1) {
          const newPluginCall = `${importedVarName}.vite(${serializeObject(mergedConfig, 6)})`;
          s.overwrite(usageStart, usageEnd, newPluginCall);
      }

    } else {
      const finalConfig = { enabled: true, ...cliConfig };
      if (hasPluginsArray && firstPluginStart > -1) {
        const pluginCall = `${importedVarName}.vite(${serializeObject(finalConfig, 6)}),\n    `;
        s.appendLeft(firstPluginStart, pluginCall);
      } else if (hasPluginsArray && pluginsArrayStart > -1) {
        const pluginCall = `\n    ${importedVarName}.vite(${serializeObject(finalConfig, 6)}),\n  `;
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

    // Server config injection (Host/AllowedHosts)
    if (options.host || (options.allowedHosts && options.allowedHosts.length > 0)) {
      traverse(ast, {
        ExportDefaultDeclaration(path: NodePath<t.ExportDefaultDeclaration>) {
          if (
            path.node.declaration.type === "CallExpression" &&
            path.node.declaration.arguments.length > 0 &&
            path.node.declaration.arguments[0].type === "ObjectExpression"
          ) {
            const configObj = path.node.declaration.arguments[0];
            const serverProp = configObj.properties.find(
              (p) => p.type === "ObjectProperty" && p.key.type === "Identifier" && p.key.name === "server"
            ) as t.ObjectProperty | undefined;

            if (serverProp && serverProp.value.start !== null) {
                const serverContentStart = serverProp.value.start! + 1;
                const serverBlockEnd = serverProp.value.end;
                if (serverBlockEnd) {
                    const currentServerBlock = code.slice(serverContentStart, serverBlockEnd);
                    let injection = "";
                    if (options.host && !currentServerBlock.includes("host:")) {
                         injection += `\n    host: '${options.host}',`;
                    }
                    if (options.allowedHosts && options.allowedHosts.length > 0 && !currentServerBlock.includes("allowedHosts:")) {
                         const hostsStr = options.allowedHosts.map(h => `'${h}'`).join(', ');
                         injection += `\n    allowedHosts: [${hostsStr}],`;
                    }
                    if (injection) s.appendLeft(serverContentStart, injection);
                }
            } else if (configObj.start !== null) {
                 let injection = "\n  server: {\n";
                 if (options.host) injection += `    host: '${options.host}',\n`;
                 if (options.allowedHosts && options.allowedHosts.length > 0) {
                    const hostsStr = options.allowedHosts.map(h => `'${h}'`).join(', ');
                    injection += `    allowedHosts: [${hostsStr}],\n`;
                 }
                 injection += "  },";
                 s.appendLeft(configObj.start! + 1, injection);
            }
          }
        }
      });
    }

    if (s.toString() === code) {
       return { success: true, modified: false, message: "DevInspector is already configured" };
    }

    return { success: true, modified: true, code: s.toString(), message: "Successfully added/updated DevInspector in Vite config" };

  } catch (error) {
    return { success: false, modified: false, error: error instanceof Error ? error.message : String(error), message: "Failed to transform Vite config" };
  }
}

export function detectViteConfig(cwd: string): string | null {
  return detectConfigFile(cwd, ["vite.config.ts", "vite.config.js", "vite.config.mjs"]);
}
