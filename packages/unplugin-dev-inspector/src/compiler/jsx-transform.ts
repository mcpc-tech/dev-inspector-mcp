import MagicString from "magic-string";
import { parse } from "@babel/parser";
import type {
  JSXOpeningElement,
  JSXIdentifier,
  JSXMemberExpression,
  JSXNamespacedName,
} from "@babel/types";
import path from "node:path";
import { createRequire } from "node:module";

// Use createRequire to load CJS modules
const require = createRequire(import.meta.url);
const traverse = require("@babel/traverse").default;

function normalizePath(id: string): string {
  return id.split(path.sep).join("/");
}

const DATA_SOURCE_ATTR = "data-source";

interface TransformOptions {
  code: string;
  id: string;
}

/**
 * Check if JSX element name is a Fragment (React.Fragment, Fragment, or <>)
 */
function isFragment(name: JSXIdentifier | JSXMemberExpression | JSXNamespacedName): boolean {
  if (name.type === "JSXIdentifier") {
    return name.name === "Fragment";
  }
  if (name.type === "JSXMemberExpression") {
    // React.Fragment
    const object = name.object;
    const property = name.property;
    return (
      object.type === "JSXIdentifier" &&
      object.name === "React" &&
      property.type === "JSXIdentifier" &&
      property.name === "Fragment"
    );
  }
  return false;
}

/**
 * Transform JSX/TSX code to inject data-source attributes for dev inspection.
 *
 * Handles:
 * - Regular components: <Div>, <Button>
 * - Member expressions: <Foo.Bar>, <Layout.Content>
 * - Generic components: <Table<T>>, <Select<Option>>
 * - Namespaced: <svg:rect>
 *
 * Skips:
 * - Fragments: <>, <Fragment>, <React.Fragment>
 * - Elements that already have data-source
 * - Parse errors (returns null gracefully)
 */
export function transformJSX({ code, id }: TransformOptions): { code: string; map: any } | null {
  // Quick bailout: no JSX in file
  if (!code.includes("<")) {
    return null;
  }

  let ast;
  try {
    ast = parse(code, {
      sourceType: "module",
      plugins: ["jsx", "typescript", "decorators-legacy", "classProperties", "importMeta"],
      errorRecovery: true, // Don't throw on minor syntax issues
    });
  } catch {
    // Parse failed - skip this file silently
    return null;
  }

  const relativePath = normalizePath(path.relative(process.cwd(), id));
  const s = new MagicString(code);
  let hasModifications = false;

  try {
    traverse(ast, {
      JSXOpeningElement(path: any) {
        try {
          const node = path.node as JSXOpeningElement;

          // Skip fragments - they can't have attributes
          if (!node.name || isFragment(node.name)) {
            return;
          }

          // Skip if missing location info
          if (!node.loc?.start || !node.name.end) {
            return;
          }

          // Skip if already has data-source attribute
          const hasDataSource = node.attributes?.some(
            (attr) =>
              attr.type === "JSXAttribute" &&
              attr.name?.type === "JSXIdentifier" &&
              attr.name.name === DATA_SOURCE_ATTR,
          );
          if (hasDataSource) {
            return;
          }

          const { line, column } = node.loc.start;
          const sourceValue = `${relativePath}:${line}:${column}`;

          // Find insertion position after tag name (and type params if any)
          let insertPos: number;

          if (node.typeParameters?.end) {
            // Generic component: <Table<T>> -> insert after >
            insertPos = node.typeParameters.end;
          } else if (node.name.end) {
            // Regular: <Div> or <Foo.Bar> -> insert after name
            insertPos = node.name.end;
          } else {
            // Safety fallback - skip if we can't determine position
            return;
          }

          // Validate insertion position is within bounds
          if (insertPos < 0 || insertPos > code.length) {
            return;
          }

          const attr = ` ${DATA_SOURCE_ATTR}="${sourceValue}"`;
          s.appendLeft(insertPos, attr);
          hasModifications = true;
        } catch {
          // Skip this element on any error
        }
      },
    });
  } catch {
    // Traversal failed - return null
    return null;
  }

  if (!hasModifications) {
    return null;
  }

  return {
    code: s.toString(),
    map: s.generateMap({ hires: true }),
  };
}
