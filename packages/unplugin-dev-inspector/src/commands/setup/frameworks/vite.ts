import { parse } from "@babel/parser";
import traverseModule from "@babel/traverse";
import type { NodePath } from "@babel/traverse";
import type * as t from "@babel/types";
import MagicString from "magic-string";
import type { SetupOptions, TransformResult } from "../types";
import { detectConfigFile, getInsertPosition, parseObjectExpression, serializeObject, detectIndent, unwrapNode } from "../utils";

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

    const indent = detectIndent(code);
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

    traverse(ast, {
      ImportDeclaration(path: NodePath<t.ImportDeclaration>) {
        if (path.node.source.value === PLUGIN_IMPORT) {
          hasImport = true;
          const spec = path.node.specifiers.find(s => s.type === "ImportDefaultSpecifier");
          if (spec?.local.type === "Identifier") {
            importedVarName = spec.local.name;
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
          pluginsArrayStart = path.node.value.start ?? -1;
          const elements = path.node.value.elements;
          
            elements.forEach((rawElement) => {
              const element = unwrapNode(rawElement) as any; // Cast to any to safely access properties
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
                // Use undefined check for types safety
                if (typeof element.start === 'number' && typeof element.end === 'number') {
                    // For replacement, we want to replace the WHOLE element (including 'as any'),
                    // so we use rawElement's range if available, otherwise element's range.
                    // Actually, if we use rawElement, we replace 'Call() as any' with 'NewCall()'.
                    // 'NewCall()' does not have 'as any'.
                    // If we want to preserve 'as any', we should replace the inner call range.
                    // But overwriting inner call might be tricky if 'as any' wraps it.
                    // simpler: just replace the inner call.
                    // But wait, if we replace inner call, the 'as any' stays.
                    
                    usageStart = element.start;
                    usageEnd = element.end;
                }
                if (element.arguments.length > 0 && element.arguments[0].type === "ObjectExpression") {
                  existingOptionsNode = element.arguments[0];
                }
              }
            });
          

          if (elements.length > 0 && elements[0]?.start != null) {
            firstPluginStart = elements[0].start;
          }
        }
      },
    });

    // Add import if missing
    if (!hasImport) {
      const importLine = `import ${PLUGIN_VAR_NAME} from '${PLUGIN_IMPORT}';\n`;
      if (lastImportEnd > 0) {
        s.appendLeft(getInsertPosition(code, lastImportEnd), importLine);
      } else {
        s.prepend(importLine);
      }
    }

    // Build config options
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

    const pluginIndent = indent.repeat(2);

    if (hasPluginUsage) {
      // Update existing config
      const mergedConfig = existingOptionsNode ? parseObjectExpression(existingOptionsNode) : {};
      Object.assign(mergedConfig, cliConfig);
      if (usageStart > -1 && usageEnd > -1) {
        s.overwrite(usageStart, usageEnd, `${importedVarName}.vite(${serializeObject(mergedConfig, indent, 3)})`);
      }
    } else if (hasPluginsArray) {
      // Add new plugin
      const finalConfig = { enabled: true, ...cliConfig };
      const pluginCall = `${importedVarName}.vite(${serializeObject(finalConfig, indent, 3)})`;
      if (firstPluginStart > -1) {
        s.appendLeft(firstPluginStart, `${pluginCall},\n${pluginIndent}`);
      } else if (pluginsArrayStart > -1) {
        s.appendLeft(pluginsArrayStart + 1, `\n${pluginIndent}${pluginCall},\n${indent}`);
      }
    } else {
      return {
        success: false,
        modified: false,
        error: "Could not find plugins array in config",
        message: "Please add DevInspector manually to your plugins array",
      };
    }

    // Server config injection
    if (options.host || options.allowedHosts?.length) {
      traverse(ast, {
        ExportDefaultDeclaration(path: NodePath<t.ExportDefaultDeclaration>) {
          if (
            path.node.declaration.type === "CallExpression" &&
            path.node.declaration.arguments[0]?.type === "ObjectExpression"
          ) {
            const configObj = path.node.declaration.arguments[0];
            const serverProp = configObj.properties.find(
              p => p.type === "ObjectProperty" && p.key.type === "Identifier" && p.key.name === "server"
            ) as t.ObjectProperty | undefined;

            const serverIndent = indent.repeat(2);
            if (serverProp?.value.start != null) {
              const serverContentStart = serverProp.value.start + 1;
              const currentBlock = code.slice(serverContentStart, serverProp.value.end!);
              let injection = "";
              if (options.host && !currentBlock.includes("host:")) {
                injection += `\n${serverIndent}host: '${options.host}',`;
              }
              if (options.allowedHosts?.length && !currentBlock.includes("allowedHosts:")) {
                injection += `\n${serverIndent}allowedHosts: [${options.allowedHosts.map(h => `'${h}'`).join(', ')}],`;
              }
              if (injection) s.appendLeft(serverContentStart, injection);
            } else if (configObj.start != null) {
              let injection = `\n${indent}server: {\n`;
              if (options.host) injection += `${serverIndent}host: '${options.host}',\n`;
              if (options.allowedHosts?.length) {
                injection += `${serverIndent}allowedHosts: [${options.allowedHosts.map(h => `'${h}'`).join(', ')}],\n`;
              }
              injection += `${indent}},`;
              s.appendLeft(configObj.start + 1, injection);
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
