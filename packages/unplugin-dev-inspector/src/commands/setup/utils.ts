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
  return path.replace(/\\/g, "\\\\").replace(/'/g, "\\'").replace(/\n/g, "");
}

/**
 * Generates formatted plugin options string.
 */
export function getPluginOptions(options: SetupOptions, indent: number = 6): string {
  // 1. Base config
  const config: Record<string, any> = {
    enabled: true,
  };

  if (options.entryPath) {
    config.entry = options.entryPath; // Will be sanitized during serialization if needed, but here simple assignment
    config.autoInject = false;
  }

  // 2. Merge generic JSON options
  if (options.jsonOptions) {
    Object.assign(config, options.jsonOptions);
  }

  // 3. Apply specific flags (Override JSON options)
  if (options.updateConfig !== undefined) config.updateConfig = options.updateConfig;
  if (options.disableChrome !== undefined) config.disableChrome = options.disableChrome;
  if (options.autoOpenBrowser !== undefined) config.autoOpenBrowser = options.autoOpenBrowser;
  if (options.defaultAgent !== undefined) config.defaultAgent = options.defaultAgent;
  if (options.visibleAgents !== undefined) config.visibleAgents = options.visibleAgents;

  // 4. Serialize
  return serializeObject(config, indent);
}

function serializeObject(obj: any, indentLevel: number): string {
  if (obj === null) return "null";
  if (obj === undefined) return "undefined";
  if (typeof obj === "string") return `'${sanitizePath(obj)}'`;
  if (typeof obj !== "object") return String(obj);

  if (Array.isArray(obj)) {
    const items = obj.map(item => serializeObject(item, indentLevel + 2)).join(", ");
    return `[${items}]`;
  }

  const keys = Object.keys(obj);
  if (keys.length === 0) return "{}";

  const indent = " ".repeat(indentLevel);
  const propIndent = " ".repeat(indentLevel + 2); // 2 spaces for nested properties
  
  const props = keys.map(key => {
    const value = serializeObject(obj[key], indentLevel + 2);
    // Keys in JS/TS usually don't need quotes unless they contain special chars
    const safeKey = /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(key) ? key : `'${key}'`;
    return `${propIndent}${safeKey}: ${value}`;
  });

  return `{\n${props.join(",\n")}\n${indent}}`;
}
