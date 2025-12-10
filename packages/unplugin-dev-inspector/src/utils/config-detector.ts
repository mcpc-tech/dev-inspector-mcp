import { existsSync } from "fs";
import { resolve } from "path";

export type BundlerType = "vite" | "webpack" | "nextjs";

export interface DetectedConfig {
  path: string;
  bundler: BundlerType;
  exists: boolean;
}

const CONFIG_PATTERNS: Record<BundlerType, string[]> = {
  vite: ["vite.config.ts", "vite.config.js", "vite.config.mjs"],
  webpack: ["webpack.config.ts", "webpack.config.js"],
  nextjs: ["next.config.ts", "next.config.js", "next.config.mjs"],
};

/**
 * Auto-detect bundler configuration files in the given directory
 * @param cwd - Current working directory (defaults to process.cwd())
 * @returns Array of detected configurations
 */
export function detectConfigs(cwd: string = process.cwd()): DetectedConfig[] {
  const detected: DetectedConfig[] = [];

  for (const [bundler, patterns] of Object.entries(CONFIG_PATTERNS)) {
    for (const pattern of patterns) {
      const configPath = resolve(cwd, pattern);
      if (existsSync(configPath)) {
        detected.push({
          path: configPath,
          bundler: bundler as BundlerType,
          exists: true,
        });
        break; // Only add one config per bundler type
      }
    }
  }

  return detected;
}

/**
 * Detect a specific bundler configuration
 * @param bundler - Bundler type to detect
 * @param cwd - Current working directory
 * @returns Detected config or null
 */
export function detectConfig(
  bundler: BundlerType,
  cwd: string = process.cwd(),
): DetectedConfig | null {
  const patterns = CONFIG_PATTERNS[bundler];

  for (const pattern of patterns) {
    const configPath = resolve(cwd, pattern);
    if (existsSync(configPath)) {
      return {
        path: configPath,
        bundler,
        exists: true,
      };
    }
  }

  return null;
}

/**
 * Find config file by explicit path
 * @param configPath - Explicit path to config file
 * @returns Detected config or null
 */
export function detectConfigByPath(configPath: string): DetectedConfig | null {
  if (!existsSync(configPath)) {
    return null;
  }

  const fileName = configPath.split("/").pop() || "";

  for (const [bundler, patterns] of Object.entries(CONFIG_PATTERNS)) {
    if (patterns.some((pattern) => fileName.includes(pattern.split(".")[0]))) {
      return {
        path: configPath,
        bundler: bundler as BundlerType,
        exists: true,
      };
    }
  }

  return null;
}
