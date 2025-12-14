import { createRequire } from "module";
import { readFileSync } from "fs";
import { join, dirname } from "path";

/**
 * Resolve npm package bin entry point
 * Returns the absolute path to the bin file, or null if resolution fails
 */
export function resolveNpmPackageBin(packageName: string): string | null {
  try {
    const require = createRequire(import.meta.url);
    const packageJsonPath = require.resolve(`${packageName}/package.json`);
    const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8'));
    
    // Get bin entry - can be string or object
    let binPath: string | undefined;
    if (typeof packageJson.bin === 'string') {
      binPath = packageJson.bin;
    } else if (typeof packageJson.bin === 'object') {
      // Use the first bin entry or one matching the package name
      const binEntries = Object.entries(packageJson.bin);
      const matchingEntry = binEntries.find(([name]) => name === packageJson.name.split('/').pop());
      binPath = matchingEntry ? matchingEntry[1] as string : binEntries[0]?.[1] as string;
    }
    
    if (!binPath) {
      console.warn(`[dev-inspector] [acp] No bin entry found in ${packageName}/package.json`);
      return null;
    }
    
    const binFullPath = join(dirname(packageJsonPath), binPath);
    console.log(`[dev-inspector] [acp] Resolved ${packageName} bin to: ${binFullPath}`);
    
    return binFullPath;
  } catch (error) {
    console.warn(`[dev-inspector] [acp] Failed to resolve npm package ${packageName}:`, error);
    return null;
  }
}
