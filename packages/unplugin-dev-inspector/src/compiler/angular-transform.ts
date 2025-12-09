import MagicString from 'magic-string';
import { parseFragment, type DefaultTreeAdapterTypes } from 'parse5';
import path from 'node:path';

type Element = DefaultTreeAdapterTypes.Element;
type Node = DefaultTreeAdapterTypes.Node;
type ParentNode = DefaultTreeAdapterTypes.ParentNode;

interface Attribute {
    name: string;
    value: string;
}

function normalizePath(id: string): string {
    return id.split(path.sep).join('/');
}

const DATA_SOURCE_ATTR = 'data-source';

interface TransformOptions {
    code: string;
    id: string;
}

/**
 * Transform Angular HTML templates to inject data-source attributes for dev inspection.
 * 
 * Handles:
 * - Regular HTML elements: <div>, <button>, <span>
 * - Angular components: <app-component>, <my-widget>
 * - Angular structural directives: *ngIf, *ngFor
 * 
 * Skips:
 * - Elements that already have data-source
 * - Text nodes and comments
 * - Parse errors (returns null gracefully)
 * 
 * Note: This function processes raw HTML template files. However, Angular's Vite plugin
 * compiles templates into TypeScript before our transform hook runs, so this may not
 * be called for Angular component templates that use templateUrl.
 */
export function compileAngular({ code, id }: TransformOptions): { code: string; map: any } | null {
    // Quick bailout: no HTML-like tags in file
    if (!code.includes('<')) {
        return null;
    }

    let fragment: ParentNode;
    try {
        fragment = parseFragment(code, {
            sourceCodeLocationInfo: true,
        });
    } catch {
        // Parse failed - skip this file silently
        return null;
    }

    const relativePath = normalizePath(path.relative(process.cwd(), id));
    const s = new MagicString(code);
    let hasModifications = false;

    function isElement(node: Node): node is Element {
        return 'tagName' in node;
    }

    function traverse(node: Node) {
        if (isElement(node)) {
            const element = node as Element;

            // Skip if missing location info
            if (!element.sourceCodeLocation) {
                return;
            }

            // Check if data-source already exists
            const hasDataSource = element.attrs?.some(
                (attr: Attribute) => attr.name === DATA_SOURCE_ATTR
            );

            if (!hasDataSource) {
                const location = element.sourceCodeLocation;

                // Calculate line and column from the start position
                const lines = code.substring(0, location.startOffset).split('\n');
                const line = lines.length;
                const column = lines[lines.length - 1].length + 1;

                const sourceValue = `${relativePath}:${line}:${column}`;

                // Find insertion position after tag name
                // For <div>, <app-component>, etc., insert after the tag name
                const tagMatch = code.substring(location.startOffset).match(/^<([^\s/>]+)/);
                if (tagMatch) {
                    const insertPos = location.startOffset + tagMatch[0].length;
                    s.appendLeft(insertPos, ` ${DATA_SOURCE_ATTR}="${sourceValue}"`);
                    hasModifications = true;
                }
            }
        }

        // Traverse children
        if ('childNodes' in node && node.childNodes) {
            for (const child of node.childNodes) {
                traverse(child);
            }
        }
    }

    // Start traversal from the root fragment
    for (const child of fragment.childNodes) {
        traverse(child);
    }

    if (!hasModifications) {
        return null;
    }

    return {
        code: s.toString(),
        map: s.generateMap({ hires: true }),
    };
}

/**
 * Transform Angular TypeScript component files to inject data-source attributes.
 * This handles the compiled output from Angular's Vite plugin, which inlines templates.
 */
export function compileAngularComponent({ code, id }: TransformOptions): { code: string; map: any } | null {
    // Quick check: must be a TypeScript file with template content
    if (!id.match(/\.ts$/) || !code.includes('ɵɵelementStart') && !code.includes('template:')) {
        return null;
    }

    // For now, return null as Angular's compiler output is complex
    // We need to handle the inline template strings in @Component decorators
    // This is a placeholder for future implementation
    return null;
}
