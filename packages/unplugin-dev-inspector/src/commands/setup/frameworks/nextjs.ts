import { parse } from "@babel/parser";
import traverseModule from "@babel/traverse";
import type { NodePath } from "@babel/traverse";
import type * as t from "@babel/types";
import MagicString from "magic-string";
import type { SetupOptions, TransformResult } from "../types";
import { detectConfigFile, getInsertPosition, detectIndent } from "../utils";

const traverse = (traverseModule as any).default || traverseModule;

const PLUGIN_IMPORT = "@mcpc-tech/unplugin-dev-inspector-mcp";
const PLUGIN_VAR_NAME = "DevInspector";

export function transformNextConfig(code: string, _options: SetupOptions): TransformResult {
  try {
    if (code.includes(PLUGIN_IMPORT)) {
      return { success: true, modified: false, message: "DevInspector is already configured in this file" };
    }

    const s = new MagicString(code);
    const ast = parse(code, { sourceType: "module", plugins: ["typescript"] });
    const indent = detectIndent(code);

    let lastImportEnd = 0;
    let nextConfigStart = -1;
    let hasWebpackProperty = false;
    let hasTurbopackProperty = false;

    traverse(ast, {
      ImportDeclaration(path: NodePath<t.ImportDeclaration>) {
        if (path.node.loc) lastImportEnd = Math.max(lastImportEnd, path.node.loc.end.line);
      },
      VariableDeclarator(path: NodePath<t.VariableDeclarator>) {
        if (
          path.node.id.type === "Identifier" &&
          path.node.id.name === "nextConfig" &&
          path.node.init?.type === "ObjectExpression"
        ) {
          nextConfigStart = path.node.init.start ?? -1;
          for (const prop of path.node.init.properties) {
            if (prop.type === "ObjectProperty" && prop.key.type === "Identifier") {
              if (prop.key.name === "webpack") hasWebpackProperty = true;
              if (prop.key.name === "turbopack") hasTurbopackProperty = true;
            }
          }
        }
      },
    });

    // Add import
    const importLine = `import ${PLUGIN_VAR_NAME}, { turbopackDevInspector } from '${PLUGIN_IMPORT}';\n`;
    if (lastImportEnd > 0) {
      s.appendLeft(getInsertPosition(code, lastImportEnd), importLine);
    } else {
      s.prepend(importLine);
    }

    // Add webpack and turbopack configuration
    if (nextConfigStart > -1 && !hasWebpackProperty && !hasTurbopackProperty) {
      const i1 = indent, i2 = indent.repeat(2), i3 = indent.repeat(3);
      const webpackConfig = `
${i1}webpack: (config) => {
${i2}config.plugins.push(${PLUGIN_VAR_NAME}.webpack({ enabled: true }));
${i2}return config;
${i1}},
${i1}turbopack: {
${i2}rules: turbopackDevInspector({ enabled: true }),
${i1}},`;
      s.appendLeft(nextConfigStart + 1, webpackConfig);
    } else if (hasWebpackProperty || hasTurbopackProperty) {
      return {
        success: false,
        modified: false,
        message: `${hasWebpackProperty ? "webpack" : "turbopack"} property already exists. Please add DevInspector manually`,
      };
    } else {
      return { success: false, modified: false, error: "Could not find nextConfig object", message: "Please add DevInspector manually" };
    }

    return { success: true, modified: true, code: s.toString(), message: "Successfully added DevInspector to Next.js config" };
  } catch (error) {
    return { success: false, modified: false, error: error instanceof Error ? error.message : String(error), message: "Failed to transform Next.js config" };
  }
}

export function transformNextLayout(code: string): TransformResult {
  try {
    const COMPONENT_IMPORT = "@mcpc-tech/unplugin-dev-inspector-mcp/next";
    
    if (code.includes("DevInspector") || code.includes(COMPONENT_IMPORT)) {
      return { success: true, modified: false, message: "DevInspector component is already in this file" };
    }

    const s = new MagicString(code);
    const ast = parse(code, { sourceType: "module", plugins: ["typescript", "jsx"] });
    const indent = detectIndent(code);

    let lastImportEnd = 0;
    let bodyStart = -1;

    traverse(ast, {
      ImportDeclaration(path: NodePath<t.ImportDeclaration>) {
        if (path.node.loc) lastImportEnd = Math.max(lastImportEnd, path.node.loc.end.line);
      },
      JSXElement(path: NodePath<t.JSXElement>) {
        if (
          path.node.openingElement.name.type === "JSXIdentifier" &&
          path.node.openingElement.name.name === "body" &&
          path.node.openingElement.end != null
        ) {
          bodyStart = path.node.openingElement.end;
        }
      },
    });

    // Add import
    const importLine = `import { DevInspector } from "${COMPONENT_IMPORT}";\n`;
    if (lastImportEnd > 0) {
      s.appendLeft(getInsertPosition(code, lastImportEnd), importLine);
    } else {
      s.prepend(importLine);
    }

    // Add component after <body>
    if (bodyStart > -1) {
      s.appendLeft(bodyStart, `\n${indent.repeat(4)}<DevInspector />`);
    } else {
      return { success: false, modified: false, error: "Could not find <body> element", message: "Please add <DevInspector /> manually" };
    }

    return { success: true, modified: true, code: s.toString(), message: "Successfully added DevInspector component to layout" };
  } catch (error) {
    return { success: false, modified: false, error: error instanceof Error ? error.message : String(error), message: "Failed to transform layout file" };
  }
}

export function detectNextConfig(cwd: string): string | null {
  return detectConfigFile(cwd, ["next.config.ts", "next.config.js", "next.config.mjs"]);
}
