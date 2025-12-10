import { parse } from "@babel/parser";
import traverseModule from "@babel/traverse";
import MagicString from "magic-string";
import { readFileSync } from "fs";
import type { BundlerType } from "./config-detector";

// Handle both ESM and CommonJS default exports
const traverse = (traverseModule as any).default || traverseModule;

export interface TransformOptions {
  configPath: string;
  bundler: BundlerType;
  dryRun?: boolean;
}

export interface TransformResult {
  success: boolean;
  modified: boolean;
  code?: string;
  error?: string;
  message: string;
}

const PLUGIN_IMPORT = "@mcpc-tech/unplugin-dev-inspector-mcp";
const PLUGIN_VAR_NAME = "DevInspector";

/**
 * Check if DevInspector is already imported in the code
 */
function hasDevInspectorImport(code: string): boolean {
  return code.includes(PLUGIN_IMPORT);
}

/**
 * Transform Vite configuration to add DevInspector
 */
export function transformViteConfig(options: TransformOptions): TransformResult {
  const { configPath } = options;

  try {
    const code = readFileSync(configPath, "utf-8");

    // Check if already configured
    if (hasDevInspectorImport(code)) {
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
      ImportDeclaration(path) {
        if (path.node.loc) {
          lastImportEnd = Math.max(lastImportEnd, path.node.loc.end.line);
        }
      },
      ObjectProperty(path) {
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
      const pluginCall = `${PLUGIN_VAR_NAME}.vite({\n      enabled: true,\n    }),\n    `;
      s.appendLeft(firstPluginStart, pluginCall);
    } else if (hasPluginsArray && pluginsArrayStart > -1) {
      // Empty plugins array, insert inside
      const pluginCall = `\n    ${PLUGIN_VAR_NAME}.vite({\n      enabled: true,\n    }),\n  `;
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

/**
 * Transform Webpack configuration to add DevInspector
 */
export function transformWebpackConfig(options: TransformOptions): TransformResult {
  const { configPath } = options;

  try {
    const code = readFileSync(configPath, "utf-8");

    // Check if already configured
    if (hasDevInspectorImport(code)) {
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
      ImportDeclaration(path) {
        if (path.node.loc) {
          lastImportEnd = Math.max(lastImportEnd, path.node.loc.end.line);
        }
      },
      VariableDeclaration(path) {
        // Handle require statements
        if (path.node.loc && !isESM) {
          lastImportEnd = Math.max(lastImportEnd, path.node.loc.end.line);
        }
      },
      ObjectProperty(path) {
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

    // Add import/require statement
    const lines = code.split("\n");
    const importLine = isESM
      ? `import ${PLUGIN_VAR_NAME} from '${PLUGIN_IMPORT}';\n`
      : `const ${PLUGIN_VAR_NAME} = require('${PLUGIN_IMPORT}');\n`;

    if (lastImportEnd > 0) {
      let insertPos = 0;
      for (let i = 0; i < lastImportEnd; i++) {
        insertPos += lines[i].length + 1;
      }
      s.appendLeft(insertPos, importLine);
    } else {
      s.prepend(importLine);
    }

    // Add DevInspector to plugins array
    if (pluginsArrayStart > -1) {
      const pluginCall = `\n    ${PLUGIN_VAR_NAME}.webpack({\n      enabled: true,\n    }),`;
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

/**
 * Transform Next.js configuration to add DevInspector
 */
export function transformNextConfig(options: TransformOptions): TransformResult {
  const { configPath } = options;

  try {
    const code = readFileSync(configPath, "utf-8");

    // Check if already configured
    if (hasDevInspectorImport(code)) {
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
      ImportDeclaration(path) {
        if (path.node.loc) {
          lastImportEnd = Math.max(lastImportEnd, path.node.loc.end.line);
        }
      },
      VariableDeclarator(path) {
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
    const lines = code.split("\n");
    const importLine = `import ${PLUGIN_VAR_NAME} from '${PLUGIN_IMPORT}';\n`;

    if (lastImportEnd > 0) {
      let insertPos = 0;
      for (let i = 0; i < lastImportEnd; i++) {
        insertPos += lines[i].length + 1;
      }
      s.appendLeft(insertPos, importLine);
    } else {
      s.prepend(importLine);
    }

    // Add webpack configuration
    if (nextConfigStart > -1 && !hasWebpackProperty) {
      const webpackConfig = `\n  webpack: (config) => {\n    config.plugins.push(\n      ${PLUGIN_VAR_NAME}.webpack({\n        enabled: true,\n      })\n    );\n    return config;\n  },`;
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

/**
 * Main transform function that routes to the appropriate transformer
 */
export function transformConfig(options: TransformOptions): TransformResult {
  switch (options.bundler) {
    case "vite":
      return transformViteConfig(options);
    case "webpack":
      return transformWebpackConfig(options);
    case "nextjs":
      return transformNextConfig(options);
    default:
      return {
        success: false,
        modified: false,
        error: `Unknown bundler type: ${options.bundler}`,
        message: "Unsupported bundler type",
      };
  }
}
