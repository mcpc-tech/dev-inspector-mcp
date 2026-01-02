import { existsSync } from "fs";
import { resolve } from "path";
import type { SetupOptions } from "./types";

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
  return path.replace(/'/g, "\\'").replace(/\n/g, "");
}

/**
 * Generates formatted plugin options string.
 */
export function getPluginOptions(options: SetupOptions, indent: number = 6): string {
  if (!options.entryPath) {
    return "{ enabled: true }";
  }

  const s = " ".repeat(indent);
  const entry = sanitizePath(options.entryPath);
  
  return `{
${s}  enabled: true,
${s}  entry: '${entry}',
${s}  autoInject: false,
${s}}`;
}
