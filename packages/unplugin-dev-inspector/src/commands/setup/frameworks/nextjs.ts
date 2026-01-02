import { parse } from "@babel/parser";
import traverseModule from "@babel/traverse";
import type { NodePath } from "@babel/traverse";
import type * as t from "@babel/types";
import MagicString from "magic-string";
import type { SetupOptions, TransformResult } from "../types";
import { detectConfigFile, getInsertPosition } from "../utils";

// Handle both ESM and CommonJS default exports
const traverse = (traverseModule as any).default || traverseModule;

const PLUGIN_IMPORT = "@mcpc-tech/unplugin-dev-inspector-mcp";
const PLUGIN_VAR_NAME = "DevInspector";

export function transformNextConfig(code: string, _options: SetupOptions): TransformResult {
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
    let hasTurbopackProperty = false;

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

          // Check if webpack or turbopack properties exist
          path.node.init.properties.forEach((prop) => {
            if (
              prop.type === "ObjectProperty" &&
              prop.key.type === "Identifier"
            ) {
              if (prop.key.name === "webpack") {
                hasWebpackProperty = true;
              }
              if (prop.key.name === "turbopack") {
                hasTurbopackProperty = true;
              }
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
    // Note: Next.js doesn't support the 'entry' option - use <DevInspector /> component instead
    if (nextConfigStart > -1 && !hasWebpackProperty && !hasTurbopackProperty) {
      const pluginOptions = "{ enabled: true }";
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
    } else if (hasWebpackProperty || hasTurbopackProperty) {
      const existingProperty = hasWebpackProperty ? "webpack" : "turbopack";
      return {
        success: false,
        modified: false,
        message:
          `${existingProperty} property already exists. Please add DevInspector manually to avoid conflicts`,
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

export function transformNextLayout(code: string): TransformResult {
  try {
    const COMPONENT_IMPORT = "@mcpc-tech/unplugin-dev-inspector-mcp/next";
    
    // Check if already has DevInspector
    if (code.includes("DevInspector") || code.includes(COMPONENT_IMPORT)) {
      return {
        success: true,
        modified: false,
        message: "DevInspector component is already in this file",
      };
    }

    const s = new MagicString(code);
    const ast = parse(code, {
      sourceType: "module",
      plugins: ["typescript", "jsx"],
    });

    let lastImportEnd = 0;
    let bodyStart = -1;

    traverse(ast, {
      ImportDeclaration(path: NodePath<t.ImportDeclaration>) {
        if (path.node.loc) {
          lastImportEnd = Math.max(lastImportEnd, path.node.loc.end.line);
        }
      },
      JSXElement(path: NodePath<t.JSXElement>) {
        // Find <body> element
        if (
          path.node.openingElement.name.type === "JSXIdentifier" &&
          path.node.openingElement.name.name === "body" &&
          path.node.start !== null
        ) {
          // Find the position after <body ...>
          const openingEnd = path.node.openingElement.end;
          if (openingEnd !== null && openingEnd !== undefined) {
            bodyStart = openingEnd;
          }
        }
      },
    });

    // Add import
    const importLine = `import { DevInspector } from "${COMPONENT_IMPORT}";\n`;
    if (lastImportEnd > 0) {
      const insertPos = getInsertPosition(code, lastImportEnd);
      s.appendLeft(insertPos, importLine);
    } else {
      s.prepend(importLine);
    }

    // Add component after <body>
    if (bodyStart > -1) {
      s.appendLeft(bodyStart, "\n        <DevInspector />");
    } else {
      return {
        success: false,
        modified: false,
        error: "Could not find <body> element",
        message: "Please add <DevInspector /> manually to your layout",
      };
    }

    return {
      success: true,
      modified: true,
      code: s.toString(),
      message: "Successfully added DevInspector component to layout",
    };
  } catch (error) {
    return {
      success: false,
      modified: false,
      error: error instanceof Error ? error.message : String(error),
      message: "Failed to transform layout file",
    };
  }
}

export function detectNextConfig(cwd: string): string | null {
  return detectConfigFile(cwd, ["next.config.ts", "next.config.js", "next.config.mjs"]);
}
