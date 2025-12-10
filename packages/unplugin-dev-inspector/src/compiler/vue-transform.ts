import MagicString from "magic-string";
import { parse } from "@vue/compiler-sfc";
import path from "node:path";

function normalizePath(id: string): string {
  return id.split(path.sep).join("/");
}

const DATA_SOURCE_ATTR = "data-source";

interface TransformOptions {
  code: string;
  id: string;
}

export function compileVue({ code, id }: TransformOptions): { code: string; map: any } | null {
  const relativePath = normalizePath(path.relative(process.cwd(), id));

  const { descriptor } = parse(code, {
    filename: id,
    sourceMap: true,
  });

  if (!descriptor.template || !descriptor.template.ast) {
    return null;
  }

  const s = new MagicString(code);
  let hasModifications = false;

  function traverse(node: any) {
    if (node.type === 1) {
      // NodeTypes.ELEMENT
      // Check if data-source already exists
      const hasDataSource = node.props.some(
        (prop: any) => prop.type === 6 && prop.name === DATA_SOURCE_ATTR, // NodeTypes.ATTRIBUTE
      );

      if (!hasDataSource) {
        const { line, column } = node.loc.start;
        const sourceValue = `${relativePath}:${line}:${column}`;

        // Insert after tag name
        // node.loc.start.offset points to '<'
        // We need to find the end of the tag name
        const tagName = node.tag;
        const insertPos = node.loc.start.offset + 1 + tagName.length;

        s.prependLeft(insertPos, ` ${DATA_SOURCE_ATTR}="${sourceValue}"`);
        hasModifications = true;
      }
    }

    if (node.children) {
      node.children.forEach(traverse);
    }
  }

  traverse(descriptor.template.ast);

  if (!hasModifications) {
    return null;
  }

  return {
    code: s.toString(),
    map: s.generateMap({ hires: true }),
  };
}
