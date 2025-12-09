import MagicString from 'magic-string';
import { parse } from 'svelte/compiler';
import type { AST } from 'svelte/compiler';
import path from 'node:path';

function normalizePath(id: string): string {
    return id.split(path.sep).join('/');
}

const DATA_SOURCE_ATTR = 'data-source';

interface TransformOptions {
    code: string;
    id: string;
}

/**
 * Transform Svelte code to inject data-source attributes for dev inspection.
 * 
 * Handles:
 * - Regular elements: <div>, <button>
 * - Components: <Counter>, <MyComponent>
 * - Svelte special elements: <svelte:window>, <svelte:head>, etc.
 * 
 * Skips:
 * - Fragments and elements that cannot have attributes
 * - Elements that already have data-source
 * - Parse errors (returns null gracefully)
 */
export function compileSvelte({ code, id }: TransformOptions): { code: string; map: any } | null {
    // Quick bailout: no HTML-like tags in file
    if (!code.includes('<')) {
        return null;
    }

    let ast: AST.Root;
    try {
        ast = parse(code, {
            filename: id,
            modern: true,
        });
    } catch {
        // Parse failed - skip this file silently
        return null;
    }

    const relativePath = normalizePath(path.relative(process.cwd(), id));
    const s = new MagicString(code);
    let hasModifications = false;

    function traverse(node: AST.TemplateNode | AST.Fragment) {
        // Handle Fragment type
        if ('nodes' in node && Array.isArray(node.nodes)) {
            for (const childNode of node.nodes) {
                traverse(childNode as AST.TemplateNode);
            }
            return;
        }

        // Handle element-like nodes
        if ('type' in node && node.type !== 'Fragment' && isElementLike(node as AST.TemplateNode)) {
            const element = node as AST.ElementLike;

            // Skip if missing location info
            if (!element.start || !element.end) {
                return;
            }

            // Check if data-source already exists
            const hasDataSource = element.attributes?.some(
                (attr) =>
                    attr.type === 'Attribute' &&
                    attr.name === DATA_SOURCE_ATTR
            );

            if (!hasDataSource) {
                // Calculate line and column from the start position
                const lines = code.substring(0, element.start).split('\n');
                const line = lines.length;
                const column = lines[lines.length - 1].length + 1;

                const sourceValue = `${relativePath}:${line}:${column}`;

                // Find insertion position after tag name
                // For <div>, <Component>, etc., insert after the tag name
                const tagMatch = code.substring(element.start).match(/^<([^\s/>]+)/);
                if (tagMatch) {
                    const insertPos = element.start + tagMatch[0].length;
                    s.appendLeft(insertPos, ` ${DATA_SOURCE_ATTR}="${sourceValue}"`);
                    hasModifications = true;
                }
            }
        }

        // Traverse children
        if ('fragment' in node && node.fragment) {
            traverse(node.fragment);
        }
        if ('consequent' in node && node.consequent) {
            traverse(node.consequent);
        }
        if ('alternate' in node && node.alternate) {
            traverse(node.alternate);
        }
        if ('body' in node && node.body) {
            traverse(node.body);
        }
        if ('pending' in node && node.pending) {
            traverse(node.pending);
        }
        if ('then' in node && node.then) {
            traverse(node.then);
        }
        if ('catch' in node && node.catch) {
            traverse(node.catch);
        }
        if ('fallback' in node && node.fallback) {
            traverse(node.fallback);
        }
    }

    function isElementLike(node: AST.TemplateNode): node is AST.ElementLike {
        return (
            node.type === 'RegularElement' ||
            node.type === 'Component' ||
            node.type === 'SlotElement' ||
            node.type === 'TitleElement' ||
            node.type === 'SvelteBody' ||
            node.type === 'SvelteComponent' ||
            node.type === 'SvelteDocument' ||
            node.type === 'SvelteElement' ||
            node.type === 'SvelteHead' ||
            node.type === 'SvelteSelf' ||
            node.type === 'SvelteWindow' ||
            node.type === 'SvelteBoundary'
        );
    }

    // Start traversal from the root fragment
    traverse(ast.fragment);

    if (!hasModifications) {
        return null;
    }

    return {
        code: s.toString(),
        map: s.generateMap({ hires: true }),
    };
}
