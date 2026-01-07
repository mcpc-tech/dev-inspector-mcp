import { existsSync } from "fs";
import { resolve } from "path";
import type * as t from "@babel/types";

/**
 * Detects a configuration file in the given directory based on patterns.
 */
export function detectConfigFile(cwd: string, patterns: string[]): string | null {
  for (const pattern of patterns) {
    const configPath = resolve(cwd, pattern);
    if (existsSync(configPath)) {
      return configPath;
    }
  }
  return null;
}

/**
 * Detects the indentation style used in the code.
 * Simple approach: find the first indented line and use its indent.
 */
export function detectIndent(code: string): string {
  const match = code.match(/\n(\t+|[ ]+)(?=\S)/);
  if (match) {
    const indent = match[1];
    // Return the base unit (first tab or first 2/4 spaces)
    if (indent[0] === '\t') return '\t';
    if (indent.length >= 4 && indent.startsWith('    ')) return '    ';
    if (indent.length >= 2) return '  ';
  }
  return '  '; // Default to 2 spaces
}

/**
 * Calculates the character position to insert an import, based on the last import line.
 */
export function getInsertPosition(code: string, lastImportLine: number): number {
  const lines = code.split("\n");
  let insertPos = 0;
  for (let i = 0; i < lastImportLine; i++) {
    insertPos += lines[i].length + 1; // +1 for newline
  }
  return insertPos;
}

/**
 * Sanitizes a path string to prevent syntax errors in generated code.
 */
export function sanitizePath(path: string): string {
  return path.replace(/\\/g, "\\\\").replace(/'/g, "\\'").replace(/\n/g, "");
}

/**
 * Serializes an object to a formatted string.
 * @param obj - The object to serialize
 * @param baseIndent - The base indentation unit (e.g., "  " for 2 spaces)
 * @param depth - Current nesting depth
 */
export function serializeObject(obj: any, baseIndent: string = "  ", depth: number = 0): string {
  if (obj === null) return "null";
  if (obj === undefined) return "undefined";
  if (typeof obj === "string") return `'${sanitizePath(obj)}'`;
  if (typeof obj !== "object") return String(obj);

  if (Array.isArray(obj)) {
    const items = obj.map(item => serializeObject(item, baseIndent, depth)).join(", ");
    return `[${items}]`;
  }

  const keys = Object.keys(obj);
  if (keys.length === 0) return "{}";

  const indent = baseIndent.repeat(depth);
  const propIndent = baseIndent.repeat(depth + 1);
  
  const props = keys.map(key => {
    const value = serializeObject(obj[key], baseIndent, depth + 1);
    const safeKey = /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(key) ? key : `'${key}'`;
    return `${propIndent}${safeKey}: ${value}`;
  });

  return `{\n${props.join(",\n")}\n${indent}}`;
}

/**
 * Parses a Babel ObjectExpression node into a simple JS object (shallow).
 */
export function parseObjectExpression(node: t.ObjectExpression): Record<string, any> {
  const result: Record<string, any> = {};
  node.properties.forEach(prop => {
    if (prop.type === "ObjectProperty" && prop.key.type === "Identifier") {
        let value: any = undefined;
        if (prop.value.type === "StringLiteral") value = prop.value.value;
        else if (prop.value.type === "BooleanLiteral") value = prop.value.value;
        else if (prop.value.type === "NumericLiteral") value = prop.value.value;
        
        if (value !== undefined) {
            result[prop.key.name] = value;
        }
    }
  });
  return result;
}

/**
 * Unwraps TS expressions like 'as any', '!', etc. to get the underlying expression.
 */
export function unwrapNode(node: t.Node | null | undefined): t.Node | null | undefined {
  if (!node) return node;
  let current = node;
  while (
    current.type === "TSAsExpression" ||
    current.type === "TSNonNullExpression" ||
    current.type === "TSSatisfiesExpression" ||
    current.type === "TSTypeAssertion"
  ) {
      current = (current as any).expression;
  }
  return current;
}
