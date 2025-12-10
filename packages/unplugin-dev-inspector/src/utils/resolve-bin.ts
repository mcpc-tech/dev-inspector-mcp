import { resolve, dirname } from "node:path";
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";

/**
 * Resolves a package's binary path from node_modules by reading its package.json
 * This is more stable than using npx as it uses the installed package directly
 *
 * @param packageName - The npm package name (e.g., 'mcp-remote', 'typescript', 'eslint')
 * @param cwd - Current working directory (defaults to process.cwd())
 * @returns Object containing the command and args to execute the binary
 *
 * @example
 * ```ts
 * const { command, args } = resolvePackageBin('mcp-remote');
 * spawn(command, [...args, 'http://localhost:5173']);
 * ```
 */
export function resolvePackageBin(
  packageName: string,
  cwd: string = process.cwd(),
): {
  command: string;
  args: string[];
} {
  try {
    // Use Node.js's built-in module resolution
    const require = createRequire(resolve(cwd, "package.json"));
    const packageJsonPath = require.resolve(`${packageName}/package.json`);

    const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf-8"));

    if (packageJson.bin) {
      // Get bin path: handle both string and object formats
      const binPath =
        typeof packageJson.bin === "string"
          ? packageJson.bin
          : packageJson.bin[packageName] || packageJson.bin[Object.keys(packageJson.bin)[0]];

      if (binPath) {
        const fullBinPath = resolve(dirname(packageJsonPath), binPath);
        if (existsSync(fullBinPath)) {
          return {
            command: "node",
            args: [fullBinPath],
          };
        }
      }
    }
  } catch (error) {
    // Package not found or resolution failed
  }

  // Fallback to npx if not found in node_modules
  console.warn(
    `${packageName} not found in node_modules, falling back to npx. Consider installing ${packageName} as a dependency.`,
  );
  return {
    command: "npx",
    args: [packageName],
  };
}

/**
 * Resolves the mcp-remote CLI path from node_modules
 * Convenience wrapper around resolvePackageBin for mcp-remote
 *
 * @param cwd - Current working directory (defaults to process.cwd())
 * @returns Object containing the command and args to execute mcp-remote
 */
export function resolveMcpRemote(cwd: string = process.cwd()): {
  command: string;
  args: string[];
} {
  return resolvePackageBin("mcp-remote", cwd);
}
